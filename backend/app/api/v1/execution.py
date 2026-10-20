"""Execution, submission, and deterministic verification endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Job, Submission
from app.schemas import (
    ExecutionResponse,
    SubmissionCreate,
    SubmissionResponse,
    VerificationResponse,
)
from app.services.execution import (
    ExecutionAgreementRequiredError,
    ExecutionAgentRequiredError,
    ExecutionEscrowRequiredError,
    ExecutionJobNotFoundError,
    ExecutionStateConflictError,
    get_execution,
    start_execution,
)
from app.services.submissions import (
    SubmissionAgreementRequiredError,
    SubmissionAgentMismatchError,
    SubmissionAgentRequiredError,
    SubmissionJobNotFoundError,
    SubmissionRetryLimitError,
    SubmissionStateConflictError,
    create_submission,
    list_submissions,
)
from app.services.verification import (
    VerificationAgreementRequiredError,
    VerificationJobNotFoundError,
    VerificationStateConflictError,
    VerificationSubmissionRequiredError,
    latest_verification,
    verify_latest_submission,
)


router = APIRouter(tags=["execution"])


def _execution_error(exc: Exception) -> None:
    if isinstance(exc, ExecutionJobNotFoundError):
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if isinstance(
        exc,
        (
            ExecutionAgreementRequiredError,
            ExecutionAgentRequiredError,
            ExecutionEscrowRequiredError,
            ExecutionStateConflictError,
        ),
    ):
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    raise exc


def _submission_error(exc: Exception) -> None:
    if isinstance(exc, SubmissionJobNotFoundError):
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if isinstance(
        exc,
        (
            SubmissionAgreementRequiredError,
            SubmissionAgentMismatchError,
            SubmissionAgentRequiredError,
            SubmissionRetryLimitError,
            SubmissionStateConflictError,
        ),
    ):
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    raise exc


def _verification_error(exc: Exception) -> None:
    if isinstance(exc, VerificationJobNotFoundError):
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if isinstance(
        exc,
        (
            VerificationAgreementRequiredError,
            VerificationStateConflictError,
            VerificationSubmissionRequiredError,
        ),
    ):
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    raise exc


def _verification_response(db: Session, verification) -> VerificationResponse:
    submission = db.get(Submission, verification.submission_id)
    if submission is None:
        raise HTTPException(status_code=500, detail="verification submission is missing")
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


@router.post(
    "/jobs/{job_id}/start",
    response_model=ExecutionResponse,
    summary="Start a funded local demo execution",
)
def start_job_execution(job_id: int, db: Session = Depends(get_db)) -> ExecutionResponse:
    try:
        return start_execution(db, job_id)
    except Exception as exc:
        _execution_error(exc)
        raise AssertionError("unreachable")


@router.get(
    "/jobs/{job_id}/execution",
    response_model=ExecutionResponse,
    summary="Get persisted execution state and eligibility",
)
def get_job_execution(job_id: int, db: Session = Depends(get_db)) -> ExecutionResponse:
    try:
        return get_execution(db, job_id)
    except Exception as exc:
        _execution_error(exc)
        raise AssertionError("unreachable")


@router.post(
    "/jobs/{job_id}/submit",
    response_model=SubmissionResponse,
    status_code=201,
    summary="Submit work output for a job",
)
def submit_job_output(
    job_id: int,
    payload: SubmissionCreate,
    db: Session = Depends(get_db),
) -> SubmissionResponse:
    try:
        return create_submission(db, job_id, payload)
    except Exception as exc:
        _submission_error(exc)
        raise AssertionError("unreachable")


@router.get(
    "/jobs/{job_id}/submissions",
    response_model=list[SubmissionResponse],
    summary="List immutable job submissions",
)
def get_job_submissions(job_id: int, db: Session = Depends(get_db)) -> list[SubmissionResponse]:
    if db.get(Job, job_id) is None:
        raise HTTPException(status_code=404, detail="job not found")
    return list_submissions(db, job_id)


@router.post(
    "/jobs/{job_id}/verify",
    response_model=VerificationResponse,
    summary="Deterministically verify the latest submission",
)
def verify_job_submission(job_id: int, db: Session = Depends(get_db)) -> VerificationResponse:
    try:
        verification = verify_latest_submission(db, job_id)
        return _verification_response(db, verification)
    except Exception as exc:
        _verification_error(exc)
        raise AssertionError("unreachable")


@router.get(
    "/jobs/{job_id}/verification",
    response_model=VerificationResponse,
    responses={204: {"description": "No verification exists for this job"}},
    summary="Get the latest persisted verification",
)
def get_job_verification(job_id: int, db: Session = Depends(get_db)) -> VerificationResponse | Response:
    if db.get(Job, job_id) is None:
        raise HTTPException(status_code=404, detail="job not found")
    verification = latest_verification(db, job_id)
    if verification is None:
        return Response(status_code=204)
    return _verification_response(db, verification)
