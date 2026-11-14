import base64
import io
from types import SimpleNamespace
from urllib.parse import parse_qs, urlsplit

import pytest
from alembic import command
from eth_hash.auto import keccak
from PIL import Image
from pypdf import PdfReader
from sqlalchemy import select

from app.core.errors import fail
from app.db.migrate import alembic_config
from app.models.models import Certificate, CertificateHistory
from app.services.blockchain import REVOKED_TOPIC, BlockchainVerifier
from tests.conftest import CONTRACT, TX, string_data, uint_word

REV_TX = "0x" + "e" * 64
REVOKER = "0x" + "7" * 40


@pytest.fixture
def full_rpc(rpc_mock, monkeypatch):
    def install(certificate, *, revoked=False, owner=None, locked=True, uri=None, missing=False):
        mock = rpc_mock(certificate, token_id="0", revoked=revoked)
        base_rpc = BlockchainVerifier.rpc
        state = bytes.fromhex(mock.responses["eth_call"][2:])
        if revoked:
            state = state[:224] + uint_word(1234568) + bytes.fromhex(REVOKER[2:].rjust(64, "0")) + state[288:]
        selectors = {
            name: "0x" + keccak((name + "(uint256)").encode())[:4].hex()
            for name in ("ownerOf", "locked", "tokenURI", "getCertificate")
        }
        revocation = {
            "to": CONTRACT,
            "transactionHash": REV_TX,
            "status": "0x1",
            "blockNumber": "0x65",
            "blockHash": "0x" + "d" * 64,
            "logs": [
                {
                    "address": CONTRACT,
                    "topics": [REVOKED_TOPIC, "0x" + "0" * 64, "0x" + REVOKER[2:].rjust(64, "0")],
                    "data": "0x",
                }
            ],
        }
        calls = []

        def rpc(self, method, params):
            calls.append((method, params))
            if method == "eth_getCode":
                return "0x60006000"
            if method == "eth_call":
                selector = params[0]["data"][:10]
                if selector == selectors["ownerOf"]:
                    if missing:
                        fail(404, "token_not_found", "Token not found")
                    return "0x" + (owner or certificate["recipient_wallet"])[2:].rjust(64, "0")
                if selector == selectors["locked"]:
                    return "0x" + uint_word(int(locked)).hex()
                if selector == selectors["tokenURI"]:
                    return "0x" + (uint_word(32) + string_data(uri or certificate["token_uri"])).hex()
                return "0x" + state.hex()
            if method == "eth_getBlockByNumber":
                height = int(params[0], 16)
                return {"hash": "0x" + ("d" if height == 101 else "c") * 64, "timestamp": hex(1234467 + height)}
            if method == "eth_getTransactionReceipt" and params[0] == REV_TX:
                return revocation
            if method == "eth_getLogs":
                if params[0]["topics"][0] == REVOKED_TOPIC:
                    return [{**revocation["logs"][0], "transactionHash": REV_TX}] if revoked else []
                return [{**mock.responses["eth_getTransactionReceipt"]["logs"][0], "transactionHash": TX}]
            return base_rpc(self, method, params)

        monkeypatch.setattr(BlockchainVerifier, "rpc", rpc)
        return SimpleNamespace(mock=mock, calls=calls, revocation=revocation)

    return install


def issued(ctx, pending):
    response = ctx.client.post(
        f"/api/v1/certificates/{pending['id']}/confirm",
        headers=ctx.headers["organizer"],
        json={"token_id": "0", "tx_hash": TX},
    )
    assert response.status_code == 200, response.text
    return response.json()


def verify(ctx, **params):
    return ctx.client.get(
        "/api/v1/verify/blockchain",
        params={"chain_id": 11155111, "contract_address": CONTRACT, "token_id": "0", **params},
    )


def test_full_verification_reads_all_required_chain_checks(ctx, pending, full_rpc):
    rpc = full_rpc(pending)
    issued(ctx, pending)
    response = verify(ctx)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["status"] == "VALID"
    assert all(result["checks"].values())
    assert result["owner_address"] == pending["recipient_wallet"]
    assert result["history"][0]["tx_hash"] == TX
    for private in (
        ctx.users["participant"].email,
        ctx.users["participant"].full_name,
        '"actor_name"',
        '"recipient_id"',
    ):
        assert private not in response.text
    assert any(method == "eth_getTransactionReceipt" for method, _ in rpc.calls)


