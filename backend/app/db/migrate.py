"""Alembic entry point used by startup checks, CLI, seed and tests."""

from alembic import command
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory

from app.core.config import BACKEND_DIR
from app.db.base import get_engine


def alembic_config():
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    return config


def assert_schema_current():
    with get_engine().connect() as connection:
        current = MigrationContext.configure(connection).get_current_revision()
    head = ScriptDirectory.from_config(alembic_config()).get_current_head()
    if current != head or head is None:
        raise RuntimeError("Database schema is not current. Run: python -m alembic upgrade head (from backend)")


def upgrade():
    command.upgrade(alembic_config(), "head")


if __name__ == "__main__":
    upgrade()
