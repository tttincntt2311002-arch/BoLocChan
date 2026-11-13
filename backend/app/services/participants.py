"""Registration, atomic CSV import and attendance management."""

import csv
import io

from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import fail
from app.models.models import (
    AttendanceStatus,
    Certificate,
    CertificateStatus,
    Event,
    EventStatus,
    Participant,
    User,
    utcnow,
)
from app.services.common import audit, require_event_manager

email_adapter = TypeAdapter(EmailStr)


def registration_open(event: Event):
    if event.status != EventStatus.ACTIVE or event.end_date <= utcnow():
        fail(409, "registration_closed", "This event is not accepting registrations")


def add(db: Session, actor: User, event: Event, target: User, *, self_registration=False):
    if not self_registration:
        require_event_manager(db, event, actor)
    registration_open(event)
    if not target.is_active:
        fail(409, "inactive_user", "Cannot register an inactive account")
    if db.scalar(select(Participant.id).where(Participant.event_id == event.id, Participant.user_id == target.id)):
        fail(409, "already_registered", "This account is already registered for this event")
    participant = Participant(event_id=event.id, user_id=target.id)
    db.add(participant)
    audit(db, actor, "participant.registered", participant)
    db.commit()
    return participant


def update_attendance(db: Session, actor: User, event: Event, participant: Participant, status: AttendanceStatus):
    require_event_manager(db, event, actor)
    if participant.event_id != event.id:
        fail(404, "not_found", "Participant not found in this event")
    if event.status == EventStatus.CANCELLED:
        fail(409, "event_cancelled", "Cannot update attendance for a cancelled event")
    if status != AttendanceStatus.ATTENDED and db.scalar(
        select(Certificate.id).where(
            Certificate.event_id == event.id,
            Certificate.recipient_id == participant.user_id,
            Certificate.status.in_([CertificateStatus.PENDING, CertificateStatus.ISSUED]),
        )
    ):
        fail(409, "certificate_exists", "Attendance cannot be cleared while a certificate is pending or issued")
    participant.status = status
    participant.attended_at = (participant.attended_at or utcnow()) if status == AttendanceStatus.ATTENDED else None
    audit(db, actor, "participant.attendance_updated", participant, status=status.value)
    db.commit()
    return participant


def import_csv(db: Session, actor: User, event: Event, content: bytes):
    require_event_manager(db, event, actor)
    registration_open(event)
    settings = get_settings()
    if len(content) > settings.MAX_CSV_BYTES:
        fail(413, "csv_too_large", "CSV file exceeds the configured size limit")
    try:
        text = content.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text, newline=""), strict=True)
        fields = reader.fieldnames or []
        if not fields or len(set(fields)) != len(fields) or not set(fields).issubset({"email", "user_id"}):
            fail(422, "invalid_csv_header", "CSV requires unique email and/or user_id columns")
        users = []
        seen = set()
        for row_number, row in enumerate(reader, 2):
            if len(users) >= settings.MAX_CSV_ROWS:
                fail(413, "csv_too_many_rows", "CSV exceeds the configured row limit")
            if None in row or any(v is None for v in row.values()):
                fail(422, "invalid_csv_row", f"Malformed CSV at row {row_number}")
            email, user_id = row.get("email", "").strip(), row.get("user_id", "").strip()
            if not email and not user_id:
                fail(422, "invalid_csv_row", f"Missing email or user_id at row {row_number}")
            if email:
                try:
                    email = str(email_adapter.validate_python(email)).lower()
                except ValidationError:
                    fail(422, "invalid_csv_row", f"Invalid email at row {row_number}")
            user = db.get(User, user_id) if user_id else db.scalar(select(User).where(User.email == email))
            if not user or not user.is_active or (email and user.email != email):
                fail(422, "invalid_csv_user", f"No matching active account at row {row_number}")
            if user.id in seen:
                fail(409, "duplicate_csv_user", f"Duplicate account at row {row_number}")
            seen.add(user.id)
            users.append(user)
    except (UnicodeDecodeError, csv.Error):
        fail(422, "invalid_csv", "File must be a valid UTF-8 CSV")
    if not users:
        fail(422, "empty_csv", "CSV contains no participants")
    if db.scalar(
        select(Participant.id).where(Participant.event_id == event.id, Participant.user_id.in_(seen)).limit(1)
    ):
        fail(409, "already_registered", "CSV includes an account already registered for this event")
    participants = [Participant(event_id=event.id, user_id=user.id) for user in users]
    db.add_all(participants)
    for participant in participants:
        audit(db, actor, "participant.csv_imported", participant)
    db.commit()
    return {"imported": len(participants), "participants": participants}
