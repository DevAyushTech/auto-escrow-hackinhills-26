"""Transactional dispute creation, review, and demo-operator resolution."""

from __future__ import annotations

from datetime import datetime, timezone
import json

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.dispute_states import (
    DISPUTE_RESOLUTIONS,
    InvalidDisputeTransition,
    transition_dispute,
)
from app.escrow_states import InvalidEscrowTransition, transition_escrow
from app.job_states import InvalidJobTransition
from app.models import Agent, AuditEvent, Dispute, Escrow, Job, Submission, Verification
from app.schemas import DisputeCreate, DisputeResolveRequest, DisputeReviewRequest
from app.services.audit import record_event
from app.services.escrow import refund_escrow, release_escrow
from app.services.jobs import transition_job
from app.services.verification import latest_submission, latest_verification


DISPUTABLE_JOB_STATES = frozenset({"assigned", "in_progress", "submitted", "under_review", "completed"})
DISPUTABLE_ESCROW_STATES = frozenset({"funded", "held"})
MAX_OPERATOR_IDENTIFIER_LENGTH = 120


class DisputeServiceError(Exception):
    """Base class for expected dispute workflow failures."""


class DisputeNotFoundError(DisputeServiceError):
    pass


class DisputeJobNotFoundError(DisputeServiceError):
    pass


class DisputeEscrowRequiredError(DisputeServiceError):
    pass


class DisputeRelationshipError(DisputeServiceError):
    pass


class DisputeActorNotAllowedError(DisputeServiceError):
    pass


class DisputeStateConflictError(DisputeServiceError):
    pass


class DisputeAuthorizationError(DisputeServiceError):
    pass


class DisputeResolutionError(DisputeServiceError):
    pass


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _safe_json_bytes(value: dict) -> int:
    return len(json.dumps(value, separators=(",", ":"), ensure_ascii=True).encode("utf-8"))


def require_demo_operator(operator_identifier: str | None) -> str:
    """Require the explicit development/test operator boundary.

    This is intentionally not authentication. It is a narrow local-demo guard
    so a public production request cannot resolve disputes by default.
    """

    settings = get_settings()
    operator = (operator_identifier or "").strip()
    if settings.app_env.lower() not in {"development", "test"}:
        raise DisputeAuthorizationError("demo dispute resolution is disabled outside development and test environments")
    if not operator or len(operator) > MAX_OPERATOR_IDENTIFIER_LENGTH:
        raise DisputeAuthorizationError("a valid demo operator identifier is required")
    if operator != settings.demo_resolution_operator:
        raise DisputeAuthorizationError("demo operator is not authorized")
    return operator


def get_dispute(db: Session, dispute_id: int) -> Dispute | None:
    return db.get(Dispute, dispute_id)


def list_job_disputes(db: Session, job_id: int, status: str | None = None) -> list[Dispute]:
    query = select(Dispute).where(Dispute.job_id == job_id)
    if status:
        query = query.where(Dispute.status == status)
    return list(db.scalars(query.order_by(Dispute.created_at.desc(), Dispute.id.desc())).all())


def list_disputes(db: Session, status: str | None = None) -> list[Dispute]:
    query = select(Dispute)
    if status:
        query = query.where(Dispute.status == status)
    return list(db.scalars(query.order_by(Dispute.created_at.desc(), Dispute.id.desc())).all())


def list_dispute_events(db: Session, dispute_id: int):
    dispute = db.get(Dispute, dispute_id)
    if dispute is None:
        raise DisputeNotFoundError("dispute not found")
    events = []
    for event in db.scalars(
        select(AuditEvent)
        .where(AuditEvent.job_id == dispute.job_id)
        .order_by(AuditEvent.created_at.asc(), AuditEvent.id.asc())
    ).all():
        data = event.data if isinstance(event.data, dict) else {}
        if data.get("dispute_id") == dispute_id:
            events.append(event)
    return events


def _active_dispute(db: Session, job_id: int, escrow_id: int) -> Dispute | None:
    return db.scalar(
        select(Dispute)
        .where(
            Dispute.job_id == job_id,
            Dispute.escrow_id == escrow_id,
            Dispute.status.in_(("open", "under_review")),
        )
        .with_for_update()
    )


