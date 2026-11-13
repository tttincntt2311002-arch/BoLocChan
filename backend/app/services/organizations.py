"""Organization ownership and membership boundaries."""

import base64
import io

from PIL import Image, UnidentifiedImageError
from sqlalchemy.orm import Session

from app.core.errors import fail
from app.models.models import MemberRole, Organization, OrganizationMember, User, UserRole
from app.services.common import audit, get_or_404, membership, require_global_organizer, require_org_manager


def set_logo(db, user, org, content):
    require_org_manager(db, org, user)
    if len(content) > 1_048_576:
        fail(413, "logo_too_large", "Logo must be at most 1 MB")
    try:
        with Image.open(io.BytesIO(content)) as image:
            if image.format not in ("PNG", "JPEG") or image.width * image.height > 4_000_000:
                fail(422, "invalid_logo", "Use a PNG or JPEG logo with at most 4 million pixels")
            image.thumbnail((256, 256))
            clean = Image.new("RGBA", image.size)
            clean.paste(image.convert("RGBA"))
            buffer = io.BytesIO()
            clean.save(buffer, format="PNG")
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        fail(422, "invalid_logo", "Logo is not a valid PNG or JPEG image")
    org.logo_data_url = "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode()
    audit(db, user, "organization.logo_updated", org)
    db.commit()
    return org


def create(db: Session, user: User, payload):
    require_global_organizer(user)
    org = Organization(**payload.model_dump(), owner_id=user.id)
    db.add(org)
    db.flush()
    db.add(OrganizationMember(organization_id=org.id, user_id=user.id, role=MemberRole.ORGANIZER))
    audit(db, user, "organization.created", org)
    db.commit()
    return org


def update(db: Session, user: User, org: Organization, payload):
    require_org_manager(db, org, user)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(org, key, value)
    audit(db, user, "organization.updated", org)
    db.commit()
    return org


def member_change(db: Session, actor: User, org: Organization, user_id: str, role: MemberRole, *, create=False):
    require_org_manager(db, org, actor, owner_only=True)
    target = get_or_404(db, User, user_id)
    if not target.is_active:
        fail(409, "inactive_user", "Inactive accounts cannot join organizations")
    if role == MemberRole.ORGANIZER and target.role not in (UserRole.ADMIN, UserRole.ORGANIZER):
        fail(409, "global_role_required", "An administrator must first grant this account the organizer role")
    member = membership(db, org.id, user_id)
    if create:
        if member:
            fail(409, "membership_exists", "This user is already a member")
        member = OrganizationMember(organization_id=org.id, user_id=user_id, role=role)
        db.add(member)
    elif not member:
        fail(404, "not_found", "Membership not found")
    elif user_id == org.owner_id and role != MemberRole.ORGANIZER:
        fail(409, "owner_protected", "The organization owner must remain an organizer")
    else:
        member.role = role
    audit(db, actor, "organization.member_added" if create else "organization.member_updated", member, role=role.value)
    db.commit()
    return member


def remove_member(db: Session, actor: User, org: Organization, user_id: str):
    require_org_manager(db, org, actor, owner_only=True)
    if org.owner_id == user_id:
        fail(409, "owner_protected", "Cannot remove the organization owner")
    member = membership(db, org.id, user_id)
    if not member:
        fail(404, "not_found", "Membership not found")
    audit(db, actor, "organization.member_removed", member)
    db.delete(member)
    db.commit()
