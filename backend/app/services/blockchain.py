"""Read-only Ethereum JSON-RPC verification against the project's SBT contract.

No keys or user-submitted RPC URLs are accepted. Issued status requires a
successful canonical receipt, enough confirmations and matching mint logs.
"""

import httpx
from eth_hash.auto import keccak

from app.core.config import get_settings
from app.core.errors import fail
from app.core.validation import normalize_address

MINT_TOPIC = "0x" + keccak(b"CertificateMinted(uint256,address,string,string,uint256)").hex()
ISSUED_TOPIC = "0x" + keccak(b"CertificateIssued(uint256,address,string,string,bytes32,address,uint256)").hex()


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
        selector = keccak(b"getCertificate(uint256)")[:4].hex()
        result = self.rpc(
            "eth_call",
            [
                {
                    "to": self.contract,
                    "data": "0x" + selector + int(certificate.token_id).to_bytes(32, "big").hex(),
                },
                "latest",
            ],
        )
        try:
            data = bytes.fromhex(result.removeprefix("0x"))
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
            return event_id == certificate.event_id and wallet == certificate.recipient_wallet and revoked == 0
        except (TypeError, ValueError, AttributeError, UnicodeError):
            fail(502, "invalid_contract_response", "SBT contract returned malformed certificate data")

    def confirm(self, certificate, token_id: str, tx_hash: str) -> dict:
        self.check_chain(certificate)
        receipt = self.rpc("eth_getTransactionReceipt", [tx_hash])
        if receipt is None:
            fail(409, "transaction_pending", "Transaction has not been mined")
        try:
            if receipt["transactionHash"].lower() != tx_hash or int(receipt["status"], 16) != 1:
                fail(409, "transaction_failed", "Transaction failed or its hash does not match")
            block_number = int(receipt["blockNumber"], 16)
            latest = int(self.rpc("eth_blockNumber", []), 16)
            if latest - block_number + 1 < self.settings.MIN_CONFIRMATIONS:
                fail(409, "insufficient_confirmations", "Transaction needs more block confirmations")
            canonical = self.rpc("eth_getBlockByNumber", [hex(block_number), False])
            if not canonical or canonical["hash"].lower() != receipt["blockHash"].lower():
                fail(409, "noncanonical_transaction", "Transaction is no longer in the canonical chain")
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
                    return {"block_number": block_number, "contract_address": self.contract}
        except (KeyError, TypeError, ValueError, AttributeError, OverflowError, UnicodeError):
            fail(502, "invalid_receipt", "Ethereum RPC returned an invalid transaction receipt")
        fail(409, "mint_log_mismatch", "No mint log matches this certificate, event, recipient and token")
