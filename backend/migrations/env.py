"""Migration environment. Configuration is shared with the API."""

from alembic import context

from app.core.config import get_settings
from app.db.base import Base, get_engine
from app.models import models  # noqa: F401
from app.models.models import UTCDateTime

target_metadata = Base.metadata


def render_item(type_, obj, autogen_context):
    if type_ == "type" and isinstance(obj, UTCDateTime):
        return "sa.DateTime()"
    return False


if context.is_offline_mode():
    context.configure(
        url=get_settings().DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_item=render_item,
    )
    with context.begin_transaction():
        context.run_migrations()
else:
    with get_engine().connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
            compare_type=True,
            render_item=render_item,
        )
        with context.begin_transaction():
            context.run_migrations()
