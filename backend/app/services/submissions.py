"""Persistent work-submission workflow."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.job_states import InvalidJobTransition
from app.models import Agent, Agreement, Job, Submission
from app.schemas import SubmissionCreate
from app.services.audit import record_event
from app.services.jobs import transition_job
from app.services.verification import latest_verification


class SubmissionServiceError(Exception):
    """Base class for expected submission workflow failures."""


class SubmissionJobNotFoundError(SubmissionServiceError):
    pass


class SubmissionAgreementRequiredError(SubmissionServiceError):
    pass


class SubmissionAgentRequiredError(SubmissionServiceError):
    pass


class SubmissionAgentMismatchError(SubmissionServiceError):
    pass


class SubmissionStateConflictError(SubmissionServiceError):
    pass


class SubmissionRetryLimitError(SubmissionServiceError):
    pass


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def list_submissions(db: Session, job_id: int) -> list[Submission]:
    return list(
        db.scalars(
            select(Submission)
            .where(Submission.job_id == job_id)
            .order_by(Submission.version.asc(), Submission.id.asc())
        ).all()
    )


def create_submission(db: Session, job_id: int, payload: SubmissionCreate) -> Submission:
    try:
        job = db.scalar(select(Job).where(Job.id == job_id).with_for_update())
        if job is None:
            raise SubmissionJobNotFoundError("job not found")
        agreement = db.scalar(select(Agreement).where(Agreement.job_id == job.id))
        if agreement is None or agreement.status != "accepted" or agreement.accepted_version is None:
            raise SubmissionAgreementRequiredError("accepted agreement is required before submission")
        if job.status not in {"in_progress", "under_review"}:
            raise SubmissionStateConflictError("job must be running or awaiting review before submission")
        expected_agent_id = job.executor_agent_id or job.selected_agent_id or agreement.executor_agent_id
        if expected_agent_id is None:
            raise SubmissionAgentRequiredError("a selected executor agent is required before submission")
        agent_id = payload.agent_id or expected_agent_id
        if agent_id != expected_agent_id or agent_id != agreement.executor_agent_id:
            raise SubmissionAgentMismatchError("submission agent must match the accepted executor agent")
        agent = db.get(Agent, agent_id)
        if agent is None:
            raise SubmissionAgentRequiredError("submission agent not found")

        latest_version = db.scalar(
            select(func.max(Submission.version)).where(Submission.job_id == job.id)
        ) or 0
        version = latest_version + 1
        retry = job.status == "under_review"
        if retry:
            previous_verification = latest_verification(db, job.id)
            if previous_verification is None or previous_verification.overall_result != "failed":
                raise SubmissionStateConflictError("a failed automated verification is required before retry")
            max_retries = max(0, get_settings().max_submission_retries)
            if latest_version >= max_retries + 1:
                raise SubmissionRetryLimitError(
                    f"maximum submission retries reached ({max_retries})"
                )
        elif latest_version:
            raise SubmissionStateConflictError("job already has a submission; verification is required before retry")

        try:
            transition_job(job, "submitted")
        except InvalidJobTransition as exc:
            raise SubmissionStateConflictError(str(exc)) from exc
        now = utc_now()
        submission = Submission(
            job_id=job.id,
            agent_id=agent_id,
            version=version,
            artifact_url=f"local://submission/{job.public_id}/{version}",
            content=payload.submitted_output,
            submitted_output=payload.submitted_output,
            evidence=payload.evidence,
            metadata_json={"notes": payload.notes, "executor_type": "local_demo"},
            status="pending",
            submitted_at=now,
        )
        db.add(submission)
        db.flush()
        if retry:
            record_event(
                db,
                "execution.retry_requested",
                job_id=job.id,
                actor_agent_id=agent_id,
                description="execution.retry_requested",
                data={
                    "submission_version": version,
                    "previous_submission_version": latest_version,
                    "max_submission_retries": max(0, get_settings().max_submission_retries),
                },
            )
        record_event(
            db,
            "submission.received",
            job_id=job.id,
            actor_agent_id=agent_id,
            description="submission.received",
            data={
                "submission_id": submission.id,
                "submission_version": version,
                "output_length": len(payload.submitted_output),
                "evidence_keys": sorted(payload.evidence.keys()),
                "artifact_url": submission.artifact_url,
            },
        )
        db.commit()
        db.refresh(submission)
        return submission
    except IntegrityError as exc:
        db.rollback()
        raise SubmissionStateConflictError("submission could not be saved") from exc
    except Exception:
        db.rollback()
        raise


__all__ = [
    "SubmissionAgreementRequiredError",
    "SubmissionAgentMismatchError",
    "SubmissionAgentRequiredError",
    "SubmissionJobNotFoundError",
    "SubmissionRetryLimitError",
    "SubmissionServiceError",
    "SubmissionStateConflictError",
    "create_submission",
    "list_submissions",
]
