"""Explicit administrator bootstrap; passwords are prompted, never CLI arguments."""

import argparse
import getpass

from pydantic import ValidationError
from sqlalchemy import select

from app.core.security import hash_password
from app.db.base import new_session
from app.db.migrate import assert_schema_current
from app.models.models import User, UserRole
from app.schemas.schemas import UserCreate
from app.services.common import audit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["create-admin"])
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", required=True)
    args = parser.parse_args()
    password = getpass.getpass("Administrator password: ")
    if password != getpass.getpass("Confirm password: "):
        parser.error("Passwords do not match")
    try:
        payload = UserCreate(email=args.email, full_name=args.name, password=password)
    except ValidationError:
        parser.error("Use a valid email/name and a password with letters/digits, 10+ characters, <=72 UTF-8 bytes")
    assert_schema_current()
    with new_session() as db:
        if db.scalar(select(User.id).where(User.email == str(payload.email).lower())):
            parser.error("Account already exists; use the administrator API to change roles")
        user = User(
            email=str(payload.email).lower(),
            full_name=payload.full_name,
            password_hash=hash_password(password),
            role=UserRole.ADMIN,
        )
        db.add(user)
        audit(db, user, "admin.bootstrapped", user)
        db.commit()
    print("Administrator created.")


if __name__ == "__main__":
    main()
