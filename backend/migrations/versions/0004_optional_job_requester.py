"""Ensure requester-independent jobs work for databases already at 0003.

Revision ID: 0004_optional_job_requester
Revises: 0003_explicit_domain_fields
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0004_optional_job_requester"
down_revision: str | None = "0003_explicit_domain_fields"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("jobs") as batch:
        batch.alter_column(
            "requester_agent_id",
            existing_type=sa.Integer(),
            nullable=True,
        )


def downgrade() -> None:
    # A downgrade is safe for an empty or legacy database. Databases containing
    # requester-independent jobs must resolve those rows before restoring the
    # old NOT NULL contract rather than silently deleting or rewriting them.
    connection = op.get_bind()
    if connection.execute(
        sa.text("SELECT 1 FROM jobs WHERE requester_agent_id IS NULL LIMIT 1")
    ).first():
        raise RuntimeError("cannot restore requester_agent_id NOT NULL while null jobs exist")
    with op.batch_alter_table("jobs") as batch:
        batch.alter_column(
            "requester_agent_id",
            existing_type=sa.Integer(),
            nullable=False,
        )
