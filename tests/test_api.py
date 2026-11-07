import pytest
from fastapi.testclient import TestClient

from api.index import app
from backend.db import init_db
from backend.seed import seed_database


@pytest.fixture(autouse=True)
def setup_test_db():
    init_db()
    seed_database()


def test_health_endpoint():
    with TestClient(app) as client:
        response = client.get("/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["database"] == "connected"
        assert data["challenges_available"] >= 3


def test_list_challenges():
    with TestClient(app) as client:
        response = client.get("/api/challenges")
        assert response.status_code == 200
        challenges = response.json()
        assert len(challenges) >= 3
        slugs = [c["slug"] for c in challenges]
        assert "agent-unsanitized-exec" in slugs


def test_get_single_challenge():
    with TestClient(app) as client:
        response = client.get("/api/challenges/1")
        assert response.status_code == 200
        data = response.json()
        assert "code_snippet" in data
        assert "eval" in data["code_snippet"]


def test_submit_review_evaluation():
    with TestClient(app) as client:
        payload = {
            "flagged_lines": [5],
            "comments": (
                "Line 5 uses eval directly, creating an arbitrary code "
                "execution and RCE vulnerability."
            ),
        }
        response = client.post("/api/challenges/1/review", json=payload)
        assert response.status_code == 200
        result = response.json()
        assert result["score"] == 100
        assert "Outstanding review" in result["feedback"]
        assert len(result["detected_issues"]) > 0
