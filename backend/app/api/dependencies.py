"""Authentication always reloads roles/activation from the database."""

from typing import Annotated

import jwt
from fastapi import Depends, Query
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import fail
from app.db.base import get_db
from app.models.models import User, UserRole

oauth2 = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token", auto_error=False)
DB = Annotated[Session, Depends(get_db)]
Skip = Annotated[int, Query(ge=0)]
Limit = Annotated[int, Query(ge=1, le=100)]


def current_user(db: DB, token: Annotated[str | None, Depends(oauth2)]) -> User:
    if not token:
        fail(401, "authentication_required", "Bearer token required")
    try:
        payload = jwt.decode(
            token,
            get_settings().SECRET_KEY,
            algorithms=["HS256"],
            audience="sbt-certificate-client",
            issuer="sbt-certificate-api",
            options={"require": ["exp", "iat", "sub", "ver", "type"]},
        )
        if payload["type"] != "access" or not isinstance(payload["ver"], int):
            raise jwt.InvalidTokenError()
        user = db.get(User, payload["sub"])
        if not user or not user.is_active or user.token_version != payload["ver"]:
            raise jwt.InvalidTokenError()
        return user
    except (jwt.InvalidTokenError, TypeError, ValueError):
        fail(401, "invalid_token", "Token is invalid, expired or revoked")


CurrentUser = Annotated[User, Depends(current_user)]


def admin_user(user: CurrentUser) -> User:
    if user.role != UserRole.ADMIN:
        fail(403, "admin_required", "Administrator permission required")
    return user


Admin = Annotated[User, Depends(admin_user)]
