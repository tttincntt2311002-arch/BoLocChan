"""Reusable validators for Ethereum identifiers and UTC datetimes."""

import re
from datetime import datetime, timezone
from typing import Annotated

from eth_hash.auto import keccak
from pydantic import AfterValidator, BeforeValidator, StringConstraints


def normalize_address(value: str) -> str:
    if not re.fullmatch(r"0x[0-9a-fA-F]{40}", value) or int(value[2:], 16) == 0:
        raise ValueError("Expected a nonzero Ethereum address: 0x followed by 40 hex characters")
    body = value[2:]
    if body != body.lower() and body != body.upper():
        digest = keccak(body.lower().encode()).hex()
        checksum = "".join(c.upper() if int(digest[i], 16) >= 8 else c.lower() for i, c in enumerate(body.lower()))
        if body != checksum:
            raise ValueError("Invalid EIP-55 checksum")
    return value.lower()


def token_string(value) -> str:
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        raise ValueError("Token ID must be a decimal uint256")
    value = str(value)
    if not re.fullmatch(r"0|[1-9][0-9]{0,77}", value) or int(value) >= 2**256:
        raise ValueError("Token ID must be between 0 and 2**256 - 1")
    return value


def utc_datetime(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("Datetime requires a timezone, for example 2026-11-13T09:00:00+07:00")
    return value.astimezone(timezone.utc)


def password_valid(value: str) -> str:
    if not 10 <= len(value) or len(value.encode("utf-8")) > 72:
        raise ValueError("Password must have at least 10 characters and at most 72 UTF-8 bytes")
    if not any(c.isalpha() for c in value) or not any(c.isdigit() for c in value):
        raise ValueError("Password must contain letters and digits")
    return value


Address = Annotated[str, AfterValidator(normalize_address)]
TokenId = Annotated[str, BeforeValidator(token_string)]
UTCDate = Annotated[datetime, AfterValidator(utc_datetime)]
Password = Annotated[str, AfterValidator(password_valid)]
Identifier = Annotated[
    str, StringConstraints(pattern=r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
]
TxHash = Annotated[str, StringConstraints(pattern=r"^0x[0-9a-fA-F]{64}$"), AfterValidator(str.lower)]
IPFSUri = Annotated[str, StringConstraints(pattern=r"^ipfs://[a-zA-Z0-9]+(?:/[a-zA-Z0-9._/-]+)?$", max_length=512)]
