from fastapi import APIRouter, Response
from sqlalchemy import select

from app.api.dependencies import DB, CurrentUser, Limit, Skip
from app.core.errors import fail
from app.core.validation import Address, Identifier
from app.models.models import Certificate, CertificateHistory, CertificateStatus
from app.schemas.schemas import (
    CertificateBatchIssuanceRequest,
    CertificateConfirmation,
    CertificateDocument,
    CertificateFailure,
    CertificateHistoryResponse,
    CertificateIssuanceRequest,
    CertificateResponse,
    CertificateRevoke,
    MintAttempt,
    Page,
    TransactionUpdate,
)
from app.services import certificates, documents
from app.services.common import get_or_404, page
from app.services.verification import verify_token

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
    wallet_address: Address | None = None,
    mine: bool = False,
):
    stmt = certificates.visible_certificates(user)
    if event_id:
        stmt = stmt.where(Certificate.event_id == event_id)
    if status:
        stmt = stmt.where(Certificate.status == status)
    if wallet_address:
        stmt = stmt.where(Certificate.recipient_wallet == wallet_address)
    if mine:
        stmt = stmt.where(Certificate.recipient_id == user.id)
    return page(db, stmt.order_by(Certificate.created_at, Certificate.id), skip, limit)


@router.get("/{certificate_id}", response_model=CertificateResponse)
def get(certificate_id: Identifier, user: CurrentUser, db: DB):
    return certificates.read(db, user, certificate_id)


@router.get("/{certificate_id}/document", response_model=CertificateDocument)
def document(certificate_id: Identifier, user: CurrentUser, db: DB):
    return documents.document_data(certificates.read(db, user, certificate_id))


@router.get("/{certificate_id}/qr.png")
def qr(certificate_id: Identifier, user: CurrentUser, db: DB):
    data = documents.document_data(certificates.read(db, user, certificate_id))
    return Response(
        documents.qr_png(data["verification_url"]),
        media_type="image/png",
        headers={"Content-Disposition": f'attachment; filename="certificate-{data["token_id"]}-qr.png"'},
    )


@router.get("/{certificate_id}/pdf")
def pdf(certificate_id: Identifier, user: CurrentUser, db: DB):
    certificate = certificates.read(db, user, certificate_id)
    data = documents.document_data(certificate)
    result = verify_token(db, certificate.chain_id, certificate.contract_address, certificate.token_id, certificate)
    if result["status"] != "VALID":
        fail(409, "certificate_not_valid", "Only a currently VALID blockchain certificate can be exported as PDF")
    return Response(
        documents.certificate_pdf(data),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="certificate-{data["token_id"]}.pdf"'},
    )


@router.get("/{certificate_id}/history", response_model=Page[CertificateHistoryResponse])
def history(certificate_id: Identifier, user: CurrentUser, db: DB, skip: Skip = 0, limit: Limit = 20):
    certificates.read(db, user, certificate_id)
    return page(
        db,
        select(CertificateHistory)
        .where(CertificateHistory.certificate_id == certificate_id)
        .order_by(CertificateHistory.transaction_time, CertificateHistory.created_at, CertificateHistory.id),
        skip,
        limit,
    )


@router.patch("/{certificate_id}/revocation-transaction", response_model=CertificateResponse)
def revocation_transaction(certificate_id: Identifier, payload: TransactionUpdate, user: CurrentUser, db: DB):
    certificate = get_or_404(db, Certificate, certificate_id)
    return certificates.submit_revocation(db, user, certificate, payload.tx_hash)


@router.post("/{certificate_id}/mint-claim", response_model=CertificateResponse)
def mint_claim(certificate_id: Identifier, payload: MintAttempt, user: CurrentUser, db: DB):
    return certificates.claim_mint(db, user, get_or_404(db, Certificate, certificate_id), payload.attempt_id)


@router.post("/{certificate_id}/mint-release", response_model=CertificateResponse)
def mint_release(certificate_id: Identifier, payload: MintAttempt, user: CurrentUser, db: DB):
    return certificates.release_mint(db, user, get_or_404(db, Certificate, certificate_id), payload.attempt_id)


@router.post("/{certificate_id}/sync", response_model=CertificateResponse)
def sync(certificate_id: Identifier, user: CurrentUser, db: DB):
    certificate = certificates.read(db, user, certificate_id)
    return certificates.reconcile(db, certificate, user)


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
