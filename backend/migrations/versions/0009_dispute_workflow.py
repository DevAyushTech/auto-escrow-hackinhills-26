"""Add Phase 9 dispute workflow metadata.

Revision ID: 0009_dispute_workflow
Revises: 0008_simulated_escrow_lifecycle
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0009_dispute_workflow"
down_revision: str | None = "0008_simulated_escrow_lifecycle"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _column_names(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def _add_columns() -> None:
    columns = [
        sa.Column("category", sa.String(length=60), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("submission_id", sa.Integer(), sa.ForeignKey("submissions.id", name="fk_disputes_submission"), nullable=True),
        sa.Column("verification_id", sa.Integer(), sa.ForeignKey("verifications.id", name="fk_disputes_verification"), nullable=True),
        sa.Column("previous_job_status", sa.String(length=30), nullable=True),
        sa.Column("previous_escrow_status", sa.String(length=20), nullable=True),
        sa.Column("resolved_by_operator", sa.String(length=120), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    ]
    missing = [column for column in columns if column.name not in _column_names("disputes")]
    if not missing:
        return
    with op.batch_alter_table("disputes") as batch:
        for column in missing:
            batch.add_column(column)


def upgrade() -> None:
    _add_columns()
    connection = op.get_bind()
    connection.execute(sa.text("UPDATE disputes SET category = 'other' WHERE category IS NULL"))
    connection.execute(sa.text("UPDATE disputes SET description = reason WHERE description IS NULL"))
    connection.execute(sa.text("UPDATE disputes SET updated_at = created_at WHERE updated_at IS NULL"))
    with op.batch_alter_table("disputes") as batch:
        batch.alter_column("category", existing_type=sa.String(length=60), nullable=False)
        batch.alter_column("description", existing_type=sa.Text(), nullable=False)
        batch.alter_column("updated_at", existing_type=sa.DateTime(timezone=True), nullable=False)
    indexes = {index["name"] for index in sa.inspect(op.get_bind()).get_indexes("disputes")}
    if "ix_disputes_status_created" not in indexes:
        op.create_index("ix_disputes_status_created", "disputes", ["status", "created_at"])


def downgrade() -> None:
    indexes = {index["name"] for index in sa.inspect(op.get_bind()).get_indexes("disputes")}
    if "ix_disputes_status_created" in indexes:
        op.drop_index("ix_disputes_status_created", table_name="disputes")
    with op.batch_alter_table("disputes") as batch:
        for name in (
            "updated_at",
            "reviewed_at",
            "resolved_by_operator",
            "previous_escrow_status",
            "previous_job_status",
            "verification_id",
            "submission_id",
            "description",
            "category",
        ):
            if name in _column_names("disputes"):
                batch.drop_column(name)
