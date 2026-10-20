"""Validated request and response contracts for the versioned API."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
import json
from typing import Annotated, Any, Literal

from pydantic import (
    AliasChoices,
    BaseModel,
    ConfigDict,
    Field,
    StrictInt,
    StrictStr,
    field_serializer,
    field_validator,
    model_validator,
)

SUPPORTED_CURRENCIES = frozenset({"USD", "EUR", "GBP", "JPY", "CAD", "AUD"})
MAX_JOB_BUDGET = Decimal("1000000.00")
MAX_JOB_DEADLINE_HORIZON = timedelta(days=365)
MAX_REQUIRED_SKILLS = 20
MAX_SKILL_LENGTH = 80
MAX_ACCEPTANCE_CRITERIA = 20
MAX_ACCEPTANCE_CRITERION_LENGTH = 1000
MAX_DESCRIPTION_LENGTH = 20000
MAX_EXPECTED_OUTPUT_LENGTH = 20000
MAX_AGREEMENT_TERM_LENGTH = 20000
MAX_AGREEMENT_RATIONALE_LENGTH = 4000
MAX_SUBMISSION_OUTPUT_LENGTH = 100000
MAX_SUBMISSION_NOTES_LENGTH = 4000
MAX_SUBMISSION_EVIDENCE_BYTES = 64000


def _currency(value: str) -> str:
    normalized = value.strip().upper()
    if normalized not in SUPPORTED_CURRENCIES:
        raise ValueError(f"unsupported currency; choose one of {sorted(SUPPORTED_CURRENCIES)}")
    return normalized


def _future_deadline(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("deadline must be an ISO-8601 datetime with a timezone")
    now = datetime.now(timezone.utc)
    normalized = value.astimezone(timezone.utc)
    if normalized <= now:
        raise ValueError("deadline must be in the future")
    if normalized > now + MAX_JOB_DEADLINE_HORIZON:
        raise ValueError("deadline is beyond the maximum supported horizon of 365 days")
    return normalized


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
    title: StrictStr = Field(max_length=240)
    description: StrictStr = Field(max_length=MAX_DESCRIPTION_LENGTH)
    required_skills: list[StrictStr] = Field(min_length=0)
    task_category: StrictStr = Field(max_length=120)
    expected_output: StrictStr = Field(max_length=MAX_EXPECTED_OUTPUT_LENGTH)
    acceptance_criteria: list[StrictStr] = Field(min_length=1)
    budget: Decimal = Field(
        gt=Decimal("0"),
        le=MAX_JOB_BUDGET,
        max_digits=18,
        decimal_places=2,
    )
    currency: StrictStr
    deadline: datetime
    additional_instructions: StrictStr | None = None
    # The requester is an association, not a workflow state. Assignment and
    # status fields are deliberately absent and therefore rejected by the
    # APIModel extra="forbid" contract.
    requester_agent_id: StrictInt | None = Field(default=None, gt=0)
    requirements: dict[str, Any] = Field(default_factory=dict)

    @field_validator("title", "description", "task_category", "expected_output")
    @classmethod
    def validate_required_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("value must contain non-whitespace characters")
        return normalized

    @field_validator("required_skills")
    @classmethod
    def normalize_required_skills(cls, value: list[str]) -> list[str]:
        normalized: list[str] = []
        seen: set[str] = set()
        for skill in value:
            item = skill.strip().lower()
            if not item:
                raise ValueError("required_skills cannot contain blank items")
            if len(item) > MAX_SKILL_LENGTH:
                raise ValueError(f"each required skill must be at most {MAX_SKILL_LENGTH} characters")
            if item not in seen:
                normalized.append(item)
                seen.add(item)
        if len(normalized) > MAX_REQUIRED_SKILLS:
            raise ValueError(f"required_skills cannot contain more than {MAX_REQUIRED_SKILLS} unique items")
        return normalized

    @field_validator("acceptance_criteria")
    @classmethod
    def normalize_acceptance_criteria(cls, value: list[str]) -> list[str]:
        if len(value) > MAX_ACCEPTANCE_CRITERIA:
            raise ValueError(f"acceptance_criteria cannot contain more than {MAX_ACCEPTANCE_CRITERIA} items")
        normalized: list[str] = []
        for criterion in value:
            item = criterion.strip()
            if not item:
                raise ValueError("acceptance_criteria must contain meaningful nonblank items")
            if len(item) > MAX_ACCEPTANCE_CRITERION_LENGTH:
                raise ValueError(
                    f"each acceptance criterion must be at most {MAX_ACCEPTANCE_CRITERION_LENGTH} characters"
                )
            normalized.append(item)
        return normalized

    @field_validator("budget")
    @classmethod
    def validate_budget_precision(cls, value: Decimal) -> Decimal:
        if value != value.quantize(Decimal("0.01")):
            raise ValueError("budget must use no more than 2 decimal places")
        return value

    _validate_currency = field_validator("currency")(_currency)
    _validate_deadline = field_validator("deadline")(_future_deadline)

    @field_validator("additional_instructions", mode="before")
    @classmethod
    def normalize_additional_instructions(cls, value: Any) -> Any:
        if value is None or not isinstance(value, str):
            return value
        normalized = value.strip()
        return normalized or None

    @field_validator("requirements")
    @classmethod
    def validate_requirements(cls, value: dict[str, Any]) -> dict[str, Any]:
        if any(not isinstance(key, str) or not key.strip() for key in value):
            raise ValueError("requirements keys must be non-empty strings")
        return value


# Keep the response/query contract explicit for OpenAPI while the allowed
# values and transitions live centrally in app.job_states.
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
    selected_match_run_id: StrictStr | None = None
    selected_matching_score: Decimal | None = None
    selected_scoring_version: StrictStr | None = None
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


class MatchCandidateResponse(APIModel):
    agent_id: int
    agent_name: StrictStr
    score: Decimal = Field(ge=Decimal("0"), le=Decimal("100"), max_digits=5, decimal_places=2)
    matched_skills: list[StrictStr]
    missing_skills: list[StrictStr]
    breakdown: dict[str, Any]
    explanation: StrictStr
    warnings: list[StrictStr]
    eligible: bool
    exclusion_reasons: list[StrictStr] = Field(default_factory=list)


class MatchRunResponse(APIModel):
    job_id: int
    run_id: StrictStr
    scoring_version: StrictStr
    computed_at: datetime
    candidates: list[MatchCandidateResponse]
    excluded_agents: list[MatchCandidateResponse]


class MatchSelectionRequest(APIModel):
    """Optional persisted match run to use as the selection's audit context."""

    run_id: StrictStr | None = Field(default=None, min_length=1, max_length=80)


