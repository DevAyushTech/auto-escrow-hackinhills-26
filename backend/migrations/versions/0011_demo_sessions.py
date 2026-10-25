"""Add expiring anonymous demo sessions and job ownership.

Revision ID: 0011_demo_sessions
Revises: 0010_harden_ledger_idempotency
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0011_demo_sessions"
down_revision: str | None = "0010_harden_ledger_idempotency"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "demo_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("token_hash", name="uq_demo_sessions_token_hash"),
    )
    op.create_index("ix_demo_sessions_expires_at", "demo_sessions", ["expires_at"])
    with op.batch_alter_table("jobs") as batch:
        batch.add_column(sa.Column("demo_session_id", sa.Integer(), nullable=True))
        batch.create_index("ix_jobs_demo_session_id", ["demo_session_id"])
        batch.create_foreign_key(
            "fk_jobs_demo_session_id_demo_sessions",
            "demo_sessions",
            ["demo_session_id"],
            ["id"],
        )


def downgrade() -> None:
    with op.batch_alter_table("jobs") as batch:
        batch.drop_constraint("fk_jobs_demo_session_id_demo_sessions", type_="foreignkey")
        batch.drop_index("ix_jobs_demo_session_id")
        batch.drop_column("demo_session_id")
    op.drop_index("ix_demo_sessions_expires_at", table_name="demo_sessions")
    op.drop_table("demo_sessions")
