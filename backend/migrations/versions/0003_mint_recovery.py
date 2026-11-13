"""Persist mint locks and the event-log recovery cursor without rebuilding tables."""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("certificates", sa.Column("mint_attempt_id", sa.String(36), nullable=True))
    op.add_column("certificates", sa.Column("mint_started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("certificates", sa.Column("sync_from_block", sa.Integer(), nullable=True))


def downgrade():
    for column in ("sync_from_block", "mint_started_at", "mint_attempt_id"):
        op.drop_column("certificates", column)