def test_token_without_sqlite_issuance_can_be_verified_from_logs(ctx, pending, full_rpc):
    rpc = full_rpc(pending)
    response = verify(ctx)
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "VALID"
    assert any(method == "eth_getLogs" for method, _ in rpc.calls)
    with ctx.db() as db:
        assert db.get(Certificate, pending["id"]).status.value == "pending"


@pytest.mark.parametrize("options", [{"owner": "0x" + "9" * 40}, {"locked": False}, {"uri": "ipfs://different"}])
def test_mismatched_owner_lock_or_metadata_is_invalid(ctx, pending, full_rpc, options):
    full_rpc(pending)
    issued(ctx, pending)
    full_rpc(pending, **options)
    response = verify(ctx)
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "INVALID"


def test_not_found_and_wrong_chain_or_contract_are_explicit(ctx, pending, full_rpc):
    full_rpc(pending, missing=True)
    assert verify(ctx).json()["status"] == "NOT FOUND"
    assert verify(ctx, chain_id=1).json()["status"] == "INVALID"
    assert verify(ctx, contract_address="0x" + "9" * 40).json()["status"] == "INVALID"


def test_revocation_is_verified_persisted_once_and_pdf_is_blocked(ctx, pending, full_rpc):
    full_rpc(pending)
    issued(ctx, pending)
    full_rpc(pending, revoked=True)
    for _ in range(2):
        response = verify(ctx)
        assert response.status_code == 200, response.text
        assert response.json()["status"] == "REVOKED"
    root = f"/api/v1/certificates/{pending['id']}"
    history = ctx.client.get(root + "/history", headers=ctx.headers["participant"])
    assert history.status_code == 200, history.text
    assert history.json()["total"] == 2
    revoked = next(row for row in history.json()["items"] if row["action"] == "revoked")
    assert revoked["tx_hash"] == REV_TX
    assert revoked["actor_address"] == REVOKER
    assert revoked["transaction_time"].startswith("1970-01-15")
    assert ctx.client.get(root + "/pdf", headers=ctx.headers["participant"]).status_code == 409


def test_qr_pdf_history_are_authorized_and_use_real_unicode_data(ctx, pending, full_rpc):
    full_rpc(pending)
    issued(ctx, pending)
    root = f"/api/v1/certificates/{pending['id']}"
    with ctx.db() as db:
        db.get(Certificate, pending["id"]).recipient_name = "Nguyễn Thị Ánh"
        db.commit()
    for path in ("/document", "/qr.png", "/pdf", "/history"):
        assert ctx.client.get(root + path).status_code == 401
        assert ctx.client.get(root + path, headers=ctx.headers["other"]).status_code == 403
    headers = ctx.headers["participant"]
    document = ctx.client.get(root + "/document", headers=headers).json()
    query = parse_qs(urlsplit(document["verification_url"]).query)
    assert query == {"chainId": ["11155111"], "contractAddress": [CONTRACT], "tokenId": ["0"]}
    qr = ctx.client.get(root + "/qr.png", headers=headers)
    assert qr.status_code == 200
    assert qr.content.startswith(b"\x89PNG")
    pdf = ctx.client.get(root + "/pdf", headers=headers)
    assert pdf.status_code == 200, pdf.text if pdf.status_code != 200 else ""
    reader = PdfReader(io.BytesIO(pdf.content))
    assert len(reader.pages) == 1
    page = reader.pages[0]
    assert float(page.mediabox.width) > float(page.mediabox.height)
    text = page.extract_text()
    for actual in ("Nguyễn Thị Ánh", "Certificate Workshop", CONTRACT, TX, "TOKEN ID  0"):
        assert actual in text
    assert any(
        annotation.get_object().get("/A", {}).get("/URI") == document["verification_url"]
        for annotation in page["/Annots"]
    )


