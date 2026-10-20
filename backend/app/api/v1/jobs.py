"""Job API endpoints."""

from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import (
    MAX_JOB_BUDGET,
    JobCreate,
    JobEventResponse,
    JobListResponse,
    JobSummary,
    JobStatus,
    MatchCandidateResponse,
    MatchRunResponse,
    MatchSelectionRequest,
)
from app.services.audit import list_job_events
from app.services.jobs import agent_exists, create_job, get_job, list_jobs
from app.services.matching import (
    AgentIneligibleError,
    AgentNotFoundForSelectionError,
    DifferentAgentAlreadySelectedError,
    JobNotOpenForMatchingError,
    MatchRunNotFoundError,
    SCORING_VERSION,
    candidate_from_result,
    compute_and_persist_matches,
    latest_persisted_run,
    select_agent_after_revalidation,
)

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


def _match_run_response(
    *,
    job_id: int,
    run_id: str,
    scoring_version: str,
    computed_at,
    candidates,
) -> MatchRunResponse:
    eligible = [candidate for candidate in candidates if candidate.eligible]
    excluded = [candidate for candidate in candidates if not candidate.eligible]
    return MatchRunResponse(
        job_id=job_id,
        run_id=run_id,
        scoring_version=scoring_version,
        computed_at=computed_at,
        candidates=[MatchCandidateResponse.model_validate(candidate.as_dict()) for candidate in eligible],
        excluded_agents=[MatchCandidateResponse.model_validate(candidate.as_dict()) for candidate in excluded],
    )


@router.post("/{job_id}/matches", response_model=MatchRunResponse, status_code=201, summary="Compute agent matches")
def compute_job_matches(job_id: int, db: Session = Depends(get_db)) -> MatchRunResponse:
    job = get_job(db, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    try:
        run_id, computed_at, candidates = compute_and_persist_matches(db, job)
    except JobNotOpenForMatchingError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return _match_run_response(
        job_id=job.id,
        run_id=run_id,
        scoring_version=SCORING_VERSION,
        computed_at=computed_at,
        candidates=candidates,
    )


@router.get(
    "/{job_id}/matches",
    response_model=MatchRunResponse,
    responses={204: {"description": "No persisted matching run exists for this job"}},
    summary="Get the latest persisted agent matches",
)
def get_latest_job_matches(job_id: int, db: Session = Depends(get_db)) -> MatchRunResponse | Response:
    if get_job(db, job_id) is None:
        raise HTTPException(status_code=404, detail="job not found")
    latest = latest_persisted_run(db, job_id)
    if latest is None:
        return Response(status_code=204)
    run_id, scoring_version, computed_at, rows = latest
    candidates = [candidate_from_result(row) for row in rows]
    return _match_run_response(
        job_id=job_id,
        run_id=run_id,
        scoring_version=scoring_version,
        computed_at=computed_at,
        candidates=candidates,
    )


@router.post("/{job_id}/matches/{agent_id}/select", response_model=JobSummary, summary="Select an eligible agent")
def select_job_agent(
    job_id: int,
    agent_id: int,
    payload: MatchSelectionRequest | None = Body(default=None),
    db: Session = Depends(get_db),
) -> JobSummary:
    if get_job(db, job_id) is None:
        raise HTTPException(status_code=404, detail="job not found")
    try:
        job, _candidate, _run_id, _created_event = select_agent_after_revalidation(
            db,
            job_id=job_id,
            agent_id=agent_id,
            requested_run_id=payload.run_id if payload else None,
        )
    except JobNotOpenForMatchingError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except DifferentAgentAlreadySelectedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except AgentNotFoundForSelectionError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except MatchRunNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except AgentIneligibleError as exc:
        raise HTTPException(
            status_code=409,
            detail={"message": "agent is not eligible for this job", "reasons": list(exc.reasons)},
        ) from exc
    return job


@router.get("/{job_id}/events", response_model=list[JobEventResponse], summary="List job audit events")
def get_job_events(job_id: int, db: Session = Depends(get_db)) -> list[JobEventResponse]:
    if get_job(db, job_id) is None:
        raise HTTPException(status_code=404, detail="job not found")
    return list_job_events(db, job_id)
