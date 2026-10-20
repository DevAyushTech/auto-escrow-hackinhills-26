"""Backend-authoritative local demo execution state and start workflow."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.job_states import InvalidJobTransition
from app.models import Agent, Agreement, AuditEvent, Dispute, Escrow, Job, Submission, Verification
from app.schemas import ExecutionResponse
from app.services.audit import record_event
from app.services.jobs import transition_job
from app.services.verification import latest_submission, verification_for_submission


class ExecutionServiceError(Exception):
    """Base class for expected execution workflow failures."""


class ExecutionJobNotFoundError(ExecutionServiceError):
    pass


class ExecutionAgreementRequiredError(ExecutionServiceError):
    pass


class ExecutionAgentRequiredError(ExecutionServiceError):
    pass


class ExecutionEscrowRequiredError(ExecutionServiceError):
    pass


class ExecutionStateConflictError(ExecutionServiceError):
    pass


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def is_settlement_eligible(db: Session, job_id: int) -> bool:
    unresolved_dispute = exists(
        select(Dispute.id).where(
            Dispute.job_id == job_id,
            Dispute.status.in_(("open", "under_review")),
        )
    )
    return db.scalar(
        select(Job.id)
        .join(Escrow, Escrow.job_id == Job.id)
        .join(Submission, Submission.job_id == Job.id)
        .join(Verification, Verification.submission_id == Submission.id)
        .where(
            Job.id == job_id,
            Job.status == "completed",
            Escrow.status.in_(("funded", "held")),
            Verification.status == "passed",
            Verification.overall_result == "passed",
            ~unresolved_dispute,
        )
        .limit(1)
    ) is not None


def _started_at(db: Session, job_id: int) -> datetime | None:
    event = db.scalar(
        # Use a narrow query so this helper does not load the complete event
        # timeline on larger jobs.
        select(AuditEvent)
        .where(
            AuditEvent.job_id == job_id,
            AuditEvent.event_type == "execution.started",
        )
        .order_by(AuditEvent.created_at.asc())
        .limit(1)
    )
    return event.created_at if event is not None else None


def _prerequisites(
    db: Session,
    job: Job,
    agreement: Agreement | None,
    escrow: Escrow | None,
) -> tuple[bool, str, int | None]:
    if agreement is None or agreement.status != "accepted" or agreement.accepted_version is None:
        return False, "An accepted agreement is required before execution can start.", None
    selected_agent_id = job.selected_agent_id or job.executor_agent_id
    if selected_agent_id is None:
        return False, "A selected executor agent is required before execution can start.", None
    agent = db.get(Agent, selected_agent_id)
    if agent is None:
        return False, "The selected executor agent no longer exists.", selected_agent_id
    if agreement.executor_agent_id != selected_agent_id:
        return False, "The selected agent does not match the accepted agreement executor.", selected_agent_id
    if job.executor_agent_id not in (None, selected_agent_id):
        return False, "The assigned executor does not match the accepted agreement.", selected_agent_id
    if escrow is None:
        return False, "Escrow must be funded before execution can start.", selected_agent_id
    if escrow.agreement_id != agreement.id or escrow.accepted_agreement_version != agreement.accepted_version:
        return False, "Escrow is not consistent with the accepted agreement.", selected_agent_id
    if escrow.status not in {"funded", "held"} or escrow.funded_amount is None:
        return False, "Escrow must be funded before execution can start.", selected_agent_id
    return True, "The accepted agreement, selected agent, and funded escrow are ready.", selected_agent_id


def _execution_status(db: Session, job: Job, can_start: bool, latest: Submission | None, verification: Verification | None) -> str:
    if job.status == "cancelled":
        return "cancelled"
    if job.status == "disputed":
        return "disputed"
    if job.status == "completed":
        return "settlement_ready" if is_settlement_eligible(db, job.id) else "completed"
    if job.status == "assigned":
        return "ready" if can_start else "blocked"
    if job.status == "in_progress":
        return "awaiting_submission"
    if job.status == "submitted":
        return "awaiting_verification"
    if job.status == "under_review":
        if verification is not None and verification.overall_result == "failed":
            return "retry_available"
        if verification is not None and verification.overall_result == "manual_review":
            return "manual_review"
        return "awaiting_verification"
    return "blocked"


def get_execution(db: Session, job_id: int) -> ExecutionResponse:
    job = db.get(Job, job_id)
    if job is None:
        raise ExecutionJobNotFoundError("job not found")
    agreement = db.scalar(select(Agreement).where(Agreement.job_id == job.id))
    escrow = db.scalar(select(Escrow).where(Escrow.job_id == job.id))
    ready, start_reason, selected_agent_id = _prerequisites(db, job, agreement, escrow)
    latest = latest_submission(db, job.id)
    # Verification belongs to an immutable submission.  Looking up the latest
    # verification for the whole job would keep an old failed result attached
    # to a newer retry submission and incorrectly hide the verify action.
    verification = verification_for_submission(db, latest.id) if latest is not None else None
    can_start = job.status == "assigned" and ready
    can_submit = job.status == "in_progress" or (
        job.status == "under_review" and verification is not None and verification.overall_result == "failed"
    )
    can_verify = job.status == "submitted" and latest is not None and verification is None
    submit_reason = (
        "Submit a work result for the local demo execution."
        if can_submit
        else "A submission is available only while execution is awaiting a result or a failed check allows a retry."
    )
    verify_reason = (
        "The latest submission is ready for deterministic verification."
        if can_verify
        else "Verification is available after a new submission reaches the submitted state."
    )
    if job.status == "completed":
        start_reason = "Completed jobs cannot restart."
    elif job.status in {"cancelled", "disputed"}:
        start_reason = f"A {job.status} job cannot execute in the current state."
    return ExecutionResponse(
        job_id=job.id,
        job_status=job.status,
        execution_status=_execution_status(db, job, can_start, latest, verification),
        selected_agent_id=selected_agent_id,
        executor_agent_id=job.executor_agent_id,
        agreement_id=agreement.id if agreement else None,
        accepted_agreement_version=agreement.accepted_version if agreement else None,
        escrow_status=escrow.status if escrow else None,
        executor_type="local_demo",
        can_start=can_start,
        can_submit=can_submit,
        can_verify=can_verify,
        start_reason=start_reason,
        submit_reason=submit_reason,
        verify_reason=verify_reason,
        started_at=_started_at(db, job.id),
        latest_submission_version=latest.version if latest else None,
        latest_verification_result=verification.overall_result if verification else None,
    )


def start_execution(db: Session, job_id: int) -> ExecutionResponse:
    try:
        job = db.scalar(select(Job).where(Job.id == job_id).with_for_update())
        if job is None:
            raise ExecutionJobNotFoundError("job not found")
        agreement = db.scalar(select(Agreement).where(Agreement.job_id == job.id).with_for_update())
        escrow = db.scalar(select(Escrow).where(Escrow.job_id == job.id).with_for_update())
        ready, reason, selected_agent_id = _prerequisites(db, job, agreement, escrow)
        if not ready:
            if agreement is None or agreement.status != "accepted":
                raise ExecutionAgreementRequiredError(reason)
            if escrow is None or escrow.status not in {"funded", "held"}:
                raise ExecutionEscrowRequiredError(reason)
            raise ExecutionAgentRequiredError(reason)
        if job.status != "assigned":
            raise ExecutionStateConflictError(
                f"job cannot start from {job.status!r}; only an assigned funded job may start"
            )
        try:
            transition_job(job, "in_progress")
        except InvalidJobTransition as exc:
            raise ExecutionStateConflictError(str(exc)) from exc
        now = utc_now()
        record_event(
            db,
            "execution.started",
            job_id=job.id,
            actor_agent_id=selected_agent_id,
            description="execution.started",
            data={
                "executor_type": "local_demo",
                "agent_id": selected_agent_id,
                "agreement_id": agreement.id,
                "accepted_agreement_version": agreement.accepted_version,
                "escrow_id": escrow.id,
                "note": "No external agent or background process was invoked.",
            },
        )
        db.commit()
        return get_execution(db, job.id)
    except Exception:
        db.rollback()
        raise


__all__ = [
    "ExecutionAgreementRequiredError",
    "ExecutionAgentRequiredError",
    "ExecutionEscrowRequiredError",
    "ExecutionJobNotFoundError",
    "ExecutionServiceError",
    "ExecutionStateConflictError",
    "get_execution",
    "is_settlement_eligible",
    "start_execution",
]
