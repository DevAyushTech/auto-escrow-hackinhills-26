"""Escrow lookup service.

Funding and release operations remain intentionally outside this Phase 2 API;
this service provides the persistence boundary for the existing escrow record.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Escrow


def get_escrow(db: Session, escrow_id: int) -> Escrow | None:
    return db.get(Escrow, escrow_id)


def get_job_escrow(db: Session, job_id: int) -> Escrow | None:
    return db.scalar(select(Escrow).where(Escrow.job_id == job_id))
