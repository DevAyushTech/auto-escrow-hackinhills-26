"""Add explainable agent matching results and selected-run metadata.

Revision ID: 0006_matching_results
Revises: 0005_audit_event_description
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0006_matching_results"
down_revision: str | None = "0005_audit_event_description"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("jobs", sa.Column("selected_match_run_id", sa.String(length=80), nullable=True))
    op.add_column("jobs", sa.Column("selected_matching_score", sa.Numeric(5, 2), nullable=True))
    op.add_column("jobs", sa.Column("selected_scoring_version", sa.String(length=40), nullable=True))

    op.create_table(
        "match_results",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("job_id", sa.Integer(), nullable=False),
        sa.Column("agent_id", sa.Integer(), nullable=False),
        sa.Column("run_id", sa.String(length=80), nullable=False),
        sa.Column("scoring_version", sa.String(length=40), nullable=False),
        sa.Column("score", sa.Numeric(5, 2), nullable=False),
        sa.Column("matched_skills", sa.JSON(), nullable=False),
        sa.Column("missing_skills", sa.JSON(), nullable=False),
        sa.Column("breakdown", sa.JSON(), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.Column("warnings", sa.JSON(), nullable=False),
        sa.Column("eligible", sa.Boolean(), nullable=False),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("score >= 0 AND score <= 100", name="ck_match_results_score_range"),
        sa.ForeignKeyConstraint(["agent_id"], ["agents.id"]),
        sa.ForeignKeyConstraint(["job_id"], ["jobs.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("run_id", "agent_id", name="uq_match_results_run_agent"),
    )
    op.create_index("ix_match_results_job_run", "match_results", ["job_id", "run_id"])
    op.create_index("ix_match_results_job_computed", "match_results", ["job_id", "computed_at"])
    op.create_index("ix_match_results_agent", "match_results", ["agent_id"])


def downgrade() -> None:
    op.drop_index("ix_match_results_agent", table_name="match_results")
    op.drop_index("ix_match_results_job_computed", table_name="match_results")
    op.drop_index("ix_match_results_job_run", table_name="match_results")
    op.drop_table("match_results")
    op.drop_column("jobs", "selected_scoring_version")
    op.drop_column("jobs", "selected_matching_score")
    op.drop_column("jobs", "selected_match_run_id")