def create_dispute(db: Session, job_id: int, payload: DisputeCreate) -> Dispute:
    try:
        job = db.scalar(select(Job).where(Job.id == job_id).with_for_update())
        if job is None:
            raise DisputeJobNotFoundError("job not found")
        escrow = db.scalar(select(Escrow).where(Escrow.job_id == job.id).with_for_update())
        if escrow is None:
            raise DisputeEscrowRequiredError("an existing escrow is required before opening a dispute")
        if payload.escrow_id != escrow.id:
            raise DisputeRelationshipError("escrow does not belong to this job")
        if escrow.job_id != job.id:
            raise DisputeRelationshipError("escrow does not belong to this job")
        if job.status not in DISPUTABLE_JOB_STATES:
            raise DisputeStateConflictError(f"job cannot be disputed from {job.status!r}")
        if escrow.status not in DISPUTABLE_ESCROW_STATES:
            raise DisputeStateConflictError(f"escrow cannot be disputed from {escrow.status!r}")
        if _active_dispute(db, job.id, escrow.id) is not None:
            raise DisputeStateConflictError("an unresolved dispute already exists for this job and escrow")
        actor = db.get(Agent, payload.raised_by_agent_id)
        if actor is None:
            raise DisputeActorNotAllowedError("dispute actor agent not found")
        related_agents = {job.requester_agent_id, job.selected_agent_id, job.executor_agent_id}
        if actor.id not in related_agents:
            raise DisputeActorNotAllowedError("dispute actor must be related to the job")
        if _safe_json_bytes(payload.evidence) > 64000:
            raise DisputeStateConflictError("dispute evidence is too large")

        submission = latest_submission(db, job.id)
        verification = latest_verification(db, job.id)
        previous_job_status = job.status
        previous_escrow_status = escrow.status
        try:
            transition_job(job, "disputed")
            transition_escrow(escrow, "disputed")
        except (InvalidJobTransition, InvalidEscrowTransition) as exc:
            raise DisputeStateConflictError(str(exc)) from exc
        dispute = Dispute(
            job_id=job.id,
            escrow_id=escrow.id,
            raised_by_agent_id=actor.id,
            category=payload.category,
            reason=payload.reason,
            description=payload.description,
            evidence=payload.evidence,
            submission_id=submission.id if submission else None,
            verification_id=verification.id if verification else None,
            previous_job_status=previous_job_status,
            previous_escrow_status=previous_escrow_status,
            status="open",
        )
        db.add(dispute)
        db.flush()
        common_data = {
            "dispute_id": dispute.id,
            "escrow_id": escrow.id,
            "category": dispute.category,
            "submission_id": dispute.submission_id,
            "verification_id": dispute.verification_id,
            "evidence_keys": sorted(payload.evidence.keys()),
        }
        record_event(
            db,
            "dispute.created",
            job_id=job.id,
            actor_agent_id=actor.id,
            description="dispute.created",
            data=common_data,
        )
        record_event(
            db,
            "job.disputed",
            job_id=job.id,
            actor_agent_id=actor.id,
            description="job.disputed",
            data={**common_data, "from_status": previous_job_status, "to_status": job.status},
        )
        record_event(
            db,
            "escrow.disputed",
            job_id=job.id,
            actor_agent_id=actor.id,
            description="escrow.disputed",
            data={**common_data, "from_status": previous_escrow_status, "to_status": escrow.status},
        )
        db.commit()
        db.refresh(dispute)
        return dispute
    except IntegrityError as exc:
        db.rollback()
        raise DisputeStateConflictError("dispute could not be saved") from exc
    except Exception:
        db.rollback()
        raise


def review_dispute(db: Session, dispute_id: int, operator_identifier: str, payload: DisputeReviewRequest | None = None) -> Dispute:
    operator = require_demo_operator(operator_identifier)
    try:
        dispute = db.scalar(select(Dispute).where(Dispute.id == dispute_id).with_for_update())
        if dispute is None:
            raise DisputeNotFoundError("dispute not found")
        try:
            transition_dispute(dispute, "under_review")
        except InvalidDisputeTransition as exc:
            raise DisputeStateConflictError(str(exc)) from exc
        dispute.reviewed_at = utc_now()
        record_event(
            db,
            "dispute.review_started",
            job_id=dispute.job_id,
            description="dispute.review_started",
            data={"dispute_id": dispute.id, "operator": operator, "rationale": payload.rationale if payload else None},
        )
        db.commit()
        db.refresh(dispute)
        return dispute
    except Exception:
        db.rollback()
        raise


