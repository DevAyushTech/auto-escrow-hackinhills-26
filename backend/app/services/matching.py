"""Deterministic, explainable agent matching.

The scoring policy in this module is deliberately pure: it reads only the
provided job and agent values and an optional clock value.  Database and API
code is kept below the pure functions so the same policy can be used for
ranking, selection re-validation, and focused unit tests.

Scoring version ``phase5-v1`` uses these weights:

* required skills: 50%
* exact task-category membership: 20%
* availability and deadline compatibility: 20% (10% each inside the group)
* budget: 10%, always neutral at 0.5 / 5 points because agents have no
  reliable price field in the current model

Eligibility is separate from scoring.  An agent must be active and available,
must have every required skill, and must not have a known completion estimate
longer than the remaining deadline.  Unknown optional metadata produces a
warning and a neutral component where applicable; it never creates an
eligibility exclusion.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Mapping, Sequence
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.job_states import is_open_for_matching
from app.models import Agent, Job, MatchResult, utc_now
from app.services.audit import record_event

SCORING_VERSION = "phase5-v1"
MATCHING_ENGINE_VERSION = SCORING_VERSION
SKILLS_WEIGHT = Decimal("0.50")
CATEGORY_WEIGHT = Decimal("0.20")
AVAILABILITY_DEADLINE_WEIGHT = Decimal("0.20")
BUDGET_WEIGHT = Decimal("0.10")
NEUTRAL_SCORE = Decimal("0.50")
MAX_SCORE = Decimal("100.00")
BUDGET_UNKNOWN_WARNING = (
    "Budget component is unknown: no reliable agent price data is available; "
    "a neutral 0.5 contribution (5 points) was used."
)
NO_REQUIRED_SKILLS_WARNING = (
    "No required skills were supplied; the skills component used a neutral 0.5 contribution."
)
UNKNOWN_DEADLINE_WARNING = (
    "Agent completion estimate is unknown; deadline compatibility used a neutral 0.5 contribution."
)


@dataclass(frozen=True)
class MatchingWeights:
    """Configurable weights for the four documented scoring components."""

    skills: Decimal = SKILLS_WEIGHT
    category: Decimal = CATEGORY_WEIGHT
    availability_deadline: Decimal = AVAILABILITY_DEADLINE_WEIGHT
    budget: Decimal = BUDGET_WEIGHT

    def __post_init__(self) -> None:
        if any(weight < 0 for weight in self.as_tuple()):
            raise ValueError("matching weights cannot be negative")
        if sum(self.as_tuple(), Decimal("0")) != Decimal("1.00"):
            raise ValueError("matching weights must sum to 1.00")

    def as_tuple(self) -> tuple[Decimal, Decimal, Decimal, Decimal]:
        return (self.skills, self.category, self.availability_deadline, self.budget)

    def as_dict(self) -> dict[str, str]:
        return {
            "skills": _decimal_text(self.skills),
            "category": _decimal_text(self.category),
            "availability_deadline": _decimal_text(self.availability_deadline),
            "budget": _decimal_text(self.budget),
        }


DEFAULT_WEIGHTS = MatchingWeights()


@dataclass(frozen=True)
class MatchCandidate:
    """Pure evaluation result for one agent."""

    agent_id: int
    agent_name: str
    score: Decimal
    matched_skills: tuple[str, ...]
    missing_skills: tuple[str, ...]
    breakdown: dict[str, Any]
    explanation: str
    warnings: tuple[str, ...]
    eligible: bool
    exclusion_reasons: tuple[str, ...]

    def as_dict(self) -> dict[str, Any]:
        """Return a JSON-ready representation used by API responses."""

        return {
            "agent_id": self.agent_id,
            "agent_name": self.agent_name,
            "score": self.score,
            "matched_skills": list(self.matched_skills),
            "missing_skills": list(self.missing_skills),
            "breakdown": self.breakdown,
            "explanation": self.explanation,
            "warnings": list(self.warnings),
            "eligible": self.eligible,
            "exclusion_reasons": list(self.exclusion_reasons),
        }


class MatchSelectionError(Exception):
    """Base error for a rejected server-side selection."""


class JobNotOpenForMatchingError(MatchSelectionError):
    """The job is not in the only state that permits selection."""


class DifferentAgentAlreadySelectedError(MatchSelectionError):
    """A different selection already exists for this job."""


class AgentNotFoundForSelectionError(MatchSelectionError):
    """The requested agent does not exist."""


class AgentIneligibleError(MatchSelectionError):
    """The requested agent failed current matching eligibility."""

    def __init__(self, reasons: Sequence[str]) -> None:
        self.reasons = tuple(reasons)
        super().__init__(" ".join(self.reasons))


class MatchRunNotFoundError(MatchSelectionError):
    """The requested audit context does not belong to this job/agent."""


def normalize_text(value: Any) -> str:
    """Normalize a comparison value using trim + Unicode case folding."""

    return str(value or "").strip().casefold()


def normalize_values(values: Sequence[Any] | None) -> tuple[str, ...]:
    """Normalize and de-duplicate ordered skill/category values."""

    normalized: list[str] = []
    seen: set[str] = set()
    for value in values or ():
        item = normalize_text(value)
        if item and item not in seen:
            normalized.append(item)
            seen.add(item)
    return tuple(normalized)


def _value(source: Any, key: str, default: Any = None) -> Any:
    if isinstance(source, Mapping):
        return source.get(key, default)
    return getattr(source, key, default)


def _decimal_text(value: Decimal) -> str:
    return format(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP), ".2f")


def _as_utc(value: datetime | None, *, fallback: datetime) -> datetime:
    selected = value or fallback
    if selected.tzinfo is None or selected.utcoffset() is None:
        return selected.replace(tzinfo=timezone.utc)
    return selected.astimezone(timezone.utc)


def _weighted_contribution(component: Decimal, weight: Decimal) -> Decimal:
    return (component * weight * Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def evaluate_candidate(
    job: Any,
    agent: Any,
    *,
    now: datetime | None = None,
    weights: MatchingWeights = DEFAULT_WEIGHTS,
) -> MatchCandidate:
    """Evaluate one job/agent pair without database or mutable global state."""

    required_skills = normalize_values(_value(job, "required_skills", ()))
    agent_skills = set(normalize_values(_value(agent, "skills", ())))
    matched_skills = tuple(skill for skill in required_skills if skill in agent_skills)
    missing_skills = tuple(skill for skill in required_skills if skill not in agent_skills)
    warnings: list[str] = [BUDGET_UNKNOWN_WARNING]

    if required_skills:
        skills_score = Decimal(len(matched_skills)) / Decimal(len(required_skills))
        skills_state = "matched" if not missing_skills else "partially_matched"
    else:
        skills_score = NEUTRAL_SCORE
        skills_state = "unknown"
        warnings.append(NO_REQUIRED_SKILLS_WARNING)

    job_category = normalize_text(_value(job, "task_category", ""))
    agent_categories = set(normalize_values(_value(agent, "task_categories", ())))
    category_matched = bool(job_category and job_category in agent_categories)
    category_score = Decimal("1") if category_matched else Decimal("0")
    category_state = "matched" if category_matched else "not_matched"

    availability = normalize_text(_value(agent, "availability", ""))
    availability_score = Decimal("1") if availability == "available" else Decimal("0")
    availability_state = "available" if availability == "available" else (availability or "unknown")

    current_time = _as_utc(now, fallback=datetime.now(timezone.utc))
    deadline = _value(job, "deadline")
    completion_minutes = _value(agent, "estimated_completion_minutes")
    completion_is_known = isinstance(completion_minutes, int) and not isinstance(completion_minutes, bool) and completion_minutes >= 0
    if deadline is None or not completion_is_known:
        deadline_score = NEUTRAL_SCORE
        deadline_state = "unknown"
        remaining_minutes: int | None = None
        if not completion_is_known:
            warnings.append(UNKNOWN_DEADLINE_WARNING)
    else:
        normalized_deadline = _as_utc(deadline, fallback=current_time)
        remaining = normalized_deadline - current_time
        remaining_minutes = remaining // timedelta(minutes=1)
        deadline_compatible = timedelta(minutes=completion_minutes) <= remaining
        deadline_score = Decimal("1") if deadline_compatible else Decimal("0")
        deadline_state = "compatible" if deadline_compatible else "incompatible"
        if not deadline_compatible:
            warnings.append(
                "Known completion estimate exceeds the remaining time to the job deadline."
            )

    availability_deadline_score = (availability_score + deadline_score) / Decimal("2")
    budget_score = NEUTRAL_SCORE

    score = (
        skills_score * weights.skills
        + category_score * weights.category
        + availability_deadline_score * weights.availability_deadline
        + budget_score * weights.budget
    ) * Decimal("100")
    score = min(MAX_SCORE, max(Decimal("0"), score)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    exclusion_reasons: list[str] = []
    status = normalize_text(_value(agent, "status", ""))
    if status != "active":
        exclusion_reasons.append(f"agent is not active (status={status or 'unknown'}).")
    if availability != "available":
        exclusion_reasons.append(f"agent is not available (availability={availability or 'unknown'}).")
    if missing_skills:
        exclusion_reasons.append("missing required skills: " + ", ".join(missing_skills) + ".")
    if deadline_state == "incompatible":
        exclusion_reasons.append(
            "known estimated completion exceeds the remaining time to the job deadline."
        )
    eligible = not exclusion_reasons

    breakdown = {
        "weights": weights.as_dict(),
        "skills": {
            "score": _decimal_text(skills_score),
            "weight": _decimal_text(weights.skills),
            "contribution": _decimal_text(_weighted_contribution(skills_score, weights.skills)),
            "state": skills_state,
        },
        "category": {
            "score": _decimal_text(category_score),
            "weight": _decimal_text(weights.category),
            "contribution": _decimal_text(_weighted_contribution(category_score, weights.category)),
            "state": category_state,
            "job_category": job_category,
        },
        "availability_deadline": {
            "score": _decimal_text(availability_deadline_score),
            "weight": _decimal_text(weights.availability_deadline),
            "contribution": _decimal_text(
                _weighted_contribution(availability_deadline_score, weights.availability_deadline)
            ),
            "availability": {
                "score": _decimal_text(availability_score),
                "state": availability_state,
            },
            "deadline": {
                "score": _decimal_text(deadline_score),
                "state": deadline_state,
                "estimated_completion_minutes": completion_minutes if completion_is_known else None,
                "remaining_minutes": remaining_minutes,
            },
        },
        "budget": {
            "score": _decimal_text(budget_score),
            "weight": _decimal_text(weights.budget),
            "contribution": _decimal_text(_weighted_contribution(budget_score, weights.budget)),
            "state": "unknown",
            "reason": "No reliable agent price data is available.",
        },
        "eligibility": {
            "eligible": eligible,
            "reasons": list(exclusion_reasons),
        },
    }

    category_explanation = "category matched exactly" if category_matched else "category did not match exactly"
    explanation_parts = [
        f"Matched {len(matched_skills)} of {len(required_skills)} required skills",
        category_explanation,
        f"availability is {availability_state}",
        f"deadline is {deadline_state}",
        "budget is unknown and contributes a neutral 5 points",
    ]
    if eligible:
        explanation = "Eligible: " + "; ".join(explanation_parts) + "."
    else:
        explanation = "Excluded: " + " ".join(exclusion_reasons) + " " + "; ".join(explanation_parts) + "."

    return MatchCandidate(
        agent_id=int(_value(agent, "id", 0)),
        agent_name=str(_value(agent, "name", "")),
        score=score,
        matched_skills=matched_skills,
        missing_skills=missing_skills,
        breakdown=breakdown,
        explanation=explanation,
        warnings=tuple(dict.fromkeys(warnings)),
        eligible=eligible,
        exclusion_reasons=tuple(exclusion_reasons),
    )


def rank_candidates(
    job: Any,
    agents: Sequence[Any],
    *,
    now: datetime | None = None,
    weights: MatchingWeights = DEFAULT_WEIGHTS,
) -> tuple[MatchCandidate, ...]:
    """Evaluate and deterministically rank all agents for a job."""

    candidates = [evaluate_candidate(job, agent, now=now, weights=weights) for agent in agents]
    return tuple(
        sorted(
            candidates,
            key=lambda candidate: (
                -candidate.score,
                candidate.agent_id,
                normalize_text(candidate.agent_name),
                candidate.agent_name,
            ),
        )
    )


def _new_run_id() -> str:
    return f"match-{uuid4().hex}"


def persist_match_results(
    db: Session,
    *,
    job_id: int,
    candidates: Sequence[MatchCandidate],
    run_id: str | None = None,
    computed_at: datetime | None = None,
) -> tuple[str, datetime]:
    """Persist every evaluated agent in one matching run without committing."""

    selected_run_id = run_id or _new_run_id()
    timestamp = computed_at or utc_now()
    db.add_all(
        [
            MatchResult(
                job_id=job_id,
                agent_id=candidate.agent_id,
                run_id=selected_run_id,
                scoring_version=SCORING_VERSION,
                score=candidate.score,
                matched_skills=list(candidate.matched_skills),
                missing_skills=list(candidate.missing_skills),
                breakdown=candidate.breakdown,
                explanation=candidate.explanation,
                warnings=list(candidate.warnings),
                eligible=candidate.eligible,
                computed_at=timestamp,
            )
            for candidate in candidates
        ]
    )
    return selected_run_id, timestamp


def compute_and_persist_matches(
    db: Session,
    job: Job,
    *,
    now: datetime | None = None,
    weights: MatchingWeights = DEFAULT_WEIGHTS,
) -> tuple[str, datetime, tuple[MatchCandidate, ...]]:
    """Compute one run for all agents and commit its MatchResult rows."""

    if not is_open_for_matching(job.status):
        raise JobNotOpenForMatchingError(
            f"job state {job.status!r} does not permit matching; only 'open' jobs are eligible."
        )
    computed_at = now or utc_now()
    agents = list(db.scalars(select(Agent).order_by(Agent.id.asc(), Agent.name.asc())).all())
    candidates = rank_candidates(job, agents, now=computed_at, weights=weights)
    run_id, timestamp = persist_match_results(
        db,
        job_id=job.id,
        candidates=candidates,
        computed_at=computed_at,
    )
    db.commit()
    return run_id, timestamp, candidates


def select_agent_after_revalidation(
    db: Session,
    *,
    job_id: int,
    agent_id: int,
    requested_run_id: str | None = None,
) -> tuple[Job, MatchCandidate, str, bool]:
    """Re-evaluate and select an eligible agent in one database transaction.

    The returned boolean indicates whether a new audit event was recorded.  A
    repeated request for the same still-open selection returns idempotently and
    does not create another event.
    """

    job = db.scalar(select(Job).where(Job.id == job_id).with_for_update())
    if job is None:
        raise LookupError("job not found")
    if not is_open_for_matching(job.status):
        raise JobNotOpenForMatchingError(
            f"job state {job.status!r} does not permit agent selection; only 'open' jobs are eligible."
        )
    if job.selected_agent_id is not None:
        if job.selected_agent_id == agent_id:
            existing_agent = db.get(Agent, job.selected_agent_id)
            if existing_agent is None:
                raise AgentNotFoundForSelectionError("selected agent not found")
            existing_candidate = evaluate_candidate(job, existing_agent, now=utc_now())
            if not existing_candidate.eligible:
                raise AgentIneligibleError(existing_candidate.exclusion_reasons)
            if requested_run_id is not None:
                persisted_context = db.scalar(
                    select(MatchResult.id).where(
                        MatchResult.job_id == job.id,
                        MatchResult.agent_id == existing_agent.id,
                        MatchResult.run_id == requested_run_id,
                    )
                )
                if persisted_context is None:
                    raise MatchRunNotFoundError("matching run was not found for this job and agent")
                run_id = requested_run_id
            else:
                run_id = job.selected_match_run_id
                if run_id is None:
                    latest = latest_persisted_run(db, job.id)
                    if latest is not None:
                        run_id = latest[0]
                    else:
                        computed_at = utc_now()
                        agents = list(
                            db.scalars(select(Agent).order_by(Agent.id.asc(), Agent.name.asc())).all()
                        )
                        candidates = rank_candidates(job, agents, now=computed_at)
                        run_id, _ = persist_match_results(
                            db,
                            job_id=job.id,
                            candidates=candidates,
                            computed_at=computed_at,
                        )

            if job.selected_match_run_id is None:
                job.selected_match_run_id = run_id
                job.selected_matching_score = existing_candidate.score
                job.selected_scoring_version = SCORING_VERSION
                record_event(
                    db,
                    "job.agent_selected",
                    job_id=job.id,
                    actor_agent_id=job.requester_agent_id,
                    description="job.agent_selected",
                    data={
                        "agent_id": existing_agent.id,
                        "score": _decimal_text(existing_candidate.score),
                        "run_id": run_id,
                        "scoring_version": SCORING_VERSION,
                    },
                )
                db.flush()
                db.commit()
                db.refresh(job)
                return job, existing_candidate, run_id, True
            return job, existing_candidate, job.selected_match_run_id, False
        raise DifferentAgentAlreadySelectedError("a different agent is already selected for this job")

    agent = db.get(Agent, agent_id)
    if agent is None:
        raise AgentNotFoundForSelectionError("agent not found")

    computed_at = utc_now()
    agents = list(db.scalars(select(Agent).order_by(Agent.id.asc(), Agent.name.asc())).all())
    candidates = rank_candidates(job, agents, now=computed_at)
    candidate_by_id = {candidate.agent_id: candidate for candidate in candidates}
    candidate = candidate_by_id[agent_id]
    if not candidate.eligible:
        raise AgentIneligibleError(candidate.exclusion_reasons)

    if requested_run_id is not None:
        persisted_context = db.scalar(
            select(MatchResult.id).where(
                MatchResult.job_id == job.id,
                MatchResult.agent_id == agent.id,
                MatchResult.run_id == requested_run_id,
            )
        )
        if persisted_context is None:
            raise MatchRunNotFoundError("matching run was not found for this job and agent")
        run_id = requested_run_id
    else:
        latest = latest_persisted_run(db, job.id)
        if latest is None:
            run_id, _ = persist_match_results(
                db,
                job_id=job.id,
                candidates=candidates,
                computed_at=computed_at,
            )
        else:
            run_id = latest[0]

    job.selected_agent_id = agent.id
    job.selected_match_run_id = run_id
    job.selected_matching_score = candidate.score
    job.selected_scoring_version = SCORING_VERSION
    record_event(
        db,
        "job.agent_selected",
        job_id=job.id,
        actor_agent_id=job.requester_agent_id,
        description="job.agent_selected",
        data={
            "agent_id": agent.id,
            "score": _decimal_text(candidate.score),
            "run_id": run_id,
            "scoring_version": SCORING_VERSION,
        },
    )
    db.flush()
    db.commit()
    db.refresh(job)
    return job, candidate, run_id, True


def latest_persisted_run(
    db: Session,
    job_id: int,
) -> tuple[str, str, datetime, list[MatchResult]] | None:
    """Load the newest complete-enough run for a job."""

    newest = db.scalar(
        select(MatchResult)
        .where(MatchResult.job_id == job_id)
        .order_by(MatchResult.computed_at.desc(), MatchResult.id.desc())
        .limit(1)
    )
    if newest is None:
        return None
    rows = list(
        db.scalars(
            select(MatchResult)
            .where(MatchResult.job_id == job_id, MatchResult.run_id == newest.run_id)
            .order_by(MatchResult.id.asc())
        ).all()
    )
    return newest.run_id, newest.scoring_version, newest.computed_at, rows


def candidate_from_result(result: MatchResult) -> MatchCandidate:
    """Convert a persisted row back into the public candidate shape."""

    eligibility = result.breakdown.get("eligibility", {}) if isinstance(result.breakdown, dict) else {}
    reasons = tuple(eligibility.get("reasons", []))
    return MatchCandidate(
        agent_id=result.agent_id,
        agent_name=result.agent.name,
        score=result.score,
        matched_skills=tuple(result.matched_skills),
        missing_skills=tuple(result.missing_skills),
        breakdown=result.breakdown,
        explanation=result.explanation,
        warnings=tuple(result.warnings),
        eligible=result.eligible,
        exclusion_reasons=reasons,
    )


__all__ = [
    "AVAILABILITY_DEADLINE_WEIGHT",
    "BUDGET_UNKNOWN_WARNING",
    "BUDGET_WEIGHT",
    "CATEGORY_WEIGHT",
    "DEFAULT_WEIGHTS",
    "MATCHING_ENGINE_VERSION",
    "MAX_SCORE",
    "MatchCandidate",
    "AgentIneligibleError",
    "AgentNotFoundForSelectionError",
    "DifferentAgentAlreadySelectedError",
    "JobNotOpenForMatchingError",
    "MatchRunNotFoundError",
    "MatchSelectionError",
    "MatchingWeights",
    "NO_REQUIRED_SKILLS_WARNING",
    "NEUTRAL_SCORE",
    "SCORING_VERSION",
    "SKILLS_WEIGHT",
    "candidate_from_result",
    "compute_and_persist_matches",
    "evaluate_candidate",
    "latest_persisted_run",
    "normalize_text",
    "normalize_values",
    "persist_match_results",
    "rank_candidates",
    "select_agent_after_revalidation",
]
