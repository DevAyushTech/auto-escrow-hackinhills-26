"""Dispute creation, review, resolution, and audit endpoints."""

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Agreement, Job, Submission
from app.schemas import (
    DisputeCreate,
    DisputeResponse,
    DisputeResolveRequest,
    DisputeReviewRequest,
    DisputeStatus,
    JobEventResponse,
    SubmissionResponse,
    VerificationResponse,
)
from app.services.disputes import (
    DisputeActorNotAllowedError,
    DisputeAuthorizationError,
    DisputeEscrowRequiredError,
    DisputeJobNotFoundError,
    DisputeNotFoundError,
    DisputeRelationshipError,
    DisputeResolutionError,
    DisputeStateConflictError,
    create_dispute,
    get_dispute,
    list_dispute_events,
    list_disputes,
    list_job_disputes,
    resolve_dispute,
    review_dispute,
)
from app.services.escrow import EscrowServiceError


router = APIRouter(tags=["disputes"])


def _dispute_error(exc: Exception) -> None:
    if isinstance(exc, (DisputeNotFoundError, DisputeJobNotFoundError)):
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if isinstance(exc, DisputeAuthorizationError):
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    if isinstance(exc, (DisputeActorNotAllowedError,)):
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    if isinstance(
        exc,
        (
            DisputeEscrowRequiredError,
            DisputeRelationshipError,
            DisputeResolutionError,
            DisputeStateConflictError,
            EscrowServiceError,
        ),
    ):
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    raise exc


def _verification_response(db: Session, verification) -> VerificationResponse | None:
    if verification is None:
        return None
    submission = db.get(Submission, verification.submission_id)
    if submission is None:
        return None
    return VerificationResponse(
        id=verification.id,
        job_id=submission.job_id,
        submission_id=verification.submission_id,
        submission_version=submission.version,
        status=verification.status,
        overall_result=verification.overall_result,
        individual_checks=verification.individual_checks or [],
        reasons=verification.reasons or [],
        evaluator_type=verification.evaluator_type,
        score=verification.score,
        feedback=verification.feedback or {},
        evaluated_at=verification.evaluated_at,
        verified_at=verification.verified_at,
    )


def _response(db: Session, dispute, *, detail: bool = False) -> DisputeResponse:
    job = db.get(Job, dispute.job_id)
    agreement = db.scalar(select(Agreement).where(Agreement.job_id == dispute.job_id))
    submission = db.get(Submission, dispute.submission_id) if dispute.submission_id else None
    verification = None
    if dispute.verification_id:
        from app.models import Verification

        verification = db.get(Verification, dispute.verification_id)
    events = []
    if detail:
        events = [JobEventResponse.model_validate(event).model_dump(mode="json") for event in list_dispute_events(db, dispute.id)]
    job_requirements = {}
    if job is not None:
        job_requirements = {
            "title": job.title,
            "description": job.description,
            "required_skills": job.required_skills,
            "task_category": job.task_category,
            "expected_output": job.expected_output,
            "acceptance_criteria": job.acceptance_criteria,
            "additional_instructions": job.additional_instructions,
        }
    resolution_aliases = {
        "release": "release",
        "released": "release",
        "release_funds": "release",
        "refund": "refund",
        "refunded": "refund",
        "refund_funds": "refund",
        "reject": "reject",
        "rejected": "reject",
    }
    normalized_resolution = resolution_aliases.get((dispute.resolution or "").strip().lower()) if dispute.resolution else None
    return DisputeResponse(
        id=dispute.id,
        job_id=dispute.job_id,
        escrow_id=dispute.escrow_id,
        raised_by_agent_id=dispute.raised_by_agent_id,
        category=dispute.category,
        status=dispute.status,
        reason=dispute.reason,
        description=dispute.description,
        evidence=dispute.evidence or {},
        submission_id=dispute.submission_id,
        verification_id=dispute.verification_id,
        previous_job_status=dispute.previous_job_status,
        previous_escrow_status=dispute.previous_escrow_status,
        resolution=normalized_resolution,
        resolution_rationale=dispute.resolution_rationale,
        resolved_by_operator=dispute.resolved_by_operator,
        created_at=dispute.created_at,
        reviewed_at=dispute.reviewed_at,
        resolved_at=dispute.resolved_at,
        updated_at=dispute.updated_at,
        agreement_terms=agreement.terms if agreement is not None else {},
        job_requirements=job_requirements,
        submission=SubmissionResponse.model_validate(submission) if detail and submission is not None else None,
        verification=_verification_response(db, verification) if detail else None,
        events=events,
    )


@router.post(
    "/jobs/{job_id}/disputes",
    response_model=DisputeResponse,
    status_code=201,
    summary="Open a dispute for a funded job escrow",
)
def create_job_dispute(job_id: int, payload: DisputeCreate, db: Session = Depends(get_db)) -> DisputeResponse:
    try:
        return _response(db, create_dispute(db, job_id, payload))
    except Exception as exc:
        _dispute_error(exc)
        raise AssertionError("unreachable")


@router.get("/jobs/{job_id}/disputes", response_model=list[DisputeResponse], summary="List disputes for a job")
def get_job_disputes(
    job_id: int,
    status: DisputeStatus | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[DisputeResponse]:
    if db.get(Job, job_id) is None:
        raise HTTPException(status_code=404, detail="job not found")
    return [_response(db, dispute) for dispute in list_job_disputes(db, job_id, status)]


@router.get("/disputes", response_model=list[DisputeResponse], summary="List all disputes")
def get_dispute_registry(
    status: DisputeStatus | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[DisputeResponse]:
    return [_response(db, dispute) for dispute in list_disputes(db, status)]


@router.get("/disputes/{dispute_id}", response_model=DisputeResponse, summary="Get dispute details")
def get_dispute_details(dispute_id: int, db: Session = Depends(get_db)) -> DisputeResponse:
    dispute = get_dispute(db, dispute_id)
    if dispute is None:
        raise HTTPException(status_code=404, detail="dispute not found")
    return _response(db, dispute, detail=True)


@router.post("/disputes/{dispute_id}/review", response_model=DisputeResponse, summary="Start demo-operator dispute review")
def start_dispute_review(
    dispute_id: int,
    payload: DisputeReviewRequest | None = Body(default=None),
    x_demo_operator: str | None = Header(default=None, alias="X-Demo-Operator"),
    db: Session = Depends(get_db),
) -> DisputeResponse:
    try:
        return _response(db, review_dispute(db, dispute_id, x_demo_operator or "", payload), detail=True)
    except Exception as exc:
        _dispute_error(exc)
        raise AssertionError("unreachable")


@router.post("/disputes/{dispute_id}/resolve", response_model=DisputeResponse, summary="Resolve a dispute through the demo operator boundary")
def resolve_existing_dispute(
    dispute_id: int,
    payload: DisputeResolveRequest,
    x_demo_operator: str | None = Header(default=None, alias="X-Demo-Operator"),
    db: Session = Depends(get_db),
) -> DisputeResponse:
    try:
        return _response(db, resolve_dispute(db, dispute_id, x_demo_operator or "", payload), detail=True)
    except Exception as exc:
        _dispute_error(exc)
        raise AssertionError("unreachable")


@router.get("/disputes/{dispute_id}/events", response_model=list[JobEventResponse], summary="List dispute audit events")
def get_dispute_audit_events(dispute_id: int, db: Session = Depends(get_db)) -> list[JobEventResponse]:
    try:
        return list_dispute_events(db, dispute_id)
    except Exception as exc:
        _dispute_error(exc)
        raise AssertionError("unreachable")
