import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError

from app.config import DEVELOPMENT_FRONTEND_ORIGINS, Settings, get_frontend_origins
from app.database import get_db
from app.main import app


def test_health_endpoint_reports_api_is_available() -> None:
    client = TestClient(app)

    response = client.get("/api/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["service"] == "auto-escrow-api"
    assert "timestamp" in payload


@pytest.mark.parametrize(
    "origin",
    [
        "http://127.0.0.1:3000",
        "http://localhost:3000",
        "http://127.0.0.1:3001",
        "http://localhost:3001",
        "http://127.0.0.1:5174",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ],
)
def test_cors_allows_each_local_frontend_origin_without_credentials(client, origin: str) -> None:
    response = client.get("/api/health", headers={"Origin": origin})

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    assert "access-control-allow-credentials" not in response.headers


def test_cors_does_not_allow_an_unlisted_origin(client) -> None:
    response = client.get("/api/health", headers={"Origin": "https://unlisted.example"})

    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers


def test_frontend_origin_setting_is_exact_and_production_has_no_implicit_origins() -> None:
    development = get_frontend_origins(
        Settings(app_env="development", frontend_origin=" https://preview.example, https://preview.example ")
    )
    production = get_frontend_origins(
        Settings(
            app_env="production",
            frontend_origin="https://app.example, https://admin.example, *, https://app.example",
        )
    )

    assert development == ["https://preview.example", *DEVELOPMENT_FRONTEND_ORIGINS]
    assert production == ["https://app.example", "https://admin.example"]


def test_readiness_endpoint_checks_the_database(client) -> None:
    response = client.get("/api/ready")

    assert response.status_code == 200
    assert response.json()["status"] == "ready"
    assert response.json()["database"] == "ok"
    assert "timestamp" in response.json()


def test_readiness_endpoint_returns_service_unavailable_when_database_query_fails(client) -> None:
    class BrokenSession:
        def execute(self, _statement):
            raise SQLAlchemyError("database unavailable")

    def broken_db():
        yield BrokenSession()

    app.dependency_overrides[get_db] = broken_db

    response = client.get("/api/ready")

    assert response.status_code == 503
    assert response.json() == {
        "status": "not_ready",
        "service": "auto-escrow-api",
        "database": "unavailable",
    }


def test_readiness_endpoint_returns_service_unavailable_when_current_schema_is_missing(client) -> None:
    class SchemaMissingSession:
        calls = 0

        def execute(self, _statement):
            self.calls += 1
            if self.calls == 1:
                class SelectOneResult:
                    def scalar_one(self):
                        return 1

                return SelectOneResult()
            raise SQLAlchemyError("demo session schema is missing")

    def schema_missing_db():
        yield SchemaMissingSession()

    app.dependency_overrides[get_db] = schema_missing_db

    response = client.get("/api/ready")

    assert response.status_code == 503
    assert response.json() == {
        "status": "not_ready",
        "service": "auto-escrow-api",
        "database": "unavailable",
    }
