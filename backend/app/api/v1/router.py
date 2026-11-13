"""Versioned API router and documented common error responses."""

from fastapi import APIRouter

from app.api.v1.endpoints import (
    audit,
    auth,
    certificates,
    events,
    ipfs,
    organizations,
    participants,
    users,
    verification,
)
from app.schemas.schemas import ErrorResponse

api_router = APIRouter(
    responses={
        status: {"model": ErrorResponse, "description": description}
        for status, description in {
            400: "Invalid operation",
            401: "Missing, expired or revoked token",
            403: "Insufficient permissions",
            404: "Resource not found",
            409: "Duplicate or invalid state transition",
            413: "Payload too large",
            422: "Validation failed",
            429: "Too many requests",
            502: "External service failure",
            503: "Service unavailable",
        }.items()
    }
)

for router, prefix, tag in [
    (auth.router, "/auth", "Authentication"),
    (users.router, "/users", "Users"),
    (organizations.router, "/organizations", "Organizations"),
    (events.router, "/events", "Events"),
    (participants.router, "/events", "Participants"),
    (certificates.router, "/certificates", "Certificates"),
    (verification.router, "/verify", "Public verification"),
    (audit.router, "/audit-logs", "Audit logs"),
    (ipfs.router, "/ipfs", "IPFS"),
]:
    api_router.include_router(router, prefix=prefix, tags=[tag])
