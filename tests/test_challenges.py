"""Tests for challenge API endpoints."""

from fastapi.testclient import TestClient
from sqlmodel import Session

from api.deps import get_optional_current_user
from api.index import app
from backend.models.challenge import Category, Difficulty, Language
from backend.models.submission import Submission
from backend.models.user import User
from backend.seed.seed_data import seed_challenges


def test_list_challenges_returns_challenge_summaries(
    client: TestClient, session: Session
):
    """GET /api/challenges returns ChallengeSummary excluding secrets."""
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

    # Verify ChallengeSummary metadata on a challenge
    item = next(ch for ch in data if ch["slug"] == "agent-unsanitized-exec")
    assert item["id"] is not None
    assert item["title"] == "Unsanitized Autonomous Calculator Tool Execution"
    assert item["difficulty"] == Difficulty.EASY.value
    assert item["category"] == Category.AGENT_ANTIPATHS.value
    assert item["language"] == Language.PYTHON.value
    assert item["estimated_minutes"] == 5
    assert len(item["description"]) > 0
    assert item["line_count"] > 0
    assert item["total_hints"] == 3
    assert item["is_solved"] is False
    assert item["best_score"] is None

    # Verify secrets and heavy detail fields are excluded from ChallengeSummary
    assert "expected_issues" not in item
    assert "canonical_review" not in item
    assert "recommended_fix_diff" not in item
    assert "code_snippet" not in item
    assert "threat_model" not in item
    assert "defect_target" not in item
    assert "hints" not in item


def test_list_challenges_filter_by_difficulty(client: TestClient, session: Session):
    """Filter challenges by difficulty query parameter."""
    seed_challenges(session)

    # Easy
    res = client.get("/api/challenges?difficulty=Easy")
    assert res.status_code == 200
    easy_items = res.json()
    assert len(easy_items) == 2
    assert all(item["difficulty"] == "Easy" for item in easy_items)

    # Medium
    res_med = client.get("/api/challenges?difficulty=Medium")
    assert res_med.status_code == 200
    med_items = res_med.json()
    assert len(med_items) == 2

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

    res_py = client.get("/api/challenges?language=python")
    assert res_py.status_code == 200
    assert len(res_py.json()) == 4


def test_list_challenges_filter_by_search(client: TestClient, session: Session):
    """Search challenges by keyword."""
    seed_challenges(session)

    res = client.get("/api/challenges?search=injection")
    assert res.status_code == 200
    items = res.json()
    assert len(items) == 2
    slugs = {item["slug"] for item in items}
    assert slugs == {"fastapi-raw-sql-injection", "agent-prompt-injection-leak"}


def test_list_challenges_filter_combinations(client: TestClient, session: Session):
    """Verify multiple filter combinations applied together."""
    seed_challenges(session)

    # Easy + Python
    res = client.get("/api/challenges?difficulty=Easy&language=python")
    assert res.status_code == 200
    items = res.json()
    assert len(items) == 2
    assert all(
        item["difficulty"] == "Easy" and item["language"] == "python" for item in items
    )

    # Concurrency + TypeScript
    res = client.get("/api/challenges?category=Concurrency&language=typescript")
    assert res.status_code == 200
    items = res.json()
    assert len(items) == 1
    assert items[0]["slug"] == "nextjs-race-condition-useeffect"

    # Search + Difficulty
    res = client.get("/api/challenges?search=injection&difficulty=Hard")
    assert res.status_code == 200
    items = res.json()
    assert len(items) == 1
    assert items[0]["slug"] == "agent-prompt-injection-leak"

    # Combination with no matching results
    res_empty = client.get("/api/challenges?difficulty=Hard&language=typescript")
    assert res_empty.status_code == 200
    assert res_empty.json() == []


def test_list_challenges_user_completion_status_guest(
    client: TestClient, session: Session
):
    """Guest session tracks completion status and highest score."""
    challenges = seed_challenges(session)
    ch1 = challenges[0]
    ch2 = challenges[1]

    session_id = "test-guest-session-123"

    # ch1 has 2 submissions (50 and 85) -> best_score=85, is_solved=True
    sub1 = Submission(
        challenge_id=ch1.id,
        session_id=session_id,
        score=50,
        comments="Initial attempt",
    )
    sub2 = Submission(
        challenge_id=ch1.id,
        session_id=session_id,
        score=85,
        comments="Second attempt with correct lines",
    )
    # ch2 has 1 submission (70) -> best_score=70, is_solved=False
    sub3 = Submission(
        challenge_id=ch2.id,
        session_id=session_id,
        score=70,
        comments="Partial attempt",
    )
    session.add_all([sub1, sub2, sub3])
    session.commit()

    # Query with guest session header
    res = client.get("/api/challenges", headers={"X-Diffly-Session-Id": session_id})
    assert res.status_code == 200
    data = res.json()

    item1 = next(item for item in data if item["id"] == ch1.id)
    assert item1["is_solved"] is True
    assert item1["best_score"] == 85

    item2 = next(item for item in data if item["id"] == ch2.id)
    assert item2["is_solved"] is False
    assert item2["best_score"] == 70

    # Remaining challenges should have is_solved=False and best_score=None
    unattempted = [item for item in data if item["id"] not in (ch1.id, ch2.id)]
    for item in unattempted:
        assert item["is_solved"] is False
        assert item["best_score"] is None

    # Query with a different session ID sees no completion
    res_other = client.get(
        "/api/challenges", headers={"X-Diffly-Session-Id": "other-session"}
    )
    data_other = res_other.json()
    assert all(item["is_solved"] is False for item in data_other)
    assert all(item["best_score"] is None for item in data_other)


