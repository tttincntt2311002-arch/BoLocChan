from typing import Annotated

from fastapi import APIRouter, File, Response, UploadFile
from sqlalchemy import select

from app.api.dependencies import DB, CurrentUser, Limit, Skip
from app.core.errors import fail
from app.core.validation import Identifier
from app.models.models import Organization, OrganizationMember, UserRole
from app.schemas.schemas import (
    MemberCreate,
    MemberResponse,
    MemberUpdate,
    OrganizationCreate,
    OrganizationResponse,
    OrganizationUpdate,
    Page,
)
from app.services import organizations
from app.services.common import get_or_404, membership, page, require_org_manager

router = APIRouter()


@router.post("", response_model=OrganizationResponse, status_code=201)
def create(payload: OrganizationCreate, user: CurrentUser, db: DB):
    return organizations.create(db, user, payload)


@router.get("", response_model=Page[OrganizationResponse])
def list_organizations(user: CurrentUser, db: DB, skip: Skip = 0, limit: Limit = 20, managed_only: bool = False):
    stmt = select(Organization)
    if managed_only and user.role != UserRole.ADMIN:
        member_orgs = select(OrganizationMember.organization_id).where(
            OrganizationMember.user_id == user.id, OrganizationMember.role == "organizer"
        )
        stmt = stmt.where((Organization.owner_id == user.id) | Organization.id.in_(member_orgs))
        if user.role != UserRole.ORGANIZER:
            stmt = stmt.where(False)
    return page(db, stmt.order_by(Organization.name, Organization.id), skip, limit)


@router.get("/{organization_id}", response_model=OrganizationResponse)
def get(organization_id: Identifier, user: CurrentUser, db: DB):
    return get_or_404(db, Organization, organization_id)


@router.patch("/{organization_id}", response_model=OrganizationResponse)
def update(organization_id: Identifier, payload: OrganizationUpdate, user: CurrentUser, db: DB):
    return organizations.update(db, user, get_or_404(db, Organization, organization_id), payload)


@router.put("/{organization_id}/logo", response_model=OrganizationResponse)
def logo(organization_id: Identifier, user: CurrentUser, db: DB, file: Annotated[UploadFile, File()]):
    org = get_or_404(db, Organization, organization_id)
    require_org_manager(db, org, user)
    return organizations.set_logo(db, user, org, file.file.read(1_048_577))


@router.get("/{organization_id}/members", response_model=Page[MemberResponse])
def list_members(organization_id: Identifier, user: CurrentUser, db: DB, skip: Skip = 0, limit: Limit = 20):
    org = get_or_404(db, Organization, organization_id)
    if user.role != UserRole.ADMIN and org.owner_id != user.id and not membership(db, org.id, user.id):
        fail(403, "membership_required", "Organization membership required")
    return page(
        db,
        select(OrganizationMember)
        .where(OrganizationMember.organization_id == organization_id)
        .order_by(OrganizationMember.created_at, OrganizationMember.id),
        skip,
        limit,
    )


@router.post("/{organization_id}/members", response_model=MemberResponse, status_code=201)
def add_member(organization_id: Identifier, payload: MemberCreate, user: CurrentUser, db: DB):
    return organizations.member_change(
        db, user, get_or_404(db, Organization, organization_id), payload.user_id, payload.role, create=True
    )


@router.patch("/{organization_id}/members/{user_id}", response_model=MemberResponse)
def update_member(organization_id: Identifier, user_id: Identifier, payload: MemberUpdate, user: CurrentUser, db: DB):
    return organizations.member_change(db, user, get_or_404(db, Organization, organization_id), user_id, payload.role)


@router.delete("/{organization_id}/members/{user_id}", status_code=204)
def remove_member(organization_id: Identifier, user_id: Identifier, user: CurrentUser, db: DB):
    organizations.remove_member(db, user, get_or_404(db, Organization, organization_id), user_id)
    return Response(status_code=204)
