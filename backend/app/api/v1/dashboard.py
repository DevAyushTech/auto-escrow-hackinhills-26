"""Persisted dashboard metrics endpoint."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Submission
from app.schemas import DashboardMetrics, DashboardExecutionMetrics, VerificationResponse
from app.services.dashboard import get_execution_metrics, get_metrics

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/metrics", response_model=DashboardMetrics, summary="Get dashboard metrics")
def dashboard_metrics(db: Session = Depends(get_db)) -> DashboardMetrics:
    return DashboardMetrics(**get_metrics(db))


@router.get(
    "/execution",
    response_model=DashboardExecutionMetrics,
    summary="Get persisted execution and verification dashboard data",
)
def dashboard_execution(db: Session = Depends(get_db)) -> DashboardExecutionMetrics:
    data = get_execution_metrics(db)
    recent_verifications: list[VerificationResponse] = []
    for verification in data["recent_verifications"]:
        submission = db.get(Submission, verification.submission_id)
        if submission is None:
            continue
        recent_verifications.append(
            VerificationResponse(
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
        )
    return DashboardExecutionMetrics(
        jobs_running=data["jobs_running"],
        jobs_awaiting_submission=data["jobs_awaiting_submission"],
        jobs_awaiting_verification=data["jobs_awaiting_verification"],
        jobs_eligible_for_settlement=data["jobs_eligible_for_settlement"],
        recent_submissions=data["recent_submissions"],
        recent_verifications=recent_verifications,
    )
