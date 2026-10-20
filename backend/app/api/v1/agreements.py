"""Agreement lookup endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import AgreementResponse
from app.services.agreements import get_agreement, get_job_agreement
from app.services.jobs import get_job

router = APIRouter(tags=["agreements"])


@router.get("/agreements/{agreement_id}", response_model=AgreementResponse, summary="Get an agreement")
def get_agreement_by_id(agreement_id: int, db: Session = Depends(get_db)) -> AgreementResponse:
    agreement = get_agreement(db, agreement_id)
    if agreement is None:
        raise HTTPException(status_code=404, detail="agreement not found")
    return agreement


@router.get(
    "/jobs/{job_id}/agreement",
    response_model=AgreementResponse,
    summary="Look up the agreement for a job",
)
def get_agreement_for_job(job_id: int, db: Session = Depends(get_db)) -> AgreementResponse | Response:
    if get_job(db, job_id) is None:
        raise HTTPException(status_code=404, detail="job not found")
    agreement = get_job_agreement(db, job_id)
    if agreement is None:
        return Response(status_code=204)
    return agreement
