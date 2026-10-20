"""Audit event persistence used by workflow services and event APIs."""

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditEvent


def record_event(
    db: Session,
    event_type: str,
    *,
    job_id: int | None = None,
    actor_agent_id: int | None = None,
    description: str | None = None,
    data: dict[str, Any] | None = None,
) -> AuditEvent:
    event = AuditEvent(
        event_type=event_type,
        job_id=job_id,
        actor_agent_id=actor_agent_id,
        description=description or event_type,
        data=data or {},
    )
    db.add(event)
    return event


def list_job_events(db: Session, job_id: int) -> list[AuditEvent]:
    return list(
        db.scalars(
            select(AuditEvent)
            .where(AuditEvent.job_id == job_id)
            .order_by(AuditEvent.created_at.asc(), AuditEvent.id.asc())
        ).all()
    )
