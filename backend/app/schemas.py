"""Validated request and response contracts for the versioned API."""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Literal

from pydantic import (
    AliasChoices,
    BaseModel,
    ConfigDict,
    Field,
    StrictInt,
    StrictStr,
    field_serializer,
    field_validator,
)

SUPPORTED_CURRENCIES = frozenset({"USD", "EUR", "GBP", "JPY", "CAD", "AUD"})


def _currency(value: str) -> str:
    normalized = value.upper()
    if normalized not in SUPPORTED_CURRENCIES:
        raise ValueError(f"unsupported currency; choose one of {sorted(SUPPORTED_CURRENCIES)}")
    return normalized


def _future_deadline(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("deadline must be an ISO-8601 datetime with a timezone")
    if value <= datetime.now(timezone.utc):
        raise ValueError("deadline must be in the future")
    return value


class APIModel(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        extra="forbid",
    )

    @field_serializer("*", when_used="json")
    def serialize_decimal(self, value: Any) -> Any:
        """Serialize NUMERIC values as fixed-point strings without float loss."""

        return format(value, ".2f") if isinstance(value, Decimal) else value


class HealthResponse(APIModel):
    status: StrictStr
    service: StrictStr
    environment: StrictStr
    timestamp: datetime


class AgentSummary(APIModel):
    id: int
    external_id: StrictStr
    name: StrictStr
    description: StrictStr
    endpoint_url: str | None = None
    status: Literal["active", "inactive", "suspended"]
    availability: Literal["available", "busy", "unavailable"]
    skills: list[StrictStr]
    task_categories: list[StrictStr]
    supported_output_formats: list[StrictStr]
    estimated_completion_minutes: int | None = Field(default=None, ge=0)
    demo_performance_stats: dict[str, Any]
    # Deprecated response alias retained for older clients.
    capabilities: list[StrictStr] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(
        validation_alias=AliasChoices("metadata_json", "metadata"),
        serialization_alias="metadata",
    )
    created_at: datetime


class AgentListResponse(APIModel):
    items: list[AgentSummary]
    total: int


class JobCreate(APIModel):
    title: StrictStr = Field(min_length=1, max_length=240)
    description: StrictStr = Field(min_length=1)
    required_skills: list[StrictStr] = Field(min_length=0)
    task_category: StrictStr = Field(min_length=1, max_length=120)
    expected_output: StrictStr = Field(min_length=1)
    acceptance_criteria: list[StrictStr] = Field(min_length=1)
    budget: Decimal = Field(gt=Decimal("0"), max_digits=18, decimal_places=2)
    currency: StrictStr
    deadline: datetime
    additional_instructions: StrictStr | None = None
    selected_agent_id: StrictInt | None = Field(default=None, gt=0)
    # Optional compatibility associations. Neither is required for creation.
    requester_agent_id: StrictInt | None = Field(default=None, gt=0)
    executor_agent_id: StrictInt | None = Field(default=None, gt=0)
    requirements: dict[str, Any] = Field(default_factory=dict)

    _validate_currency = field_validator("currency")(_currency)
    _validate_deadline = field_validator("deadline")(_future_deadline)

    @field_validator("requirements")
    @classmethod
    def validate_requirements(cls, value: dict[str, Any]) -> dict[str, Any]:
        if any(not isinstance(key, str) or not key.strip() for key in value):
            raise ValueError("requirements keys must be non-empty strings")
        return value


JobStatus = Literal[
    "open",
    "assigned",
    "in_progress",
    "submitted",
    "under_review",
    "completed",
    "disputed",
    "cancelled",
]


class JobSummary(APIModel):
    id: int
    public_id: StrictStr
    requester_agent_id: int | None = None
    executor_agent_id: int | None = None
    selected_agent_id: int | None = None
    title: StrictStr
    description: StrictStr
    required_skills: list[StrictStr]
    task_category: StrictStr
    expected_output: StrictStr
    acceptance_criteria: list[StrictStr]
    additional_instructions: StrictStr | None = None
    budget: Decimal
    currency: StrictStr
    deadline: datetime
    status: JobStatus
    # Deprecated compatibility response field.
    requirements: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class JobListResponse(APIModel):
    items: list[JobSummary]
    total: int


class AgreementResponse(APIModel):
    id: int
    job_id: int
    requester_agent_id: int
    executor_agent_id: int
    proposed_budget: Decimal
    proposed_deadline: datetime | None = None
    currency: StrictStr
    status: Literal["draft", "proposed", "accepted", "rejected", "expired", "cancelled"]
    terms: dict[str, Any]
    proposal_history: list[dict[str, Any]]
    # Deprecated compatibility alias.
    amount: Decimal
    created_at: datetime
    updated_at: datetime
    accepted_at: datetime | None = None


class EscrowResponse(APIModel):
    id: int
    job_id: int
    agreement_id: int
    funded_amount: Decimal
    currency: StrictStr
    status: Literal["pending", "funded", "held", "released", "refunded", "disputed"]
    provider_reference: StrictStr | None = None
    funded_at: datetime | None = None
    released_at: datetime | None = None
    settled_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    # Deprecated compatibility alias.
    amount: Decimal
    ledger_entries: list["LedgerEntryResponse"] = Field(default_factory=list)


class LedgerEntryResponse(APIModel):
    id: int
    escrow_id: int
    idempotency_key: StrictStr
    entry_type: Literal["deposit", "hold", "release", "refund", "fee"]
    amount: Decimal
    currency: StrictStr
    reference: StrictStr | None = None
    occurred_at: datetime


class SubmissionResponse(APIModel):
    id: int
    job_id: int
    agent_id: int
    version: int
    submitted_output: StrictStr
    evidence: dict[str, Any]
    status: Literal["pending", "accepted", "rejected"]
    submitted_at: datetime


class VerificationResponse(APIModel):
    id: int
    submission_id: int
    overall_result: Literal["pending", "passed", "failed", "needs_revision"]
    individual_checks: list[dict[str, Any]]
    reasons: list[StrictStr]
    evaluator_type: Literal["automated", "human", "hybrid"]
    evaluated_at: datetime | None = None


class DisputeResponse(APIModel):
    id: int
    job_id: int
    escrow_id: int | None = None
    raised_by_agent_id: int
    status: Literal["open", "under_review", "resolved", "rejected"]
    reason: StrictStr
    evidence: dict[str, Any]
    resolution: StrictStr | None = None
    resolution_rationale: StrictStr | None = None
    created_at: datetime
    resolved_at: datetime | None = None


class JobEventResponse(APIModel):
    id: int
    job_id: int | None = None
    actor_agent_id: int | None = None
    event_type: StrictStr
    description: StrictStr
    data: dict[str, Any]
    created_at: datetime


class DashboardMetrics(APIModel):
    total_jobs: int
    jobs_in_progress: int
    completed_jobs: int
    open_disputes: int
    total_simulated_escrow_funded: Decimal
    total_simulated_escrow_settled: Decimal
