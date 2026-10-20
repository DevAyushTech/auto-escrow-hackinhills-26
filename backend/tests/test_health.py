from fastapi.testclient import TestClient

from app.main import app


def test_health_endpoint_reports_api_is_available() -> None:
    client = TestClient(app)

    response = client.get("/api/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["service"] == "auto-escrow-api"
    assert "timestamp" in payload
