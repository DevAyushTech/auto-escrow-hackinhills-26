"""Environment-backed application settings."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


DEVELOPMENT_FRONTEND_ORIGINS = (
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "http://127.0.0.1:3001",
    "http://localhost:3001",
    "http://127.0.0.1:5174",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://localhost:5173",
)


class Settings(BaseSettings):
    app_name: str = "Auto Escrow API"
    app_env: str = "development"
    database_url: str = "sqlite:///./auto_escrow.db"
    # Tests can point the application at an isolated database without changing
    # the normal development URL.  It is selected when APP_ENV=test.
    test_database_url: str | None = None
    frontend_origin: str = ""
    # One initial submission plus this many retries is the demo default.  A
    # deployment can lower or raise it without changing the state machine.
    max_submission_retries: int = 2
    demo_resolution_operator: str = "demo-operator"
    # Public demo access is opt-in.  When enabled, every /api/v1 request must
    # carry a server-issued X-Demo-Session token and all mutable records are
    # scoped to that session.
    demo_public_enabled: bool = False
    demo_seed_enabled: bool = False
    demo_session_ttl_minutes: int = 120
    demo_max_jobs_per_session: int = 3
    demo_rate_limit_per_minute: int = 120
    demo_session_create_limit_per_hour: int = 10
    demo_max_request_bytes: int = 300_000

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )


@lru_cache
def get_settings() -> Settings:
    """Return cached settings so all services use one configuration."""

    return Settings()


def get_database_url(settings: Settings | None = None) -> str:
    """Return the database URL for the current environment.

    ``TEST_DATABASE_URL`` is intentionally opt-in.  Production and local
    startup continue to use ``DATABASE_URL`` and never recreate or reset a
    database automatically.
    """

    active_settings = settings or get_settings()
    if active_settings.app_env.lower() == "test" and active_settings.test_database_url:
        database_url = active_settings.test_database_url
    else:
        database_url = active_settings.database_url
    # psycopg is pinned in requirements, so the conventional PostgreSQL URL
    # works without requiring callers to know SQLAlchemy's driver suffix.
    if database_url.startswith("postgresql://"):
        return database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    if database_url.startswith("postgres://"):
        return database_url.replace("postgres://", "postgresql+psycopg://", 1)
    return database_url


def get_frontend_origins(settings: Settings | None = None) -> list[str]:
    """Return the exact CORS origin allowlist for the current environment.

    ``FRONTEND_ORIGIN`` is comma-separated so deployments can explicitly list
    more than one frontend origin.  Development also permits the local Vite
    origins used by this project; production receives no implicit origins.
    Wildcards are ignored so CORS never becomes an allow-all policy.
    """

    active_settings = settings or get_settings()
    configured_origins = [
        origin
        for origin in (value.strip() for value in active_settings.frontend_origin.split(","))
        if origin and origin != "*"
    ]
    origins = list(dict.fromkeys(configured_origins))

    if active_settings.app_env.lower() == "development":
        origins.extend(origin for origin in DEVELOPMENT_FRONTEND_ORIGINS if origin not in origins)

    return origins
