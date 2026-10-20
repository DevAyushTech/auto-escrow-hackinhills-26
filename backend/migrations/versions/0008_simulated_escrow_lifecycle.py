"""Add Phase 7 escrow agreement snapshots and job-aware ledger entries.

Revision ID: 0008_simulated_escrow_lifecycle
Revises: 0007_agreement_negotiation
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0008_simulated_escrow_lifecycle"
down_revision: str | None = "0007_agreement_negotiation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


LEGACY_ENTRY_TYPES = "entry_type IN ('deposit', 'hold', 'release', 'refund', 'fee')"
PHASE7_ENTRY_TYPES = "entry_type IN ('deposit', 'funding', 'hold', 'release', 'refund', 'fee')"


def _column_names(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def upgrade() -> None:
    if "accepted_agreement_version" not in _column_names("escrows"):
        op.add_column("escrows", sa.Column("accepted_agreement_version", sa.Integer(), nullable=True))

    if "job_id" not in _column_names("ledger_entries"):
        with op.batch_alter_table("ledger_entries") as batch:
            batch.add_column(
                sa.Column(
                    "job_id",
                    sa.Integer(),
                    sa.ForeignKey("jobs.id", name="fk_ledger_entries_job"),
                    nullable=True,
                )
            )

    # Keep legacy deposit rows readable and add funding as the canonical Phase
    # 7 entry type without rewriting any existing ledger history.
    with op.batch_alter_table("ledger_entries") as batch:
        batch.drop_constraint("ck_ledger_entries_type", type_="check")
        batch.create_check_constraint("ck_ledger_entries_type", PHASE7_ENTRY_TYPES)


def downgrade() -> None:
    connection = op.get_bind()
    if connection.execute(
        sa.text("SELECT 1 FROM ledger_entries WHERE entry_type = 'funding' LIMIT 1")
    ).first():
        raise RuntimeError("cannot downgrade while canonical funding ledger entries exist")

    with op.batch_alter_table("ledger_entries") as batch:
        batch.drop_constraint("ck_ledger_entries_type", type_="check")
        batch.create_check_constraint("ck_ledger_entries_type", LEGACY_ENTRY_TYPES)
        batch.drop_column("job_id")
    op.drop_column("escrows", "accepted_agreement_version")
