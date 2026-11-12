"""
Certificate verification endpoints (public, no auth required)
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.schemas.schemas import VerificationResult

router = APIRouter()


@router.get("/wallet/{wallet_address}", response_model=list[VerificationResult], summary="Verify by wallet")
async def verify_by_wallet(wallet_address: str, db: Session = Depends(get_db)):
    """
    Returns all certificates linked to the given wallet address.
    Cross-checks database records with on-chain state.
    """
    raise HTTPException(status_code=501, detail="Not yet implemented – scaffold only")


@router.get("/token/{token_id}", response_model=VerificationResult, summary="Verify by token ID")
async def verify_by_token_id(token_id: int, db: Session = Depends(get_db)):
    """
    Verifies a specific SBT token by its on-chain token ID.
    Returns combined on-chain + off-chain certificate data.
    """
    raise HTTPException(status_code=501, detail="Not yet implemented – scaffold only")


@router.get("/certificate/{certificate_id}", response_model=VerificationResult, summary="Verify by certificate ID")
async def verify_by_certificate_id(certificate_id: str, db: Session = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not yet implemented – scaffold only")
