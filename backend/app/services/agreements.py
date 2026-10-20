"""Transactional agreement proposal and negotiation workflows."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.agreement_states import (
    ACCEPTED_STATUS,
    PROPOSAL_STATUS,
    REVISION_REQUESTED_STATUS,
    InvalidAgreementTransition,
    validate_submit_revision,
    validate_transition,
)
from app.job_states import InvalidJobTransition
from app.models import Agent, Agreement, Job, SUPPORTED_CURRENCIES
from app.schemas import (
    AgreementActionRequest,
    AgreementCreate,
    AgreementHistoryEntry,
    AgreementRevisionRequest,
    AgreementTerms,
    MAX_JOB_DEADLINE_HORIZON,
)
from app.services.audit import record_event
from app.services.jobs import transition_job


class AgreementServiceError(Exception):
    """Base class for expected agreement workflow failures."""


class AgreementNotFoundError(AgreementServiceError):
    pass


class JobNotFoundForAgreementError(AgreementServiceError):
    pass


class SelectedAgentRequiredError(AgreementServiceError):
    pass


class SelectedAgentNotFoundError(AgreementServiceError):
    pass


class AgreementConflictError(AgreementServiceError):
    pass


class AgreementValidationError(AgreementServiceError):
    pass


class AgreementStateConflictError(AgreementServiceError):
    pass


class JobStateConflictError(AgreementServiceError):
    pass


def get_agreement(db: Session, agreement_id: int) -> Agreement | None:
    return db.get(Agreement, agreement_id)


def get_job_agreement(db: Session, job_id: int) -> Agreement | None:
    return db.scalar(select(Agreement).where(Agreement.job_id == job_id))


def _normalize_deadline(value: datetime, *, require_timezone: bool, enforce_horizon: bool = True) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        if require_timezone:
            raise AgreementValidationError("deadline must be an ISO-8601 datetime with a timezone")
        value = value.replace(tzinfo=timezone.utc)
    normalized = value.astimezone(timezone.utc)
    now = datetime.now(timezone.utc)
    if normalized <= now:
        raise AgreementValidationError("deadline must be in the future")
    if enforce_horizon and normalized > now + MAX_JOB_DEADLINE_HORIZON:
        raise AgreementValidationError("deadline is beyond the maximum supported horizon of 365 days")
    return normalized


def _normalize_budget(value: Decimal) -> Decimal:
    if value <= 0:
        raise AgreementValidationError("budget must be positive")
    if value != value.quantize(Decimal("0.01")):
        raise AgreementValidationError("budget must use no more than 2 decimal places")
    return value


def _normalize_currency(value: str) -> str:
    normalized = value.strip().upper()
    if normalized not in SUPPORTED_CURRENCIES:
        raise AgreementValidationError("unsupported currency")
    return normalized


def _default_terms(job: Job) -> AgreementTerms:
    try:
        return AgreementTerms(
            scope=job.description,
            expected_deliverable=job.expected_output,
            acceptance_criteria=list(job.acceptance_criteria or []),
            verification_method="Requester review against each acceptance criterion.",
            cancellation_conditions="Cancellation is allowed before acceptance when the parties agree or the job can no longer be completed.",
            dispute_conditions="A party may raise a dispute with evidence when the delivered work or a decision does not satisfy these terms.",
            instructions=job.additional_instructions,
        )
    except ValueError as exc:
        raise AgreementValidationError("job defaults do not contain meaningful agreement terms") from exc


def _terms_snapshot(terms: AgreementTerms) -> dict[str, Any]:
    return deepcopy(terms.model_dump(mode="json", by_alias=True, exclude_none=True))


def _history_entry(
    *,
    version: int,
    action: str,
    terms: dict[str, Any],
    budget: Decimal,
    deadline: datetime,
    timestamp: datetime,
    rationale: str | None = None,
) -> dict[str, Any]:
    entry: dict[str, Any] = {
        "version": version,
        "action": action,
        "terms": deepcopy(terms),
        "budget": format(budget, ".2f"),
        "proposed_budget": format(budget, ".2f"),
        "deadline": deadline.astimezone(timezone.utc).isoformat(),
        "timestamp": timestamp.astimezone(timezone.utc).isoformat(),
    }
    if rationale:
        entry["rationale"] = rationale
    return entry


def _current_version(agreement: Agreement) -> int:
    current = agreement.proposal_version or 1
    for entry in agreement.proposal_history or []:
        if isinstance(entry, dict):
            try:
                current = max(current, int(entry.get("version", 0)))
            except (TypeError, ValueError):
                continue
    return current


def _validated_terms(value: dict[str, Any]) -> AgreementTerms:
    try:
        return AgreementTerms.model_validate(value)
    except ValueError as exc:
        raise AgreementValidationError("agreement terms are incomplete or not meaningful") from exc


def _validate_job_for_create(db: Session, job_id: int) -> tuple[Job, Agent]:
    job = db.get(Job, job_id)
    if job is None:
        raise JobNotFoundForAgreementError("job not found")
    if job.status != "open":
        raise AgreementStateConflictError("an agreement can only be proposed for an open job")
    if job.selected_agent_id is None:
        raise SelectedAgentRequiredError("job must have a selected agent before proposing an agreement")
    agent = db.get(Agent, job.selected_agent_id)
    if agent is None:
        raise SelectedAgentNotFoundError("selected agent not found")
    return job, agent


def _commit_or_conflict(db: Session, conflict_message: str) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise AgreementConflictError(conflict_message) from exc


def create_agreement(db: Session, job_id: int, payload: AgreementCreate) -> Agreement:
    job, selected_agent = _validate_job_for_create(db, job_id)
    if get_job_agreement(db, job_id) is not None:
        raise AgreementConflictError("an agreement already exists for this job")

    budget = _normalize_budget(payload.proposed_budget or job.budget)
    deadline = _normalize_deadline(
        payload.proposed_deadline or job.deadline,
        require_timezone=False,
        # Preserve a future deadline already persisted on a legacy/demo job;
        # newly supplied agreement deadlines remain bounded by the normal API
        # horizon and are validated by the request schema as well.
        enforce_horizon=payload.proposed_deadline is not None,
    )
    currency = _normalize_currency(payload.currency or job.currency)
    terms = payload.terms or _default_terms(job)
    terms_snapshot = _terms_snapshot(terms)
    now = datetime.now(timezone.utc)
    history = [
        _history_entry(
            version=1,
            action="proposed",
            terms=terms_snapshot,
            budget=budget,
            deadline=deadline,
            timestamp=now,
            rationale=payload.rationale,
        )
    ]

    # requester_agent_id was historically mandatory even though Phase 4 jobs
    # may omit a requester.  The selected agent is a safe compatibility actor
    # for that legacy column; the executor remains the explicit selection.
    requester_agent_id = job.requester_agent_id or selected_agent.id
    agreement = Agreement(
        job_id=job.id,
        requester_agent_id=requester_agent_id,
        executor_agent_id=selected_agent.id,
        amount=budget,
        proposed_budget=budget,
        proposed_deadline=deadline,
        currency=currency,
        status=PROPOSAL_STATUS,
        terms=terms_snapshot,
        proposal_history=history,
        proposal_version=1,
    )
    db.add(agreement)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise AgreementConflictError("an agreement already exists for this job") from exc
    record_event(
        db,
        "agreement.proposed",
        job_id=job.id,
        actor_agent_id=requester_agent_id,
        description="agreement.proposed",
        data={
            "agreement_id": agreement.id,
            "version": 1,
            "status": agreement.status,
            "budget": format(budget, ".2f"),
            "deadline": deadline.isoformat(),
        },
    )
    _commit_or_conflict(db, "agreement could not be created")
    db.refresh(agreement)
    return agreement


def request_revision(db: Session, agreement_id: int, payload: AgreementRevisionRequest) -> Agreement:
    agreement = _require_agreement(db, agreement_id)
    try:
        validate_transition(agreement.status, REVISION_REQUESTED_STATUS)
    except InvalidAgreementTransition as exc:
        raise AgreementStateConflictError(str(exc)) from exc

    previous_status = agreement.status
    agreement.status = REVISION_REQUESTED_STATUS
    record_event(
        db,
        "agreement.revision_requested",
        job_id=agreement.job_id,
        actor_agent_id=agreement.requester_agent_id,
        description="agreement.revision_requested",
        data={
            "agreement_id": agreement.id,
            "from_status": previous_status,
            "to_status": agreement.status,
            "proposal_version": _current_version(agreement),
            "rationale": payload.rationale,
        },
    )
    _commit_or_conflict(db, "agreement revision request could not be saved")
    db.refresh(agreement)
    return agreement


def submit_revision(db: Session, agreement_id: int, payload: AgreementRevisionRequest) -> Agreement:
    agreement = _require_agreement(db, agreement_id)
    try:
        validate_submit_revision(agreement.status)
    except InvalidAgreementTransition as exc:
        raise AgreementStateConflictError(str(exc)) from exc

    current_budget = agreement.proposed_budget or agreement.amount
    budget = _normalize_budget(payload.proposed_budget or current_budget)
    current_deadline = agreement.proposed_deadline
    if current_deadline is None:
        job = db.get(Job, agreement.job_id)
        if job is None:
            raise JobNotFoundForAgreementError("job not found")
        current_deadline = job.deadline
    deadline = _normalize_deadline(
        payload.proposed_deadline or current_deadline,
        require_timezone=False,
        enforce_horizon=payload.proposed_deadline is not None,
    )
    terms = payload.terms or _validated_terms(agreement.terms or {})
    terms_snapshot = _terms_snapshot(terms)
    version = _current_version(agreement) + 1
    now = datetime.now(timezone.utc)
    history = list(agreement.proposal_history or [])
    history.append(
        _history_entry(
            version=version,
            action="revised",
            terms=terms_snapshot,
            budget=budget,
            deadline=deadline,
            timestamp=now,
            rationale=payload.rationale,
        )
    )
    previous_status = agreement.status
    agreement.amount = budget
    agreement.proposed_budget = budget
    agreement.proposed_deadline = deadline
    agreement.terms = terms_snapshot
    agreement.proposal_history = history
    agreement.proposal_version = version
    agreement.status = PROPOSAL_STATUS
    record_event(
        db,
        "agreement.revised",
        job_id=agreement.job_id,
        actor_agent_id=agreement.requester_agent_id,
        description="agreement.revised",
        data={
            "agreement_id": agreement.id,
            "from_status": previous_status,
            "to_status": agreement.status,
            "proposal_version": version,
            "budget": format(budget, ".2f"),
            "deadline": deadline.isoformat(),
            "rationale": payload.rationale,
        },
    )
    _commit_or_conflict(db, "agreement revision could not be saved")
    db.refresh(agreement)
    return agreement


def revise_agreement(db: Session, agreement_id: int, payload: AgreementRevisionRequest) -> Agreement:
    if payload.action == "request_revision":
        return request_revision(db, agreement_id, payload)
    return submit_revision(db, agreement_id, payload)


def accept_agreement(db: Session, agreement_id: int, payload: AgreementActionRequest | None = None) -> Agreement:
    agreement = _require_agreement(db, agreement_id)
    if agreement.status == ACCEPTED_STATUS:
        # Acceptance is intentionally idempotent and does not create another
        # audit event or alter the accepted snapshot.
        return agreement
    try:
        validate_transition(agreement.status, ACCEPTED_STATUS)
    except InvalidAgreementTransition as exc:
        raise AgreementStateConflictError(str(exc)) from exc
    job = db.get(Job, agreement.job_id)
    if job is None:
        raise JobNotFoundForAgreementError("job not found")
    try:
        transition_job(job, "assigned")
    except InvalidJobTransition as exc:
        raise JobStateConflictError(str(exc)) from exc
    # Selection is provisional until acceptance. Persist the selected executor
    # as the job assignment at the same transaction boundary as acceptance.
    job.executor_agent_id = agreement.executor_agent_id

    now = datetime.now(timezone.utc)
    agreement.status = ACCEPTED_STATUS
    agreement.accepted_version = _current_version(agreement)
    agreement.accepted_at = now
    record_event(
        db,
        "agreement.accepted",
        job_id=agreement.job_id,
        actor_agent_id=agreement.requester_agent_id,
        description="agreement.accepted",
        data={
            "agreement_id": agreement.id,
            "proposal_version": agreement.accepted_version,
            "status": agreement.status,
            "job_status": job.status,
            "rationale": payload.rationale if payload else None,
        },
    )
    _commit_or_conflict(db, "agreement acceptance could not be saved")
    db.refresh(agreement)
    return agreement


def reject_agreement(db: Session, agreement_id: int, payload: AgreementActionRequest | None = None) -> Agreement:
    return _finish_agreement(db, agreement_id, "rejected", "agreement.rejected", payload)


def cancel_agreement(db: Session, agreement_id: int, payload: AgreementActionRequest | None = None) -> Agreement:
    return _finish_agreement(db, agreement_id, "cancelled", "agreement.cancelled", payload)


def _finish_agreement(
    db: Session,
    agreement_id: int,
    target_status: str,
    event_type: str,
    payload: AgreementActionRequest | None,
) -> Agreement:
    agreement = _require_agreement(db, agreement_id)
    try:
        validate_transition(agreement.status, target_status)
    except InvalidAgreementTransition as exc:
        raise AgreementStateConflictError(str(exc)) from exc
    previous_status = agreement.status
    agreement.status = target_status
    record_event(
        db,
        event_type,
        job_id=agreement.job_id,
        actor_agent_id=agreement.requester_agent_id,
        description=event_type,
        data={
            "agreement_id": agreement.id,
            "from_status": previous_status,
            "to_status": target_status,
            "proposal_version": _current_version(agreement),
            "rationale": payload.rationale if payload else None,
        },
    )
    _commit_or_conflict(db, f"agreement could not be {target_status}")
    db.refresh(agreement)
    return agreement


def _require_agreement(db: Session, agreement_id: int) -> Agreement:
    agreement = get_agreement(db, agreement_id)
    if agreement is None:
        raise AgreementNotFoundError("agreement not found")
    return agreement


def list_agreement_history(db: Session, agreement_id: int) -> list[AgreementHistoryEntry]:
    agreement = _require_agreement(db, agreement_id)
    normalized: list[AgreementHistoryEntry] = []
    for index, raw_entry in enumerate(agreement.proposal_history or [], start=1):
        if not isinstance(raw_entry, dict):
            raw_entry = {}
        raw_budget = raw_entry.get("budget", raw_entry.get("proposed_budget", raw_entry.get("amount")))
        raw_deadline = raw_entry.get("deadline", raw_entry.get("proposed_deadline"))
        raw_timestamp = raw_entry.get("timestamp", raw_entry.get("created_at"))
        normalized.append(
            AgreementHistoryEntry.model_validate(
                {
                    "version": raw_entry.get("version", index),
                    "action": raw_entry.get("action", raw_entry.get("status", "legacy")),
                    "terms": raw_entry.get("terms", {}),
                    "budget": raw_budget,
                    "deadline": raw_deadline,
                    "timestamp": raw_timestamp,
                    "rationale": raw_entry.get("rationale"),
                }
            )
        )
    return normalized


__all__ = [
    "AgreementConflictError",
    "AgreementNotFoundError",
    "AgreementServiceError",
    "AgreementStateConflictError",
    "AgreementValidationError",
    "JobNotFoundForAgreementError",
    "JobStateConflictError",
    "SelectedAgentNotFoundError",
    "SelectedAgentRequiredError",
    "accept_agreement",
    "cancel_agreement",
    "create_agreement",
    "get_agreement",
    "get_job_agreement",
    "list_agreement_history",
    "reject_agreement",
    "request_revision",
    "revise_agreement",
    "submit_revision",
]