def test_list_challenges_user_completion_status_authenticated(
    client: TestClient, session: Session
):
    """Authenticated user tracks completion status and highest score."""
    challenges = seed_challenges(session)
    ch1 = challenges[0]

    user = User(
        email="learner@diffly.dev",
        username="learner",
        hashed_password="pw",
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    sub = Submission(
        challenge_id=ch1.id,
        user_id=user.id,
        score=95,
        comments="Great review",
    )
    session.add(sub)
    session.commit()

    # Authenticate via dependency override
    app.dependency_overrides[get_optional_current_user] = lambda: user
    try:
        res = client.get("/api/challenges")
        assert res.status_code == 200
        data = res.json()
        item1 = next(item for item in data if item["id"] == ch1.id)
        assert item1["is_solved"] is True
        assert item1["best_score"] == 95
    finally:
        app.dependency_overrides.pop(get_optional_current_user, None)

    # Authenticate via X-User-Id header fallback
    res_header = client.get("/api/challenges", headers={"X-User-Id": str(user.id)})
    assert res_header.status_code == 200
    data_header = res_header.json()
    item_header = next(item for item in data_header if item["id"] == ch1.id)
    assert item_header["is_solved"] is True
    assert item_header["best_score"] == 95


def test_get_challenge_by_slug(client: TestClient, session: Session):
    """Retrieve ChallengeDetail by URL slug."""
    seed_challenges(session)

    res = client.get("/api/challenges/agent-unsanitized-exec")
    assert res.status_code == 200
    data = res.json()
    assert data["slug"] == "agent-unsanitized-exec"
    assert data["title"] == "Unsanitized Autonomous Calculator Tool Execution"
    assert data["difficulty"] == "Easy"
    assert data["category"] == "Agent Antipaths"
    assert data["language"] == "python"
    assert "eval(" in data["code_snippet"]
    assert len(data["threat_model"]) > 0
    assert len(data["defect_target"]) > 0
    assert data["estimated_minutes"] == 5
    assert data["line_count"] > 0
    assert data["total_hints"] == 3
    assert data["is_solved"] is False
    assert data["best_score"] is None

    # Verify secret fields are excluded
    assert "expected_issues" not in data
    assert "canonical_review" not in data
    assert "recommended_fix_diff" not in data
    assert "hints" not in data


def test_get_challenge_by_numeric_id(client: TestClient, session: Session):
    """Retrieve ChallengeDetail by numeric database ID."""
    seed_challenges(session)

    res_list = client.get("/api/challenges")
    first_ch = res_list.json()[0]
    first_id = first_ch["id"]

    res = client.get(f"/api/challenges/{first_id}")
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == first_id
    assert data["slug"] == first_ch["slug"]
    assert "code_snippet" in data
    assert "threat_model" in data


def test_get_challenge_user_completion_status(client: TestClient, session: Session):
    """GET /api/challenges/{identifier} reflects user completion status."""
    challenges = seed_challenges(session)
    ch = challenges[0]
    session_id = "test-detail-session"

    sub = Submission(
        challenge_id=ch.id,
        session_id=session_id,
        score=90,
        comments="High score review",
    )
    session.add(sub)
    session.commit()

    # Guest session test
    res = client.get(
        f"/api/challenges/{ch.slug}",
        headers={"X-Diffly-Session-Id": session_id},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["is_solved"] is True
    assert data["best_score"] == 90

    # Authenticated user test
    user = User(
        email="detailuser@diffly.dev",
        username="detailuser",
        hashed_password="pw",
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    user_sub = Submission(
        challenge_id=ch.id,
        user_id=user.id,
        score=92,
        comments="Auth user review",
    )
    session.add(user_sub)
    session.commit()

    app.dependency_overrides[get_optional_current_user] = lambda: user
    try:
        res_auth = client.get(f"/api/challenges/{ch.slug}")
        assert res_auth.status_code == 200
        data_auth = res_auth.json()
        assert data_auth["is_solved"] is True
        assert data_auth["best_score"] == 92
    finally:
        app.dependency_overrides.pop(get_optional_current_user, None)


def test_get_challenge_not_found(client: TestClient, session: Session):
    """Returns 404 with exact detail message when challenge is not found."""
    seed_challenges(session)

    res = client.get("/api/challenges/non-existent-challenge-slug")
    assert res.status_code == 404
    assert res.json() == {"detail": "Challenge not found"}

    res_id = client.get("/api/challenges/999999")
    assert res_id.status_code == 404
    assert res_id.json() == {"detail": "Challenge not found"}
