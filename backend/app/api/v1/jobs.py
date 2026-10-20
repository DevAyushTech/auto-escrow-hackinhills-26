"""Job API endpoints."""

from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import (
    MAX_JOB_BUDGET,
    JobCreate,
    JobEventResponse,
    JobListResponse,
    JobStatus,
    JobSummary,
)
from app.services.audit import list_job_events
from app.services.jobs import agent_exists, create_job, get_job, list_jobs

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.post("", response_model=JobSummary, status_code=201, summary="Create a job")
def create_new_job(payload: JobCreate, db: Session = Depends(get_db)) -> JobSummary:
    if payload.requester_agent_id is not None and not agent_exists(db, payload.requester_agent_id):
        raise HTTPException(status_code=404, detail="requester agent not found")
    try:
        return create_job(db, payload)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="job could not be created") from exc


@router.get("", response_model=JobListResponse, summary="List jobs")
def list_registered_jobs(
    status: JobStatus | None = Query(default=None),
    task_category: str | None = Query(default=None, min_length=1, max_length=120),
    min_budget: Decimal | None = Query(default=None, gt=Decimal("0"), le=MAX_JOB_BUDGET, max_digits=18, decimal_places=2),
    max_budget: Decimal | None = Query(default=None, gt=Decimal("0"), le=MAX_JOB_BUDGET, max_digits=18, decimal_places=2),
    search: str | None = Query(default=None, min_length=1, max_length=120),
    requester_agent_id: int | None = Query(default=None, gt=0),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=100),
    sort: Literal["newest", "deadline"] = Query(default="newest"),
    db: Session = Depends(get_db),
) -> JobListResponse:
    normalized_category = task_category.strip() if task_category is not None else None
    normalized_search = search.strip() if search is not None else None
    if task_category is not None and not normalized_category:
        raise HTTPException(status_code=422, detail="task_category must not be blank")
    if search is not None and not normalized_search:
        raise HTTPException(status_code=422, detail="search must not be blank")
    if min_budget is not None and max_budget is not None and min_budget > max_budget:
        raise HTTPException(status_code=422, detail="min_budget cannot exceed max_budget")
    jobs, total = list_jobs(
        db,
        status=status,
        task_category=normalized_category,
        min_budget=min_budget,
        max_budget=max_budget,
        search=normalized_search,
        requester_agent_id=requester_agent_id,
        skip=skip,
        limit=limit,
        sort=sort,
    )
    return JobListResponse(items=jobs, total=total)


@router.get("/{job_id}", response_model=JobSummary, summary="Get a job")
def get_registered_job(job_id: int, db: Session = Depends(get_db)) -> JobSummary:
    job = get_job(db, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return job


@router.get("/{job_id}/events", response_model=list[JobEventResponse], summary="List job audit events")
def get_job_events(job_id: int, db: Session = Depends(get_db)) -> list[JobEventResponse]:
    if get_job(db, job_id) is None:
        raise HTTPException(status_code=404, detail="job not found")
    return list_job_events(db, job_id)
