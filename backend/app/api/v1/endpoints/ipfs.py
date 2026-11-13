from fastapi import APIRouter

from app.api.dependencies import CurrentUser
from app.schemas.schemas import IPFSResponse, MetadataInput
from app.services.common import require_global_organizer
from app.services.ipfs import upload_metadata

router = APIRouter()


@router.post("/upload/metadata", response_model=IPFSResponse, status_code=201)
def metadata(payload: MetadataInput, user: CurrentUser):
    require_global_organizer(user)
    return upload_metadata(payload.model_dump())
