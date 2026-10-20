"""Job creation, lookup, and filtered listing workflows."""

from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.job_states import INITIAL_JOB_STATUS, validate_transition
from app.models import Agent, Job
from app.schemas import JobCreate
from app.services.audit import record_event


def transition_job(job: Job, target: str) -> Job:
    """Apply a validated job lifecycle transition in the current transaction."""

    validate_transition(job.status, target)
    job.status = target
    return job


def create_job(db: Session, payload: JobCreate) -> Job:
    # Map the public create contract explicitly. In particular, status is
    # never copied from client input and always starts at the central initial
    # state for this workflow.
    job = Job(
        title=payload.title,
        description=payload.description,
        required_skills=payload.required_skills,
        task_category=payload.task_category,
        expected_output=payload.expected_output,
        acceptance_criteria=payload.acceptance_criteria,
        budget=payload.budget,
        currency=payload.currency,
        deadline=payload.deadline,
        additional_instructions=payload.additional_instructions,
        requester_agent_id=payload.requester_agent_id,
        requirements=payload.requirements,
        status=INITIAL_JOB_STATUS,
    )
    db.add(job)
    db.flush()
    record_event(
        db,
        "job.created",
        job_id=job.id,
        actor_agent_id=job.requester_agent_id or job.selected_agent_id,
        description="job.created",
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
    task_category: str | None = None,
    min_budget: Decimal | None = None,
    max_budget: Decimal | None = None,
    search: str | None = None,
    requester_agent_id: int | None = None,
    skip: int = 0,
    limit: int = 100,
    sort: str = "newest",
) -> tuple[list[Job], int]:
    query = select(Job)
    count_query = select(func.count()).select_from(Job)
    if status:
        query = query.where(Job.status == status)
        count_query = count_query.where(Job.status == status)
    if task_category:
        query = query.where(Job.task_category == task_category)
        count_query = count_query.where(Job.task_category == task_category)
    if min_budget is not None:
        query = query.where(Job.budget >= min_budget)
        count_query = count_query.where(Job.budget >= min_budget)
    if max_budget is not None:
        query = query.where(Job.budget <= max_budget)
        count_query = count_query.where(Job.budget <= max_budget)
    if search:
        search_pattern = f"%{search}%"
        search_filter = or_(
            Job.title.ilike(search_pattern),
            Job.description.ilike(search_pattern),
            Job.task_category.ilike(search_pattern),
            Job.expected_output.ilike(search_pattern),
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)
    if requester_agent_id:
        query = query.where(Job.requester_agent_id == requester_agent_id)
        count_query = count_query.where(Job.requester_agent_id == requester_agent_id)
    total = db.scalar(count_query) or 0
    if sort == "deadline":
        ordering = (Job.deadline.asc(), Job.id.asc())
    else:
        ordering = (Job.created_at.desc(), Job.id.desc())
    jobs = list(db.scalars(query.order_by(*ordering).offset(skip).limit(limit)).all())
    return jobs, total


def agent_exists(db: Session, agent_id: int) -> bool:
    return db.scalar(select(Agent.id).where(Agent.id == agent_id)) is not None
