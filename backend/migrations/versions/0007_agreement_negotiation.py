"""Add versioned agreement negotiation fields and revision state.

Revision ID: 0007_agreement_negotiation
Revises: 0006_matching_results
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0007_agreement_negotiation"
down_revision: str | None = "0006_matching_results"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


AGREEMENT_STATUS_CONSTRAINT = (
    "status IN ('draft', 'proposed', 'revision_requested', 'accepted', 'rejected', 'expired', 'cancelled')"
)
LEGACY_AGREEMENT_STATUS_CONSTRAINT = "status IN ('draft', 'proposed', 'accepted', 'rejected', 'expired', 'cancelled')"


def upgrade() -> None:
    op.add_column(
        "agreements",
        sa.Column("proposal_version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column("agreements", sa.Column("accepted_version", sa.Integer(), nullable=True))
    with op.batch_alter_table("agreements") as batch:
        batch.drop_constraint("ck_agreements_status", type_="check")
        batch.create_check_constraint("ck_agreements_status", AGREEMENT_STATUS_CONSTRAINT)


def downgrade() -> None:
    # A downgrade cannot retain a Phase 6-only state under the old constraint;
    # map it to the closest legacy proposal state before rebuilding SQLite's
    # constrained table.
    op.execute(sa.text("UPDATE agreements SET status = 'proposed' WHERE status = 'revision_requested'"))
    with op.batch_alter_table("agreements") as batch:
        batch.drop_constraint("ck_agreements_status", type_="check")
        batch.create_check_constraint("ck_agreements_status", LEGACY_AGREEMENT_STATUS_CONSTRAINT)
    op.drop_column("agreements", "accepted_version")
    op.drop_column("agreements", "proposal_version")
