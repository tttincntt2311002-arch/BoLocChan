from fastapi import APIRouter

from app.api.dependencies import DB, CurrentUser, Limit, Skip
from app.core.validation import Identifier
from app.models.models import Certificate, CertificateStatus
from app.schemas.schemas import (
    CertificateBatchIssuanceRequest,
    CertificateConfirmation,
    CertificateFailure,
    CertificateIssuanceRequest,
    CertificateResponse,
    CertificateRevoke,
    Page,
    TransactionUpdate,
)
from app.services import certificates
from app.services.common import get_or_404, page

router = APIRouter()


@router.post("/issue", response_model=CertificateResponse, status_code=202)
def issue(payload: CertificateIssuanceRequest, user: CurrentUser, db: DB):
    """Create a pending record. Mint with the contract, then call /confirm."""
    return certificates.issue(db, user, payload)


@router.post("/issue/batch", response_model=list[CertificateResponse], status_code=202)
def batch(payload: CertificateBatchIssuanceRequest, user: CurrentUser, db: DB):
    """Atomic batch of up to 100 pending certificates."""
    return certificates.issue_batch(db, user, payload)


@router.get("", response_model=Page[CertificateResponse])
def list_certificates(
    user: CurrentUser,
    db: DB,
    skip: Skip = 0,
    limit: Limit = 20,
    event_id: Identifier | None = None,
    status: CertificateStatus | None = None,
):
    stmt = certificates.visible_certificates(user)
    if event_id:
        stmt = stmt.where(Certificate.event_id == event_id)
    if status:
        stmt = stmt.where(Certificate.status == status)
    return page(db, stmt.order_by(Certificate.created_at, Certificate.id), skip, limit)


@router.get("/{certificate_id}", response_model=CertificateResponse)
def get(certificate_id: Identifier, user: CurrentUser, db: DB):
    return certificates.read(db, user, certificate_id)


@router.patch("/{certificate_id}/transaction", response_model=CertificateResponse)
def transaction(certificate_id: Identifier, payload: TransactionUpdate, user: CurrentUser, db: DB):
    return certificates.submit_transaction(db, user, get_or_404(db, Certificate, certificate_id), payload.tx_hash)


@router.post("/{certificate_id}/confirm", response_model=CertificateResponse)
def confirm(certificate_id: Identifier, payload: CertificateConfirmation, user: CurrentUser, db: DB):
    """Verify successful receipt, confirmations, contract, mint log and current state."""
    return certificates.confirm(db, user, get_or_404(db, Certificate, certificate_id), payload)


@router.post("/{certificate_id}/fail", response_model=CertificateResponse)
def fail_certificate(certificate_id: Identifier, payload: CertificateFailure, user: CurrentUser, db: DB):
    return certificates.mark_failed(db, user, get_or_404(db, Certificate, certificate_id), payload.reason)


@router.post("/{certificate_id}/retry", response_model=CertificateResponse, status_code=202)
def retry(certificate_id: Identifier, user: CurrentUser, db: DB):
    return certificates.retry(db, user, get_or_404(db, Certificate, certificate_id))


@router.post("/{certificate_id}/revoke", response_model=CertificateResponse)
def revoke(certificate_id: Identifier, payload: CertificateRevoke, user: CurrentUser, db: DB):
    """Revoke in this registry immediately. This endpoint does not sign an on-chain transaction."""
    return certificates.revoke(db, user, get_or_404(db, Certificate, certificate_id), payload.reason)
