import pytest

from tests.conftest import TX


def confirm(ctx, certificate, mock):
    return ctx.client.post(
        f"/api/v1/certificates/{certificate['id']}/confirm",
        headers=ctx.headers["organizer"],
        json={"token_id": mock.token_id, "tx_hash": TX},
    )


@pytest.mark.parametrize("schema", ["modern", "legacy"])
def test_supports_new_contract_and_historical_contract_layouts(ctx, pending, rpc_mock, schema):
    mock = rpc_mock(pending, schema=schema)
    response = confirm(ctx, pending, mock)
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "issued"


def test_rejects_unknown_contract_tuple_layout(ctx, pending, rpc_mock):
    mock = rpc_mock(pending)
    raw = bytes.fromhex(mock.responses["eth_call"][2:])
    mock.responses["eth_call"] = "0x" + (raw[:32] + (224).to_bytes(32, "big") + raw[64:]).hex()
    response = confirm(ctx, pending, mock)
    assert response.status_code == 502, response.text
    assert response.json()["error"]["code"] == "invalid_contract_response"


def test_certificate_lifecycle_and_privacy(ctx, pending, rpc_mock):
    root = f"/api/v1/certificates/{pending['id']}"
    assert pending["status"] == "pending"
    duplicate = ctx.client.post(
        "/api/v1/certificates/issue",
        headers=ctx.headers["organizer"],
        json={
            "event_id": pending["event_id"],
            "recipient_id": pending["recipient_id"],
            "token_uri": pending["token_uri"],
        },
    )
    assert duplicate.status_code == 409
    assert ctx.client.get(root, headers=ctx.headers["other"]).status_code == 403
    assert ctx.client.get(root, headers=ctx.headers["participant"]).status_code == 200
    assert ctx.client.get("/api/v1/certificates", headers=ctx.headers["other"]).json()["total"] == 0
    assert ctx.client.get("/api/v1/certificates", headers=ctx.headers["participant"]).json()["total"] == 1
    assert (
        ctx.client.patch(root + "/transaction", headers=ctx.headers["participant"], json={"tx_hash": TX}).status_code
        == 403
    )
    assert (
        ctx.client.patch(root + "/transaction", headers=ctx.headers["organizer"], json={"tx_hash": TX}).status_code
        == 200
    )
    assert (
        ctx.client.post(
            root + "/confirm", headers=ctx.headers["participant"], json={"token_id": "0", "tx_hash": TX}
        ).status_code
        == 403
    )
    mock = rpc_mock(pending)
    result = confirm(ctx, pending, mock)
    assert result.status_code == 200, result.text
    assert result.json()["status"] == "issued"
    assert result.json()["token_id"] == str(2**200)
    assert result.json()["block_number"] == 100
    verified = ctx.client.get(f"/api/v1/verify/certificate/{pending['id']}")
    assert verified.status_code == 200
    assert verified.json()["is_valid"] is True
    assert verified.json()["on_chain_verified"] is False
    assert verified.json()["source"] == "database"
    public = verified.json()["certificate"]
    for field in [
        "recipient_id",
        "recipient_wallet",
        "email",
        "full_name",
        "revoke_reason",
        "failure_reason",
        "token_uri",
        "password_hash",
    ]:
        assert field not in public
    assert ctx.users["participant"].email not in verified.text
    by_token = ctx.client.get(f"/api/v1/verify/token/{mock.token_id}?on_chain=true")
    assert by_token.json()["on_chain_verified"] is True
    assert any(method == "eth_getTransactionReceipt" for method, params in mock.calls)
    revoked = ctx.client.post(
        root + "/revoke", headers=ctx.headers["organizer"], json={"reason": "Certificate withdrawn"}
    )
    assert revoked.status_code == 200, revoked.text
    assert ctx.client.get(f"/api/v1/verify/certificate/{pending['id']}").json()["is_valid"] is False
    assert confirm(ctx, pending, mock).status_code == 409


@pytest.mark.parametrize(
    "options,expected",
    [
        ({"receipt_status": "0x0"}, "transaction_failed"),
        ({"confirmations": 1}, "insufficient_confirmations"),
        ({"wallet": "0x" + "9" * 40}, "mint_log_mismatch"),
        ({"event_id": "00000000-0000-0000-0000-000000000001"}, "mint_log_mismatch"),
        ({"contract": "0x" + "9" * 40}, "mint_log_mismatch"),
        ({"revoked": True}, "onchain_invalid"),
    ],
)
def test_confirmation_rejects_invalid_blockchain_evidence(ctx, pending, rpc_mock, options, expected):
    mock = rpc_mock(pending, **options)
    response = confirm(ctx, pending, mock)
    assert response.status_code == 409, response.text
    assert response.json()["error"]["code"] == expected
    record = ctx.client.get(f"/api/v1/certificates/{pending['id']}", headers=ctx.headers["organizer"]).json()
    assert record["status"] == "pending"
    assert record["token_id"] is None