# Descriptive compatibility alias for callers that refer to the action as an
# agent selection rather than a match selection.
AgentSelectionRequest = MatchSelectionRequest


class AgreementTerms(APIModel):
    """The immutable, versioned terms carried by an agreement proposal."""

    scope: StrictStr = Field(
        validation_alias=AliasChoices("scope", "task_description"),
        serialization_alias="scope",
        max_length=MAX_AGREEMENT_TERM_LENGTH,
    )
    expected_deliverable: StrictStr = Field(
        validation_alias=AliasChoices("expected_deliverable", "expected_output"),
        serialization_alias="expected_deliverable",
        max_length=MAX_AGREEMENT_TERM_LENGTH,
    )
    acceptance_criteria: list[StrictStr] = Field(min_length=1, max_length=MAX_ACCEPTANCE_CRITERIA)
    verification_method: StrictStr = Field(max_length=MAX_AGREEMENT_TERM_LENGTH)
    cancellation_conditions: StrictStr = Field(max_length=MAX_AGREEMENT_TERM_LENGTH)
    dispute_conditions: StrictStr = Field(max_length=MAX_AGREEMENT_TERM_LENGTH)
    instructions: Annotated[
        StrictStr | None,
        Field(
            validation_alias=AliasChoices("instructions", "additional_instructions"),
            serialization_alias="instructions",
            max_length=MAX_AGREEMENT_TERM_LENGTH,
        ),
    ] = None
    # Optional deterministic evaluator configuration.  It is part of the
    # accepted agreement snapshot, so clients cannot change verification rules
    # after acceptance.
    verification_rules: dict[str, Any] | None = None

    @field_validator(
        "scope",
        "expected_deliverable",
        "verification_method",
        "cancellation_conditions",
        "dispute_conditions",
        "instructions",
        mode="before",
    )
    @classmethod
    def normalize_term_text(cls, value: Any) -> Any:
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        normalized = value.strip()
        return normalized or None

    @field_validator("acceptance_criteria")
    @classmethod
    def normalize_term_criteria(cls, value: list[str]) -> list[str]:
        normalized: list[str] = []
        for criterion in value:
            item = criterion.strip()
            if not item:
                raise ValueError("acceptance_criteria must contain meaningful nonblank items")
            if len(item) > MAX_ACCEPTANCE_CRITERION_LENGTH:
                raise ValueError(
                    f"each acceptance criterion must be at most {MAX_ACCEPTANCE_CRITERION_LENGTH} characters"
                )
            normalized.append(item)
        return normalized

    @field_validator("verification_rules")
    @classmethod
    def validate_verification_rules(cls, value: dict[str, Any] | None) -> dict[str, Any] | None:
        if value is None:
            return None
        try:
            encoded = json.dumps(value, separators=(",", ":"), ensure_ascii=True)
        except (TypeError, ValueError) as exc:
            raise ValueError("verification_rules must contain JSON-compatible values") from exc
        if len(encoded.encode("utf-8")) > MAX_SUBMISSION_EVIDENCE_BYTES:
            raise ValueError("verification_rules is too large")
        return value


