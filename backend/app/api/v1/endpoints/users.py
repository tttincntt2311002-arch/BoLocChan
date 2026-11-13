from fastapi import APIRouter, Response
from sqlalchemy import select

from app.api.dependencies import DB, Admin, CurrentUser, Limit, Skip
from app.core.errors import fail
from app.core.validation import Identifier
from app.models.models import User
from app.schemas.schemas import AdminUserUpdate, Page, PasswordUpdate, UserResponse, UserUpdate, WalletUpdate
from app.services import users
from app.services.common import get_or_404, page

router = APIRouter()


@router.get("/me", response_model=UserResponse)
def me(user: CurrentUser):
    return user


@router.patch("/me", response_model=UserResponse)
def update_me(payload: UserUpdate, user: CurrentUser, db: DB):
    return users.update_profile(db, user, payload)


@router.put("/me/wallet", response_model=UserResponse)
def wallet(payload: WalletUpdate, user: CurrentUser, db: DB):
    """Link a formatted wallet address; this is not proof of wallet ownership."""
    return users.update_wallet(db, user, payload.wallet_address)


@router.put("/me/password", status_code=204)
def password(payload: PasswordUpdate, user: CurrentUser, db: DB):
    users.change_password(db, user, payload)
    return Response(status_code=204)


@router.get("", response_model=Page[UserResponse])
def list_users(admin: Admin, db: DB, skip: Skip = 0, limit: Limit = 20):
    return page(db, select(User).order_by(User.created_at, User.id), skip, limit)


@router.get("/{user_id}", response_model=UserResponse)
def get_user(user_id: Identifier, user: CurrentUser, db: DB):
    if user.id != user_id and user.role.value != "admin":
        fail(403, "user_forbidden", "You cannot access another user's profile")
    return get_or_404(db, User, user_id)


@router.patch("/{user_id}", response_model=UserResponse)
def admin_update(user_id: Identifier, payload: AdminUserUpdate, admin: Admin, db: DB):
    """Only an administrator can grant/revoke roles or disable accounts."""
    return users.admin_update(db, admin, get_or_404(db, User, user_id), payload)
