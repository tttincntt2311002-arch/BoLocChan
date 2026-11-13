"""Full public verification from Ethereum evidence, with optional registry context."""

from types import SimpleNamespace

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm.exc import StaleDataError

from app.core.config import get_settings
from app.core.errors import fail
from app.models.models import Certificate, CertificateStatus
from app.services.blockchain import (
    HASH_PATTERN,
    ISSUED_TOPIC,
    MINT_TOPIC,
    REVOKED_TOPIC,
    BlockchainVerifier,
    abi_string,
    rpc_quantity,
    word,
)
from app.services.history import record_history


def event_transaction(verifier, token_id, topic, moment, lower=0):
    """Locate the event's block by its on-chain timestamp in O(log height).

    Avoid unbounded public log scans and RPC providers' wide-range limits.
    Ethereum timestamps strictly increase, including the target Sepolia chain.
    """
    latest = rpc_quantity(verifier.rpc("eth_blockNumber", []))
    low, high = max(lower, verifier.settings.SBT_DEPLOYMENT_BLOCK), latest
    target = int(moment.timestamp())
    found = None
    while low <= high:
        middle = (low + high) // 2
        block = verifier.rpc("eth_getBlockByNumber", [hex(middle), False])
        try:
            timestamp = rpc_quantity(block["timestamp"])
        except (TypeError, KeyError, ValueError):
            fail(502, "invalid_block", "RPC returned a block without a valid timestamp")
        if timestamp == target:
            found = middle
            break
        if timestamp < target:
            low = middle + 1
        else:
            high = middle - 1
    if found is None:
        return None
    logs = verifier.rpc(
        "eth_getLogs",
        [
            {
                "address": verifier.contract,
                "fromBlock": hex(found),
                "toBlock": hex(found),
                "topics": [topic, "0x" + int(token_id).to_bytes(32, "big").hex()],
            }
        ],
    )
    try:
        if not isinstance(logs, list):
            raise ValueError("Invalid logs")
        for log in logs:
            if not log.get("removed", False) and log["address"].lower() == verifier.contract:
                topics = log["topics"]
                accepted = topic if isinstance(topic, list) else [topic]
                if len(topics) >= 2 and topics[0].lower() in accepted and int(topics[1], 16) == int(token_id):
                    if not HASH_PATTERN.fullmatch(log["transactionHash"]):
                        raise ValueError("Invalid hash")
                    return log["transactionHash"].lower()
    except (KeyError, TypeError, ValueError, AttributeError):
        fail(502, "invalid_receipt", "RPC returned malformed event logs")
    return None


def revocation_evidence(verifier, token_id, state, tx_hash=None, lower=0):
    if not state["revoked"] or not state["revoked_at"]:
        fail(409, "revocation_not_found", "Token is not revoked on blockchain")
    tx_hash = tx_hash or event_transaction(verifier, token_id, REVOKED_TOPIC, state["revoked_at"], lower)
    if not tx_hash:
        fail(409, "revocation_log_mismatch", "No matching revocation event exists")
    receipt = verifier.rpc("eth_getTransactionReceipt", [tx_hash])
    evidence = verifier.receipt_evidence(receipt, tx_hash, require_success=True)
    expected = [
        REVOKED_TOPIC,
        "0x" + int(token_id).to_bytes(32, "big").hex(),
        "0x" + state["revoked_by"][2:].rjust(64, "0"),
    ]
    try:
        for log in receipt["logs"]:
            if (
                not log.get("removed", False)
                and log["address"].lower() == verifier.contract
                and [t.lower() for t in log["topics"]] == expected
            ):
                return {
                    "action": "revoked",
                    "source": "blockchain",
                    "tx_hash": tx_hash,
                    "block_number": evidence["block_number"],
                    "transaction_time": state["revoked_at"],
                    "actor_address": state["revoked_by"],
                }
    except (KeyError, TypeError, AttributeError):
        fail(502, "invalid_receipt", "RPC returned malformed revocation logs")
    fail(409, "revocation_log_mismatch", "Receipt has no matching CertificateRevoked event")


