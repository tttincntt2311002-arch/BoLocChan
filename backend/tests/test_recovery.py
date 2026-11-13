from unittest.mock import patch
from uuid import uuid4

import pytest

from app.services.blockchain import BlockchainVerifier
from tests.conftest import CONTRACT, TX


def test_lost_hash_recovers_from_logs_and_uses_blockchain_timestamp(ctx, pending, rpc_mock):
    mock = rpc_mock(pending, token_id="0")
    mock.responses["eth_getLogs"] = [{**mock.responses["eth_getTransactionReceipt"]["logs"][0], "transactionHash": TX}]
    response = ctx.client.post(f"/api/v1/certificates/{pending['id']}/sync", headers=ctx.headers["organizer"])
    assert response.status_code == 200, response.text
    record = response.json()
    assert record["status"] == "issued"
    assert record["token_id"] == "0"
    assert record["tx_hash"] == TX
    assert record["issued_at"].startswith("1970-01-15")  # log timestamp 1234567, not server time
    assert any(method == "eth_getLogs" for method, _ in mock.calls)
    again = ctx.client.post(
        f"/api/v1/certificates/{pending['id']}/confirm",
        headers=ctx.headers["organizer"],
        json={"token_id": "0", "tx_hash": TX},
    )
    assert again.status_code == 200


def test_mint_claim_blocks_other_tabs_and_release_requires_same_attempt(ctx, pending, rpc_mock):
    rpc_mock(pending)
    root = f"/api/v1/certificates/{pending['id']}"
    attempt = str(uuid4())
    headers = ctx.headers["organizer"]
    assert ctx.client.post(root + "/mint-claim", headers=headers, json={"attempt_id": attempt}).status_code == 200
    assert ctx.client.post(root + "/mint-claim", headers=headers, json={"attempt_id": attempt}).status_code == 200
    assert ctx.client.post(root + "/mint-claim", headers=headers, json={"attempt_id": str(uuid4())}).status_code == 409
    assert (
        ctx.client.post(root + "/mint-release", headers=headers, json={"attempt_id": str(uuid4())}).status_code == 409
    )
    assert ctx.client.post(root + "/mint-release", headers=headers, json={"attempt_id": attempt}).status_code == 200


