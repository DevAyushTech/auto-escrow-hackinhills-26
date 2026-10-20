"""Environment-backed application settings."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Auto Escrow API"
    app_env: str = "development"
    database_url: str = "sqlite:///./auto_escrow.db"
    # Tests can point the application at an isolated database without changing
    # the normal development URL.  It is selected when APP_ENV=test.
    test_database_url: str | None = None
    frontend_origin: str = "http://localhost:5173"

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
