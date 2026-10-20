"""Escrow lookup and guarded simulated payment lifecycle endpoints."""

from fastapi import APIRouter, Body, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import EscrowFundRequest, EscrowResponse, LedgerEntryResponse
from app.services.escrow import (
    AgreementNotAcceptedForFundingError,
    AgreementRequiredForFundingError,
    EscrowConflictError,
    EscrowConsistencyError,
    EscrowNotFoundError,
    EscrowStateConflictError,
    JobNotFundableError,
    JobNotFoundForEscrowError,
    RefundNotPermittedError,
    SettlementBalanceError,
    VerificationRequiredError,
    fund_escrow,
    get_escrow,
    get_job_escrow,
    get_ledger_entries,
    refund_escrow,
    release_escrow,
)
from app.services.jobs import get_job

router = APIRouter(tags=["escrow"])


def _raise_escrow_http_error(exc: Exception) -> None:
    if isinstance(exc, (EscrowNotFoundError, JobNotFoundForEscrowError)):
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if isinstance(
        exc,
        (
            AgreementRequiredForFundingError,
            AgreementNotAcceptedForFundingError,
            JobNotFundableError,
            EscrowConflictError,
            EscrowConsistencyError,
            EscrowStateConflictError,
            RefundNotPermittedError,
            SettlementBalanceError,
            VerificationRequiredError,
        ),
    ):
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    raise exc


@router.post(
    "/jobs/{job_id}/escrow/fund",
    response_model=EscrowResponse,
    status_code=201,
    summary="Fund a job escrow from its accepted agreement",
)
def fund_job_escrow(
    job_id: int,
    payload: EscrowFundRequest | None = Body(default=None),
    db: Session = Depends(get_db),
) -> EscrowResponse:
    try:
        return fund_escrow(db, job_id, payload)
    except Exception as exc:
        _raise_escrow_http_error(exc)
        raise AssertionError("unreachable")


@router.get("/escrows/{escrow_id}", response_model=EscrowResponse, summary="Get an escrow")
def get_escrow_by_id(escrow_id: int, db: Session = Depends(get_db)) -> EscrowResponse:
    escrow = get_escrow(db, escrow_id)
    if escrow is None:
        raise HTTPException(status_code=404, detail="escrow not found")
    return escrow


@router.get("/jobs/{job_id}/escrow", response_model=EscrowResponse, summary="Look up escrow for a job")
def get_escrow_for_job(job_id: int, db: Session = Depends(get_db)) -> EscrowResponse | Response:
    if get_job(db, job_id) is None:
        raise HTTPException(status_code=404, detail="job not found")
    escrow = get_job_escrow(db, job_id)
    if escrow is None:
        return Response(status_code=204)
    return escrow


@router.get(
    "/escrows/{escrow_id}/ledger",
    response_model=list[LedgerEntryResponse],
    summary="List an escrow ledger",
)
def get_escrow_ledger(escrow_id: int, db: Session = Depends(get_db)) -> list[LedgerEntryResponse]:
    if get_escrow(db, escrow_id) is None:
        raise HTTPException(status_code=404, detail="escrow not found")
    return get_ledger_entries(db, escrow_id)


@router.post(
    "/escrows/{escrow_id}/release",
    response_model=EscrowResponse,
    summary="Release a verified escrow",
)
def release_existing_escrow(escrow_id: int, db: Session = Depends(get_db)) -> EscrowResponse:
    try:
        return release_escrow(db, escrow_id)
    except Exception as exc:
        _raise_escrow_http_error(exc)
        raise AssertionError("unreachable")


@router.post(
    "/escrows/{escrow_id}/refund",
    response_model=EscrowResponse,
    summary="Refund an escrow after a resolved dispute",
)
def refund_existing_escrow(escrow_id: int, db: Session = Depends(get_db)) -> EscrowResponse:
    try:
        return refund_escrow(db, escrow_id)
    except Exception as exc:
        _raise_escrow_http_error(exc)
        raise AssertionError("unreachable")
