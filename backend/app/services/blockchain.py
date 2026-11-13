"""Read-only Ethereum JSON-RPC verification against the project's SBT contract.

No keys or user-submitted RPC URLs are accepted. Issued status requires a
successful canonical receipt, enough confirmations and matching mint logs.
"""

import re
from datetime import datetime, timezone

import httpx
from eth_hash.auto import keccak

from app.core.config import get_settings
from app.core.errors import fail
from app.core.validation import normalize_address

MINT_TOPIC = "0x" + keccak(b"CertificateMinted(uint256,address,string,string,uint256)").hex()
ISSUED_TOPIC = "0x" + keccak(b"CertificateIssued(uint256,address,string,string,bytes32,address,uint256)").hex()
REVOKED_TOPIC = "0x" + keccak(b"CertificateRevoked(uint256,address)").hex()
HASH_PATTERN = re.compile(r"0x[0-9a-fA-F]{64}")


def rpc_quantity(value) -> int:
    if not isinstance(value, str) or not re.fullmatch(r"0x[0-9a-fA-F]+", value):
        raise ValueError("Invalid RPC quantity")
    return int(value, 16)


def word(data: bytes, index: int) -> int:
    value = data[index * 32 : (index + 1) * 32]
    if len(value) != 32:
        raise ValueError("Invalid ABI word")
    return int.from_bytes(value, "big")


def abi_string(data: bytes, offset: int) -> str:
    if offset % 32 or offset < 0 or offset + 32 > len(data):
        raise ValueError("Invalid ABI string offset")
    size = int.from_bytes(data[offset : offset + 32], "big")
    if offset + 32 + size > len(data):
        raise ValueError("Invalid ABI string length")
    return data[offset + 32 : offset + 32 + size].decode("utf-8")


