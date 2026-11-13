from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm.exc import StaleDataError

from app.core.security import create_access_token
from app.models.models import Certificate, CertificateStatus, Participant, User, UserRole


def test_simultaneous_registration_has_one_winner(ctx, event):
    barrier = Barrier(2)

    def register():
        barrier.wait(timeout=10)
        return ctx.client.post(f"/api/v1/events/{event['id']}/register", headers=ctx.headers["participant"]).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(register), pool.submit(register)]
        statuses = sorted(f.result(timeout=20) for f in futures)
    assert statuses == [201, 409]
    with ctx.db() as db:
        count = db.scalar(
            select(func.count())
            .select_from(Participant)
            .where(Participant.event_id == event["id"], Participant.user_id == ctx.users["participant"].id)
        )
        assert count == 1


def test_stale_certificate_update_cannot_overwrite_new_state(ctx, pending):
    with ctx.db() as first, ctx.db() as second:
        first_record = first.get(Certificate, pending["id"])
        stale_record = second.get(Certificate, pending["id"])
        first_record.status = CertificateStatus.FAILED
        first_record.failure_reason = "Transaction reverted"
        first.commit()
        stale_record.tx_hash = "0x" + "f" * 64
        with pytest.raises(StaleDataError):
            second.commit()
        second.rollback()
    with ctx.db() as db:
        assert db.get(Certificate, pending["id"]).status == CertificateStatus.FAILED
        assert db.get(Certificate, pending["id"]).tx_hash is None


def test_concurrent_admin_demotions_preserve_an_active_administrator(ctx):
    with ctx.db() as db:
        second = db.get(User, ctx.users["other"].id)
        second.role = UserRole.ADMIN
        db.commit()
        second_header = {"Authorization": "Bearer " + create_access_token(second)}
    barrier = Barrier(2)

    def demote(user_id, header):
        barrier.wait(timeout=10)
        return ctx.client.patch(f"/api/v1/users/{user_id}", headers=header, json={"role": "participant"}).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(demote, ctx.users["admin"].id, ctx.headers["admin"])
        second = pool.submit(demote, ctx.users["other"].id, second_header)
        statuses = sorted([first.result(timeout=25), second.result(timeout=25)])
    assert statuses == [200, 409]
    with ctx.db() as db:
        count = db.scalar(
            select(func.count()).select_from(User).where(User.role == UserRole.ADMIN, User.is_active.is_(True))
        )
        assert count == 1
