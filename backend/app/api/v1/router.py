"""
API v1 Router – aggregates all sub-routers
"""
from fastapi import APIRouter

from app.api.v1.endpoints import auth, users, events, certificates, verification, ipfs

api_router = APIRouter()

api_router.include_router(auth.router,         prefix="/auth",         tags=["Authentication"])
api_router.include_router(users.router,        prefix="/users",        tags=["Users"])
api_router.include_router(events.router,       prefix="/events",       tags=["Events"])
api_router.include_router(certificates.router, prefix="/certificates", tags=["Certificates"])
api_router.include_router(verification.router, prefix="/verify",       tags=["Verification"])
api_router.include_router(ipfs.router,         prefix="/ipfs",         tags=["IPFS"])
