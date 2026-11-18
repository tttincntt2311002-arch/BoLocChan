"""Idempotent demo seed. Only available in development/test."""

from datetime import timedelta

from sqlalchemy import select

from app.core.config import get_settings
from app.core.security import hash_password
from app.db.base import new_session
from app.db.migrate import assert_schema_current
from app.models.models import (
    AttendanceStatus,
    AuditLog,
    Event,
    EventStatus,
    MemberRole,
    Organization,
    OrganizationMember,
    Participant,
    User,
    UserRole,
    utcnow,
)

DEMO_PASSWORD = "DemoSBT2026!"


def seed():
    if get_settings().APP_ENV == "production":
        raise SystemExit("Demo seed is disabled in production. Use python -m app.cli create-admin.")
    assert_schema_current()
    with new_session() as db:
        for email, name, role in [
            ("admin@example.com", "Demo Admin", UserRole.ADMIN),
            ("organizer@example.com", "Demo Organizer", UserRole.ORGANIZER),
            ("participant@example.com", "Demo Participant", UserRole.PARTICIPANT),
        ]:
            if not db.scalar(select(User.id).where(User.email == email)):
                db.add(
                    User(
                        email=email,
                        full_name=name,
                        role=role,
                        password_hash=hash_password(DEMO_PASSWORD),
                    )
                )
        db.flush()
        organizer = db.scalar(select(User).where(User.email == "organizer@example.com"))
        participant_user = db.scalar(select(User).where(User.email == "participant@example.com"))
        org = db.scalar(select(Organization).where(Organization.slug == "demo-blockchain-club"))
        if org is None:
            org = Organization(
                name="Demo Blockchain Club",
                slug="demo-blockchain-club",
                owner_id=organizer.id,
                description="Demo organization for local API development",
            )
            db.add(org)
            db.flush()
            db.add(OrganizationMember(organization_id=org.id, user_id=organizer.id, role=MemberRole.ORGANIZER))
        event = db.scalar(
            select(Event).where(Event.organization_id == org.id, Event.name == "SBT Certificate Workshop")
        )
        if event is None:
            event = Event(
                name="SBT Certificate Workshop",
                organization_id=org.id,
                organizer_id=organizer.id,
                description="Local demo event",
                start_date=utcnow() + timedelta(days=7),
                end_date=utcnow() + timedelta(days=7, hours=3),
                location="Ho Chi Minh City",
                status=EventStatus.ACTIVE,
            )
            db.add(event)
            db.flush()
            db.add(Participant(event_id=event.id, user_id=participant_user.id, status=AttendanceStatus.CONFIRMED))
        past = db.scalar(select(Event).where(Event.organization_id == org.id, Event.name == "Completed SBT Workshop"))
        if past is None:
            past = Event(
                name="Completed SBT Workshop",
                organization_id=org.id,
                organizer_id=organizer.id,
                start_date=utcnow() - timedelta(days=3),
                end_date=utcnow() - timedelta(days=3) + timedelta(hours=2),
                status=EventStatus.COMPLETED,
            )
            db.add(past)
            db.flush()
            db.add(
                Participant(
                    event_id=past.id,
                    user_id=participant_user.id,
                    status=AttendanceStatus.ATTENDED,
                    attended_at=past.end_date,
                )
            )
        db.flush()
        if not db.scalar(select(AuditLog.id).where(AuditLog.action == "demo.seed")):
            db.add(AuditLog(actor_id=organizer.id, action="demo.seed", entity_type="organizations", entity_id=org.id))
        db.commit()
    print("Demo data ready. Accounts: admin@example.com, organizer@example.com, participant@example.com")
    print(f"Local demo password: {DEMO_PASSWORD}")
    print("Link your own wallet in Profile before issuing certificates with real IPFS metadata.")
    print("Seed does not assign wallets or create certificates/blockchain transactions.")


if __name__ == "__main__":
    seed()
