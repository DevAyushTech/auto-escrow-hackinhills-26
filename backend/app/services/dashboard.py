"""Dashboard aggregates calculated from persisted rows."""

from decimal import Decimal

from sqlalchemy import exists, func, select
from sqlalchemy.orm import Session

from app.demo_sessions import scope_job_query
from app.models import Dispute, Escrow, Job, Submission, Verification

MONEY_ZERO = Decimal("0.00")


def _count(db: Session, model, *conditions) -> int:
    query = select(func.count()).select_from(model).where(*conditions)
    if model is Job:
        query = scope_job_query(db, query)
    elif model is Dispute:
        query = scope_job_query(db, query.join(Job, Dispute.job_id == Job.id))
    return int(db.scalar(query) or 0)


def _sum(db: Session, column, *conditions) -> Decimal:
    query = scope_job_query(
        db,
        select(func.coalesce(func.sum(column), 0))
        .select_from(Escrow)
        .join(Job, Escrow.job_id == Job.id)
        .where(*conditions),
    )
    value = db.scalar(query)
    decimal_value = value if isinstance(value, Decimal) else Decimal(str(value or 0))
    return decimal_value.quantize(MONEY_ZERO)


def get_metrics(db: Session) -> dict[str, int | Decimal]:
    # "Funded" is cumulative simulated money that has left the pending state;
    # "settled" is money released or refunded back out of escrow.
    funded_statuses = ("funded", "held", "released", "refunded", "disputed")
    settled_statuses = ("released", "refunded")
    return {
        "total_jobs": _count(db, Job),
        "jobs_in_progress": _count(db, Job, Job.status == "in_progress"),
        "completed_jobs": _count(db, Job, Job.status == "completed"),
        "open_disputes": _count(db, Dispute, Dispute.status.in_(("open", "under_review"))),
        "total_simulated_escrow_funded": _sum(
            db, Escrow.funded_amount, Escrow.status.in_(funded_statuses)
        ),
        "total_simulated_escrow_settled": _sum(
            db, Escrow.funded_amount, Escrow.status.in_(settled_statuses)
        ),
    }


def get_execution_metrics(db: Session) -> dict[str, object]:
    """Return workflow counts and recent persisted execution records."""

    unresolved_dispute = exists(
        select(Dispute.id).where(
            Dispute.job_id == Job.id,
            Dispute.status.in_(("open", "under_review")),
        )
    )
    eligible_settlement = scope_job_query(db, (
        select(Job.id)
        .join(Escrow, Escrow.job_id == Job.id)
        .join(Submission, Submission.job_id == Job.id)
        .join(Verification, Verification.submission_id == Submission.id)
        .where(
            Job.status == "completed",
            Escrow.status.in_(("funded", "held")),
            Verification.status == "passed",
            Verification.overall_result == "passed",
            ~unresolved_dispute,
        )
        .distinct()
        .subquery()
    ))
    recent_submissions = list(
        db.scalars(
            scope_job_query(db, select(Submission).join(Job, Submission.job_id == Job.id))
            .order_by(Submission.submitted_at.desc(), Submission.id.desc())
            .limit(5)
        ).all()
    )
    recent_verifications = list(
        db.scalars(
            scope_job_query(db, select(Verification).join(Submission, Verification.submission_id == Submission.id).join(Job, Submission.job_id == Job.id))
            .order_by(Verification.evaluated_at.desc(), Verification.id.desc())
            .limit(5)
        ).all()
    )
    return {
        "jobs_running": _count(db, Job, Job.status == "in_progress"),
        "jobs_awaiting_submission": _count(db, Job, Job.status == "in_progress"),
        "jobs_awaiting_verification": _count(db, Job, Job.status.in_(("submitted", "under_review"))),
        "jobs_eligible_for_settlement": int(db.scalar(select(func.count()).select_from(eligible_settlement)) or 0),
        "recent_submissions": recent_submissions,
        "recent_verifications": recent_verifications,
    }
