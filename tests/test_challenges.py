"""Tests for challenge API endpoints."""

from fastapi.testclient import TestClient
from sqlmodel import Session

from backend.models.challenge import Category, Difficulty, Language
from backend.seed.seed_data import seed_challenges


def test_list_challenges_returns_all_seeded_challenges(
    client: TestClient, session: Session
):
    """GET /api/challenges returns all 5 seeded challenges with complete metadata."""
    seed_challenges(session)

    response = client.get("/api/challenges")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 5

    slugs = {item["slug"] for item in data}
    assert slugs == {
        "agent-unsanitized-exec",
        "fastapi-raw-sql-injection",
        "nextjs-race-condition-useeffect",
        "agent-prompt-injection-leak",
        "asyncio-unhandled-task-gather",
    }

    # Verify complete metadata on a challenge
    item = next(ch for ch in data if ch["slug"] == "agent-unsanitized-exec")
    assert item["title"] == "Unsanitized Autonomous Calculator Tool Execution"
    assert item["difficulty"] == Difficulty.EASY.value
    assert item["category"] == Category.AGENT_ANTIPATHS.value
    assert item["language"] == Language.PYTHON.value
    assert item["estimated_minutes"] == 5
    assert len(item["description"]) > 0
    assert len(item["threat_model"]) > 0
    assert len(item["defect_target"]) > 0
    assert len(item["code_snippet"]) > 0
    assert len(item["canonical_review"]) > 0
    assert len(item["recommended_fix_diff"]) > 0
    assert "crit-rce-eval" in item["expected_issues"]
    assert "Contextual Clue" in item["hints"]


def test_list_challenges_filter_by_difficulty(client: TestClient, session: Session):
    """Filter challenges by difficulty query parameter."""
    seed_challenges(session)

    # Easy
    res = client.get("/api/challenges?difficulty=Easy")
    assert res.status_code == 200
    easy_items = res.json()
    assert len(easy_items) == 2
    assert all(item["difficulty"] == "Easy" for item in easy_items)

    # Hard
    res_hard = client.get("/api/challenges?difficulty=Hard")
    assert res_hard.status_code == 200
    hard_items = res_hard.json()
    assert len(hard_items) == 1
    assert hard_items[0]["slug"] == "agent-prompt-injection-leak"


def test_list_challenges_filter_by_category(client: TestClient, session: Session):
    """Filter challenges by category query parameter."""
    seed_challenges(session)

    res = client.get("/api/challenges?category=Concurrency")
    assert res.status_code == 200
    concurrency_items = res.json()
    assert len(concurrency_items) == 2
    slugs = {item["slug"] for item in concurrency_items}
    assert slugs == {"nextjs-race-condition-useeffect", "asyncio-unhandled-task-gather"}


def test_list_challenges_filter_by_language(client: TestClient, session: Session):
    """Filter challenges by language query parameter."""
    seed_challenges(session)

    res = client.get("/api/challenges?language=typescript")
    assert res.status_code == 200
    ts_items = res.json()
    assert len(ts_items) == 1
    assert ts_items[0]["slug"] == "nextjs-race-condition-useeffect"


def test_list_challenges_filter_by_search(client: TestClient, session: Session):
    """Search challenges by search keyword."""
    seed_challenges(session)

    res = client.get("/api/challenges?search=injection")
    assert res.status_code == 200
    items = res.json()
    assert len(items) == 2
    slugs = {item["slug"] for item in items}
    assert slugs == {"fastapi-raw-sql-injection", "agent-prompt-injection-leak"}


def test_get_challenge_by_slug(client: TestClient, session: Session):
    """Retrieve challenge detail by slug."""
    seed_challenges(session)

    res = client.get("/api/challenges/agent-unsanitized-exec")
    assert res.status_code == 200
    data = res.json()
    assert data["slug"] == "agent-unsanitized-exec"
    assert data["title"] == "Unsanitized Autonomous Calculator Tool Execution"
    assert "eval(" in data["code_snippet"]


def test_get_challenge_by_numeric_id(client: TestClient, session: Session):
    """Retrieve challenge detail by numeric database ID."""
    seed_challenges(session)

    # Get ID of first challenge
    res_list = client.get("/api/challenges")
    first_ch = res_list.json()[0]
    first_id = first_ch["id"]

    res = client.get(f"/api/challenges/{first_id}")
    assert res.status_code == 200
    assert res.json()["slug"] == first_ch["slug"]


def test_get_challenge_not_found(client: TestClient, session: Session):
    """Returns 404 when challenge slug or ID is not found."""
    seed_challenges(session)

    res = client.get("/api/challenges/non-existent-challenge-slug")
    assert res.status_code == 404
    assert res.json()["detail"] == "Challenge not found"

    res_id = client.get("/api/challenges/999999")
    assert res_id.status_code == 404
    assert res_id.json()["detail"] == "Challenge not found"
