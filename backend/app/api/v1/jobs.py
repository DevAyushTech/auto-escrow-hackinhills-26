"""Job API endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import JobCreate, JobEventResponse, JobListResponse, JobStatus, JobSummary
from app.services.audit import list_job_events
from app.services.jobs import agent_exists, create_job, get_job, list_jobs

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.post("", response_model=JobSummary, status_code=201, summary="Create a job")
def create_new_job(payload: JobCreate, db: Session = Depends(get_db)) -> JobSummary:
    if payload.requester_agent_id is not None and not agent_exists(db, payload.requester_agent_id):
        raise HTTPException(status_code=404, detail="requester agent not found")
    if payload.executor_agent_id is not None and not agent_exists(db, payload.executor_agent_id):
        raise HTTPException(status_code=404, detail="executor agent not found")
    if payload.selected_agent_id is not None and not agent_exists(db, payload.selected_agent_id):
        raise HTTPException(status_code=404, detail="selected agent not found")
    try:
        return create_job(db, payload)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="job could not be created") from exc


@router.get("", response_model=JobListResponse, summary="List jobs")
def list_registered_jobs(
    status: JobStatus | None = Query(default=None),
    requester_agent_id: int | None = Query(default=None, gt=0),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=100),
    db: Session = Depends(get_db),
) -> JobListResponse:
    jobs, total = list_jobs(
        db,
        status=status,
        requester_agent_id=requester_agent_id,
        skip=skip,
        limit=limit,
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
