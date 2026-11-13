"""Each API test uses an isolated, Alembic-migrated SQLite database."""

import os
from datetime import timedelta
from types import SimpleNamespace

os.environ.setdefault("SECRET_KEY", "test-only-signing-key-" + "x" * 48)
os.environ.setdefault("APP_ENV", "test")

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.core.security import create_access_token, hash_password
from app.db.base import get_engine, new_session
from app.db.migrate import upgrade
from app.models.models import User, UserRole, utcnow
from main import create_app

PASSWORD = "StrongPassword2026!"
CONTRACT = "0x" + "a" * 40
TX = "0x" + "b" * 64


@pytest.fixture(scope="session")
def password_hash():
    return hash_password(PASSWORD)


@pytest.fixture
def ctx(tmp_path, monkeypatch, password_hash):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///" + (tmp_path / "api.db").as_posix())
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("SECRET_KEY", "isolated-api-tests-" + "k" * 48)
    monkeypatch.setenv("SBT_CONTRACT_ADDRESS", CONTRACT)
    monkeypatch.setenv("WEB3_PROVIDER_URL", "http://configured-rpc.invalid")
    monkeypatch.setenv("PINATA_JWT", "")
    monkeypatch.setenv("SYNC_ENABLED", "false")
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:5173")
    get_engine.cache_clear()
    get_settings.cache_clear()
    upgrade()
    users = {}
    with new_session() as db:
        for index, (name, role) in enumerate(
            [
                ("admin", UserRole.ADMIN),
                ("organizer", UserRole.ORGANIZER),
                ("outsider", UserRole.ORGANIZER),
                ("participant", UserRole.PARTICIPANT),
                ("other", UserRole.PARTICIPANT),
            ],
            1,
        ):
            user = User(
                email=f"{name}@example.com",
                full_name=name,
                role=role,
                password_hash=password_hash,
                wallet_address="0x" + str(index) * 40,
            )
            db.add(user)
            users[name] = user
        db.commit()
        headers = {name: {"Authorization": f"Bearer {create_access_token(user)}"} for name, user in users.items()}
    with TestClient(create_app(), raise_server_exceptions=False) as client:
        yield SimpleNamespace(client=client, users=users, headers=headers, db=new_session)
    get_engine().dispose()
    get_engine.cache_clear()
    get_settings.cache_clear()


@pytest.fixture
def event(ctx):
    client = ctx.client
    org = client.post(
        "/api/v1/organizations",
        headers=ctx.headers["organizer"],
        json={"name": "Blockchain Club", "slug": "blockchain-club"},
    )
    assert org.status_code == 201, org.text
    start = utcnow() + timedelta(days=1)
    response = client.post(
        "/api/v1/events",
        headers=ctx.headers["organizer"],
        json={
            "organization_id": org.json()["id"],
            "name": "Certificate Workshop",
            "start_date": start.isoformat(),
            "end_date": (start + timedelta(hours=2)).isoformat(),
            "status": "active",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.fixture
def pending(ctx, event):
    response = ctx.client.post(f"/api/v1/events/{event['id']}/register", headers=ctx.headers["participant"])
    assert response.status_code == 201, response.text
    participant_id = response.json()["id"]
    response = ctx.client.patch(
        f"/api/v1/events/{event['id']}/participants/{participant_id}",
        headers=ctx.headers["organizer"],
        json={"status": "attended"},
    )
    assert response.status_code == 200, response.text
    response = ctx.client.post(
        "/api/v1/certificates/issue",
        headers=ctx.headers["organizer"],
        json={
            "event_id": event["id"],
            "recipient_id": ctx.users["participant"].id,
            "token_uri": "ipfs://bafytest/metadata.json",
        },
    )
    assert response.status_code == 202, response.text
    return response.json()


def uint_word(value):
    return value.to_bytes(32, "big")


def string_data(text):
    data = text.encode()
    return uint_word(len(data)) + data + b"\x00" * (-len(data) % 32)


@pytest.fixture
def rpc_mock(monkeypatch):
    from eth_hash.auto import keccak

    from app.services.blockchain import ISSUED_TOPIC, MINT_TOPIC, BlockchainVerifier

    def install(
        certificate,
        *,
        token_id=str(2**200),
        revoked=False,
        confirmations=3,
        receipt_status="0x1",
        wallet=None,
        event_id=None,
        contract=CONTRACT,
        schema="modern",
    ):
        wallet = wallet or certificate["recipient_wallet"]
        event_id = event_id or certificate["event_id"]
        uri = certificate["token_uri"]
        receipt = {
            "to": CONTRACT,
            "transactionHash": TX,
            "status": receipt_status,
            "blockNumber": "0x64",
            "blockHash": "0x" + "c" * 64,
            "logs": [
                {
                    "address": contract,
                    "topics": [
                        ISSUED_TOPIC if schema == "modern" else MINT_TOPIC,
                        "0x" + uint_word(int(token_id)).hex(),
                        "0x" + wallet[2:].rjust(64, "0"),
                        "0x" + keccak(event_id.encode()).hex(),
                    ],
                    "data": "0x"
                    + (
                        (uint_word(128) + keccak(b"test-certificate") + uint_word(1) + uint_word(1234567))
                        if schema == "modern"
                        else (uint_word(64) + uint_word(1234567))
                    ).hex()
                    + string_data(uri).hex(),
                }
            ],
        }
        event_data, name_data = string_data(event_id), string_data("Workshop")
        record = (
            uint_word(32)
            + uint_word(160)
            + uint_word(160 + len(event_data))
            + bytes.fromhex(wallet[2:].rjust(64, "0"))
            + uint_word(1234567)
            + uint_word(int(revoked))
            + event_data
            + name_data
        )
        if schema == "modern":
            record = (
                uint_word(32)
                + uint_word(256)
                + bytes.fromhex(wallet[2:].rjust(64, "0"))
                + uint_word(1)
                + keccak(b"test-certificate")
                + uint_word(1234567)
                + uint_word(int(revoked))
                + uint_word(1234567 if revoked else 0)
                + uint_word(1 if revoked else 0)
                + event_data
            )
        responses = {
            "eth_chainId": hex(11155111),
            "eth_getTransactionReceipt": receipt,
            "eth_blockNumber": hex(100 + confirmations - 1),
            "eth_getBlockByNumber": {"hash": receipt["blockHash"]},
            "eth_call": "0x" + record.hex(),
        }
        calls = []

        def rpc(self, method, params):
            calls.append((method, params))
            return responses[method]

        monkeypatch.setattr(BlockchainVerifier, "rpc", rpc)
        return SimpleNamespace(token_id=token_id, responses=responses, calls=calls)

    return install