def _restore_after_rejection(db: Session, dispute: Dispute, job: Job, escrow: Escrow) -> None:
    target_job_status = dispute.previous_job_status or "under_review"
    if target_job_status not in {"assigned", "in_progress", "submitted", "under_review", "completed"}:
        target_job_status = "under_review"
    try:
        transition_job(job, target_job_status)
        target_escrow_status = dispute.previous_escrow_status or "funded"
        transition_escrow(escrow, target_escrow_status, has_valid_resolution=True)
    except (InvalidJobTransition, InvalidEscrowTransition) as exc:
        raise DisputeStateConflictError(f"dispute cannot be rejected and restored: {exc}") from exc


def resolve_dispute(
    db: Session,
    dispute_id: int,
    operator_identifier: str,
    payload: DisputeResolveRequest,
) -> Dispute:
    operator = require_demo_operator(operator_identifier)
    if payload.resolution not in DISPUTE_RESOLUTIONS:
        raise DisputeResolutionError("invalid dispute resolution outcome")
    try:
        dispute = db.scalar(select(Dispute).where(Dispute.id == dispute_id).with_for_update())
        if dispute is None:
            raise DisputeNotFoundError("dispute not found")
        if dispute.escrow_id is None:
            raise DisputeEscrowRequiredError("dispute has no escrow to resolve")
        job = db.scalar(select(Job).where(Job.id == dispute.job_id).with_for_update())
        escrow = db.scalar(select(Escrow).where(Escrow.id == dispute.escrow_id).with_for_update())
        if job is None or escrow is None:
            raise DisputeRelationshipError("dispute job or escrow no longer exists")
        if escrow.job_id != job.id or dispute.job_id != escrow.job_id:
            raise DisputeRelationshipError("dispute job and escrow relationship is invalid")
        try:
            transition_dispute(dispute, "rejected" if payload.resolution == "reject" else "resolved")
        except InvalidDisputeTransition as exc:
            raise DisputeStateConflictError(str(exc)) from exc
        now = utc_now()
        dispute.resolution = payload.resolution
        dispute.resolution_rationale = payload.rationale
        dispute.resolved_by_operator = operator
        dispute.resolved_at = now
        record_event(
            db,
            "dispute.resolution_authorized",
            job_id=job.id,
            description="dispute.resolution_authorized",
            data={
                "dispute_id": dispute.id,
                "operator": operator,
                "resolution": payload.resolution,
                "rationale_length": len(payload.rationale),
            },
        )
        if payload.resolution == "reject":
            _restore_after_rejection(db, dispute, job, escrow)
            record_event(
                db,
                "dispute.rejected",
                job_id=job.id,
                description="dispute.rejected",
                data={
                    "dispute_id": dispute.id,
                    "restored_job_status": job.status,
                    "restored_escrow_status": escrow.status,
                },
            )
        elif payload.resolution == "release":
            try:
                transition_job(job, "completed")
            except InvalidJobTransition as exc:
                raise DisputeStateConflictError(str(exc)) from exc
            db.flush()
            release_escrow(db, escrow.id, commit=False, rollback_on_error=False)
            record_event(
                db,
                "dispute.escrow_released",
                job_id=job.id,
                description="dispute.escrow_released",
                data={"dispute_id": dispute.id, "escrow_id": escrow.id},
            )
        elif payload.resolution == "refund":
            try:
                transition_job(job, "cancelled")
            except InvalidJobTransition as exc:
                raise DisputeStateConflictError(str(exc)) from exc
            db.flush()
            refund_escrow(db, escrow.id, commit=False, rollback_on_error=False)
            record_event(
                db,
                "dispute.escrow_refunded",
                job_id=job.id,
                description="dispute.escrow_refunded",
                data={"dispute_id": dispute.id, "escrow_id": escrow.id},
            )
        record_event(
            db,
            "dispute.resolved" if payload.resolution != "reject" else "dispute.closed",
            job_id=job.id,
            description="dispute.resolved" if payload.resolution != "reject" else "dispute.closed",
            data={
                "dispute_id": dispute.id,
                "resolution": payload.resolution,
                "operator": operator,
                "job_status": job.status,
                "escrow_status": escrow.status,
            },
        )
        db.commit()
        db.refresh(dispute)
        return dispute
    except Exception:
        db.rollback()
        raise


__all__ = [
    "DisputeActorNotAllowedError",
    "DisputeAuthorizationError",
    "DisputeEscrowRequiredError",
    "DisputeJobNotFoundError",
    "DisputeNotFoundError",
    "DisputeRelationshipError",
    "DisputeResolutionError",
    "DisputeServiceError",
    "DisputeStateConflictError",
    "create_dispute",
    "get_dispute",
    "list_dispute_events",
    "list_disputes",
    "list_job_disputes",
    "require_demo_operator",
    "resolve_dispute",
    "review_dispute",
]
