"""Harden ledger idempotency keys.

Revision ID: 0010_harden_ledger_idempotency
Revises: 0009_dispute_workflow
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0010_harden_ledger_idempotency"
down_revision: str | None = "0009_dispute_workflow"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    connection = op.get_bind()
    connection.execute(
        sa.text(
            "UPDATE ledger_entries "
            "SET idempotency_key = 'legacy-ledger-' || CAST(id AS TEXT) "
            "WHERE idempotency_key IS NULL"
        )
    )
    with op.batch_alter_table("ledger_entries") as batch:
        batch.alter_column(
            "idempotency_key",
            existing_type=sa.String(length=160),
            nullable=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("ledger_entries") as batch:
        batch.alter_column(
            "idempotency_key",
            existing_type=sa.String(length=160),
            nullable=True,
        )
