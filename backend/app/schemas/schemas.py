"""Strict input schemas and explicit public/private response projections."""

from datetime import datetime
from typing import Annotated, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_validator, model_validator

from app.core.validation import Address, Identifier, IPFSUri, Password, TokenId, TxHash, UTCDate
from app.models.models import AttendanceStatus, CertificateStatus, EventStatus, MemberRole, UserRole

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=150)]
T = TypeVar("T")


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def reject_explicit_nulls(self):
        # Nullable fields may be cleared; all other patch fields reject explicit null.
        nullable = {"description", "location", "wallet_address"}
        for name in self.model_fields_set:
            if getattr(self, name) is None and name not in nullable:
                raise ValueError(f"{name} cannot be null")
        return self


class Output(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    skip: int
    limit: int


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: list[dict] | None = None


class ErrorResponse(BaseModel):
    error: ErrorDetail


class UserCreate(Input):
    email: EmailStr
    full_name: Name
    password: Password

    @field_validator("email")
    @classmethod
    def lower_email(cls, value):
        return str(value).lower()


class LoginRequest(Input):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class UserUpdate(Input):
    full_name: Name | None = None
    email: EmailStr | None = None


class WalletUpdate(Input):
    wallet_address: Address | None


class PasswordUpdate(Input):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: Password


class AdminUserUpdate(Input):
    role: UserRole | None = None
    is_active: bool | None = None


class UserResponse(Output):
    id: str
    email: str
    full_name: str
    wallet_address: str | None
    role: UserRole
    is_active: bool
    created_at: datetime
    updated_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse


class OrganizationCreate(Input):
    name: str = Field(min_length=2, max_length=200)
    slug: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=10000)


class OrganizationUpdate(Input):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=10000)


class OrganizationResponse(Output):
    id: str
    name: str
    slug: str
    description: str | None
    logo_data_url: str | None = None
    owner_id: str
    created_at: datetime
    updated_at: datetime


class MemberCreate(Input):
    user_id: Identifier
    role: MemberRole = MemberRole.MEMBER


class MemberUpdate(Input):
    role: MemberRole


class MemberResponse(Output):
    id: str
    organization_id: str
    user_id: str
    role: MemberRole
    created_at: datetime


class EventCreate(Input):
    organization_id: Identifier
    name: str = Field(min_length=3, max_length=255)
    description: str | None = Field(default=None, max_length=10000)
    start_date: UTCDate
    end_date: UTCDate
    location: str | None = Field(default=None, max_length=255)
    status: EventStatus = EventStatus.DRAFT

    @model_validator(mode="after")
    def dates(self):
        if self.end_date <= self.start_date:
            raise ValueError("end_date must be after start_date")
        if self.status not in (EventStatus.DRAFT, EventStatus.ACTIVE):
            raise ValueError("New events must be draft or active")
        return self


class EventUpdate(Input):
    name: str | None = Field(default=None, min_length=3, max_length=255)
    description: str | None = Field(default=None, max_length=10000)
    start_date: UTCDate | None = None
    end_date: UTCDate | None = None
    location: str | None = Field(default=None, max_length=255)
    status: EventStatus | None = None


class EventResponse(Output):
    id: str
    organization_id: str
    organizer_id: str
    name: str
    description: str | None
    start_date: datetime
    end_date: datetime
    location: str | None
    status: EventStatus
    created_at: datetime
    updated_at: datetime


class ParticipantCreate(Input):
    user_id: Identifier


class AttendanceUpdate(Input):
    status: AttendanceStatus


class ParticipantResponse(Output):
    id: str
    event_id: str
    user_id: str
    status: AttendanceStatus
    attended_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ParticipantDetail(ParticipantResponse):
    full_name: str
    wallet_address: str | None


class CSVImportResult(BaseModel):
    imported: int
    participants: list[ParticipantResponse]


class CertificateIssuanceRequest(Input):
    event_id: Identifier
    recipient_id: Identifier
    token_uri: IPFSUri


class CertificateBatchIssuanceRequest(Input):
    certificates: list[CertificateIssuanceRequest] = Field(min_length=1, max_length=100)


class TransactionUpdate(Input):
    tx_hash: TxHash


class CertificateConfirmation(Input):
    token_id: TokenId
    tx_hash: TxHash


class CertificateFailure(Input):
    reason: str = Field(min_length=3, max_length=500)


class MintAttempt(Input):
    attempt_id: Identifier


class CertificateRevoke(Input):
    reason: str = Field(min_length=3, max_length=500)


class CertificateResponse(Output):
    id: str
    event_id: str
    recipient_id: str
    recipient_wallet: str
    recipient_name: str | None
    chain_id: int
    token_id: str | None
    token_uri: str | None
    contract_address: str | None
    tx_hash: str | None
    block_number: int | None
    status: CertificateStatus
    issued_at: datetime | None
    revoked_at: datetime | None
    revoke_reason: str | None
    failure_reason: str | None
    mint_attempt_id: str | None
    mint_started_at: datetime | None
    sync_from_block: int | None
    revocation_tx_hash: str | None
    created_at: datetime
    updated_at: datetime


class PublicCertificate(BaseModel):
    id: str
    event_id: str
    event_name: str
    organization_name: str
    chain_id: int
    token_id: str | None
    contract_address: str | None
    tx_hash: str | None
    status: CertificateStatus
    issued_at: datetime | None
    revoked_at: datetime | None


class VerificationResult(BaseModel):
    is_valid: bool
    on_chain_verified: bool = False
    source: str = "database"
    certificate: PublicCertificate
    message: str


class CertificateHistoryResponse(Output):
    id: str
    action: str
    source: str
    tx_hash: str | None
    block_number: int | None
    transaction_time: datetime | None
    actor_name: str | None
    actor_address: str | None
    created_at: datetime


class ChainHistoryEntry(BaseModel):
    action: str
    source: str = "blockchain"
    tx_hash: str | None
    block_number: int | None
    transaction_time: datetime | None
    actor_address: str | None


class BlockchainVerificationResult(BaseModel):
    status: Literal["VALID", "REVOKED", "INVALID", "NOT FOUND"]
    is_valid: bool = False
    on_chain_verified: bool = False
    chain_id: int
    contract_address: str
    token_id: str
    message: str
    checks: dict[str, bool | None] = Field(default_factory=dict)
    owner_address: str | None = None
    metadata_uri: str | None = None
    event_name: str | None = None
    organization_name: str | None = None
    issued_at: datetime | None = None
    history: list[ChainHistoryEntry] = Field(default_factory=list)


class CertificateDocument(BaseModel):
    id: str
    recipient_name: str
    event_name: str
    event_start_date: datetime
    event_end_date: datetime
    organization_name: str
    organization_logo: str | None
    chain_id: int
    contract_address: str
    token_id: str
    issued_at: datetime
    tx_hash: str
    status: CertificateStatus
    verification_url: str


class AuditResponse(Output):
    id: str
    actor_id: str | None
    action: str
    entity_type: str
    entity_id: str
    details: dict
    created_at: datetime


class MetadataInput(Input):
    name: str = Field(min_length=1, max_length=255)
    description: str = Field(max_length=10000)
    image: IPFSUri
    attributes: list[dict[str, str | int | float]] = Field(default_factory=list, max_length=50)


class IPFSResponse(BaseModel):
    cid: str
    uri: str
