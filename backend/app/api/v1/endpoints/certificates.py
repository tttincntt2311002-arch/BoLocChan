"""
Certificate issuance and management endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.schemas.schemas import (
    CertificateIssuanceRequest,
    CertificateBatchIssuanceRequest,
    CertificateResponse,
)

router = APIRouter()


@router.post(
    "/issue",
    response_model=CertificateResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Issue a certificate (single)",
)
async def issue_certificate(payload: CertificateIssuanceRequest, db: Session = Depends(get_db)):
    """
    Queues minting of a Soulbound Token certificate for one recipient.
    Business logic (IPFS upload + on-chain minting) will be implemented later.
    """
    raise HTTPException(status_code=501, detail="Not yet implemented – scaffold only")


@router.post(
    "/issue/batch",
    response_model=list[CertificateResponse],
    status_code=status.HTTP_202_ACCEPTED,
    summary="Issue certificates (batch)",
)
async def issue_certificates_batch(payload: CertificateBatchIssuanceRequest, db: Session = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not yet implemented – scaffold only")


@router.get("/", response_model=list[CertificateResponse], summary="List certificates")
async def list_certificates(
    event_id: str | None = None,
    wallet: str | None = None,
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    raise HTTPException(status_code=501, detail="Not yet implemented – scaffold only")


@router.get("/{certificate_id}", response_model=CertificateResponse, summary="Get certificate by ID")
async def get_certificate(certificate_id: str, db: Session = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not yet implemented – scaffold only")


@router.post("/{certificate_id}/revoke", summary="Revoke a certificate")
async def revoke_certificate(certificate_id: str, db: Session = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not yet implemented – scaffold only")
