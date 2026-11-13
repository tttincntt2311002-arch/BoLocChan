"""Recover submitted mints even when every browser is closed."""

import asyncio
import logging

from fastapi import HTTPException
from sqlalchemy import select

from app.core.config import get_settings
from app.db.base import new_session
from app.models.models import Certificate, CertificateStatus
from app.services.certificates import reconcile

logger = logging.getLogger(__name__)


def sync_pending(after_id: str | None = None):
    with new_session() as db:
        query = (
            select(Certificate.id)
            .where(
                (
                    (Certificate.status == CertificateStatus.PENDING)
                    & (Certificate.tx_hash.is_not(None) | Certificate.mint_attempt_id.is_not(None))
                )
                | Certificate.revocation_tx_hash.is_not(None),
            )
            .order_by(Certificate.id)
            .limit(20)
        )
        if after_id:
            query = query.where(Certificate.id > after_id)
        ids = db.scalars(query).all()
    for certificate_id in ids:
        with new_session() as db:
            try:
                reconcile(db, db.get(Certificate, certificate_id))
            except HTTPException:
                db.rollback()  # RPC outages/pending confirmations never mark failure.
            except Exception:
                db.rollback()
                logger.exception("Certificate recovery failed for %s", certificate_id)
    return ids[-1] if ids else None


async def recovery_loop():
    cursor = None
    while True:
        try:
            cursor = await asyncio.to_thread(sync_pending, cursor)
        except Exception:
            logger.exception("Certificate recovery iteration failed")
        await asyncio.sleep(get_settings().SYNC_INTERVAL_SECONDS)
