"""Integration helper: verify real Hardhat receipts using the Python backend."""
import json
import os
import secrets
import sys
from pathlib import Path
from types import SimpleNamespace

payload = json.load(sys.stdin)
os.environ.update({
    "APP_ENV": "test",
    "SECRET_KEY": secrets.token_urlsafe(48),
    "WEB3_PROVIDER_URL": payload["rpc_url"],
    "CHAIN_ID": str(payload["certificate"]["chain_id"]),
    "SBT_CONTRACT_ADDRESS": payload["certificate"]["contract_address"],
    "MIN_CONFIRMATIONS": "2",
})
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

from app.services.blockchain import BlockchainVerifier  # noqa: E402

certificate = SimpleNamespace(**payload["certificate"])
verifier = BlockchainVerifier()
if payload["expected_valid"]:
    evidence = verifier.confirm(certificate, certificate.token_id, payload["tx_hash"])
    assert evidence["contract_address"] == certificate.contract_address
actual = verifier.current_validity(certificate)
assert actual == payload["expected_valid"], f"Unexpected live certificate state: {actual}"
print(json.dumps({"receipt_verified": bool(payload["expected_valid"]), "is_valid": actual}))
