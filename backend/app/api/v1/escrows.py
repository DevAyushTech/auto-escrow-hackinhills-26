"""Escrow lookup endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import EscrowResponse
from app.services.escrow import get_escrow, get_job_escrow
from app.services.jobs import get_job

router = APIRouter(tags=["escrow"])


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
