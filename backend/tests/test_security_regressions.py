"""Adversarial upstream responses must fail closed without saving a certificate."""

from unittest.mock import patch

import httpx
import pytest
from fastapi import HTTPException

from app.services.blockchain import BlockchainVerifier
from tests.conftest import TX


@pytest.mark.parametrize("rpc_error", ["upstream failure", ["failure"], True])
def test_malformed_rpc_errors_return_gateway_error(ctx, rpc_error):
    response = httpx.Response(200, json={"error": rpc_error})
    with patch("app.services.blockchain.httpx.Client") as client:
        client.return_value.__enter__.return_value.post.return_value = response
        response.request = httpx.Request("POST", "http://rpc.invalid")
        with pytest.raises(HTTPException) as caught:
            BlockchainVerifier().rpc("eth_call", [])
    assert caught.value.status_code == 502
    assert caught.value.detail["code"] == "blockchain_unavailable"


@pytest.mark.parametrize("target", ["block", "mint"])
def test_unrepresentable_timestamps_do_not_issue(ctx, pending, rpc_mock, target):
    mock = rpc_mock(pending)
    if target == "block":
        mock.responses["eth_getBlockByNumber"]["timestamp"] = hex(2**256 - 1)
    else:
        log = mock.responses["eth_getTransactionReceipt"]["logs"][0]
        data = bytearray.fromhex(log["data"][2:])
        data[96:128] = (2**256 - 1).to_bytes(32, "big")
        log["data"] = "0x" + data.hex()
    root = f"/api/v1/certificates/{pending['id']}"
    response = ctx.client.post(
        root + "/confirm", headers=ctx.headers["organizer"], json={"token_id": mock.token_id, "tx_hash": TX}
    )
    assert response.status_code == 502, response.text
    assert response.json()["error"]["code"] == "invalid_receipt"
    saved = ctx.client.get(root, headers=ctx.headers["organizer"]).json()
    assert saved["status"] == "pending"
    assert saved["token_id"] is None


@pytest.mark.parametrize("trait", ["recipient_id", "email", "full_name", "phone", "password", "wallet_address"])
def test_private_identity_traits_are_never_uploaded(ctx, trait):
    with patch("app.api.v1.endpoints.ipfs.upload_metadata") as upload:
        response = ctx.client.post(
            "/api/v1/ipfs/upload/metadata",
            headers=ctx.headers["organizer"],
            json={
                "name": "Public certificate",
                "description": "Public achievement",
                "image": "ipfs://bafyimage",
                "attributes": [{"trait_type": trait, "value": "private-value"}],
            },
        )
    assert response.status_code == 422
    upload.assert_not_called()


def test_public_metadata_is_forwarded_without_recipient_identity(ctx):
    payload = {
        "name": "Public certificate",
        "description": "Public achievement",
        "image": "ipfs://bafyimage",
        "attributes": [{"trait_type": "event_id", "value": "public-event"}],
    }
    with patch(
        "app.api.v1.endpoints.ipfs.upload_metadata", return_value={"cid": "bafytest", "uri": "ipfs://bafytest"}
    ) as upload:
        response = ctx.client.post("/api/v1/ipfs/upload/metadata", headers=ctx.headers["organizer"], json=payload)
    assert response.status_code == 201
    upload.assert_called_once_with(payload)