def test_pending_transaction_cannot_be_marked_failed_by_browser(ctx, pending, rpc_mock):
    mock = rpc_mock(pending)
    mock.responses["eth_getTransactionReceipt"] = None
    mock.responses["eth_getLogs"] = []
    root = f"/api/v1/certificates/{pending['id']}"
    headers = ctx.headers["organizer"]
    assert ctx.client.patch(root + "/transaction", headers=headers, json={"tx_hash": TX}).status_code == 200
    assert ctx.client.post(root + "/fail", headers=headers, json={"reason": "Browser timeout"}).status_code == 409
    response = ctx.client.post(root + "/sync", headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "pending"


def test_background_worker_finishes_without_frontend_confirmation(ctx, pending, rpc_mock):
    from app.services.sync import sync_pending

    rpc_mock(pending, token_id="0")
    root = f"/api/v1/certificates/{pending['id']}"
    ctx.client.patch(root + "/transaction", headers=ctx.headers["organizer"], json={"tx_hash": TX})
    sync_pending()
    record = ctx.client.get(root, headers=ctx.headers["participant"]).json()
    assert record["status"] == "issued"
    assert record["token_id"] == "0"


@pytest.mark.parametrize("confirmations,expected", [(1, "pending"), (3, "failed")])
def test_only_final_reverted_receipts_can_be_retried(ctx, pending, rpc_mock, confirmations, expected):
    rpc_mock(pending, receipt_status="0x0", confirmations=confirmations)
    root = f"/api/v1/certificates/{pending['id']}"
    headers = ctx.headers["organizer"]
    ctx.client.patch(root + "/transaction", headers=headers, json={"tx_hash": TX})
    ctx.client.post(root + "/sync", headers=headers)
    assert ctx.client.get(root, headers=headers).json()["status"] == expected
    assert ctx.client.post(root + "/retry", headers=headers).status_code == (202 if expected == "failed" else 409)


def test_sync_enforces_access_and_receipt_destination(ctx, pending, rpc_mock):
    mock = rpc_mock(pending)
    root = f"/api/v1/certificates/{pending['id']}"
    assert ctx.client.post(root + "/sync", headers=ctx.headers["other"]).status_code == 403
    ctx.client.patch(root + "/transaction", headers=ctx.headers["organizer"], json={"tx_hash": TX})
    mock.responses["eth_getTransactionReceipt"]["to"] = "0x" + "9" * 40
    result = ctx.client.post(root + "/sync", headers=ctx.headers["organizer"])
    assert result.status_code == 409
    assert result.json()["error"]["code"] == "contract_mismatch"
    assert ctx.client.get(root, headers=ctx.headers["organizer"]).json()["status"] == "pending"


def test_transaction_replacement_requires_same_sender_and_nonce(ctx, pending, rpc_mock):
    mock = rpc_mock(pending)
    root = f"/api/v1/certificates/{pending['id']}"
    headers = ctx.headers["organizer"]
    ctx.client.patch(root + "/transaction", headers=headers, json={"tx_hash": TX})
    replacement = "0x" + "d" * 64
    original_rpc = BlockchainVerifier.rpc

    def rpc(self, method, params):
        if method == "eth_getTransactionByHash":
            return {"from": CONTRACT, "nonce": "0x1" if params[0] == TX else "0x2"}
        return original_rpc(self, method, params)

    with patch.object(BlockchainVerifier, "rpc", rpc):
        response = ctx.client.patch(root + "/transaction", headers=headers, json={"tx_hash": replacement})
    assert response.status_code == 409
    assert mock.calls


@pytest.mark.parametrize(
    "field,value",
    [
        ("status", None),
        ("status", "0x2"),
        ("blockNumber", 100),
        ("blockHash", None),
        ("transactionHash", "0x1234"),
        ("logs", None),
        ("to", 123),
    ],
)
def test_malformed_rpc_evidence_never_marks_failure(ctx, pending, rpc_mock, field, value):
    mock = rpc_mock(pending)
    mock.responses["eth_getTransactionReceipt"][field] = value
    root = f"/api/v1/certificates/{pending['id']}"
    headers = ctx.headers["organizer"]
    ctx.client.patch(root + "/transaction", headers=headers, json={"tx_hash": TX})
    response = ctx.client.post(root + "/sync", headers=headers)
    assert response.status_code == 502, response.text
    assert response.json()["error"]["code"] == "invalid_receipt"
    record = ctx.client.get(root, headers=headers).json()
    assert record["status"] == "pending"
    assert record["tx_hash"] == TX
    assert record["token_id"] is None


def test_historical_log_scan_advances_with_small_block_range(ctx, pending, rpc_mock, monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setenv("SYNC_BLOCK_RANGE", "1")
    get_settings.cache_clear()
    mock = rpc_mock(pending)
    mock.responses["eth_getLogs"] = []
    root = f"/api/v1/certificates/{pending['id']}"
    headers = ctx.headers["organizer"]
    first = ctx.client.post(root + "/sync", headers=headers)
    second = ctx.client.post(root + "/sync", headers=headers)
    assert first.status_code == second.status_code == 200
    assert first.json()["sync_from_block"] == 1
    assert second.json()["sync_from_block"] == 2


def test_recovery_skips_event_logs_for_another_recipient(ctx, pending, rpc_mock):
    mock = rpc_mock(pending, wallet="0x" + "9" * 40)
    mock.responses["eth_getLogs"] = [{**mock.responses["eth_getTransactionReceipt"]["logs"][0], "transactionHash": TX}]
    response = ctx.client.post(f"/api/v1/certificates/{pending['id']}/sync", headers=ctx.headers["organizer"])
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "pending"
    assert response.json()["tx_hash"] is None


def test_worker_moves_past_twenty_records_that_keep_failing(ctx, pending, monkeypatch):
    from fastapi import HTTPException

    from app.models.models import Certificate, Event, Participant
    from app.services import sync

    with ctx.db() as db:
        source = db.get(Event, pending["event_id"])
        for _ in range(21):
            event = Event(
                name="Recovery backlog",
                organization_id=source.organization_id,
                organizer_id=source.organizer_id,
                start_date=source.start_date,
                end_date=source.end_date,
                status=source.status,
            )
            db.add(event)
            db.flush()
            db.add(Participant(event_id=event.id, user_id=pending["recipient_id"]))
            db.flush()
            db.add(
                Certificate(
                    event_id=event.id,
                    recipient_id=pending["recipient_id"],
                    recipient_wallet=pending["recipient_wallet"],
                    chain_id=pending["chain_id"],
                    tx_hash=TX,
                )
            )
        db.get(Certificate, pending["id"]).tx_hash = TX
        db.commit()
    attempted = []

    def unavailable(db, certificate):
        attempted.append(certificate.id)
        raise HTTPException(502, detail={"code": "blockchain_unavailable"})

    monkeypatch.setattr(sync, "reconcile", unavailable)
    cursor = sync.sync_pending()
    assert len(attempted) == 20
    cursor = sync.sync_pending(cursor)
    assert len(attempted) == len(set(attempted)) == 22
    assert sync.sync_pending(cursor) is None


def test_invalid_event_token_topic_returns_rpc_error_without_saving(ctx, pending, rpc_mock):
    mock = rpc_mock(pending)
    mock.responses["eth_getTransactionReceipt"]["logs"][0]["topics"][1] = "0x1234"
    root = f"/api/v1/certificates/{pending['id']}"
    headers = ctx.headers["organizer"]
    ctx.client.patch(root + "/transaction", headers=headers, json={"tx_hash": TX})
    response = ctx.client.post(root + "/sync", headers=headers)
    assert response.status_code == 502, response.text
    assert ctx.client.get(root, headers=headers).json()["status"] == "pending"


@pytest.mark.parametrize("height", [None, "0xinvalid", 100])
def test_invalid_rpc_height_does_not_create_a_mint_lock(ctx, pending, rpc_mock, height):
    mock = rpc_mock(pending)
    mock.responses["eth_blockNumber"] = height
    root = f"/api/v1/certificates/{pending['id']}"
    headers = ctx.headers["organizer"]
    response = ctx.client.post(root + "/mint-claim", headers=headers, json={"attempt_id": str(uuid4())})
    assert response.status_code == 502, response.text
    record = ctx.client.get(root, headers=headers).json()
    assert record["mint_attempt_id"] is None
    assert record["status"] == "pending"
