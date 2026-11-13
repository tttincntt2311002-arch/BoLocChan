"""Certificate branding, recipient snapshot and durable transaction history."""
from uuid import uuid4

from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("organizations", sa.Column("logo_data_url", sa.Text(), nullable=True))
    op.add_column("certificates", sa.Column("recipient_name", sa.String(150), nullable=True))
    op.add_column("certificates", sa.Column("revocation_tx_hash", sa.String(66), nullable=True))
    op.execute("UPDATE certificates SET recipient_name = (SELECT full_name FROM users WHERE users.id = certificates.recipient_id)")
    op.create_table(
        "certificate_history",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("certificate_id", sa.String(36), sa.ForeignKey("certificates.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("action", sa.String(30), nullable=False),
        sa.Column("source", sa.String(20), nullable=False),
        sa.Column("tx_hash", sa.String(66), nullable=True),
        sa.Column("block_number", sa.Integer(), nullable=True),
        sa.Column("transaction_time", sa.DateTime(), nullable=True),
        sa.Column("actor_id", sa.String(36), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("actor_name", sa.String(150), nullable=True),
        sa.Column("actor_address", sa.String(42), nullable=True),
        sa.UniqueConstraint("certificate_id", "action", "source", "tx_hash", name="uq_certificate_history_transaction"),
    )
    op.create_index("ix_certificate_history_certificate_id", "certificate_history", ["certificate_id"])
    connection = op.get_bind()
    rows = connection.execute(sa.text("SELECT id, tx_hash, block_number, issued_at, revoked_at, revoked_by_id FROM certificates WHERE status IN ('issued', 'revoked')")).mappings()
    for row in rows:
        connection.execute(sa.text("INSERT INTO certificate_history (id, certificate_id, action, source, tx_hash, block_number, transaction_time, created_at) VALUES (:history_id, :id, 'issued', 'blockchain', :tx_hash, :block_number, :issued_at, :issued_at)"), {**row, "history_id": str(uuid4())})
        if row["revoked_at"]:
            connection.execute(sa.text("INSERT INTO certificate_history (id, certificate_id, action, source, actor_id, actor_name, transaction_time, created_at) VALUES (:history_id, :id, 'revoked', 'registry', :revoked_by_id, (SELECT full_name FROM users WHERE id=:revoked_by_id), :revoked_at, :revoked_at)"), {**row, "history_id": str(uuid4())})


def downgrade():
    op.drop_table("certificate_history")
    op.drop_column("certificates", "revocation_tx_hash")
    op.drop_column("certificates", "recipient_name")
    op.drop_column("organizations", "logo_data_url")
