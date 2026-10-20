"""Create the normalized Auto Escrow domain schema.

Revision ID: 0002_escrow_domain
Revises: 0001_phase1_foundation
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0002_escrow_domain"
down_revision: str | None = "0001_phase1_foundation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

MONEY = sa.Numeric(18, 2, asdecimal=True)
CURRENCIES = "'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'"


def upgrade() -> None:
    op.create_table(
        "agents",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("external_id", sa.String(length=120), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("endpoint_url", sa.String(length=500)),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("capabilities", sa.JSON(), nullable=False),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('active', 'inactive', 'suspended')", name="ck_agents_status"),
        sa.UniqueConstraint("external_id", name="uq_agents_external_id"),
    )
    op.create_index("ix_agents_status", "agents", ["status"])

    op.create_table(
        "jobs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("public_id", sa.String(length=80), nullable=False),
        sa.Column("requester_agent_id", sa.Integer(), sa.ForeignKey("agents.id"), nullable=False),
        sa.Column("executor_agent_id", sa.Integer(), sa.ForeignKey("agents.id")),
        sa.Column("title", sa.String(length=240), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("budget", MONEY, nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("deadline", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("requirements", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "status IN ('open', 'assigned', 'in_progress', 'submitted', 'under_review', 'completed', 'disputed', 'cancelled')",
            name="ck_jobs_status",
        ),
        sa.CheckConstraint("budget > 0", name="ck_jobs_budget_positive"),
        sa.CheckConstraint(f"currency IN ({CURRENCIES})", name="ck_jobs_currency"),
        sa.UniqueConstraint("public_id", name="uq_jobs_public_id"),
    )
    op.create_index("ix_jobs_status_deadline", "jobs", ["status", "deadline"])
    op.create_index("ix_jobs_requester_agent_id", "jobs", ["requester_agent_id"])

    op.create_table(
        "agreements",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("job_id", sa.Integer(), sa.ForeignKey("jobs.id"), nullable=False),
        sa.Column("requester_agent_id", sa.Integer(), sa.ForeignKey("agents.id"), nullable=False),
        sa.Column("executor_agent_id", sa.Integer(), sa.ForeignKey("agents.id"), nullable=False),
        sa.Column("amount", MONEY, nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("terms", sa.JSON(), nullable=False),
        sa.Column("proposal_history", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("accepted_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint(
            "status IN ('draft', 'proposed', 'accepted', 'rejected', 'expired', 'cancelled')",
            name="ck_agreements_status",
        ),
        sa.CheckConstraint("amount > 0", name="ck_agreements_amount_positive"),
        sa.CheckConstraint(f"currency IN ({CURRENCIES})", name="ck_agreements_currency"),
        sa.UniqueConstraint("job_id", name="uq_agreements_job_id"),
    )
    op.create_index("ix_agreements_status", "agreements", ["status"])

    op.create_table(
        "escrows",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("job_id", sa.Integer(), sa.ForeignKey("jobs.id"), nullable=False),
        sa.Column("agreement_id", sa.Integer(), sa.ForeignKey("agreements.id"), nullable=False),
        sa.Column("amount", MONEY, nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("provider_reference", sa.String(length=160)),
        sa.Column("funded_at", sa.DateTime(timezone=True)),
        sa.Column("released_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "status IN ('pending', 'funded', 'held', 'released', 'refunded', 'disputed')",
            name="ck_escrows_status",
        ),
        sa.CheckConstraint("amount > 0", name="ck_escrows_amount_positive"),
        sa.CheckConstraint(f"currency IN ({CURRENCIES})", name="ck_escrows_currency"),
        sa.UniqueConstraint("job_id", name="uq_escrows_job_id"),
        sa.UniqueConstraint("agreement_id", name="uq_escrows_agreement_id"),
    )
    op.create_index("ix_escrows_status", "escrows", ["status"])

    op.create_table(
        "ledger_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("escrow_id", sa.Integer(), sa.ForeignKey("escrows.id"), nullable=False),
        sa.Column("entry_type", sa.String(length=20), nullable=False),
        sa.Column("amount", MONEY, nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("reference", sa.String(length=160)),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("entry_type IN ('deposit', 'hold', 'release', 'refund', 'fee')", name="ck_ledger_entries_type"),
        sa.CheckConstraint("amount > 0", name="ck_ledger_entries_amount_positive"),
        sa.CheckConstraint(f"currency IN ({CURRENCIES})", name="ck_ledger_entries_currency"),
    )
    op.create_index("ix_ledger_entries_escrow_occurred", "ledger_entries", ["escrow_id", "occurred_at"])

    op.create_table(
        "submissions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("job_id", sa.Integer(), sa.ForeignKey("jobs.id"), nullable=False),
        sa.Column("agent_id", sa.Integer(), sa.ForeignKey("agents.id"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("artifact_url", sa.String(length=1000), nullable=False),
        sa.Column("content", sa.Text()),
        sa.Column("metadata", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('pending', 'accepted', 'rejected')", name="ck_submissions_status"),
        sa.UniqueConstraint("job_id", "version", name="uq_submissions_job_version"),
    )
    op.create_index("ix_submissions_job_submitted", "submissions", ["job_id", "submitted_at"])

    op.create_table(
        "verifications",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("submission_id", sa.Integer(), sa.ForeignKey("submissions.id"), nullable=False),
        sa.Column("verifier_agent_id", sa.Integer(), sa.ForeignKey("agents.id")),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("score", sa.Numeric(5, 2, asdecimal=True)),
        sa.Column("feedback", sa.JSON(), nullable=False),
        sa.Column("verified_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("status IN ('pending', 'passed', 'failed')", name="ck_verifications_status"),
        sa.UniqueConstraint("submission_id", name="uq_verifications_submission_id"),
    )

    op.create_table(
        "disputes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("job_id", sa.Integer(), sa.ForeignKey("jobs.id"), nullable=False),
        sa.Column("raised_by_agent_id", sa.Integer(), sa.ForeignKey("agents.id"), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("resolution", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("resolved_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("status IN ('open', 'under_review', 'resolved', 'rejected')", name="ck_disputes_status"),
    )
    op.create_index("ix_disputes_job_status", "disputes", ["job_id", "status"])

    op.create_table(
        "audit_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("job_id", sa.Integer(), sa.ForeignKey("jobs.id")),
        sa.Column("actor_agent_id", sa.Integer(), sa.ForeignKey("agents.id")),
        sa.Column("event_type", sa.String(length=80), nullable=False),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_audit_events_job_created", "audit_events", ["job_id", "created_at"])
    op.create_index("ix_audit_events_event_type", "audit_events", ["event_type"])


def downgrade() -> None:
    op.drop_index("ix_audit_events_event_type", table_name="audit_events")
    op.drop_index("ix_audit_events_job_created", table_name="audit_events")
    op.drop_table("audit_events")
    op.drop_index("ix_disputes_job_status", table_name="disputes")
    op.drop_table("disputes")
    op.drop_table("verifications")
    op.drop_index("ix_submissions_job_submitted", table_name="submissions")
    op.drop_table("submissions")
    op.drop_index("ix_ledger_entries_escrow_occurred", table_name="ledger_entries")
    op.drop_table("ledger_entries")
    op.drop_index("ix_escrows_status", table_name="escrows")
    op.drop_table("escrows")
    op.drop_index("ix_agreements_status", table_name="agreements")
    op.drop_table("agreements")
    op.drop_index("ix_jobs_requester_agent_id", table_name="jobs")
    op.drop_index("ix_jobs_status_deadline", table_name="jobs")
    op.drop_table("jobs")
    op.drop_index("ix_agents_status", table_name="agents")
    op.drop_table("agents")
