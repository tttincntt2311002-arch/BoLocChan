"""Shared transactional audit and authorization helpers."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import fail
from app.models.models import AuditLog, Event, MemberRole, Organization, OrganizationMember, User, UserRole


def page(db: Session, stmt, skip: int, limit: int):
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery()))
    return {"items": db.scalars(stmt.offset(skip).limit(limit)).all(), "total": total, "skip": skip, "limit": limit}


def get_or_404(db: Session, model, entity_id: str):
    entity = db.get(model, entity_id)
    if entity is None:
        fail(404, "not_found", f"{model.__name__} not found")
    return entity


def audit(db: Session, actor: User | None, action: str, entity, **details):
    db.flush()
    db.add(
        AuditLog(
            actor_id=actor.id if actor else None,
            action=action,
            entity_type=entity.__tablename__,
            entity_id=entity.id,
            details=details,
        )
    )


def membership(db: Session, organization_id: str, user_id: str):
    return db.scalar(
        select(OrganizationMember).where(
            OrganizationMember.organization_id == organization_id,
            OrganizationMember.user_id == user_id,
        )
    )


def require_global_organizer(user: User):
    if user.role not in (UserRole.ADMIN, UserRole.ORGANIZER):
        fail(403, "organizer_required", "Organizer or administrator permission required")


def require_org_manager(db: Session, org: Organization, user: User, *, owner_only=False):
    if user.role == UserRole.ADMIN:
        return
    if org.owner_id == user.id and user.role == UserRole.ORGANIZER:
        return
    member = membership(db, org.id, user.id)
    if not owner_only and member and member.role == MemberRole.ORGANIZER and user.role == UserRole.ORGANIZER:
        return
    fail(403, "organization_forbidden", "You cannot manage this organization")


def can_manage_event(db: Session, event: Event, user: User) -> bool:
    if user.role == UserRole.ADMIN:
        return True
    if user.role != UserRole.ORGANIZER:
        return False
    org = get_or_404(db, Organization, event.organization_id)
    if org.owner_id == user.id:
        return True
    member = membership(db, org.id, user.id)
    return bool(member and member.role == MemberRole.ORGANIZER)


def require_event_manager(db: Session, event: Event, user: User):
    if not can_manage_event(db, event, user):
        fail(403, "event_forbidden", "You cannot manage events in this organization")
