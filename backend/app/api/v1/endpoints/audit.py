from typing import Annotated

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.api.dependencies import DB, Admin, Limit, Skip
from app.core.validation import Identifier
from app.models.models import AuditLog
from app.schemas.schemas import AuditResponse, Page
from app.services.common import page

router = APIRouter()


@router.get("", response_model=Page[AuditResponse])
def list_logs(
    admin: Admin,
    db: DB,
    skip: Skip = 0,
    limit: Limit = 20,
    actor_id: Identifier | None = None,
    action: Annotated[str | None, Query(max_length=100)] = None,
):
    stmt = select(AuditLog)
    if actor_id:
        stmt = stmt.where(AuditLog.actor_id == actor_id)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    return page(db, stmt.order_by(AuditLog.created_at.desc(), AuditLog.id), skip, limit)
