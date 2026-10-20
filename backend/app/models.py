"""SQLAlchemy models for the Auto Escrow domain."""

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

SUPPORTED_CURRENCIES = ("USD", "EUR", "GBP", "JPY", "CAD", "AUD")
MONEY = Numeric(18, 2, asdecimal=True)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Agent(Base):
    __tablename__ = "agents"
    __table_args__ = (
        CheckConstraint("status IN ('active', 'inactive', 'suspended')", name="ck_agents_status"),
        CheckConstraint(
            "availability IN ('available', 'busy', 'unavailable')",
            name="ck_agents_availability",
        ),
        UniqueConstraint("external_id", name="uq_agents_external_id"),
        Index("ix_agents_status", "status"),
        Index("ix_agents_availability", "availability"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    external_id: Mapped[str] = mapped_column(String(120), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    endpoint_url: Mapped[str | None] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    availability: Mapped[str] = mapped_column(String(20), nullable=False, default="available")
    skills: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    task_categories: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    supported_output_formats: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    estimated_completion_minutes: Mapped[int | None] = mapped_column(Integer)
    demo_performance_stats: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    # Deprecated compatibility column. New API contracts use explicit fields.
    capabilities: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    metadata_json: Mapped[dict[str, Any]] = mapped_column("metadata", JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    requested_jobs: Mapped[list["Job"]] = relationship(
        back_populates="requester", foreign_keys="Job.requester_agent_id"
    )
    assigned_jobs: Mapped[list["Job"]] = relationship(
        back_populates="executor", foreign_keys="Job.executor_agent_id"
    )
    selected_jobs: Mapped[list["Job"]] = relationship(
        back_populates="selected_agent", foreign_keys="Job.selected_agent_id"
    )
    agreements_as_requester: Mapped[list["Agreement"]] = relationship(
        back_populates="requester", foreign_keys="Agreement.requester_agent_id"
    )
    agreements_as_executor: Mapped[list["Agreement"]] = relationship(
        back_populates="executor", foreign_keys="Agreement.executor_agent_id"
    )
    submissions: Mapped[list["Submission"]] = relationship(back_populates="agent")
    verifications: Mapped[list["Verification"]] = relationship(
        back_populates="verifier", foreign_keys="Verification.verifier_agent_id"
    )
    disputes: Mapped[list["Dispute"]] = relationship(back_populates="raised_by")
    audit_events: Mapped[list["AuditEvent"]] = relationship(back_populates="actor")
    match_results: Mapped[list["MatchResult"]] = relationship(back_populates="agent")


class Job(Base):
    __tablename__ = "jobs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('open', 'assigned', 'in_progress', 'submitted', 'under_review', 'completed', 'disputed', 'cancelled')",
            name="ck_jobs_status",
        ),
        CheckConstraint("budget > 0", name="ck_jobs_budget_positive"),
        CheckConstraint("currency IN ('USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD')", name="ck_jobs_currency"),
        UniqueConstraint("public_id", name="uq_jobs_public_id"),
        Index("ix_jobs_status_deadline", "status", "deadline"),
        Index("ix_jobs_requester_agent_id", "requester_agent_id"),
        Index("ix_jobs_selected_agent_id", "selected_agent_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    public_id: Mapped[str] = mapped_column(String(80), nullable=False, default=lambda: f"job-{uuid4().hex}")
    # Legacy associations remain optional. Job creation is independent of an
    # Agent record; selected_agent_id is the explicit current association.
    requester_agent_id: Mapped[int | None] = mapped_column(ForeignKey("agents.id"))
    executor_agent_id: Mapped[int | None] = mapped_column(ForeignKey("agents.id"))
    selected_agent_id: Mapped[int | None] = mapped_column(ForeignKey("agents.id"))
    selected_match_run_id: Mapped[str | None] = mapped_column(String(80))
    selected_matching_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2, asdecimal=True))
    selected_scoring_version: Mapped[str | None] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    budget: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="open")
    required_skills: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    task_category: Mapped[str] = mapped_column(String(120), nullable=False, default="general")
    expected_output: Mapped[str] = mapped_column(Text, nullable=False, default="")
    acceptance_criteria: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    additional_instructions: Mapped[str | None] = mapped_column(Text)
    # Deprecated compatibility field for pre-Phase-3 clients.
    requirements: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    requester: Mapped[Agent | None] = relationship(back_populates="requested_jobs", foreign_keys=[requester_agent_id])
    executor: Mapped[Agent | None] = relationship(back_populates="assigned_jobs", foreign_keys=[executor_agent_id])
    selected_agent: Mapped[Agent | None] = relationship(
        back_populates="selected_jobs", foreign_keys=[selected_agent_id]
    )
    agreement: Mapped["Agreement | None"] = relationship(back_populates="job", uselist=False)
    escrow: Mapped["Escrow | None"] = relationship(back_populates="job", uselist=False)
    submissions: Mapped[list["Submission"]] = relationship(back_populates="job", cascade="all, delete-orphan")
    disputes: Mapped[list["Dispute"]] = relationship(back_populates="job", cascade="all, delete-orphan")
    audit_events: Mapped[list["AuditEvent"]] = relationship(back_populates="job", cascade="all, delete-orphan")
    match_results: Mapped[list["MatchResult"]] = relationship(back_populates="job", cascade="all, delete-orphan")


class Agreement(Base):
    __tablename__ = "agreements"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'proposed', 'revision_requested', 'accepted', 'rejected', 'expired', 'cancelled')",
            name="ck_agreements_status",
        ),
        CheckConstraint("amount > 0", name="ck_agreements_amount_positive"),
        CheckConstraint("proposed_budget > 0", name="ck_agreements_proposed_budget_positive"),
        CheckConstraint("currency IN ('USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD')", name="ck_agreements_currency"),
        UniqueConstraint("job_id", name="uq_agreements_job_id"),
        Index("ix_agreements_status", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"), nullable=False)
    requester_agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id"), nullable=False)
    executor_agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    proposed_budget: Mapped[Decimal | None] = mapped_column(MONEY)
    proposed_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="proposed")
    terms: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    proposal_history: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    proposal_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    accepted_version: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    job: Mapped[Job] = relationship(back_populates="agreement")
    requester: Mapped[Agent] = relationship(back_populates="agreements_as_requester", foreign_keys=[requester_agent_id])
    executor: Mapped[Agent] = relationship(back_populates="agreements_as_executor", foreign_keys=[executor_agent_id])
    escrow: Mapped["Escrow | None"] = relationship(back_populates="agreement", uselist=False)


