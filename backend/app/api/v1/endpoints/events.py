"""
Event management endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.schemas.schemas import EventCreate, EventUpdate, EventResponse

router = APIRouter()


@router.post("/", response_model=EventResponse, status_code=status.HTTP_201_CREATED, summary="Create event")
async def create_event(payload: EventCreate, db: Session = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not yet implemented – scaffold only")


@router.get("/", response_model=list[EventResponse], summary="List events")
async def list_events(skip: int = 0, limit: int = 20, db: Session = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not yet implemented – scaffold only")


@router.get("/{event_id}", response_model=EventResponse, summary="Get event by ID")
async def get_event(event_id: str, db: Session = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not yet implemented – scaffold only")


@router.put("/{event_id}", response_model=EventResponse, summary="Update event")
async def update_event(event_id: str, payload: EventUpdate, db: Session = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not yet implemented – scaffold only")


@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete event")
async def delete_event(event_id: str, db: Session = Depends(get_db)):
    raise HTTPException(status_code=501, detail="Not yet implemented – scaffold only")
