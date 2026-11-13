from typing import Annotated

from fastapi import APIRouter, File, UploadFile
from sqlalchemy import select

from app.api.dependencies import DB, CurrentUser, Limit, Skip
from app.core.config import get_settings
from app.core.validation import Identifier
from app.models.models import AttendanceStatus, Event, Participant, User
from app.schemas.schemas import AttendanceUpdate, CSVImportResult, Page, ParticipantCreate, ParticipantResponse
from app.services import events, participants
from app.services.common import can_manage_event, get_or_404, page, require_event_manager

router = APIRouter()


@router.post("/{event_id}/register", response_model=ParticipantResponse, status_code=201)
def register(event_id: Identifier, user: CurrentUser, db: DB):
    event = events.read(db, user, event_id)
    return participants.add(db, user, event, user, self_registration=True)


@router.post("/{event_id}/participants", response_model=ParticipantResponse, status_code=201)
def add(event_id: Identifier, payload: ParticipantCreate, user: CurrentUser, db: DB):
    event = get_or_404(db, Event, event_id)
    require_event_manager(db, event, user)
    return participants.add(db, user, event, get_or_404(db, User, payload.user_id))


@router.get("/{event_id}/participants", response_model=Page[ParticipantResponse])
def list_participants(
    event_id: Identifier,
    user: CurrentUser,
    db: DB,
    skip: Skip = 0,
    limit: Limit = 20,
    status: AttendanceStatus | None = None,
):
    event = events.read(db, user, event_id)
    stmt = select(Participant).where(Participant.event_id == event.id)
    if not can_manage_event(db, event, user):
        stmt = stmt.where(Participant.user_id == user.id)
    if status:
        stmt = stmt.where(Participant.status == status)
    return page(db, stmt.order_by(Participant.created_at, Participant.id), skip, limit)


@router.post("/{event_id}/participants/import", response_model=CSVImportResult, status_code=201)
def import_csv(event_id: Identifier, user: CurrentUser, db: DB, file: Annotated[UploadFile, File()]):
    event = get_or_404(db, Event, event_id)
    require_event_manager(db, event, user)
    content = file.file.read(get_settings().MAX_CSV_BYTES + 1)
    return participants.import_csv(db, user, event, content)


@router.patch("/{event_id}/participants/{participant_id}", response_model=ParticipantResponse)
def attendance(event_id: Identifier, participant_id: Identifier, payload: AttendanceUpdate, user: CurrentUser, db: DB):
    event = get_or_404(db, Event, event_id)
    require_event_manager(db, event, user)
    return participants.update_attendance(db, user, event, get_or_404(db, Participant, participant_id), payload.status)
