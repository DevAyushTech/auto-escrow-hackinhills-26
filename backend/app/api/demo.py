"""Anonymous synthetic-demo session bootstrap and reset endpoints."""

from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session

from app.database import get_db
from app.demo_sessions import (
    DEMO_SESSION_HEADER,
    create_demo_session,
    reset_demo_session,
    session_from_header,
)
from app.schemas import DemoSessionResponse


router = APIRouter(prefix="/api/demo", tags=["demo"])


def _response(token_data) -> DemoSessionResponse:
    from app.config import get_settings

    return DemoSessionResponse(
        session_token=token_data.token,
        expires_at=token_data.session.expires_at,
        max_jobs=max(1, get_settings().demo_max_jobs_per_session),
        synthetic_only=True,
        reset_note="This sandbox contains synthetic records and simulated escrow only.",
    )


@router.post("/session", response_model=DemoSessionResponse, summary="Start an isolated synthetic demo session")
def start_demo_session(db: Session = Depends(get_db)) -> DemoSessionResponse:
    return _response(create_demo_session(db))


@router.post("/reset", response_model=DemoSessionResponse, summary="Reset the caller's demo sandbox")
def reset_demo_sandbox(
    token: str | None = Header(default=None, alias=DEMO_SESSION_HEADER),
    db: Session = Depends(get_db),
) -> DemoSessionResponse:
    return _response(reset_demo_session(db, session_from_header(db, token)))
