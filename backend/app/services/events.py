"""Event lifecycle, visibility and ownership checks."""

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.errors import fail
from app.models.models import (
    Event,
    EventStatus,
    MemberRole,
    Organization,
    OrganizationMember,
    Participant,
    User,
    UserRole,
)
from app.services.common import audit, can_manage_event, get_or_404, require_event_manager, require_org_manager

TRANSITIONS = {
    EventStatus.DRAFT: {EventStatus.ACTIVE, EventStatus.CANCELLED},
    EventStatus.ACTIVE: {EventStatus.CLOSED, EventStatus.COMPLETED, EventStatus.CANCELLED},
    EventStatus.CLOSED: {EventStatus.COMPLETED, EventStatus.CANCELLED},
    EventStatus.COMPLETED: set(),
    EventStatus.CANCELLED: set(),
}


def visible_events(user: User):
    stmt = select(Event)
    if user.role != UserRole.ADMIN:
        managed_orgs = select(Organization.id).where(Organization.owner_id == user.id)
        member_orgs = select(OrganizationMember.organization_id).where(
            OrganizationMember.user_id == user.id, OrganizationMember.role == MemberRole.ORGANIZER
        )
        own = Event.organization_id.in_(managed_orgs.union(member_orgs)) if user.role == UserRole.ORGANIZER else False
        stmt = stmt.where(or_(Event.status != EventStatus.DRAFT, own))
    return stmt


def read(db: Session, user: User, event_id: str):
    event = get_or_404(db, Event, event_id)
    if event.status == EventStatus.DRAFT and not can_manage_event(db, event, user):
        fail(404, "not_found", "Event not found")
    return event


def create(db: Session, user: User, payload):
    org = get_or_404(db, Organization, payload.organization_id)
    require_org_manager(db, org, user)
    event = Event(**payload.model_dump(), organizer_id=user.id)
    db.add(event)
    audit(db, user, "event.created", event)
    db.commit()
    return event


def update(db: Session, user: User, event: Event, payload):
    require_event_manager(db, event, user)
    values = payload.model_dump(exclude_unset=True)
    status = values.get("status", event.status)
    if status != event.status and status not in TRANSITIONS[event.status]:
        fail(409, "invalid_transition", f"Cannot change event from {event.status.value} to {status.value}")
    if event.status in (EventStatus.COMPLETED, EventStatus.CANCELLED) and values:
        fail(409, "event_finalized", "Finalized events cannot be edited")
    if values.get("end_date", event.end_date) <= values.get("start_date", event.start_date):
        fail(422, "invalid_dates", "end_date must be after start_date")
    for key, value in values.items():
        setattr(event, key, value)
    audit(db, user, "event.updated", event, fields=list(values))
    db.commit()
    return event


def delete(db: Session, user: User, event: Event):
    require_event_manager(db, event, user)
    if event.status != EventStatus.DRAFT or db.scalar(
        select(Participant.id).where(Participant.event_id == event.id).limit(1)
    ):
        fail(
            409, "event_has_history", "Only draft events without participants can be deleted; close this event instead"
        )
    audit(db, user, "event.deleted", event)
    db.delete(event)
    db.commit()
