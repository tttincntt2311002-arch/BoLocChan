"""Certificate lifecycle. Database constraints prevent duplicate issuance."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import fail
from app.core.validation import normalize_address
from app.models.models import (
    AttendanceStatus,
    Certificate,
    CertificateStatus,
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
from app.schemas.schemas import PublicCertificate
from app.services.blockchain import BlockchainVerifier
from app.services.common import audit, can_manage_event, get_or_404, require_event_manager


def visible_certificates(user: User):
    stmt = select(Certificate)
    if user.role == UserRole.ADMIN:
        return stmt
    if user.role == UserRole.ORGANIZER:
        org_ids = (
            select(Organization.id)
            .where(Organization.owner_id == user.id)
            .union(
                select(OrganizationMember.organization_id).where(
                    OrganizationMember.user_id == user.id, OrganizationMember.role == MemberRole.ORGANIZER
                )
            )
        )
        events = select(Event.id).where(Event.organization_id.in_(org_ids))
        return stmt.where((Certificate.recipient_id == user.id) | Certificate.event_id.in_(events))
    return stmt.where(Certificate.recipient_id == user.id)


def read(db: Session, user: User, certificate_id: str) -> Certificate:
    certificate = get_or_404(db, Certificate, certificate_id)
    if certificate.recipient_id != user.id and not can_manage_event(db, certificate.event, user):
        fail(403, "certificate_forbidden", "You cannot access this certificate")
    return certificate


def prepare(db: Session, actor: User, payload) -> Certificate:
    event = get_or_404(db, Event, payload.event_id)
    require_event_manager(db, event, actor)
    if event.status in (EventStatus.DRAFT, EventStatus.CANCELLED):
        fail(409, "event_not_eligible", "Certificates require an active, closed or completed event")
    recipient = get_or_404(db, User, payload.recipient_id)
    if not recipient.is_active or not recipient.wallet_address:
        fail(409, "recipient_ineligible", "Recipient must be active and have a linked wallet")
    participant = db.scalar(
        select(Participant).where(Participant.event_id == event.id, Participant.user_id == recipient.id)
    )
    if not participant or participant.status != AttendanceStatus.ATTENDED:
        fail(409, "attendance_required", "Recipient must have confirmed attendance")
    if db.scalar(
        select(Certificate.id).where(Certificate.event_id == event.id, Certificate.recipient_id == recipient.id)
    ):
        fail(409, "certificate_exists", "A certificate already exists for this recipient and event")
    settings = get_settings()
    contract = None
    if settings.SBT_CONTRACT_ADDRESS:
        try:
            contract = normalize_address(settings.SBT_CONTRACT_ADDRESS)
        except ValueError:
            fail(503, "blockchain_unconfigured", "Configured SBT contract address is invalid")
    certificate = Certificate(
        event_id=event.id,
        recipient_id=recipient.id,
        recipient_wallet=recipient.wallet_address,
        chain_id=settings.CHAIN_ID,
        contract_address=contract,
        token_uri=payload.token_uri,
    )
    db.add(certificate)
    audit(db, actor, "certificate.pending", certificate)
    return certificate


def issue(db: Session, actor: User, payload):
    certificate = prepare(db, actor, payload)
    db.commit()
    return certificate


def issue_batch(db: Session, actor: User, payload):
    certificates = [prepare(db, actor, item) for item in payload.certificates]
    db.commit()
    return certificates


def authorize_change(db: Session, actor: User, certificate: Certificate):
    require_event_manager(db, certificate.event, actor)


def submit_transaction(db: Session, actor: User, certificate: Certificate, tx_hash: str):
    authorize_change(db, actor, certificate)
    if certificate.status != CertificateStatus.PENDING:
        fail(409, "invalid_transition", "Only pending certificates accept transactions")
    if certificate.tx_hash and certificate.tx_hash != tx_hash:
        fail(409, "transaction_exists", "A transaction is already attached; fail and retry before replacing it")
    certificate.tx_hash = tx_hash
    audit(db, actor, "certificate.transaction_submitted", certificate)
    db.commit()
    return certificate


def confirm(db: Session, actor: User, certificate: Certificate, payload):
    authorize_change(db, actor, certificate)
    if certificate.status != CertificateStatus.PENDING:
        fail(409, "invalid_transition", "Only pending certificates can be confirmed")
    if certificate.tx_hash and certificate.tx_hash != payload.tx_hash:
        fail(409, "transaction_mismatch", "Hash differs from the recorded pending transaction")
    verifier = BlockchainVerifier()
    result = verifier.confirm(certificate, payload.token_id, payload.tx_hash)
    certificate.token_id = payload.token_id
    # Check current revocation state before accepting a historical mint receipt.
    if not verifier.current_validity(certificate):
        fail(409, "onchain_invalid", "Contract state does not match or the token was revoked")
    certificate.tx_hash = payload.tx_hash
    certificate.contract_address = result["contract_address"]
    certificate.block_number = result["block_number"]
    certificate.status = CertificateStatus.ISSUED
    certificate.issued_at = utcnow()
    audit(db, actor, "certificate.issued", certificate)
    db.commit()
    return certificate


def mark_failed(db: Session, actor: User, certificate: Certificate, reason: str):
    authorize_change(db, actor, certificate)
    if certificate.status != CertificateStatus.PENDING:
        fail(409, "invalid_transition", "Only pending certificates can be marked failed")
    certificate.status = CertificateStatus.FAILED
    certificate.failure_reason = reason
    audit(db, actor, "certificate.failed", certificate)
    db.commit()
    return certificate


def retry(db: Session, actor: User, certificate: Certificate):
    authorize_change(db, actor, certificate)
    if certificate.status != CertificateStatus.FAILED:
        fail(409, "invalid_transition", "Only failed certificates can be retried")
    participant = db.scalar(
        select(Participant).where(
            Participant.event_id == certificate.event_id, Participant.user_id == certificate.recipient_id
        )
    )
    if (
        participant.status != AttendanceStatus.ATTENDED
        or not certificate.recipient.is_active
        or certificate.event.status in (EventStatus.DRAFT, EventStatus.CANCELLED)
    ):
        fail(409, "recipient_ineligible", "Recipient or event is no longer eligible")
    certificate.status = CertificateStatus.PENDING
    certificate.failure_reason = None
    certificate.tx_hash = None
    audit(db, actor, "certificate.retried", certificate)
    db.commit()
    return certificate


def revoke(db: Session, actor: User, certificate: Certificate, reason: str):
    authorize_change(db, actor, certificate)
    if certificate.status != CertificateStatus.ISSUED:
        fail(409, "invalid_transition", "Only issued certificates can be revoked")
    certificate.status = CertificateStatus.REVOKED
    certificate.revoked_at = utcnow()
    certificate.revoked_by_id = actor.id
    certificate.revoke_reason = reason
    audit(db, actor, "certificate.revoked", certificate)
    db.commit()
    return certificate


def verify(certificate: Certificate, on_chain: bool = False):
    valid = certificate.status == CertificateStatus.ISSUED
    checked = False
    if on_chain and certificate.token_id is not None:
        chain_valid = BlockchainVerifier().current_validity(certificate)
        valid = valid and chain_valid
        checked = True
    public = PublicCertificate(
        id=certificate.id,
        event_id=certificate.event_id,
        event_name=certificate.event.name,
        organization_name=certificate.event.organization.name,
        chain_id=certificate.chain_id,
        token_id=certificate.token_id,
        contract_address=certificate.contract_address,
        tx_hash=certificate.tx_hash,
        status=certificate.status,
        issued_at=certificate.issued_at,
        revoked_at=certificate.revoked_at,
    )
    return {
        "is_valid": valid,
        "on_chain_verified": checked and valid,
        "source": "database_and_blockchain" if checked else "database",
        "certificate": public,
        "message": "Certificate is valid" if valid else "Certificate is not valid",
    }
