"""Intentionally public verification with a minimal response schema."""

from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.api.dependencies import DB
from app.core.errors import fail
from app.core.validation import Address, Identifier, TokenId
from app.models.models import Certificate
from app.schemas.schemas import BlockchainVerificationResult, VerificationResult
from app.services import certificates
from app.services.common import get_or_404
from app.services.verification import verify_token

router = APIRouter()


@router.get("/blockchain", response_model=BlockchainVerificationResult)
def blockchain(
    db: DB, chain_id: Annotated[int, Query(gt=0, le=2**63 - 1)], contract_address: Address, token_id: TokenId
):
    """Verify chain state and mint/revocation receipts, even without a SQLite row."""
    return verify_token(db, chain_id, contract_address, token_id)


@router.get("/certificate/{certificate_id}", response_model=VerificationResult)
def by_id(certificate_id: Identifier, db: DB, on_chain: bool = False):
    """No email, account ID, wallet, IPFS metadata or private reason is exposed."""
    return certificates.verify(get_or_404(db, Certificate, certificate_id), on_chain)


@router.get("/token/{token_id}", response_model=VerificationResult)
def by_token(
    token_id: TokenId,
    db: DB,
    contract_address: Address | None = None,
    chain_id: Annotated[int | None, Query(gt=0, le=2**63 - 1)] = None,
    on_chain: bool = False,
):
    stmt = select(Certificate).where(Certificate.token_id == token_id)
    if contract_address:
        stmt = stmt.where(Certificate.contract_address == contract_address)
    if chain_id is not None:
        if chain_id <= 0:
            fail(422, "invalid_chain_id", "chain_id must be positive")
        stmt = stmt.where(Certificate.chain_id == chain_id)
    matches = db.scalars(stmt.limit(2)).all()
    if not matches:
        fail(404, "not_found", "Certificate not found")
    if len(matches) > 1:
        fail(409, "ambiguous_token", "Supply chain_id and contract_address to identify this token")
    return certificates.verify(matches[0], on_chain)
