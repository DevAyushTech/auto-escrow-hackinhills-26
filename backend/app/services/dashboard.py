"""Dashboard aggregates calculated from persisted rows."""

from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Dispute, Escrow, Job

MONEY_ZERO = Decimal("0.00")


def _count(db: Session, model, *conditions) -> int:
    return int(db.scalar(select(func.count()).select_from(model).where(*conditions)) or 0)


def _sum(db: Session, column, *conditions) -> Decimal:
    value = db.scalar(select(func.coalesce(func.sum(column), 0)).where(*conditions))
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
