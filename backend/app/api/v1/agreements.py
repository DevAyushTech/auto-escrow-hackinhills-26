"""Agreement proposal and negotiation endpoints."""

from fastapi import APIRouter, Body, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import (
    AgreementActionRequest,
    AgreementCreate,
    AgreementHistoryEntry,
    AgreementResponse,
    AgreementRevisionRequest,
)
from app.services.agreements import (
    AgreementConflictError,
    AgreementNotFoundError,
    AgreementStateConflictError,
    AgreementValidationError,
    JobNotFoundForAgreementError,
    JobStateConflictError,
    SelectedAgentNotFoundError,
    SelectedAgentRequiredError,
    accept_agreement,
    cancel_agreement,
    create_agreement,
    get_agreement,
    get_job_agreement,
    list_agreement_history,
    reject_agreement,
    revise_agreement,
)
from app.services.jobs import get_job

router = APIRouter(tags=["agreements"])


def _raise_http_error(exc: Exception) -> None:
    if isinstance(exc, (AgreementNotFoundError, JobNotFoundForAgreementError)):
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if isinstance(exc, SelectedAgentNotFoundError):
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if isinstance(exc, (AgreementConflictError, AgreementStateConflictError, JobStateConflictError)):
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if isinstance(exc, SelectedAgentRequiredError):
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if isinstance(exc, AgreementValidationError):
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    raise exc


@router.post(
    "/jobs/{job_id}/agreement",
    response_model=AgreementResponse,
    status_code=201,
    summary="Create an agreement proposal",
)
def create_job_agreement(job_id: int, payload: AgreementCreate, db: Session = Depends(get_db)) -> AgreementResponse:
    try:
        return create_agreement(db, job_id, payload)
    except Exception as exc:
        _raise_http_error(exc)
        raise AssertionError("unreachable")


@router.get(
    "/jobs/{job_id}/agreement",
    response_model=AgreementResponse,
    responses={204: {"description": "No agreement exists for this job"}},
    summary="Look up the agreement for a job",
)
def get_agreement_for_job(job_id: int, db: Session = Depends(get_db)) -> AgreementResponse | Response:
    if get_job(db, job_id) is None:
        raise HTTPException(status_code=404, detail="job not found")
    agreement = get_job_agreement(db, job_id)
    if agreement is None:
        return Response(status_code=204)
    return agreement


@router.get("/agreements/{agreement_id}", response_model=AgreementResponse, summary="Get an agreement")
def get_agreement_by_id(agreement_id: int, db: Session = Depends(get_db)) -> AgreementResponse:
    agreement = get_agreement(db, agreement_id)
    if agreement is None:
        raise HTTPException(status_code=404, detail="agreement not found")
    return agreement


@router.get(
    "/agreements/{agreement_id}/history",
    response_model=list[AgreementHistoryEntry],
    summary="Get an agreement proposal history",
)
def get_agreement_history(agreement_id: int, db: Session = Depends(get_db)) -> list[AgreementHistoryEntry]:
    try:
        return list_agreement_history(db, agreement_id)
    except Exception as exc:
        _raise_http_error(exc)
        raise AssertionError("unreachable")


@router.post(
    "/agreements/{agreement_id}/revise",
    response_model=AgreementResponse,
    summary="Request or submit an agreement revision",
)
def revise_existing_agreement(
    agreement_id: int,
    payload: AgreementRevisionRequest,
    db: Session = Depends(get_db),
) -> AgreementResponse:
    try:
        return revise_agreement(db, agreement_id, payload)
    except Exception as exc:
        _raise_http_error(exc)
        raise AssertionError("unreachable")


@router.post("/agreements/{agreement_id}/accept", response_model=AgreementResponse, summary="Accept an agreement")
def accept_existing_agreement(
    agreement_id: int,
    payload: AgreementActionRequest | None = Body(default=None),
    db: Session = Depends(get_db),
) -> AgreementResponse:
    try:
        return accept_agreement(db, agreement_id, payload)
    except Exception as exc:
        _raise_http_error(exc)
        raise AssertionError("unreachable")


@router.post("/agreements/{agreement_id}/reject", response_model=AgreementResponse, summary="Reject an agreement")
def reject_existing_agreement(
    agreement_id: int,
    payload: AgreementActionRequest | None = Body(default=None),
    db: Session = Depends(get_db),
) -> AgreementResponse:
    try:
        return reject_agreement(db, agreement_id, payload)
    except Exception as exc:
        _raise_http_error(exc)
        raise AssertionError("unreachable")


@router.post("/agreements/{agreement_id}/cancel", response_model=AgreementResponse, summary="Cancel an agreement")
def cancel_existing_agreement(
    agreement_id: int,
    payload: AgreementActionRequest | None = Body(default=None),
    db: Session = Depends(get_db),
) -> AgreementResponse:
    try:
        return cancel_agreement(db, agreement_id, payload)
    except Exception as exc:
        _raise_http_error(exc)
        raise AssertionError("unreachable")
