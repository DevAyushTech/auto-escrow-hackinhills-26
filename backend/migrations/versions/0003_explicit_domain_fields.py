"""Add the explicit agent, job, escrow, submission, and verification fields.

Revision ID: 0003_explicit_domain_fields
Revises: 0002_escrow_domain
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0003_explicit_domain_fields"
down_revision: str | None = "0002_escrow_domain"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

MONEY = sa.Numeric(18, 2, asdecimal=True)


def _column_names(table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def _add_column(table_name: str, column: sa.Column) -> None:
    if column.name not in _column_names(table_name):
        op.add_column(table_name, column)


def _add_columns_batch(table_name: str, columns: list[sa.Column]) -> None:
    missing = [column for column in columns if column.name not in _column_names(table_name)]
    if not missing:
        return
    with op.batch_alter_table(table_name) as batch:
        for column in missing:
            batch.add_column(column)


def _create_index(name: str, table_name: str, columns: list[str], *, unique: bool = False) -> None:
    indexes = {index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table_name)}
    if name not in indexes:
        op.create_index(name, table_name, columns, unique=unique)


def upgrade() -> None:
    # Agent contract additions. The old capabilities column remains as a
    # compatibility alias and is not used by the new API contract.
    _add_column("agents", sa.Column("availability", sa.String(length=20), nullable=True))
    _add_column("agents", sa.Column("skills", sa.JSON(), nullable=True))
    _add_column("agents", sa.Column("task_categories", sa.JSON(), nullable=True))
    _add_column("agents", sa.Column("supported_output_formats", sa.JSON(), nullable=True))
    _add_column("agents", sa.Column("estimated_completion_minutes", sa.Integer(), nullable=True))
    _add_column("agents", sa.Column("demo_performance_stats", sa.JSON(), nullable=True))
    _create_index("ix_agents_availability", "agents", ["availability"])

    # Job creation is no longer coupled to a requester Agent. Old association
    # columns remain nullable compatibility fields; selected_agent_id is the
    # explicit current assignment.
    _add_columns_batch(
        "jobs",
        [
            sa.Column(
                "selected_agent_id",
                sa.Integer(),
                sa.ForeignKey("agents.id", name="fk_jobs_selected_agent"),
                nullable=True,
            ),
            sa.Column("required_skills", sa.JSON(), nullable=True),
            sa.Column("task_category", sa.String(length=120), nullable=True),
            sa.Column("expected_output", sa.Text(), nullable=True),
            sa.Column("acceptance_criteria", sa.JSON(), nullable=True),
            sa.Column("additional_instructions", sa.Text(), nullable=True),
        ],
    )
    # 0002 made requester_agent_id mandatory. Make it nullable in the same
    # additive migration so the new requester-independent POST contract works
    # on every database upgraded from the preserved Phase 2 schema.
    with op.batch_alter_table("jobs") as batch:
        batch.alter_column(
            "requester_agent_id",
            existing_type=sa.Integer(),
            nullable=True,
        )
    _create_index("ix_jobs_selected_agent_id", "jobs", ["selected_agent_id"])

    _add_column("agreements", sa.Column("proposed_budget", MONEY, nullable=True))
    _add_column("agreements", sa.Column("proposed_deadline", sa.DateTime(timezone=True), nullable=True))

    _add_column("escrows", sa.Column("funded_amount", MONEY, nullable=True))
    _add_column("escrows", sa.Column("settled_at", sa.DateTime(timezone=True), nullable=True))

    _add_column("ledger_entries", sa.Column("idempotency_key", sa.String(length=160), nullable=True))

    _add_column("submissions", sa.Column("submitted_output", sa.Text(), nullable=True))
    _add_column("submissions", sa.Column("evidence", sa.JSON(), nullable=True))

    _add_column("verifications", sa.Column("overall_result", sa.String(length=30), nullable=True))
    _add_column("verifications", sa.Column("individual_checks", sa.JSON(), nullable=True))
    _add_column("verifications", sa.Column("reasons", sa.JSON(), nullable=True))
    _add_column("verifications", sa.Column("evaluator_type", sa.String(length=20), nullable=True))
    _add_column("verifications", sa.Column("evaluated_at", sa.DateTime(timezone=True), nullable=True))

    _add_columns_batch(
        "disputes",
        [
            sa.Column(
                "escrow_id",
                sa.Integer(),
                sa.ForeignKey("escrows.id", name="fk_disputes_escrow"),
                nullable=True,
            ),
            sa.Column("evidence", sa.JSON(), nullable=True),
            sa.Column("resolution_rationale", sa.Text(), nullable=True),
        ],
    )
    _create_index("ix_disputes_escrow_status", "disputes", ["escrow_id", "status"])

    connection = op.get_bind()
    # Backfill new fields without deleting or rewriting legacy data. Values are
    # deliberately conservative so old rows remain readable by the new model.
    connection.execute(sa.text("UPDATE agents SET availability = 'available' WHERE availability IS NULL"))
    connection.execute(sa.text("UPDATE agents SET skills = capabilities WHERE skills IS NULL"))
    connection.execute(sa.text("UPDATE agents SET task_categories = '[]' WHERE task_categories IS NULL"))
    connection.execute(sa.text("UPDATE agents SET supported_output_formats = '[]' WHERE supported_output_formats IS NULL"))
    connection.execute(sa.text("UPDATE agents SET estimated_completion_minutes = 60 WHERE estimated_completion_minutes IS NULL"))
    connection.execute(sa.text("UPDATE agents SET demo_performance_stats = '{}' WHERE demo_performance_stats IS NULL"))

    connection.execute(sa.text("UPDATE jobs SET required_skills = '[]' WHERE required_skills IS NULL"))
    connection.execute(sa.text("UPDATE jobs SET task_category = 'general' WHERE task_category IS NULL"))
    connection.execute(sa.text("UPDATE jobs SET expected_output = description WHERE expected_output IS NULL"))
    connection.execute(sa.text("UPDATE jobs SET acceptance_criteria = '[]' WHERE acceptance_criteria IS NULL"))
    connection.execute(sa.text("UPDATE jobs SET selected_agent_id = executor_agent_id WHERE selected_agent_id IS NULL"))

    connection.execute(sa.text("UPDATE agreements SET proposed_budget = amount WHERE proposed_budget IS NULL"))
    connection.execute(
        sa.text(
            "UPDATE agreements SET proposed_deadline = "
            "(SELECT jobs.deadline FROM jobs WHERE jobs.id = agreements.job_id) "
            "WHERE proposed_deadline IS NULL"
        )
    )

    connection.execute(sa.text("UPDATE escrows SET funded_amount = amount WHERE funded_amount IS NULL"))

    connection.execute(sa.text("UPDATE submissions SET submitted_output = COALESCE(content, '') WHERE submitted_output IS NULL"))
    connection.execute(sa.text("UPDATE submissions SET evidence = metadata WHERE evidence IS NULL"))

    connection.execute(
        sa.text(
            "UPDATE verifications SET overall_result = "
            "CASE WHEN status = 'passed' THEN 'passed' "
            "WHEN status = 'failed' THEN 'failed' ELSE 'pending' END "
            "WHERE overall_result IS NULL"
        )
    )
    connection.execute(sa.text("UPDATE verifications SET individual_checks = '[]' WHERE individual_checks IS NULL"))
    connection.execute(sa.text("UPDATE verifications SET reasons = '[]' WHERE reasons IS NULL"))
    connection.execute(sa.text("UPDATE verifications SET evaluator_type = 'automated' WHERE evaluator_type IS NULL"))
    connection.execute(sa.text("UPDATE verifications SET evaluated_at = verified_at WHERE evaluated_at IS NULL"))

    connection.execute(sa.text("UPDATE disputes SET evidence = '{}' WHERE evidence IS NULL"))

    for row in connection.execute(
        sa.text("SELECT id FROM ledger_entries WHERE idempotency_key IS NULL ORDER BY id")
    ):
        connection.execute(
            sa.text("UPDATE ledger_entries SET idempotency_key = :key WHERE id = :id"),
            {"key": f"legacy-ledger-{row.id}", "id": row.id},
        )
    # A unique composite index enforces idempotency per escrow on SQLite and
    # PostgreSQL without altering the preserved ledger table history.
    _create_index(
        "uq_ledger_entries_escrow_idempotency_key",
        "ledger_entries",
        ["escrow_id", "idempotency_key"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_ledger_entries_escrow_idempotency_key", table_name="ledger_entries")
    op.drop_index("ix_disputes_escrow_status", table_name="disputes")
    op.drop_index("ix_jobs_selected_agent_id", table_name="jobs")
    op.drop_index("ix_agents_availability", table_name="agents")

    with op.batch_alter_table("disputes") as batch:
        batch.drop_column("resolution_rationale")
        batch.drop_column("evidence")
        batch.drop_column("escrow_id")
    with op.batch_alter_table("verifications") as batch:
        batch.drop_column("evaluated_at")
        batch.drop_column("evaluator_type")
        batch.drop_column("reasons")
        batch.drop_column("individual_checks")
        batch.drop_column("overall_result")
    with op.batch_alter_table("submissions") as batch:
        batch.drop_column("evidence")
        batch.drop_column("submitted_output")
    with op.batch_alter_table("ledger_entries") as batch:
        batch.drop_column("idempotency_key")
    with op.batch_alter_table("escrows") as batch:
        batch.drop_column("settled_at")
        batch.drop_column("funded_amount")
    with op.batch_alter_table("agreements") as batch:
        batch.drop_column("proposed_deadline")
        batch.drop_column("proposed_budget")
    with op.batch_alter_table("jobs") as batch:
        batch.drop_column("additional_instructions")
        batch.drop_column("acceptance_criteria")
        batch.drop_column("expected_output")
        batch.drop_column("task_category")
        batch.drop_column("required_skills")
        batch.drop_column("selected_agent_id")
    with op.batch_alter_table("agents") as batch:
        batch.drop_column("demo_performance_stats")
        batch.drop_column("estimated_completion_minutes")
        batch.drop_column("supported_output_formats")
        batch.drop_column("task_categories")
        batch.drop_column("skills")
        batch.drop_column("availability")