class BlockchainVerifier:
    def __init__(self):
        self.settings = get_settings()
        if not self.settings.WEB3_PROVIDER_URL or not self.settings.SBT_CONTRACT_ADDRESS:
            fail(503, "blockchain_unconfigured", "Configure WEB3_PROVIDER_URL and SBT_CONTRACT_ADDRESS first")
        try:
            self.contract = normalize_address(self.settings.SBT_CONTRACT_ADDRESS)
        except ValueError:
            fail(503, "blockchain_unconfigured", "Configured SBT contract address is invalid")

    def rpc(self, method: str, params: list):
        try:
            with httpx.Client(timeout=10, follow_redirects=False, trust_env=False) as client:
                response = client.post(
                    self.settings.WEB3_PROVIDER_URL,
                    json={
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": method,
                        "params": params,
                    },
                )
                response.raise_for_status()
                payload = response.json()
            if isinstance(payload, dict) and method == "eth_call" and payload.get("error"):
                data = payload["error"].get("data", "")
                if isinstance(data, dict):
                    data = data.get("data", "")
                missing_selector = "0x" + keccak(b"ERC721NonexistentToken(uint256)")[:4].hex()
                if isinstance(data, str) and data.startswith(missing_selector):
                    fail(404, "token_not_found", "Token does not exist on the configured contract")
            if not isinstance(payload, dict) or payload.get("error") or "result" not in payload:
                raise ValueError("RPC returned an error")
            return payload["result"]
        except (httpx.HTTPError, ValueError):
            fail(502, "blockchain_unavailable", "Ethereum RPC is unavailable or returned an invalid response")

    def check_chain(self, certificate):
        try:
            rpc_chain = int(self.rpc("eth_chainId", []), 16)
        except (TypeError, ValueError):
            fail(502, "invalid_chain_response", "RPC returned an invalid chain identifier")
        if rpc_chain != certificate.chain_id or certificate.chain_id != self.settings.CHAIN_ID:
            fail(409, "chain_mismatch", "Certificate chain does not match the configured RPC")
        if certificate.contract_address and certificate.contract_address != self.contract:
            fail(409, "contract_mismatch", "Certificate contract does not match the configured contract")

    def current_validity(self, certificate) -> bool:
        """Check current contract state, including revocation."""
        self.check_chain(certificate)
        state = self.read_state(certificate.token_id)
        return (
            state["event_id"] == certificate.event_id
            and state["recipient"] == certificate.recipient_wallet
            and not state["revoked"]
        )

    def call(self, signature: str, token_id: str) -> bytes:
        selector = keccak(signature.encode())[:4].hex()
        result = self.rpc(
            "eth_call",
            [{"to": self.contract, "data": "0x" + selector + int(token_id).to_bytes(32, "big").hex()}, "latest"],
        )
        try:
            return bytes.fromhex(result.removeprefix("0x"))
        except (TypeError, ValueError, AttributeError):
            fail(502, "invalid_contract_response", "SBT contract returned malformed data")

    def read_state(self, token_id: str) -> dict:
        try:
            data = self.call("getCertificate(uint256)", token_id)
            offset = word(data, 0)
            if offset != 32:
                raise ValueError("Invalid tuple offset")
            record = data[offset:]
            event_offset = word(record, 0)
            # SoulboundCertificate has an 8-word tuple. Retain read support for
            # certificates on previously deployed, 5-word SBTCertificate contracts.
            if event_offset == 256:
                wallet_word, revoked_word = 1, 5
            elif event_offset == 160:
                wallet_word, revoked_word = 2, 4
            else:
                raise ValueError("Unsupported certificate tuple")
            event_id = abi_string(record, event_offset)
            wallet_value = word(record, wallet_word)
            if wallet_value >= 2**160:
                raise ValueError("Invalid recipient address")
            wallet = "0x" + wallet_value.to_bytes(20, "big").hex()
            revoked = word(record, revoked_word)
            if revoked not in (0, 1):
                raise ValueError("Invalid boolean")
            issued_at = datetime.fromtimestamp(word(record, 4 if event_offset == 256 else 3), timezone.utc)
            issuer = "0x" + word(record, 2).to_bytes(20, "big").hex() if event_offset == 256 else None
            revoked_at = word(record, 6) if event_offset == 256 else 0
            revoked_by = "0x" + word(record, 7).to_bytes(20, "big").hex() if event_offset == 256 else None
            return {
                "event_id": event_id,
                "recipient": wallet,
                "revoked": bool(revoked),
                "issuer": issuer,
                "issued_at": issued_at,
                "revoked_at": datetime.fromtimestamp(revoked_at, timezone.utc) if revoked_at else None,
                "revoked_by": revoked_by,
            }
        except (TypeError, ValueError, AttributeError, UnicodeError, OverflowError, OSError):
            fail(502, "invalid_contract_response", "SBT contract returned malformed certificate data")

    def receipt_evidence(self, receipt, tx_hash: str, *, require_success=False) -> dict:
        """Validate both success and failure evidence before changing any status."""
        if receipt is None:
            fail(409, "transaction_pending", "Transaction has not been mined")
        try:
            if not HASH_PATTERN.fullmatch(receipt["transactionHash"]) or receipt["transactionHash"].lower() != tx_hash:
                raise ValueError("Receipt transaction hash does not match")
            status = rpc_quantity(receipt["status"])
            if status not in (0, 1) or not isinstance(receipt["logs"], list):
                raise ValueError("Invalid receipt status or logs")
            if receipt["to"] is not None:
                normalize_address(receipt["to"])
            if require_success and status != 1:
                fail(409, "transaction_failed", "Transaction failed")
            if require_success and receipt["to"].lower() != self.contract:
                fail(409, "contract_mismatch", "Transaction was not sent to the configured SBT contract")
            block_number = rpc_quantity(receipt["blockNumber"])
            if not HASH_PATTERN.fullmatch(receipt["blockHash"]):
                raise ValueError("Invalid receipt block hash")
            latest = rpc_quantity(self.rpc("eth_blockNumber", []))
            if latest - block_number + 1 < self.settings.MIN_CONFIRMATIONS:
                fail(409, "insufficient_confirmations", "Transaction needs more block confirmations")
            canonical = self.rpc("eth_getBlockByNumber", [hex(block_number), False])
            if not canonical or canonical["hash"].lower() != receipt["blockHash"].lower():
                fail(409, "noncanonical_transaction", "Transaction is no longer in the canonical chain")
            timestamp = canonical.get("timestamp")
            return {
                "block_number": block_number,
                "status": status,
                "transaction_time": datetime.fromtimestamp(rpc_quantity(timestamp), timezone.utc)
                if timestamp
                else None,
            }
        except (KeyError, TypeError, ValueError, AttributeError):
            fail(502, "invalid_receipt", "Ethereum RPC returned an invalid transaction receipt")

    def confirm(self, certificate, token_id: str, tx_hash: str) -> dict:
        self.check_chain(certificate)
        receipt = self.rpc("eth_getTransactionReceipt", [tx_hash])
        evidence = self.receipt_evidence(receipt, tx_hash, require_success=True)
        try:
            expected_topics = [
                MINT_TOPIC,
                "0x" + int(token_id).to_bytes(32, "big").hex(),
                "0x" + certificate.recipient_wallet[2:].rjust(64, "0"),
                "0x" + keccak(certificate.event_id.encode()).hex(),
            ]
            for log in receipt["logs"]:
                if log.get("removed", False) or log.get("address", "").lower() != self.contract:
                    continue
                topics = [topic.lower() for topic in log.get("topics", [])]
                if len(topics) == 4 and topics[0] in (MINT_TOPIC, ISSUED_TOPIC) and topics[1:] == expected_topics[1:]:
                    data = bytes.fromhex(log["data"].removeprefix("0x"))
                    uri = abi_string(data, word(data, 0))
                    if uri != certificate.token_uri:
                        fail(409, "metadata_mismatch", "Minted token URI does not match the pending certificate")
                    timestamp = word(data, 3 if topics[0] == ISSUED_TOPIC else 1)
                    issuer = "0x" + word(data, 2).to_bytes(20, "big").hex() if topics[0] == ISSUED_TOPIC else None
                    return {
                        "block_number": evidence["block_number"],
                        "contract_address": self.contract,
                        "issued_at": datetime.fromtimestamp(timestamp, timezone.utc),
                        "actor_address": issuer,
                    }
        except (KeyError, TypeError, ValueError, AttributeError, OverflowError, UnicodeError):
            fail(502, "invalid_receipt", "Ethereum RPC returned an invalid transaction receipt")
        fail(409, "mint_log_mismatch", "No mint log matches this certificate, event, recipient and token")

    def matching_token(self, certificate, receipt) -> str:
        """Derive the token ID from RPC evidence, never from a browser assertion."""
        try:
            for log in receipt["logs"]:
                topics = [t.lower() for t in log.get("topics", [])]
                if (
                    not log.get("removed", False)
                    and log.get("address", "").lower() == self.contract
                    and len(topics) == 4
                    and topics[0] in (ISSUED_TOPIC, MINT_TOPIC)
                    and topics[2] == "0x" + certificate.recipient_wallet[2:].rjust(64, "0")
                    and topics[3] == "0x" + keccak(certificate.event_id.encode()).hex()
                ):
                    if not HASH_PATTERN.fullmatch(topics[1]):
                        raise ValueError("Invalid uint256 token topic")
                    return str(int(topics[1], 16))
        except (KeyError, TypeError, ValueError, AttributeError):
            fail(502, "invalid_receipt", "Ethereum RPC returned malformed logs")
        fail(409, "mint_log_mismatch", "Transaction has no matching certificate event")

    def find_transaction(self, certificate) -> tuple[str | None, int]:
        """Bounded, overlapping log scans recover even a lost transaction hash.

        The cursor is advanced only after a successful scan. Unconfirmed blocks
        are revisited, including after a reorg or an interrupted worker.
        """
        self.check_chain(certificate)
        try:
            latest = rpc_quantity(self.rpc("eth_blockNumber", []))
        except ValueError:
            fail(502, "invalid_receipt", "RPC returned an invalid block height")
        start = certificate.sync_from_block
        if start is None:
            start = self.settings.SBT_DEPLOYMENT_BLOCK
        end = min(latest, start + self.settings.SYNC_BLOCK_RANGE - 1)
        if start > end:
            return None, start
        logs = self.rpc(
            "eth_getLogs",
            [
                {
                    "address": self.contract,
                    "fromBlock": hex(start),
                    "toBlock": hex(end),
                    "topics": [
                        [ISSUED_TOPIC, MINT_TOPIC],
                        None,
                        "0x" + certificate.recipient_wallet[2:].rjust(64, "0"),
                        "0x" + keccak(certificate.event_id.encode()).hex(),
                    ],
                }
            ],
        )
        if not isinstance(logs, list):
            fail(502, "invalid_receipt", "RPC returned malformed event logs")
        try:
            for log in logs:
                topics = log["topics"]
                if not isinstance(topics, list) or any(not HASH_PATTERN.fullmatch(topic) for topic in topics):
                    raise ValueError("Invalid event topics")
                if (
                    not log.get("removed", False)
                    and log["address"].lower() == self.contract
                    and len(topics) == 4
                    and topics[0].lower() in (ISSUED_TOPIC, MINT_TOPIC)
                    and topics[2].lower() == "0x" + certificate.recipient_wallet[2:].rjust(64, "0")
                    and topics[3].lower() == "0x" + keccak(certificate.event_id.encode()).hex()
                ):
                    tx_hash = log["transactionHash"]
                    if not HASH_PATTERN.fullmatch(tx_hash):
                        raise ValueError("Invalid transaction hash in event log")
                    # A full receipt is independently revalidated before any write.
                    return tx_hash.lower(), start
        except (KeyError, TypeError, ValueError, AttributeError):
            fail(502, "invalid_receipt", "RPC returned malformed event logs")
        # Fully scanned historical ranges must advance even if the configured
        # range is smaller than MIN_CONFIRMATIONS. Only overlap near the head.
        return None, max(start, min(end + 1, latest + 1 - self.settings.MIN_CONFIRMATIONS))
