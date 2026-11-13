"""Password login accepts JSON or the standard Swagger OAuth2 form."""

from typing import Annotated

from fastapi import APIRouter, Depends, Response
from fastapi.security import OAuth2PasswordRequestForm

from app.api.dependencies import DB, CurrentUser
from app.schemas.schemas import LoginRequest, TokenResponse, UserCreate, UserResponse
from app.services import auth

router = APIRouter()


@router.post("/register", response_model=UserResponse, status_code=201)
def register(payload: UserCreate, db: DB):
    """Public signup always creates a Participant; role fields are rejected."""
    return auth.register(db, payload)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: DB):
    return auth.login(db, str(payload.email), payload.password)


@router.post("/token", response_model=TokenResponse)
def token(form: Annotated[OAuth2PasswordRequestForm, Depends()], db: DB):
    """Use the email address in the OAuth2 username field."""
    return auth.login(db, form.username, form.password)


@router.get("/me", response_model=UserResponse)
def me(user: CurrentUser):
    return user


@router.post("/logout", status_code=204)
def logout(user: CurrentUser, db: DB):
    """Revokes this account's existing tokens. Client must also remove its token."""
    auth.logout(db, user)
    return Response(status_code=204)
