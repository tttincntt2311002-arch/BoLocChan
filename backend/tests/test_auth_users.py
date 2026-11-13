from datetime import timedelta

import jwt
import pytest
from sqlalchemy import select

from app.core.config import get_settings
from app.core.security import create_access_token, verify_password
from app.models.models import User, utcnow
from tests.conftest import PASSWORD


def test_registration_hashes_password_and_normalizes_email(ctx):
    response = ctx.client.post(
        "/api/v1/auth/register",
        json={
            "email": "NewUser@EXAMPLE.com",
            "full_name": "New User",
            "password": PASSWORD,
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["role"] == "participant"
    assert "password_hash" not in response.text and PASSWORD not in response.text
    with ctx.db() as db:
        user = db.scalar(select(User).where(User.email == "newuser@example.com"))
        assert user.password_hash != PASSWORD
        assert verify_password(PASSWORD, user.password_hash)
    duplicate = ctx.client.post(
        "/api/v1/auth/register",
        json={
            "email": "NEWUSER@example.com",
            "full_name": "Duplicate",
            "password": PASSWORD,
        },
    )
    assert duplicate.status_code == 409


@pytest.mark.parametrize("role", ["admin", "organizer", "participant"])
def test_registration_rejects_role_injection(ctx, role):
    response = ctx.client.post(
        "/api/v1/auth/register",
        json={
            "email": "intruder@example.com",
            "full_name": "Intruder",
            "password": PASSWORD,
            "role": role,
        },
    )
    assert response.status_code == 422
    assert PASSWORD not in response.text


@pytest.mark.parametrize("password", ["short1", "letterswithoutdigits", "A1" + "é" * 36])
def test_password_policy_and_validation_never_echo_password(ctx, password):
    response = ctx.client.post(
        "/api/v1/auth/register",
        json={
            "email": "new@example.com",
            "full_name": "New",
            "password": password,
        },
    )
    assert response.status_code == 422
    assert password not in response.text


def test_login_json_swagger_and_logout(ctx):
    client = ctx.client
    response = client.post("/api/v1/auth/login", json={"email": "participant@example.com", "password": PASSWORD})
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    header = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/v1/auth/me", headers=header).json()["role"] == "participant"
    form = client.post("/api/v1/auth/token", data={"username": "participant@example.com", "password": PASSWORD})
    assert form.status_code == 200, form.text
    assert client.post("/api/v1/auth/logout", headers=header).status_code == 204
    assert client.get("/api/v1/auth/me", headers=header).status_code == 401
    second_header = {"Authorization": f"Bearer {form.json()['access_token']}"}
    assert client.get("/api/v1/auth/me", headers=second_header).status_code == 401


@pytest.mark.parametrize(
    "email,password",
    [
        ("participant@example.com", "wrongpassword"),
        ("missing@example.com", PASSWORD),
    ],
)
def test_login_uses_generic_error(ctx, email, password):
    response = ctx.client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.json()["error"]["code"] == "invalid_credentials"


def test_expired_forged_and_wrong_audience_tokens(ctx):
    user = ctx.users["participant"]
    valid = create_access_token(user)
    payload = jwt.decode(valid, get_settings().SECRET_KEY, algorithms=["HS256"], audience="sbt-certificate-client")
    expired = dict(payload, exp=int((utcnow() - timedelta(seconds=1)).timestamp()))
    wrong_audience = dict(payload, aud="another-app")
    for token in [
        jwt.encode(expired, get_settings().SECRET_KEY, algorithm="HS256"),
        jwt.encode(payload, "attacker-signing-key-" + "z" * 32, algorithm="HS256"),
        jwt.encode(wrong_audience, get_settings().SECRET_KEY, algorithm="HS256"),
        "invalid",
    ]:
        assert ctx.client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_client_role_claim_never_grants_permission(ctx):
    payload = jwt.decode(
        create_access_token(ctx.users["participant"]),
        get_settings().SECRET_KEY,
        algorithms=["HS256"],
        audience="sbt-certificate-client",
    )
    payload["role"] = "admin"
    signed = jwt.encode(payload, get_settings().SECRET_KEY, algorithm="HS256")
    assert ctx.client.get("/api/v1/users", headers={"Authorization": f"Bearer {signed}"}).status_code == 403


def test_role_assignment_requires_admin_and_takes_effect_immediately(ctx):
    user_id = ctx.users["participant"].id
    path = f"/api/v1/users/{user_id}"
    assert (
        ctx.client.patch("/api/v1/users/me", headers=ctx.headers["participant"], json={"role": "organizer"}).status_code
        == 422
    )
    assert ctx.client.patch(path, headers=ctx.headers["participant"], json={"role": "organizer"}).status_code == 403
    response = ctx.client.patch(path, headers=ctx.headers["admin"], json={"role": "organizer"})
    assert response.status_code == 200
    assert response.json()["role"] == "organizer"
    assert ctx.client.get("/api/v1/auth/me", headers=ctx.headers["participant"]).status_code == 401
    login = ctx.client.post("/api/v1/auth/login", json={"email": "participant@example.com", "password": PASSWORD})
    assert login.json()["user"]["role"] == "organizer"


def test_inactive_user_and_last_admin_protection(ctx):
    admin_id = ctx.users["admin"].id
    assert (
        ctx.client.patch(
            f"/api/v1/users/{admin_id}", headers=ctx.headers["admin"], json={"is_active": False}
        ).status_code
        == 409
    )
    user_id = ctx.users["participant"].id
    assert (
        ctx.client.patch(
            f"/api/v1/users/{user_id}", headers=ctx.headers["admin"], json={"is_active": False}
        ).status_code
        == 200
    )
    assert ctx.client.get("/api/v1/auth/me", headers=ctx.headers["participant"]).status_code == 401
    assert (
        ctx.client.post(
            "/api/v1/auth/login", json={"email": "participant@example.com", "password": PASSWORD}
        ).status_code
        == 401
    )


def test_profile_privacy_wallet_uniqueness_and_password_change(ctx):
    client = ctx.client
    header = ctx.headers["participant"]
    assert client.get(f"/api/v1/users/{ctx.users['other'].id}", headers=header).status_code == 403
    assert client.get("/api/v1/users", headers=header).status_code == 403
    assert client.put("/api/v1/users/me/wallet", headers=header, json={"wallet_address": "bad"}).status_code == 422
    assert (
        client.put("/api/v1/users/me/wallet", headers=header, json={"wallet_address": "0x" + "0" * 40}).status_code
        == 422
    )
    other_wallet = ctx.users["other"].wallet_address
    assert (
        client.put("/api/v1/users/me/wallet", headers=header, json={"wallet_address": other_wallet}).status_code == 409
    )
    response = client.patch(
        "/api/v1/users/me", headers=header, json={"full_name": "Updated Name", "email": "updated@example.com"}
    )
    assert response.status_code == 200, response.text
    assert response.json()["full_name"] == "Updated Name"
    assert (
        client.put(
            "/api/v1/users/me/password",
            headers=header,
            json={"current_password": "wrong", "new_password": "NewPassword2026!"},
        ).status_code
        == 400
    )
    assert (
        client.put(
            "/api/v1/users/me/password",
            headers=header,
            json={"current_password": PASSWORD, "new_password": "NewPassword2026!"},
        ).status_code
        == 204
    )
    assert client.get("/api/v1/users/me", headers=header).status_code == 401
    assert (
        client.post(
            "/api/v1/auth/login", json={"email": "updated@example.com", "password": "NewPassword2026!"}
        ).status_code
        == 200
    )


@pytest.mark.parametrize("body", [{"full_name": None}, {"email": None}])
def test_patch_rejects_null_required_fields(ctx, body):
    assert ctx.client.patch("/api/v1/users/me", headers=ctx.headers["participant"], json=body).status_code == 422


def test_wallet_eip55_validation(ctx):
    path, header = "/api/v1/users/me/wallet", ctx.headers["participant"]
    good = "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"
    response = ctx.client.put(path, headers=header, json={"wallet_address": good})
    assert response.status_code == 200, response.text
    assert response.json()["wallet_address"] == good.lower()
    bad = good.replace("5aAe", "5aAE")
    assert ctx.client.put(path, headers=header, json={"wallet_address": bad}).status_code == 422
    assert ctx.client.put(path, headers=header, json={"wallet_address": None}).status_code == 200


def test_pagination_bounds(ctx):
    for query in ["skip=-1", "limit=0", "limit=101"]:
        assert ctx.client.get("/api/v1/users?" + query, headers=ctx.headers["admin"]).status_code == 422
