"""
User management endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.schemas.schemas import UserResponse, UserCreate

router = APIRouter()


@router.get("/", response_model=list[UserResponse], summary="List users")
async def list_users(skip: int = 0, limit: int = 20, db: Session = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not yet implemented – scaffold only")


@router.get("/{user_id}", response_model=UserResponse, summary="Get user by ID")
async def get_user(user_id: str, db: Session = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not yet implemented – scaffold only")


@router.get("/wallet/{wallet_address}", response_model=UserResponse, summary="Get user by wallet")
async def get_user_by_wallet(wallet_address: str, db: Session = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not yet implemented – scaffold only")
