"""
Authentication endpoints – MetaMask wallet-based sign-in (Sign-In with Ethereum)
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.schemas.schemas import NonceRequest, NonceResponse, SignatureVerifyRequest, TokenResponse

router = APIRouter()


@router.post("/nonce", response_model=NonceResponse, summary="Get nonce for wallet sign-in")
async def get_nonce(payload: NonceRequest, db: Session = Depends(get_db)):
    """
    Returns a unique nonce for the given wallet address.
    The frontend must sign this nonce with MetaMask and send the
    signature to /auth/verify to obtain a JWT token.

    Business logic will be implemented in a later phase.
    """
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Authentication not yet implemented – scaffold only",
    )


@router.post("/verify", response_model=TokenResponse, summary="Verify MetaMask signature")
async def verify_signature(payload: SignatureVerifyRequest, db: Session = Depends(get_db)):
    """
    Verifies the MetaMask signature against the stored nonce.
    Returns a JWT access token on success.

    Business logic will be implemented in a later phase.
    """
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Authentication not yet implemented – scaffold only",
    )


@router.post("/refresh", summary="Refresh access token")
async def refresh_token():
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Token refresh not yet implemented – scaffold only",
    )
