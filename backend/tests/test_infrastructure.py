import pytest
from alembic import command
from sqlalchemy import func, inspect, select, text
from sqlalchemy.exc import IntegrityError

from app.db.base import get_engine
from app.db.migrate import alembic_config
from app.models.models import Certificate, CertificateStatus, Participant, User


def test_cors_only_allows_configured_frontend(ctx):
    allowed = ctx.client.options(
        "/api/v1/events",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization",
        },
    )
    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
    denied = ctx.client.options(
        "/api/v1/events",
        headers={
            "Origin": "https://attacker.example",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert denied.status_code == 400
    assert "access-control-allow-origin" not in denied.headers


def test_openapi_health_error_shape_and_audit_permissions(ctx, event):
    assert ctx.client.get("/health").json()["status"] == "healthy"
    docs = ctx.client.get("/docs")
    assert docs.status_code == 200
    schema = ctx.client.get("/openapi.json").json()
    assert schema["components"]["securitySchemes"]["OAuth2PasswordBearer"]
    assert "409" in schema["paths"]["/api/v1/events"]["post"]["responses"]
    assert ctx.client.get("/api/v1/audit-logs", headers=ctx.headers["participant"]).status_code == 403
    logs = ctx.client.get("/api/v1/audit-logs?action=event.created", headers=ctx.headers["admin"])
    assert logs.status_code == 200
    assert logs.json()["total"] == 1
    assert "password" not in logs.text
    unauthorized = ctx.client.get("/api/v1/users")
    assert unauthorized.status_code == 401
    assert unauthorized.json()["error"]["code"] == "authentication_required"
    not_found = ctx.client.get("/missing-endpoint")
    assert not_found.status_code == 404
    assert set(not_found.json()) == {"error"}


def test_database_constraints_protect_direct_writes(ctx, pending):
    with ctx.db() as db:
        assert db.scalar(text("PRAGMA foreign_keys")) == 1
        db.add(Participant(event_id=pending["event_id"], user_id=pending["recipient_id"]))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()
        db.add(
            Certificate(
                event_id=pending["event_id"],
                recipient_id=pending["recipient_id"],
                recipient_wallet=pending["recipient_wallet"],
                chain_id=11155111,
            )
        )
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()
        db.add(Participant(event_id=pending["event_id"], user_id="00000000-0000-0000-0000-000000000001"))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()
        with pytest.raises(IntegrityError):
            db.execute(text("UPDATE certificates SET status='issued' WHERE id=:id"), {"id": pending["id"]})
            db.commit()
        db.rollback()
        with pytest.raises(IntegrityError):
            db.execute(text("UPDATE users SET role='superadmin' WHERE id=:id"), {"id": pending["recipient_id"]})
            db.commit()
        db.rollback()
        assert db.get(Certificate, pending["id"]).status == CertificateStatus.PENDING


def test_migration_downgrade_upgrade_round_trip(ctx):
    # Dedicated fixture database only; no production/demo database is touched.
    config = alembic_config()
    command.downgrade(config, "base")
    assert inspect(get_engine()).get_table_names() == ["alembic_version"]
    command.upgrade(config, "head")
    expected = {
        "users",
        "organizations",
        "organization_members",
        "events",
        "participants",
        "certificates",
        "audit_logs",
    }
    assert expected.issubset(set(inspect(get_engine()).get_table_names()))
    command.check(config)


def test_revision_migration_preserves_existing_related_data(ctx, pending):
    config = alembic_config()
    command.downgrade(config, "0001")
    with get_engine().connect() as connection:
        row = connection.execute(text("SELECT status FROM certificates WHERE id=:id"), {"id": pending["id"]}).one()
        assert row.status == "pending"
        assert connection.execute(text("PRAGMA foreign_key_check")).all() == []
    command.upgrade(config, "head")
    with ctx.db() as db:
        assert db.get(Certificate, pending["id"]).status == CertificateStatus.PENDING


def test_seed_is_idempotent_and_blocked_in_production(ctx, monkeypatch):
    from app.core.config import get_settings
    from seed import seed

    seed()
    with ctx.db() as db:
        first_counts = [
            db.scalar(select(func.count()).select_from(model)) for model in [User, Participant, Certificate]
        ]
    seed()
    with ctx.db() as db:
        assert first_counts == [
            db.scalar(select(func.count()).select_from(model)) for model in [User, Participant, Certificate]
        ]
    monkeypatch.setenv("APP_ENV", "production")
    get_settings.cache_clear()
    with pytest.raises(SystemExit):
        seed()


def test_ipfs_optional_integration_is_authenticated_and_fails_closed(ctx):
    payload = {"name": "Certificate", "description": "Demo", "image": "ipfs://bafyimage"}
    path = "/api/v1/ipfs/upload/metadata"
    assert ctx.client.post(path, json=payload).status_code == 401
    assert ctx.client.post(path, headers=ctx.headers["participant"], json=payload).status_code == 403
    assert ctx.client.post(path, headers=ctx.headers["organizer"], json=payload).status_code == 503
