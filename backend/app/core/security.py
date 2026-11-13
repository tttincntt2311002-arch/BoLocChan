"""bcrypt hashing and short-lived, versioned JWT access tokens."""

from datetime import timedelta

import bcrypt
import jwt

from app.core.config import get_settings
from app.models.models import User, utcnow

# A fixed hash keeps nonexistent-email logins on the bcrypt verification path.
DUMMY_HASH = bcrypt.hashpw(b"unusable-dummy-password", bcrypt.gensalt(rounds=12))


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("ascii")


def verify_password(password: str, password_hash: str | bytes) -> bool:
    try:
        hashed = password_hash.encode("ascii") if isinstance(password_hash, str) else password_hash
        return bcrypt.checkpw(password.encode("utf-8"), hashed)
    except (ValueError, TypeError, UnicodeError):
        return False


def create_access_token(user: User) -> str:
    settings = get_settings()
    now = utcnow()
    return jwt.encode(
        {
            "sub": user.id,
            "ver": user.token_version,
            "iat": now,
            "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
            "iss": "sbt-certificate-api",
            "aud": "sbt-certificate-client",
            "type": "access",
        },
        settings.SECRET_KEY,
        algorithm="HS256",
    )
