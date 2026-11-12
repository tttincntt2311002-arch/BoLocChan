"""
IPFS utility endpoints – upload metadata/images for certificate NFTs
"""
from fastapi import APIRouter, HTTPException, UploadFile, File

router = APIRouter()


@router.post("/upload/metadata", summary="Upload certificate metadata to IPFS")
async def upload_metadata(metadata: dict):
    """
    Uploads ERC-721 compliant metadata JSON to IPFS via configured pinning service.
    Returns the IPFS CID.
    """
    raise HTTPException(status_code=501, detail="Not yet implemented – scaffold only")


@router.post("/upload/image", summary="Upload certificate image to IPFS")
async def upload_image(file: UploadFile = File(...)):
    """
    Uploads a certificate image (PNG/SVG) to IPFS.
    Returns the IPFS CID.
    """
    raise HTTPException(status_code=501, detail="Not yet implemented – scaffold only")


@router.get("/metadata/{cid}", summary="Fetch metadata from IPFS")
async def get_metadata(cid: str):
    """
    Retrieves and returns certificate metadata from IPFS by CID.
    Uses the configured IPFS gateway.
    """
    raise HTTPException(status_code=501, detail="Not yet implemented – scaffold only")
