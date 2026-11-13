"""FastAPI application factory; schema changes are managed only by Alembic."""

import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm.exc import StaleDataError
from starlette.exceptions import HTTPException

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.db.base import get_engine
from app.db.migrate import assert_schema_current
from app.services.sync import recovery_loop

logger = logging.getLogger(__name__)


def error(status, code, message, details=None, headers=None):
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message, "details": details}},
        headers=headers,
    )


def create_app():
    settings = get_settings()

    @asynccontextmanager
    async def lifespan(application):
        assert_schema_current()
        recovery = None
        if settings.SYNC_ENABLED and settings.WEB3_PROVIDER_URL and settings.SBT_CONTRACT_ADDRESS:
            recovery = asyncio.create_task(recovery_loop())
        try:
            yield
        finally:
            if recovery:
                recovery.cancel()
                with suppress(asyncio.CancelledError):
                    await recovery

    application = FastAPI(
        title=settings.APP_NAME,
        version="2.0.0",
        lifespan=lifespan,
        description="SBT certificate registry. Authenticate with email/password. Public verification exposes only certificate and issuer information.",
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        max_age=600,
    )

    @application.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Cache-Control"] = "no-store"
        return response

    @application.exception_handler(HTTPException)
    async def http_error(request, exc):
        if isinstance(exc.detail, dict):
            detail = exc.detail
            return error(exc.status_code, detail["code"], detail["message"], detail.get("details"), exc.headers)
        return error(exc.status_code, "http_error", str(exc.detail), headers=exc.headers)

    @application.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        details = [
            {"field": ".".join(str(v) for v in e["loc"]), "message": e["msg"], "type": e["type"]} for e in exc.errors()
        ]
        return error(422, "validation_error", "Request validation failed", details)

    @application.exception_handler(IntegrityError)
    async def integrity_error(request, exc):
        return error(409, "data_conflict", "Operation conflicts with an existing record or a database constraint")

    @application.exception_handler(StaleDataError)
    async def stale_error(request, exc):
        return error(409, "concurrent_update", "Record changed during this request; reload before retrying")

    @application.exception_handler(OperationalError)
    async def database_error(request, exc):
        return error(503, "database_unavailable", "Database is temporarily unavailable")

    @application.exception_handler(Exception)
    async def unexpected_error(request, exc):
        logger.error("Unhandled exception: %s", type(exc).__name__)
        return error(500, "internal_error", "An unexpected error occurred")

    application.include_router(api_router, prefix="/api/v1")

    @application.get("/api/v1/blockchain/config", tags=["Blockchain"])
    def blockchain_config():
        return {
            "chain_id": settings.CHAIN_ID,
            "contract_address": settings.SBT_CONTRACT_ADDRESS,
            "min_confirmations": settings.MIN_CONFIRMATIONS,
            "deployment_block": settings.SBT_DEPLOYMENT_BLOCK,
            "configured": bool(settings.WEB3_PROVIDER_URL and settings.SBT_CONTRACT_ADDRESS),
            "metadata_upload_enabled": bool(settings.PINATA_JWT),
        }

    @application.get("/health", tags=["Health"])
    def health():
        try:
            with get_engine().connect() as connection:
                connection.execute(text("SELECT 1"))
            return {"status": "healthy", "app": settings.APP_NAME, "environment": settings.APP_ENV}
        except OperationalError:
            return error(503, "database_unavailable", "Database is unavailable")

    @application.get("/", tags=["Health"])
    def root():
        return {"message": settings.APP_NAME, "docs": "/docs", "health": "/health"}

    return application


app = create_app()
