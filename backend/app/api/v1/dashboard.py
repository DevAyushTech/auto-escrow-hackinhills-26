"""Persisted dashboard metrics endpoint."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import DashboardMetrics
from app.services.dashboard import get_metrics

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/metrics", response_model=DashboardMetrics, summary="Get dashboard metrics")
def dashboard_metrics(db: Session = Depends(get_db)) -> DashboardMetrics:
    return DashboardMetrics(**get_metrics(db))
