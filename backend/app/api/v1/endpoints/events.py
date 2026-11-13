from typing import Annotated

from fastapi import APIRouter, Query, Response
from sqlalchemy import select

from app.api.dependencies import DB, CurrentUser, Limit, Skip
from app.core.errors import fail
from app.core.validation import Identifier, UTCDate
from app.models.models import Event, EventStatus, MemberRole, Organization, OrganizationMember, UserRole
from app.schemas.schemas import EventCreate, EventResponse, EventUpdate, Page
from app.services import events
from app.services.common import get_or_404, page

router = APIRouter()


@router.post("", response_model=EventResponse, status_code=201)
def create(payload: EventCreate, user: CurrentUser, db: DB):
    return events.create(db, user, payload)


@router.get("", response_model=Page[EventResponse])
def list_events(
    user: CurrentUser,
    db: DB,
    skip: Skip = 0,
    limit: Limit = 20,
    q: Annotated[str | None, Query(min_length=1, max_length=200)] = None,
    status: EventStatus | None = None,
    organization_id: Identifier | None = None,
    start_from: UTCDate | None = None,
    start_to: UTCDate | None = None,
    managed_only: bool = False,
):
    if start_from and start_to and start_to < start_from:
        fail(422, "invalid_dates", "start_to must not be before start_from")
    stmt = events.visible_events(user)
    if managed_only and user.role != UserRole.ADMIN:
        organizations = (
            select(Organization.id)
            .where(Organization.owner_id == user.id)
            .union(
                select(OrganizationMember.organization_id).where(
                    OrganizationMember.user_id == user.id, OrganizationMember.role == MemberRole.ORGANIZER
                )
            )
        )
        stmt = stmt.where(Event.organization_id.in_(organizations))
        if user.role != UserRole.ORGANIZER:
            stmt = stmt.where(False)
    if q:
        stmt = stmt.where(Event.name.icontains(q, autoescape=True))
    if status:
        stmt = stmt.where(Event.status == status)
    if organization_id:
        stmt = stmt.where(Event.organization_id == organization_id)
    if start_from:
        stmt = stmt.where(Event.start_date >= start_from)
    if start_to:
        stmt = stmt.where(Event.start_date <= start_to)
    return page(db, stmt.order_by(Event.start_date, Event.id), skip, limit)


@router.get("/{event_id}", response_model=EventResponse)
def get(event_id: Identifier, user: CurrentUser, db: DB):
    return events.read(db, user, event_id)


@router.patch("/{event_id}", response_model=EventResponse)
def update(event_id: Identifier, payload: EventUpdate, user: CurrentUser, db: DB):
    return events.update(db, user, get_or_404(db, Event, event_id), payload)


@router.post("/{event_id}/close", response_model=EventResponse)
def close(event_id: Identifier, user: CurrentUser, db: DB):
    return events.update(db, user, get_or_404(db, Event, event_id), EventUpdate(status=EventStatus.CLOSED))


@router.delete("/{event_id}", status_code=204)
def delete(event_id: Identifier, user: CurrentUser, db: DB):
    events.delete(db, user, get_or_404(db, Event, event_id))
    return Response(status_code=204)