def test_pending_documents_and_invalid_logos_are_rejected(ctx, pending, full_rpc, event):
    root = f"/api/v1/certificates/{pending['id']}"
    assert ctx.client.get(root + "/document", headers=ctx.headers["organizer"]).status_code == 409
    logo_path = f"/api/v1/organizations/{event['organization_id']}/logo"
    png = io.BytesIO()
    Image.new("RGB", (48, 48), "navy").save(png, format="PNG")
    assert (
        ctx.client.put(
            logo_path, headers=ctx.headers["participant"], files={"file": ("logo.png", png.getvalue(), "image/png")}
        ).status_code
        == 403
    )
    assert (
        ctx.client.put(
            logo_path, headers=ctx.headers["organizer"], files={"file": ("logo.svg", b"<svg/>", "image/svg+xml")}
        ).status_code
        == 422
    )
    response = ctx.client.put(
        logo_path, headers=ctx.headers["organizer"], files={"file": ("logo.png", png.getvalue(), "image/png")}
    )
    assert response.status_code == 200, response.text
    assert base64.b64decode(response.json()["logo_data_url"].split(",")[1]).startswith(b"\x89PNG")
    full_rpc(pending)
    issued(ctx, pending)
    pdf = ctx.client.get(root + "/pdf", headers=ctx.headers["participant"])
    assert pdf.status_code == 200
    assert len(PdfReader(io.BytesIO(pdf.content)).pages[0].images) == 2


def test_migration_backfills_existing_issue_and_registry_revocation(ctx, pending, full_rpc):
    full_rpc(pending)
    issued(ctx, pending)
    ctx.client.post(
        f"/api/v1/certificates/{pending['id']}/revoke",
        headers=ctx.headers["organizer"],
        json={"reason": "Registry withdrawal"},
    )
    config = alembic_config()
    command.downgrade(config, "0003")
    command.upgrade(config, "head")
    with ctx.db() as db:
        rows = db.scalars(select(CertificateHistory).where(CertificateHistory.certificate_id == pending["id"])).all()
        assert {row.action for row in rows} == {"issued", "revoked"}
        assert db.get(Certificate, pending["id"]).recipient_name == ctx.users["participant"].full_name
    command.check(config)


def test_revocation_intent_stays_pending_until_chain_evidence_then_worker_records_history(ctx, pending, full_rpc):
    from app.services.sync import sync_pending

    full_rpc(pending)
    issued(ctx, pending)
    root = f"/api/v1/certificates/{pending['id']}"
    headers = ctx.headers["organizer"]
    assert (
        ctx.client.patch(
            root + "/revocation-transaction", headers=ctx.headers["participant"], json={"tx_hash": REV_TX}
        ).status_code
        == 403
    )
    assert (
        ctx.client.patch(root + "/revocation-transaction", headers=headers, json={"tx_hash": REV_TX}).status_code == 200
    )
    full_rpc(pending, revoked=True)
    sync_pending()
    record = ctx.client.get(root, headers=headers).json()
    assert record["status"] == "revoked"
    assert record["revocation_tx_hash"] is None
    assert ctx.client.get(root + "/history", headers=headers).json()["total"] == 2


def test_failed_revocation_does_not_revoke_issued_certificate(ctx, pending, full_rpc):
    rpc = full_rpc(pending)
    issued(ctx, pending)
    root = f"/api/v1/certificates/{pending['id']}"
    headers = ctx.headers["organizer"]
    ctx.client.patch(root + "/revocation-transaction", headers=headers, json={"tx_hash": REV_TX})
    rpc.revocation["status"] = "0x0"
    rpc.revocation["logs"] = []
    response = ctx.client.post(root + "/sync", headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "issued"
    assert response.json()["revocation_tx_hash"] is None
    history = ctx.client.get(root + "/history", headers=headers).json()
    assert {row["action"] for row in history["items"]} == {"issued", "revocation_failed"}


def test_registry_revocation_is_labeled_without_inventing_a_blockchain_hash(ctx, pending, full_rpc):
    full_rpc(pending)
    issued(ctx, pending)
    root = f"/api/v1/certificates/{pending['id']}"
    ctx.client.post(root + "/revoke", headers=ctx.headers["organizer"], json={"reason": "Registry policy"})
    result = verify(ctx).json()
    assert result["status"] == "REVOKED"
    registry = next(row for row in result["history"] if row["source"] == "registry")
    assert registry["tx_hash"] is None
    assert "actor_name" not in registry


def test_pending_confirmations_are_errors_not_a_false_invalid_verdict(ctx, pending, full_rpc):
    rpc = full_rpc(pending)
    issued(ctx, pending)
    rpc.mock.responses["eth_blockNumber"] = "0x64"
    response = verify(ctx)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "insufficient_confirmations"


def test_rpc_on_wrong_chain_does_not_report_a_passed_chain_check(ctx, pending, full_rpc):
    rpc = full_rpc(pending)
    rpc.mock.responses["eth_chainId"] = "0x1"
    result = verify(ctx).json()
    assert result["status"] == "INVALID"
    assert result["checks"]["chain_id"] is False
