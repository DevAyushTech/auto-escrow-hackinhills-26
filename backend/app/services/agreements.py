"""Agreement lookup service."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Agreement


def get_agreement(db: Session, agreement_id: int) -> Agreement | None:
    return db.get(Agreement, agreement_id)


def get_job_agreement(db: Session, job_id: int) -> Agreement | None:
    return db.scalar(select(Agreement).where(Agreement.job_id == job_id))
