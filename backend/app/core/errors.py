"""Consistent API errors without database or request-secret disclosure."""

from fastapi import HTTPException


def fail(status: int, code: str, message: str, details: list[dict] | None = None):
    raise HTTPException(
        status_code=status,
        detail={"code": code, "message": message, "details": details},
        headers={"WWW-Authenticate": "Bearer"} if status == 401 else None,
    )
