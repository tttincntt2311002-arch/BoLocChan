"""Self-service profile updates and administrator-only role assignment."""

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.errors import fail
from app.core.security import hash_password, verify_password
from app.models.models import User, UserRole
from app.schemas.schemas import AdminUserUpdate, PasswordUpdate, UserUpdate
from app.services.common import audit


def update_profile(db: Session, user: User, payload: UserUpdate):
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(user, key, str(value).lower() if key == "email" else value)
    audit(db, user, "user.profile_updated", user)
    db.commit()
    return user


def update_wallet(db: Session, user: User, wallet: str | None):
    user.wallet_address = wallet
    audit(db, user, "user.wallet_updated", user)
    db.commit()
    return user


def change_password(db: Session, user: User, payload: PasswordUpdate):
    if not verify_password(payload.current_password, user.password_hash):
        fail(400, "password_mismatch", "Current password is incorrect")
    user.password_hash = hash_password(payload.new_password)
    user.token_version += 1
    audit(db, user, "user.password_changed", user)
    db.commit()


def admin_update(db: Session, actor: User, target: User, payload: AdminUserUpdate):
    # Acquire SQLite's writer lock before counting administrators. This keeps
    # simultaneous demotions from removing both of the last two administrators.
    db.execute(
        update(User)
        .where(User.id == target.id)
        .values(token_version=User.token_version + 1, revision=User.revision + 1)
    )
    db.refresh(target)
    db.refresh(actor)
    if not actor.is_active or actor.role != UserRole.ADMIN:
        fail(403, "admin_required", "Administrator permission required")
    values = payload.model_dump(exclude_unset=True)
    if (
        target.role == UserRole.ADMIN
        and target.is_active
        and (values.get("role", target.role) != UserRole.ADMIN or not values.get("is_active", target.is_active))
    ):
        count = db.scalar(
            select(func.count()).select_from(User).where(User.role == UserRole.ADMIN, User.is_active.is_(True))
        )
        if count <= 1:
            fail(409, "last_admin", "The last active administrator cannot be disabled or demoted")
    for key, value in values.items():
        setattr(target, key, value)
    audit(
        db,
        actor,
        "user.permissions_updated",
        target,
        **{k: v.value if isinstance(v, UserRole) else v for k, v in values.items()},
    )
    db.commit()
    return target
