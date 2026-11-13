"""Append transaction evidence and preserve actor snapshots."""

from sqlalchemy import select

from app.models.models import CertificateHistory, User


def record_history(
    db,
    certificate,
    action,
    *,
    source="blockchain",
    tx_hash=None,
    block_number=None,
    transaction_time=None,
    actor_address=None,
    actor=None,
):
    existing = db.scalar(
        select(CertificateHistory).where(
            CertificateHistory.certificate_id == certificate.id,
            CertificateHistory.action == action,
            CertificateHistory.source == source,
            CertificateHistory.tx_hash == tx_hash,
        )
    )
    if existing:
        # Older rows can acquire missing chain evidence, never a different tx.
        if not existing.actor_address and actor_address:
            existing.actor_address = actor_address
        return existing
    if source == "blockchain":
        actor = db.scalar(select(User).where(User.wallet_address == actor_address)) if actor_address else None
    row = CertificateHistory(
        certificate_id=certificate.id,
        action=action,
        source=source,
        tx_hash=tx_hash,
        block_number=block_number,
        transaction_time=transaction_time,
        actor_address=actor_address,
        actor_id=actor.id if actor else None,
        actor_name=actor.full_name if actor else None,
    )
    db.add(row)
    return row
