"""
SQLAlchemy ORM Models for SBT Certificate System
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, DateTime, Enum, ForeignKey, Integer,
    String, Text, func
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _uuid() -> str:
    return str(uuid.uuid4())


# ── Enums ─────────────────────────────────────────────────────────────────────
class UserRole(str, enum.Enum):
    ADMIN     = "admin"
    ORGANIZER = "organizer"
    STUDENT   = "student"


class EventStatus(str, enum.Enum):
    DRAFT     = "draft"
    ACTIVE    = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class CertificateStatus(str, enum.Enum):
    PENDING  = "pending"   # Minting queued
    MINTING  = "minting"   # TX submitted
    ISSUED   = "issued"    # TX confirmed on-chain
    REVOKED  = "revoked"   # Revoked by admin
    FAILED   = "failed"    # Minting failed


# ── User ──────────────────────────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id: Mapped[str]            = mapped_column(String(36), primary_key=True, default=_uuid)
    wallet_address: Mapped[str] = mapped_column(String(42), unique=True, index=True)
    username: Mapped[str | None] = mapped_column(String(100), nullable=True)
    email: Mapped[str | None]  = mapped_column(String(255), nullable=True)
    role: Mapped[UserRole]     = mapped_column(Enum(UserRole), default=UserRole.STUDENT)
    is_active: Mapped[bool]    = mapped_column(Boolean, default=True)
    nonce: Mapped[str]         = mapped_column(String(64), default=_uuid)  # For MetaMask sign-in
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    organized_events: Mapped[list[Event]] = relationship(
        "Event", back_populates="organizer", foreign_keys="Event.organizer_id"
    )
    certificates: Mapped[list[Certificate]] = relationship(
        "Certificate", back_populates="recipient"
    )


# ── Event ─────────────────────────────────────────────────────────────────────
class Event(Base):
    __tablename__ = "events"

    id: Mapped[str]            = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str]          = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    organizer_id: Mapped[str]  = mapped_column(ForeignKey("users.id"), nullable=False)
    start_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    end_date: Mapped[datetime | None]   = mapped_column(DateTime, nullable=True)
    location: Mapped[str | None]       = mapped_column(String(255), nullable=True)
    status: Mapped[EventStatus]        = mapped_column(Enum(EventStatus), default=EventStatus.DRAFT)
    banner_ipfs_cid: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime]       = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime]       = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    organizer: Mapped[User]            = relationship("User", back_populates="organized_events", foreign_keys=[organizer_id])
    certificates: Mapped[list[Certificate]] = relationship("Certificate", back_populates="event")
    participants: Mapped[list[Participant]] = relationship("Participant", back_populates="event")


# ── Participant ───────────────────────────────────────────────────────────────
class Participant(Base):
    __tablename__ = "participants"

    id: Mapped[str]         = mapped_column(String(36), primary_key=True, default=_uuid)
    event_id: Mapped[str]   = mapped_column(ForeignKey("events.id"), nullable=False)
    user_id: Mapped[str]    = mapped_column(ForeignKey("users.id"), nullable=False)
    registered_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    attended: Mapped[bool]  = mapped_column(Boolean, default=False)

    # Relationships
    event: Mapped[Event] = relationship("Event", back_populates="participants")
    user: Mapped[User]   = relationship("User")


# ── Certificate ───────────────────────────────────────────────────────────────
class Certificate(Base):
    __tablename__ = "certificates"

    id: Mapped[str]            = mapped_column(String(36), primary_key=True, default=_uuid)
    event_id: Mapped[str]      = mapped_column(ForeignKey("events.id"), nullable=False)
    recipient_id: Mapped[str]  = mapped_column(ForeignKey("users.id"), nullable=False)

    # On-chain data
    token_id: Mapped[int | None]        = mapped_column(Integer, nullable=True, unique=True)
    token_uri: Mapped[str | None]       = mapped_column(String(255), nullable=True)   # ipfs://CID
    metadata_cid: Mapped[str | None]    = mapped_column(String(100), nullable=True)   # Raw CID
    contract_address: Mapped[str | None] = mapped_column(String(42), nullable=True)
    tx_hash: Mapped[str | None]         = mapped_column(String(66), nullable=True)
    block_number: Mapped[int | None]    = mapped_column(Integer, nullable=True)

    # Status tracking
    status: Mapped[CertificateStatus]   = mapped_column(Enum(CertificateStatus), default=CertificateStatus.PENDING)
    issued_at: Mapped[datetime | None]  = mapped_column(DateTime, nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    revoked_by_id: Mapped[str | None]   = mapped_column(ForeignKey("users.id"), nullable=True)

    created_at: Mapped[datetime]        = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime]        = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    # Relationships
    event: Mapped[Event]     = relationship("Event", back_populates="certificates")
    recipient: Mapped[User]  = relationship("User", back_populates="certificates", foreign_keys=[recipient_id])
