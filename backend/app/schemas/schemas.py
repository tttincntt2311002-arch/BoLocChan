"""
Pydantic schemas for request/response validation
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, field_validator

from app.models.models import UserRole, EventStatus, CertificateStatus


# ── User Schemas ─────────────────────────────────────────────────────────────
class UserBase(BaseModel):
    wallet_address: str = Field(..., pattern=r"^0x[a-fA-F0-9]{40}$")
    username: Optional[str] = None
    email: Optional[str] = None


class UserCreate(UserBase):
    pass


class UserResponse(UserBase):
    id: str
    role: UserRole
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Auth Schemas ──────────────────────────────────────────────────────────────
class NonceRequest(BaseModel):
    wallet_address: str = Field(..., pattern=r"^0x[a-fA-F0-9]{40}$")


class NonceResponse(BaseModel):
    nonce: str
    wallet_address: str


class SignatureVerifyRequest(BaseModel):
    wallet_address: str = Field(..., pattern=r"^0x[a-fA-F0-9]{40}$")
    signature: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# ── Event Schemas ─────────────────────────────────────────────────────────────
class EventBase(BaseModel):
    name: str = Field(..., min_length=3, max_length=255)
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    location: Optional[str] = None


class EventCreate(EventBase):
    pass


class EventUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=3, max_length=255)
    description: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    location: Optional[str] = None
    status: Optional[EventStatus] = None


class EventResponse(EventBase):
    id: str
    organizer_id: str
    status: EventStatus
    banner_ipfs_cid: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Certificate Schemas ───────────────────────────────────────────────────────
class CertificateIssuanceRequest(BaseModel):
    event_id: str
    recipient_wallet: str = Field(..., pattern=r"^0x[a-fA-F0-9]{40}$")


class CertificateBatchIssuanceRequest(BaseModel):
    event_id: str
    recipient_wallets: list[str] = Field(..., min_length=1)

    @field_validator("recipient_wallets")
    @classmethod
    def validate_wallets(cls, wallets: list[str]) -> list[str]:
        import re
        pattern = re.compile(r"^0x[a-fA-F0-9]{40}$")
        for w in wallets:
            if not pattern.match(w):
                raise ValueError(f"Invalid wallet address: {w}")
        return wallets


class CertificateResponse(BaseModel):
    id: str
    event_id: str
    recipient_id: str
    token_id: Optional[int] = None
    token_uri: Optional[str] = None
    metadata_cid: Optional[str] = None
    contract_address: Optional[str] = None
    tx_hash: Optional[str] = None
    block_number: Optional[int] = None
    status: CertificateStatus
    issued_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Verification Schemas ──────────────────────────────────────────────────────
class VerifyByWalletRequest(BaseModel):
    wallet_address: str = Field(..., pattern=r"^0x[a-fA-F0-9]{40}$")


class VerifyByTokenRequest(BaseModel):
    token_id: int
    contract_address: Optional[str] = None


class VerificationResult(BaseModel):
    is_valid: bool
    certificate: Optional[CertificateResponse] = None
    on_chain_verified: bool = False
    message: str


# ── IPFS Metadata Schema (ERC-721 Metadata Standard) ─────────────────────────
class CertificateMetadata(BaseModel):
    """
    ERC-721 compliant metadata structure for IPFS upload.
    See: https://eips.ethereum.org/EIPS/eip-721
    """
    name: str
    description: str
    image: str              # ipfs://CID of certificate image
    external_url: Optional[str] = None
    attributes: list[dict] = []

    # Custom fields (non-standard, for display purposes)
    event_id: Optional[str] = None
    event_name: Optional[str] = None
    recipient_name: Optional[str] = None
    issued_date: Optional[str] = None
    issuer: Optional[str] = None


# ── Pagination ────────────────────────────────────────────────────────────────
class PaginatedResponse(BaseModel):
    items: list
    total: int
    page: int
    size: int
    pages: int