def _validate_optional_budget(value: Decimal | None) -> Decimal | None:
    if value is None:
        return None
    if value != value.quantize(Decimal("0.01")):
        raise ValueError("budget must use no more than 2 decimal places")
    return value


class AgreementCreate(APIModel):
    """Create a proposal, defaulting omitted values from its job."""

    proposed_budget: Decimal | None = Field(
        default=None,
        gt=Decimal("0"),
        le=MAX_JOB_BUDGET,
        max_digits=18,
        decimal_places=2,
    )
    proposed_deadline: datetime | None = None
    currency: StrictStr | None = None
    terms: AgreementTerms | None = None
    rationale: StrictStr | None = Field(default=None, max_length=MAX_AGREEMENT_RATIONALE_LENGTH)

    _validate_budget = field_validator("proposed_budget")(_validate_optional_budget)
    _validate_currency = field_validator("currency")(_currency)
    _validate_deadline = field_validator("proposed_deadline")(_future_deadline)

    @model_validator(mode="before")
    @classmethod
    def normalize_legacy_field_names(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value
        normalized = dict(value)
        aliases = {
            "proposed_budget": ("budget", "amount"),
            "proposed_deadline": ("deadline",),
        }
        for field_name, field_aliases in aliases.items():
            if field_name not in normalized:
                for alias in field_aliases:
                    if alias in normalized:
                        normalized[field_name] = normalized[alias]
                        break
            for alias in field_aliases:
                normalized.pop(alias, None)
        return normalized

    @field_validator("rationale", mode="before")
    @classmethod
    def normalize_rationale(cls, value: Any) -> Any:
        if value is None or not isinstance(value, str):
            return value
        normalized = value.strip()
        return normalized or None


class AgreementRevisionRequest(AgreementCreate):
    action: Literal["request_revision", "submit_revision"]


class AgreementActionRequest(APIModel):
    rationale: StrictStr | None = Field(default=None, max_length=MAX_AGREEMENT_RATIONALE_LENGTH)

    @field_validator("rationale", mode="before")
    @classmethod
    def normalize_rationale(cls, value: Any) -> Any:
        if value is None or not isinstance(value, str):
            return value
        normalized = value.strip()
        return normalized or None


class AgreementHistoryEntry(APIModel):
    """Normalized history response that also reads pre-Phase-6 entries."""

    version: int = 1
    action: StrictStr = "legacy"
    terms: dict[str, Any] = Field(default_factory=dict)
    budget: Decimal | None = None
    deadline: datetime | None = None
    timestamp: datetime | None = None
    rationale: StrictStr | None = None


class AgreementResponse(APIModel):
    id: int
    job_id: int
    requester_agent_id: int
    executor_agent_id: int
    proposed_budget: Decimal | None = None
    proposed_deadline: datetime | None = None
    currency: StrictStr
    status: Literal[
        "draft",
        "proposed",
        "revision_requested",
        "accepted",
        "rejected",
        "expired",
        "cancelled",
    ]
    terms: dict[str, Any]
    proposal_history: list[dict[str, Any]]
    # Deprecated compatibility alias.
    amount: Decimal
    created_at: datetime
    updated_at: datetime
    accepted_at: datetime | None = None
    proposal_version: int = 1
    accepted_version: int | None = None


class EscrowResponse(APIModel):
    id: int
    job_id: int
    agreement_id: int
    accepted_agreement_version: int | None = None
    agreement_version: int | None = None
    accepted_amount: Decimal
    accepted_currency: StrictStr
    funded_amount: Decimal | None = None
    currency: StrictStr
    status: Literal["pending", "funded", "held", "released", "refunded", "disputed"]
    funding_state: Literal["not_funded", "funded", "held", "released", "refunded", "disputed"]
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
    job_id: int | None = None
    idempotency_key: StrictStr
    entry_type: Literal["deposit", "funding", "hold", "release", "refund", "fee"]
    amount: Decimal
    currency: StrictStr
    reference: StrictStr | None = None
    occurred_at: datetime


class EscrowFundRequest(APIModel):
    """Safe funding metadata; amount and currency always come from the agreement."""

    idempotency_key: StrictStr | None = Field(default=None, min_length=1, max_length=160)
    reference: StrictStr | None = Field(default=None, min_length=1, max_length=160)

    @model_validator(mode="before")
    @classmethod
    def discard_derived_money_fields(cls, value: Any) -> Any:
        """Ignore legacy/client money fields rather than trusting them.

        The fields are intentionally absent from the typed contract.  Dropping
        them here keeps old demo callers harmless while ensuring the accepted
        agreement remains the sole source of amount and currency.
        """

        if not isinstance(value, dict):
            return value
        normalized = dict(value)
        normalized.pop("amount", None)
        normalized.pop("currency", None)
        return normalized

    @field_validator("idempotency_key", "reference", mode="before")
    @classmethod
    def normalize_funding_metadata(cls, value: Any) -> Any:
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        normalized = value.strip()
        if not normalized:
            raise ValueError("funding metadata must not be blank")
        if any(ord(character) < 32 or ord(character) == 127 for character in normalized):
            raise ValueError("funding metadata contains unsupported control characters")
        return normalized


class SubmissionCreate(APIModel):
    """User-supplied work output; content is stored and never executed."""

    submitted_output: StrictStr = Field(min_length=1, max_length=MAX_SUBMISSION_OUTPUT_LENGTH)
    evidence: dict[str, Any] = Field(default_factory=dict)
    notes: StrictStr | None = Field(default=None, max_length=MAX_SUBMISSION_NOTES_LENGTH)
    agent_id: StrictInt | None = Field(default=None, gt=0)

    @field_validator("submitted_output", "notes", mode="before")
    @classmethod
    def normalize_submission_text(cls, value: Any) -> Any:
        if value is None or not isinstance(value, str):
            return value
        normalized = value.strip()
        return normalized or None

    @field_validator("evidence")
    @classmethod
    def validate_submission_evidence(cls, value: dict[str, Any]) -> dict[str, Any]:
        try:
            encoded = json.dumps(value, separators=(",", ":"), ensure_ascii=True)
        except (TypeError, ValueError) as exc:
            raise ValueError("evidence must contain JSON-compatible values") from exc
        if len(encoded.encode("utf-8")) > MAX_SUBMISSION_EVIDENCE_BYTES:
            raise ValueError("evidence is too large")
        return value


class SubmissionResponse(APIModel):
    id: int
    job_id: int
    agent_id: int
    version: int
    artifact_url: StrictStr
    content: StrictStr | None = None
    submitted_output: StrictStr
    evidence: dict[str, Any]
    notes: StrictStr | None = None
    status: Literal["pending", "accepted", "rejected"]
    submitted_at: datetime


class VerificationResponse(APIModel):
    id: int
    job_id: int
    submission_id: int
    submission_version: int
    status: Literal["pending", "passed", "failed"]
    overall_result: Literal["pending", "passed", "failed", "manual_review", "needs_revision"]
    individual_checks: list[dict[str, Any]]
    reasons: list[StrictStr]
    evaluator_type: Literal["automated", "human", "hybrid"]
    score: Decimal | None = None
    feedback: dict[str, Any] = Field(default_factory=dict)
    evaluated_at: datetime | None = None
    verified_at: datetime | None = None


ExecutionStatus = Literal[
    "blocked",
    "ready",
    "awaiting_submission",
    "awaiting_verification",
    "retry_available",
    "manual_review",
    "settlement_ready",
    "completed",
    "disputed",
    "cancelled",
]


class ExecutionResponse(APIModel):
    job_id: int
    job_status: JobStatus
    execution_status: ExecutionStatus
    selected_agent_id: int | None = None
    executor_agent_id: int | None = None
    agreement_id: int | None = None
    accepted_agreement_version: int | None = None
    escrow_status: Literal["pending", "funded", "held", "released", "refunded", "disputed"] | None = None
    executor_type: Literal["local_demo"] = "local_demo"
    can_start: bool
    can_submit: bool
    can_verify: bool
    start_reason: StrictStr
    submit_reason: StrictStr
    verify_reason: StrictStr
    started_at: datetime | None = None
    latest_submission_version: int | None = None
    latest_verification_result: Literal["pending", "passed", "failed", "manual_review", "needs_revision"] | None = None


class DashboardExecutionMetrics(APIModel):
    jobs_running: int
    jobs_awaiting_submission: int
    jobs_awaiting_verification: int
    jobs_eligible_for_settlement: int
    recent_submissions: list[SubmissionResponse] = Field(default_factory=list)
    recent_verifications: list[VerificationResponse] = Field(default_factory=list)


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
