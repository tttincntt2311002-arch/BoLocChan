"""Optional real Pinata upload. No simulated CIDs or local fallback."""

import httpx

from app.core.config import get_settings
from app.core.errors import fail


def upload_metadata(metadata: dict):
    token = get_settings().PINATA_JWT
    if not token:
        fail(503, "ipfs_unconfigured", "Configure PINATA_JWT to enable IPFS uploads")
    try:
        with httpx.Client(timeout=30, follow_redirects=False, trust_env=False) as client:
            response = client.post(
                "https://api.pinata.cloud/pinning/pinJSONToIPFS",
                headers={"Authorization": f"Bearer {token}"},
                json={"pinataContent": metadata, "pinataOptions": {"cidVersion": 1}},
            )
            response.raise_for_status()
            cid = response.json()["IpfsHash"]
            if not isinstance(cid, str) or not cid.isalnum() or len(cid) > 128:
                raise ValueError("Invalid CID")
        return {"cid": cid, "uri": f"ipfs://{cid}"}
    except (httpx.HTTPError, KeyError, TypeError, ValueError):
        fail(502, "ipfs_unavailable", "IPFS pinning service is unavailable")
