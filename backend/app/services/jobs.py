"""Job creation and lookup workflows."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Agent, Job
from app.schemas import JobCreate
from app.services.audit import record_event


def create_job(db: Session, payload: JobCreate) -> Job:
    job = Job(**payload.model_dump())
    db.add(job)
    db.flush()
    record_event(
        db,
        "job.created",
        job_id=job.id,
        actor_agent_id=job.requester_agent_id or job.selected_agent_id,
        data={"public_id": job.public_id, "status": job.status},
    )
    db.commit()
    db.refresh(job)
    return job


def get_job(db: Session, job_id: int) -> Job | None:
    return db.get(Job, job_id)


def list_jobs(
    db: Session,
    *,
    status: str | None = None,
    requester_agent_id: int | None = None,
    skip: int = 0,
    limit: int = 100,
) -> tuple[list[Job], int]:
    query = select(Job)
    count_query = select(func.count()).select_from(Job)
    if status:
        query = query.where(Job.status == status)
        count_query = count_query.where(Job.status == status)
    if requester_agent_id:
        query = query.where(Job.requester_agent_id == requester_agent_id)
        count_query = count_query.where(Job.requester_agent_id == requester_agent_id)
    total = db.scalar(count_query) or 0
    jobs = list(db.scalars(query.order_by(Job.created_at.desc(), Job.id.desc()).offset(skip).limit(limit)).all())
    return jobs, total


def agent_exists(db: Session, agent_id: int) -> bool:
    return db.scalar(select(Agent.id).where(Agent.id == agent_id)) is not None
