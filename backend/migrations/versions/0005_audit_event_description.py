"""Add a human-readable description to audit events.

Revision ID: 0005_audit_event_description
Revises: 0004_optional_job_requester
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0005_audit_event_description"
down_revision: str | None = "0004_optional_job_requester"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("audit_events", sa.Column("description", sa.Text(), nullable=True))
    op.execute(sa.text("UPDATE audit_events SET description = event_type WHERE description IS NULL"))
    with op.batch_alter_table("audit_events") as batch:
        batch.alter_column("description", existing_type=sa.Text(), nullable=False)


def downgrade() -> None:
    op.drop_column("audit_events", "description")