def test_confirmation_handles_pending_reorg_chain_and_metadata_mismatch(ctx, pending, rpc_mock):
    mock = rpc_mock(pending)
    receipt = mock.responses["eth_getTransactionReceipt"]
    mock.responses["eth_getTransactionReceipt"] = None
    assert confirm(ctx, pending, mock).json()["error"]["code"] == "transaction_pending"
    mock.responses["eth_getTransactionReceipt"] = receipt
    mock.responses["eth_chainId"] = "0x1"
    assert confirm(ctx, pending, mock).json()["error"]["code"] == "chain_mismatch"
    mock.responses["eth_chainId"] = hex(11155111)
    mock.responses["eth_getBlockByNumber"] = {"hash": "0x" + "d" * 64}
    assert confirm(ctx, pending, mock).json()["error"]["code"] == "noncanonical_transaction"


def test_confirmation_fails_closed_without_rpc_configuration(ctx, pending, monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setenv("WEB3_PROVIDER_URL", "")
    get_settings.cache_clear()
    response = ctx.client.post(
        f"/api/v1/certificates/{pending['id']}/confirm",
        headers=ctx.headers["organizer"],
        json={"token_id": "0", "tx_hash": TX},
    )
    assert response.status_code == 503, response.text
    assert response.json()["error"]["code"] == "blockchain_unconfigured"


def test_failed_retry_keeps_same_record(ctx, pending):
    root = f"/api/v1/certificates/{pending['id']}"
    assert (
        ctx.client.post(
            root + "/revoke", headers=ctx.headers["organizer"], json={"reason": "Invalid pending revoke"}
        ).status_code
        == 409
    )
    failed = ctx.client.post(root + "/fail", headers=ctx.headers["organizer"], json={"reason": "Transaction rejected"})
    assert failed.json()["status"] == "failed"
    retry = ctx.client.post(root + "/retry", headers=ctx.headers["organizer"])
    assert retry.status_code == 202, retry.text
    assert retry.json()["id"] == pending["id"]
    assert retry.json()["failure_reason"] is None
    assert ctx.client.post(root + "/retry", headers=ctx.headers["organizer"]).status_code == 409


def test_certificates_require_attendance_and_manager(ctx, event):
    payload = {"event_id": event["id"], "recipient_id": ctx.users["participant"].id, "token_uri": "ipfs://bafytest"}
    assert (
        ctx.client.post("/api/v1/certificates/issue", headers=ctx.headers["participant"], json=payload).status_code
        == 403
    )
    assert (
        ctx.client.post("/api/v1/certificates/issue", headers=ctx.headers["outsider"], json=payload).status_code == 403
    )
    assert (
        ctx.client.post("/api/v1/certificates/issue", headers=ctx.headers["organizer"], json=payload).status_code == 409
    )


def test_atomic_batch_rolls_back_on_duplicate(ctx, event):
    root = f"/api/v1/events/{event['id']}"
    registered = ctx.client.post(root + "/register", headers=ctx.headers["participant"]).json()
    ctx.client.patch(
        root + "/participants/" + registered["id"], headers=ctx.headers["organizer"], json={"status": "attended"}
    )
    payload = {"event_id": event["id"], "recipient_id": ctx.users["participant"].id, "token_uri": "ipfs://bafytest"}
    response = ctx.client.post(
        "/api/v1/certificates/issue/batch", headers=ctx.headers["organizer"], json={"certificates": [payload, payload]}
    )
    assert response.status_code == 409, response.text
    assert ctx.client.get("/api/v1/certificates", headers=ctx.headers["organizer"]).json()["total"] == 0
    logs = ctx.client.get("/api/v1/audit-logs?action=certificate.pending", headers=ctx.headers["admin"]).json()
    assert logs["total"] == 0


@pytest.mark.parametrize("token_id", ["-1", str(2**256), "01", "1.0"])
def test_invalid_token_ids_are_rejected(ctx, token_id):
    assert ctx.client.get("/api/v1/verify/token/" + token_id).status_code == 422


def test_pending_invalid_and_wallet_snapshot_preserved(ctx, pending):
    assert ctx.client.get(f"/api/v1/verify/certificate/{pending['id']}").json()["is_valid"] is False
    assert (
        ctx.client.put(
            "/api/v1/users/me/wallet", headers=ctx.headers["participant"], json={"wallet_address": "0x" + "9" * 40}
        ).status_code
        == 200
    )
    result = ctx.client.get(f"/api/v1/certificates/{pending['id']}", headers=ctx.headers["participant"]).json()
    assert result["recipient_wallet"] == pending["recipient_wallet"]
    root = f"/api/v1/events/{pending['event_id']}/participants"
    participant = ctx.client.get(root, headers=ctx.headers["organizer"]).json()["items"][0]
    assert (
        ctx.client.patch(
            root + "/" + participant["id"], headers=ctx.headers["organizer"], json={"status": "absent"}
        ).status_code
        == 409
    )


def test_token_zero_is_valid(ctx, pending, rpc_mock):
    mock = rpc_mock(pending, token_id="0")
    assert confirm(ctx, pending, mock).status_code == 200
    assert ctx.client.get("/api/v1/verify/token/0").json()["is_valid"] is True


def test_live_verification_detects_external_revocation(ctx, pending, rpc_mock):
    mock = rpc_mock(pending)
    assert confirm(ctx, pending, mock).status_code == 200
    rpc_mock(pending, revoked=True)
    response = ctx.client.get(f"/api/v1/verify/certificate/{pending['id']}?on_chain=true")
    assert response.status_code == 200, response.text
    assert response.json()["is_valid"] is False
    assert response.json()["source"] == "database_and_blockchain"
