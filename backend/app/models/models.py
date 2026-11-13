"""Domain entities with database constraints."""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, declared_attr, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

from app.db.base import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UTCDateTime(TypeDecorator):
    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return value.astimezone(timezone.utc).replace(tzinfo=None) if value else value

    def process_result_value(self, value, dialect):
        return value.replace(tzinfo=timezone.utc) if value else value


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    ORGANIZER = "organizer"
    PARTICIPANT = "participant"


class MemberRole(str, enum.Enum):
    ORGANIZER = "organizer"
    MEMBER = "member"


class EventStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    CLOSED = "closed"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class AttendanceStatus(str, enum.Enum):
    REGISTERED = "registered"
    CONFIRMED = "confirmed"
    ATTENDED = "attended"
    ABSENT = "absent"
    CANCELLED = "cancelled"


class CertificateStatus(str, enum.Enum):
    PENDING = "pending"
    ISSUED = "issued"
    REVOKED = "revoked"
    FAILED = "failed"


def enum_type(cls):
    return Enum(
        cls,
        values_callable=lambda members: [v.value for v in members],
        native_enum=False,
        create_constraint=True,
        validate_strings=True,
        name=cls.__name__.lower(),
    )


class IdentityMixin:
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class TimestampMixin(IdentityMixin):
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow)
    revision: Mapped[int] = mapped_column(Integer, default=1, server_default="1")

    @declared_attr.directive
    def __mapper_args__(cls):
        return {"version_id_col": cls.revision}


class User(TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("email = lower(email)", name="email_lowercase"),
        CheckConstraint(
            "wallet_address IS NULL OR (length(wallet_address) = 42 AND wallet_address = lower(wallet_address))",
            name="wallet_format",
        ),
        CheckConstraint("token_version >= 0", name="token_version_positive"),
    )
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(150))
    password_hash: Mapped[str] = mapped_column(String(255))
    wallet_address: Mapped[str | None] = mapped_column(String(42), unique=True, index=True)
    role: Mapped[UserRole] = mapped_column(enum_type(UserRole), default=UserRole.PARTICIPANT)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    token_version: Mapped[int] = mapped_column(Integer, default=0)
    memberships: Mapped[list["OrganizationMember"]] = relationship(back_populates="user")
    participations: Mapped[list["Participant"]] = relationship(back_populates="user")
    certificates: Mapped[list["Certificate"]] = relationship(
        back_populates="recipient", foreign_keys="Certificate.recipient_id"
    )


class Organization(TimestampMixin, Base):
    __tablename__ = "organizations"
    name: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    owner: Mapped[User] = relationship()
    members: Mapped[list["OrganizationMember"]] = relationship(back_populates="organization")
    events: Mapped[list["Event"]] = relationship(back_populates="organization")


class OrganizationMember(IdentityMixin, Base):
    __tablename__ = "organization_members"
    __table_args__ = (UniqueConstraint("organization_id", "user_id", name="uq_membership"),)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="RESTRICT"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    role: Mapped[MemberRole] = mapped_column(enum_type(MemberRole), default=MemberRole.MEMBER)
    organization: Mapped[Organization] = relationship(back_populates="members")
    user: Mapped[User] = relationship(back_populates="memberships")


class Event(TimestampMixin, Base):
    __tablename__ = "events"
    __table_args__ = (CheckConstraint("end_date > start_date", name="valid_dates"),)
    name: Mapped[str] = mapped_column(String(255), index=True)
    description: Mapped[str | None] = mapped_column(Text)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="RESTRICT"), index=True)
    organizer_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    start_date: Mapped[datetime] = mapped_column(UTCDateTime(), index=True)
    end_date: Mapped[datetime] = mapped_column(UTCDateTime())
    location: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[EventStatus] = mapped_column(enum_type(EventStatus), default=EventStatus.DRAFT, index=True)
    organization: Mapped[Organization] = relationship(back_populates="events")
    organizer: Mapped[User] = relationship()
    participants: Mapped[list["Participant"]] = relationship(back_populates="event", passive_deletes="all")
    certificates: Mapped[list["Certificate"]] = relationship(
        back_populates="event", foreign_keys="Certificate.event_id", passive_deletes="all"
    )


class Participant(TimestampMixin, Base):
    __tablename__ = "participants"
    __table_args__ = (UniqueConstraint("event_id", "user_id", name="uq_participant_event_user"),)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id", ondelete="RESTRICT"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    status: Mapped[AttendanceStatus] = mapped_column(enum_type(AttendanceStatus), default=AttendanceStatus.REGISTERED)
    attended_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    event: Mapped[Event] = relationship(back_populates="participants")
    user: Mapped[User] = relationship(back_populates="participations")


class Certificate(TimestampMixin, Base):
    __tablename__ = "certificates"
    __table_args__ = (
        UniqueConstraint("event_id", "recipient_id", name="uq_certificate_event_recipient"),
        UniqueConstraint("chain_id", "contract_address", "token_id", name="uq_certificate_chain_contract_token"),
        ForeignKeyConstraint(
            ["event_id", "recipient_id"],
            ["participants.event_id", "participants.user_id"],
            name="fk_certificate_participant",
            ondelete="RESTRICT",
        ),
        CheckConstraint("chain_id > 0", name="chain_positive"),
        CheckConstraint("block_number IS NULL OR block_number >= 0", name="block_positive"),
        CheckConstraint(
            "status NOT IN ('issued', 'revoked') OR (token_id IS NOT NULL AND contract_address IS NOT NULL AND tx_hash IS NOT NULL AND block_number IS NOT NULL AND issued_at IS NOT NULL AND token_uri IS NOT NULL)",
            name="issued_requires_chain_data",
        ),
        CheckConstraint(
            "status != 'revoked' OR (revoked_at IS NOT NULL AND revoke_reason IS NOT NULL)",
            name="revoked_requires_reason",
        ),
    )
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id", ondelete="RESTRICT"), index=True)
    recipient_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    recipient_wallet: Mapped[str] = mapped_column(String(42))
    chain_id: Mapped[int] = mapped_column(Integer)
    # Decimal text preserves the full Ethereum uint256 range in SQLite and JSON.
    token_id: Mapped[str | None] = mapped_column(String(78))
    token_uri: Mapped[str | None] = mapped_column(String(512))
    contract_address: Mapped[str | None] = mapped_column(String(42))
    tx_hash: Mapped[str | None] = mapped_column(String(66), index=True)
    block_number: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[CertificateStatus] = mapped_column(
        enum_type(CertificateStatus), default=CertificateStatus.PENDING, index=True
    )
    issued_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    revoked_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    revoked_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    revoke_reason: Mapped[str | None] = mapped_column(String(500))
    failure_reason: Mapped[str | None] = mapped_column(String(500))
    event: Mapped[Event] = relationship(back_populates="certificates", foreign_keys=[event_id])
    recipient: Mapped[User] = relationship(back_populates="certificates", foreign_keys=[recipient_id])


class AuditLog(IdentityMixin, Base):
    __tablename__ = "audit_logs"
    actor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    action: Mapped[str] = mapped_column(String(100), index=True)
    entity_type: Mapped[str] = mapped_column(String(50))
    entity_id: Mapped[str] = mapped_column(String(36), index=True)
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    actor: Mapped[User | None] = relationship()