def verify_token(db, chain_id, contract_address, token_id, certificate=None):
    settings = get_settings()
    if not settings.WEB3_PROVIDER_URL or not settings.SBT_CONTRACT_ADDRESS:
        fail(503, "blockchain_unconfigured", "Configure the issuer's RPC and contract before verification")
    result = {
        "status": "INVALID",
        "chain_id": chain_id,
        "contract_address": contract_address,
        "token_id": token_id,
        "message": "Certificate evidence does not match",
        "is_valid": False,
        "on_chain_verified": False,
        "checks": {},
        "history": [],
    }
    checks = result["checks"]
    checks["chain_id"] = chain_id == settings.CHAIN_ID
    checks["contract_address"] = contract_address == settings.SBT_CONTRACT_ADDRESS.lower()
    if not all(checks.values()):
        result["message"] = "Chain or contract is not supported by this issuer"
        return result
    verifier = BlockchainVerifier()
    context = SimpleNamespace(chain_id=chain_id, contract_address=contract_address)
    try:
        verifier.check_chain(context)
        code = verifier.rpc("eth_getCode", [contract_address, "latest"])
        if not isinstance(code, str) or not code.startswith("0x"):
            fail(502, "invalid_contract_response", "RPC returned invalid contract bytecode")
        checks["contract_deployed"] = code != "0x"
        if code == "0x":
            result.update(status="NOT FOUND", message="No deployed contract at this address")
            return result
        owner_data = verifier.call("ownerOf(uint256)", token_id)
        if len(owner_data) != 32 or word(owner_data, 0) >= 2**160 or word(owner_data, 0) == 0:
            fail(502, "invalid_contract_response", "Contract returned an invalid owner")
        owner = "0x" + word(owner_data, 0).to_bytes(20, "big").hex()
        checks["token_exists"] = True
        result["owner_address"] = owner
        state = verifier.read_state(token_id)
        locked_data = verifier.call("locked(uint256)", token_id)
        if len(locked_data) != 32 or word(locked_data, 0) not in (0, 1):
            fail(502, "invalid_contract_response", "Contract returned an invalid lock state")
        uri_data = verifier.call("tokenURI(uint256)", token_id)
        try:
            uri = abi_string(uri_data, word(uri_data, 0))
        except (ValueError, UnicodeError):
            fail(502, "invalid_contract_response", "Contract returned an invalid metadata URI")
        result["metadata_uri"] = uri
        checks["owner_of"] = owner == state["recipient"]
        checks["locked"] = word(locked_data, 0) == 1
        checks["metadata_uri"] = bool(
            uri
            and uri == uri.strip()
            and len(uri.encode()) <= 2048
            and uri.startswith(("ipfs://", "https://", "data:application/json"))
        )
        certificate = certificate or db.scalar(
            select(Certificate).where(
                Certificate.chain_id == chain_id,
                Certificate.contract_address == contract_address,
                Certificate.token_id == token_id,
            )
        )
        if certificate:
            checks["registry_matches"] = (
                certificate.recipient_wallet == owner
                and certificate.event_id == state["event_id"]
                and certificate.token_uri == uri
            )
            result["event_name"] = certificate.event.name
            result["organization_name"] = certificate.event.organization.name
        else:
            result["event_name"] = state["event_id"]
        pending = SimpleNamespace(
            chain_id=chain_id,
            contract_address=contract_address,
            token_id=token_id,
            recipient_wallet=state["recipient"],
            event_id=state["event_id"],
            token_uri=uri,
        )
        tx_hash = certificate.tx_hash if certificate else None
        tx_hash = tx_hash or event_transaction(verifier, token_id, [ISSUED_TOPIC, MINT_TOPIC], state["issued_at"])
        checks["mint_transaction"] = False
        if not tx_hash:
            result["message"] = "Token exists but its mint event could not be verified"
            return result
        proof = verifier.confirm(pending, token_id, tx_hash)
        checks["mint_transaction"] = (
            proof["issued_at"] == state["issued_at"] and proof.get("actor_address") == state["issuer"]
        )
        result["issued_at"] = proof["issued_at"]
        mint = {
            "action": "issued",
            "source": "blockchain",
            "tx_hash": tx_hash,
            "block_number": proof["block_number"],
            "transaction_time": proof["issued_at"],
            "actor_address": proof.get("actor_address"),
        }
        result["history"].append(mint)
        revoked = state["revoked"] or bool(certificate and certificate.status == CertificateStatus.REVOKED)
        revocation = None
        if state["revoked"]:
            revocation = revocation_evidence(
                verifier,
                token_id,
                state,
                None,  # Unconfirmed browser hints cannot override canonical revocation evidence.
                proof["block_number"],
            )
            result["history"].append(revocation)
        elif certificate and certificate.status == CertificateStatus.REVOKED:
            result["history"].append(
                {
                    "action": "revoked",
                    "source": "registry",
                    "tx_hash": None,
                    "block_number": None,
                    "transaction_time": certificate.revoked_at,
                    "actor_address": None,
                }
            )
        if not all(checks.values()):
            return result
        if certificate:
            record_history(db, certificate, **mint)
            if revocation:
                record_history(db, certificate, **revocation)
                certificate.status = CertificateStatus.REVOKED
                certificate.revoked_at = certificate.revoked_at or state["revoked_at"]
                certificate.revoke_reason = certificate.revoke_reason or "Revoked on blockchain"
                certificate.revocation_tx_hash = None
            try:
                db.commit()
            except (IntegrityError, StaleDataError):
                # Concurrent viewers/workers may persist the same proven event.
                db.rollback()
                db.refresh(certificate)
                revoked = revoked or certificate.status == CertificateStatus.REVOKED
        checks["not_revoked"] = not revoked
        result.update(
            status="REVOKED" if revoked else "VALID",
            is_valid=not revoked,
            on_chain_verified=True,
            message="Certificate is revoked" if revoked else "All blockchain checks passed",
        )
        return result
    except HTTPException as exc:
        if exc.status_code == 404 and exc.detail.get("code") == "token_not_found":
            checks["token_exists"] = False
            result.update(status="NOT FOUND", message="Token does not exist on blockchain")
            return result
        if exc.status_code == 409:
            if exc.detail.get("code") == "chain_mismatch":
                checks["chain_id"] = False
            if exc.detail.get("code") == "contract_mismatch":
                checks["contract_address"] = False
            if exc.detail.get("code") in ("transaction_pending", "insufficient_confirmations", "noncanonical_transaction"):
                raise
            result["message"] = exc.detail["message"]
            return result
        raise
