from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import DemoSession

router = APIRouter(tags=["health"])


@router.get("/health", summary="Check API availability")
def health_check() -> dict[str, str]:
    """Return a small machine-readable liveness response."""

    return {
        "status": "ok",
        "service": "auto-escrow-api",
        "environment": get_settings().app_env,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/ready", response_model=None, summary="Check API and database readiness")
def readiness_check(db: Session = Depends(get_db)) -> dict[str, str] | JSONResponse:
    """Return readiness only when the configured database accepts a query."""

    try:
        db.execute(text("SELECT 1")).scalar_one()
        # A live connection is not enough: the public demo requires the
        # session schema from the current migration head before traffic starts.
        db.execute(select(DemoSession.id).limit(1)).first()
    except SQLAlchemyError:
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "service": "auto-escrow-api", "database": "unavailable"},
        )

    return {
        "status": "ready",
        "service": "auto-escrow-api",
        "environment": get_settings().app_env,
        "database": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
