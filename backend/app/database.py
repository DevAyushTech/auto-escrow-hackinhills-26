"""Database engine and request-scoped session setup.

SQLite is the default local database.  The SQLAlchemy URL can be switched to a
PostgreSQL URL for a hosted deployment without changing application code.
Schema creation is deliberately handled by Alembic, not application startup.
"""

from collections.abc import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import get_database_url, get_settings


def create_engine_for_url(database_url: str):
    """Create a SQLAlchemy engine for SQLite or PostgreSQL."""

    connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
    created_engine = create_engine(database_url, connect_args=connect_args, pool_pre_ping=True)
    if database_url.startswith("sqlite"):
        @event.listens_for(created_engine, "connect")
        def _enable_sqlite_foreign_keys(dbapi_connection, _connection_record) -> None:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return created_engine


settings = get_settings()
engine = create_engine_for_url(get_database_url(settings))
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """Base class for future SQLAlchemy models."""


def get_db() -> Generator[Session, None, None]:
    """Yield one request-scoped database session."""

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def configure_database(database_url: str) -> None:
    """Replace the process-local engine, primarily for isolated test runs."""

    global engine, SessionLocal
    engine.dispose()
    engine = create_engine_for_url(database_url)
    SessionLocal.configure(bind=engine)
