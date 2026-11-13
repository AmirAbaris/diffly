from fastapi.testclient import TestClient

from api.index import app
from backend.core.db import get_session


def test_health_endpoint(client: TestClient):
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "diffly-fastapi"
    assert data["database"] == "connected"
    assert isinstance(data["challenge_count"], int)
    assert data["challenge_count"] >= 0
    assert isinstance(data["uptime_seconds"], (int, float))
    assert data["uptime_seconds"] >= 0


def test_health_endpoint_db_failure(client: TestClient):
    class FailingSession:
        def exec(self, *args, **kwargs):
            raise RuntimeError("DB query failure simulation")

    def failing_session():
        yield FailingSession()

    app.dependency_overrides[get_session] = failing_session
    try:
        response = client.get("/api/health")
        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "unhealthy"
        assert data["service"] == "diffly-fastapi"
        assert "disconnected" in data["database"]
        assert data["challenge_count"] == 0
        assert data["uptime_seconds"] >= 0
    finally:
        app.dependency_overrides.pop(get_session, None)


def test_scalar_docs_endpoint(client: TestClient):
    response = client.get("/scalar")
    assert response.status_code == 200
    assert "text/html" in response.headers.get("content-type", "")
    assert "scalar" in response.text.lower()
