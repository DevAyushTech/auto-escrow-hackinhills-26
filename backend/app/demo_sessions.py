"""Scoped anonymous sandbox sessions for the synthetic public demo.

The token returned by ``POST /api/demo/session`` is a bearer credential for a
single disposable sandbox.  Only a SHA-256 digest is persisted, so a database
read does not reveal active browser credentials.  Local development remains
backwards compatible: requests without a token are allowed when public demo
mode is disabled, while requests that do provide a token are still isolated.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import hashlib
import secrets

from fastapi import Depends, Header, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models import (
    Agreement,
    AuditEvent,
    DemoSession,
    Dispute,
    Escrow,
    Job,
    LedgerEntry,
    MatchResult,
    Submission,
    Verification,
)


DEMO_SESSION_HEADER = "X-Demo-Session"
TOKEN_BYTES = 32


@dataclass(frozen=True)
class DemoSessionToken:
    session: DemoSession
    token: str


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _expires_at() -> datetime:
    minutes = max(5, get_settings().demo_session_ttl_minutes)
    return utc_now() + timedelta(minutes=minutes)


def create_demo_session(db: Session) -> DemoSessionToken:
    token = secrets.token_urlsafe(TOKEN_BYTES)
    session = DemoSession(token_hash=_hash_token(token), expires_at=_expires_at())
    db.add(session)
    db.commit()
    db.refresh(session)
    return DemoSessionToken(session=session, token=token)


def find_demo_session(db: Session, token: str | None) -> DemoSession | None:
    normalized = (token or "").strip()
    if not normalized or len(normalized) > 256:
        return None
    session = db.scalar(select(DemoSession).where(DemoSession.token_hash == _hash_token(normalized)))
    expires_at = session.expires_at.replace(tzinfo=timezone.utc) if session and session.expires_at.tzinfo is None else (session.expires_at if session else None)
    if session is None or session.revoked_at is not None or expires_at <= utc_now():
        return None
    return session


def require_demo_session(
    db: Session = Depends(get_db),
    token: str | None = Header(default=None, alias=DEMO_SESSION_HEADER),
) -> DemoSession | None:
    """Validate the optional local/public demo credential and bind its scope.

    The dependency is attached to the versioned API router.  It stores only the
    numeric server-side session id in the request's SQLAlchemy session info so
    downstream services can add ownership predicates without trusting a client
    supplied job, agent, or session id.
    """

    if token is None or not token.strip():
        if get_settings().demo_public_enabled:
            raise HTTPException(status_code=401, detail="a demo session is required")
        db.info.pop("demo_session_id", None)
        return None

    session = find_demo_session(db, token)
    if session is None:
        raise HTTPException(status_code=401, detail="demo session is invalid or expired")
    db.info["demo_session_id"] = session.id
    return session


def current_demo_session_id(db: Session) -> int | None:
    value = db.info.get("demo_session_id")
    return int(value) if value is not None else None


def is_scoped_request(db: Session) -> bool:
    return current_demo_session_id(db) is not None


def scope_job_query(db: Session, query):
    session_id = current_demo_session_id(db)
    return query.where(Job.demo_session_id == session_id) if session_id is not None else query


def get_scoped_job(db: Session, job_id: int) -> Job | None:
    query = select(Job).where(Job.id == job_id)
    return db.scalar(scope_job_query(db, query))


def ensure_scoped_count_allows_job(db: Session) -> None:
    session_id = current_demo_session_id(db)
    if session_id is None:
        return
    count = db.scalar(select(Job.id).where(Job.demo_session_id == session_id).order_by(Job.id.desc()).offset(
        max(0, get_settings().demo_max_jobs_per_session - 1)
    ).limit(1))
    if count is not None:
        raise HTTPException(
            status_code=429,
            detail=f"demo session limit reached ({get_settings().demo_max_jobs_per_session} jobs)",
        )


def synthetic_only(db: Session) -> bool:
    return current_demo_session_id(db) is not None


def reset_demo_session(db: Session, session: DemoSession) -> DemoSessionToken:
    """Delete only the caller's jobs and all records attached to those jobs."""

    job_ids = [row[0] for row in db.execute(select(Job.id).where(Job.demo_session_id == session.id)).all()]
    if job_ids:
        submission_ids = [row[0] for row in db.execute(select(Submission.id).where(Submission.job_id.in_(job_ids))).all()]
        escrow_ids = [row[0] for row in db.execute(select(Escrow.id).where(Escrow.job_id.in_(job_ids))).all()]
        if submission_ids:
            db.execute(delete(Verification).where(Verification.submission_id.in_(submission_ids)))
        if escrow_ids:
            db.execute(delete(LedgerEntry).where(LedgerEntry.escrow_id.in_(escrow_ids)))
        db.execute(delete(Dispute).where(Dispute.job_id.in_(job_ids)))
        db.execute(delete(Submission).where(Submission.job_id.in_(job_ids)))
        db.execute(delete(AuditEvent).where(AuditEvent.job_id.in_(job_ids)))
        db.execute(delete(MatchResult).where(MatchResult.job_id.in_(job_ids)))
        db.execute(delete(Escrow).where(Escrow.job_id.in_(job_ids)))
        db.execute(delete(Agreement).where(Agreement.job_id.in_(job_ids)))
        db.execute(delete(Job).where(Job.id.in_(job_ids)))

    token = secrets.token_urlsafe(TOKEN_BYTES)
    session.token_hash = _hash_token(token)
    session.expires_at = _expires_at()
    session.revoked_at = None
    db.commit()
    db.refresh(session)
    return DemoSessionToken(session=session, token=token)


def revoke_demo_session(db: Session, session: DemoSession) -> None:
    session.revoked_at = utc_now()
    db.commit()


def session_from_header(db: Session, token: str | None) -> DemoSession:
    session = find_demo_session(db, token)
    if session is None:
        raise HTTPException(status_code=401, detail="demo session is invalid or expired")
    db.info["demo_session_id"] = session.id
    return session


__all__ = [
    "DEMO_SESSION_HEADER",
    "DemoSessionToken",
    "create_demo_session",
    "current_demo_session_id",
    "ensure_scoped_count_allows_job",
    "find_demo_session",
    "get_scoped_job",
    "is_scoped_request",
    "require_demo_session",
    "reset_demo_session",
    "scope_job_query",
    "session_from_header",
    "synthetic_only",
]