class Escrow(Base):
    __tablename__ = "escrows"
    __table_args__ = (
        CheckConstraint("status IN ('pending', 'funded', 'held', 'released', 'refunded', 'disputed')", name="ck_escrows_status"),
        CheckConstraint("amount > 0", name="ck_escrows_amount_positive"),
        CheckConstraint("funded_amount > 0", name="ck_escrows_funded_amount_positive"),
        CheckConstraint("currency IN ('USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD')", name="ck_escrows_currency"),
        UniqueConstraint("job_id", name="uq_escrows_job_id"),
        UniqueConstraint("agreement_id", name="uq_escrows_agreement_id"),
        Index("ix_escrows_status", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"), nullable=False)
    agreement_id: Mapped[int] = mapped_column(ForeignKey("agreements.id"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    funded_amount: Mapped[Decimal | None] = mapped_column(MONEY)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    accepted_agreement_version: Mapped[int | None] = mapped_column(Integer)
    provider_reference: Mapped[str | None] = mapped_column(String(160))
    funded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    job: Mapped[Job] = relationship(back_populates="escrow")
    agreement: Mapped[Agreement] = relationship(back_populates="escrow")
    ledger_entries: Mapped[list["LedgerEntry"]] = relationship(back_populates="escrow", cascade="all, delete-orphan")
    disputes: Mapped[list["Dispute"]] = relationship(back_populates="escrow")

    @property
    def agreement_version(self) -> int | None:
        """Response-friendly alias for the frozen agreement version."""

        return self.accepted_agreement_version

    @property
    def accepted_amount(self) -> Decimal:
        """The amount copied from the accepted agreement."""

        return self.amount

    @property
    def accepted_currency(self) -> str:
        """The currency copied from the accepted agreement."""

        return self.currency

    @property
    def funding_state(self) -> str:
        from app.escrow_states import funding_state

        return funding_state(self.status)


class LedgerEntry(Base):
    __tablename__ = "ledger_entries"
    __table_args__ = (
        CheckConstraint(
            "entry_type IN ('deposit', 'funding', 'hold', 'release', 'refund', 'fee')",
            name="ck_ledger_entries_type",
        ),
        CheckConstraint("amount > 0", name="ck_ledger_entries_amount_positive"),
        CheckConstraint("currency IN ('USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD')", name="ck_ledger_entries_currency"),
        UniqueConstraint("escrow_id", "idempotency_key", name="uq_ledger_entries_escrow_idempotency_key"),
        Index("ix_ledger_entries_escrow_occurred", "escrow_id", "occurred_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    escrow_id: Mapped[int] = mapped_column(ForeignKey("escrows.id"), nullable=False)
    # Nullable for legacy ledger history. New financial entries always carry
    # the owning job id so job-level audit and ledger reads remain consistent.
    job_id: Mapped[int | None] = mapped_column(ForeignKey("jobs.id"))
    idempotency_key: Mapped[str] = mapped_column(
        String(160), nullable=False, default=lambda: f"ledger-{uuid4().hex}"
    )
    entry_type: Mapped[str] = mapped_column(String(20), nullable=False)
    amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    reference: Mapped[str | None] = mapped_column(String(160))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    escrow: Mapped[Escrow] = relationship(back_populates="ledger_entries")
    job: Mapped[Job | None] = relationship()


class Submission(Base):
    __tablename__ = "submissions"
    __table_args__ = (
        CheckConstraint("status IN ('pending', 'accepted', 'rejected')", name="ck_submissions_status"),
        UniqueConstraint("job_id", "version", name="uq_submissions_job_version"),
        Index("ix_submissions_job_submitted", "job_id", "submitted_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"), nullable=False)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    artifact_url: Mapped[str] = mapped_column(String(1000), nullable=False)
    content: Mapped[str | None] = mapped_column(Text)
    submitted_output: Mapped[str] = mapped_column(Text, nullable=False, default="")
    evidence: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    metadata_json: Mapped[dict[str, Any]] = mapped_column("metadata", JSON, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    job: Mapped[Job] = relationship(back_populates="submissions")
    agent: Mapped[Agent] = relationship(back_populates="submissions")
    verification: Mapped["Verification | None"] = relationship(back_populates="submission", uselist=False, cascade="all, delete-orphan")

    @property
    def notes(self) -> str | None:
        """Expose optional explanatory notes stored in metadata JSON."""

        value = (self.metadata_json or {}).get("notes") if isinstance(self.metadata_json, dict) else None
        return value if isinstance(value, str) else None


class Verification(Base):
    __tablename__ = "verifications"
    __table_args__ = (
        CheckConstraint("status IN ('pending', 'passed', 'failed')", name="ck_verifications_status"),
        UniqueConstraint("submission_id", name="uq_verifications_submission_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    submission_id: Mapped[int] = mapped_column(ForeignKey("submissions.id"), nullable=False)
    verifier_agent_id: Mapped[int | None] = mapped_column(ForeignKey("agents.id"))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    overall_result: Mapped[str] = mapped_column(String(30), nullable=False, default="pending")
    individual_checks: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False, default=list)
    reasons: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    evaluator_type: Mapped[str] = mapped_column(String(20), nullable=False, default="automated")
    score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2, asdecimal=True))
    feedback: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    evaluated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    submission: Mapped[Submission] = relationship(back_populates="verification")
    verifier: Mapped[Agent | None] = relationship(
        back_populates="verifications", foreign_keys=[verifier_agent_id]
    )


class Dispute(Base):
    __tablename__ = "disputes"
    __table_args__ = (
        CheckConstraint("status IN ('open', 'under_review', 'resolved', 'rejected')", name="ck_disputes_status"),
        Index("ix_disputes_job_status", "job_id", "status"),
        Index("ix_disputes_escrow_status", "escrow_id", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"), nullable=False)
    escrow_id: Mapped[int | None] = mapped_column(ForeignKey("escrows.id"))
    raised_by_agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id"), nullable=False)
    category: Mapped[str] = mapped_column(String(60), nullable=False, default="other")
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    submission_id: Mapped[int | None] = mapped_column(ForeignKey("submissions.id"))
    verification_id: Mapped[int | None] = mapped_column(ForeignKey("verifications.id"))
    previous_job_status: Mapped[str | None] = mapped_column(String(30))
    previous_escrow_status: Mapped[str | None] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    evidence: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    resolution: Mapped[str | None] = mapped_column(Text)
    resolution_rationale: Mapped[str | None] = mapped_column(Text)
    resolved_by_operator: Mapped[str | None] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)

    job: Mapped[Job] = relationship(back_populates="disputes")
    escrow: Mapped[Escrow | None] = relationship(back_populates="disputes")
    raised_by: Mapped[Agent] = relationship(back_populates="disputes")
    submission: Mapped[Submission | None] = relationship(foreign_keys=[submission_id])
    verification: Mapped[Verification | None] = relationship(foreign_keys=[verification_id])


class AuditEvent(Base):
    __tablename__ = "audit_events"
    __table_args__ = (
        Index("ix_audit_events_job_created", "job_id", "created_at"),
        Index("ix_audit_events_event_type", "event_type"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int | None] = mapped_column(ForeignKey("jobs.id"))
    actor_agent_id: Mapped[int | None] = mapped_column(ForeignKey("agents.id"))
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    data: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    job: Mapped[Job | None] = relationship(back_populates="audit_events")
    actor: Mapped[Agent | None] = relationship(back_populates="audit_events")


class MatchResult(Base):
    """One agent's explainable result from one matching run."""

    __tablename__ = "match_results"
    __table_args__ = (
        CheckConstraint("score >= 0 AND score <= 100", name="ck_match_results_score_range"),
        UniqueConstraint("run_id", "agent_id", name="uq_match_results_run_agent"),
        Index("ix_match_results_job_run", "job_id", "run_id"),
        Index("ix_match_results_job_computed", "job_id", "computed_at"),
        Index("ix_match_results_agent", "agent_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"), nullable=False)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id"), nullable=False)
    run_id: Mapped[str] = mapped_column(String(80), nullable=False)
    scoring_version: Mapped[str] = mapped_column(String(40), nullable=False)
    score: Mapped[Decimal] = mapped_column(Numeric(5, 2, asdecimal=True), nullable=False)
    matched_skills: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    missing_skills: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    breakdown: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    warnings: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    eligible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)

    job: Mapped[Job] = relationship(back_populates="match_results")
    agent: Mapped[Agent] = relationship(back_populates="match_results")


__all__ = [
    "Agent",
    "Agreement",
    "AuditEvent",
    "Base",
    "Dispute",
    "Escrow",
    "Job",
    "LedgerEntry",
    "MatchResult",
    "Submission",
    "Verification",
]
