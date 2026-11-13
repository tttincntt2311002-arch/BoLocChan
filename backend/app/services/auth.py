"""Account creation and credential authentication."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import fail
from app.core.security import DUMMY_HASH, create_access_token, hash_password, verify_password
from app.models.models import User, UserRole
from app.schemas.schemas import UserCreate
from app.services.common import audit


def register(db: Session, payload: UserCreate) -> User:
    if db.scalar(select(User.id).where(User.email == str(payload.email).lower())):
        fail(409, "email_exists", "Email is already registered")
    user = User(
        email=str(payload.email).lower(),
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        role=UserRole.PARTICIPANT,
    )
    db.add(user)
    audit(db, user, "auth.register", user)
    db.commit()
    return user


def login(db: Session, email: str, password: str):
    user = db.scalar(select(User).where(User.email == email.lower().strip()))
    valid = verify_password(password, user.password_hash if user else DUMMY_HASH)
    if not valid or not user or not user.is_active:
        fail(401, "invalid_credentials", "Email or password is incorrect")
    audit(db, user, "auth.login", user)
    db.commit()
    return {
        "access_token": create_access_token(user),
        "expires_in": get_settings().ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        "user": user,
    }


def logout(db: Session, user: User):
    # Versioning immediately invalidates every existing token for this account.
    user.token_version += 1
    audit(db, user, "auth.logout", user)
    db.commit()
