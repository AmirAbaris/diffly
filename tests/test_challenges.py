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


def test_get_challenge_hints_all_progressive(client: TestClient, session: Session):
    """GET /api/challenges/{identifier}/hints returns progressive hints in order."""
    seed_challenges(session)

    res = client.get("/api/challenges/agent-unsanitized-exec/hints")
    assert res.status_code == 200
    hints = res.json()
    assert isinstance(hints, list)
    assert len(hints) == 3

    assert hints[0]["tier"] == 1
    assert "Contextual" in hints[0]["label"]
    assert len(hints[0]["text"]) > 0

    assert hints[1]["tier"] == 2
    assert "Vulnerability" in hints[1]["label"]
    assert len(hints[1]["text"]) > 0

    assert hints[2]["tier"] == 3
    assert "Line" in hints[2]["label"]
    assert len(hints[2]["text"]) > 0


def test_get_challenge_hints_by_numeric_id(client: TestClient, session: Session):
    """GET /api/challenges/{identifier}/hints supports numeric challenge ID."""
    challenges = seed_challenges(session)
    ch = challenges[0]

    res = client.get(f"/api/challenges/{ch.id}/hints")
    assert res.status_code == 200
    hints = res.json()
    assert len(hints) == 3
    assert [h["tier"] for h in hints] == [1, 2, 3]


def test_get_challenge_hints_filter_by_tier(client: TestClient, session: Session):
    """GET /api/challenges/{identifier}/hints?tier={tier} filters to requested tier."""
    seed_challenges(session)

    for tier in (1, 2, 3):
        res = client.get(f"/api/challenges/agent-unsanitized-exec/hints?tier={tier}")
        assert res.status_code == 200
        hints = res.json()
        assert len(hints) == 1
        assert hints[0]["tier"] == tier


def test_get_challenge_hints_invalid_tier(client: TestClient, session: Session):
    """GET /api/challenges/{identifier}/hints validates tier range (1-3)."""
    seed_challenges(session)

    res_zero = client.get("/api/challenges/agent-unsanitized-exec/hints?tier=0")
    assert res_zero.status_code == 422

    res_four = client.get("/api/challenges/agent-unsanitized-exec/hints?tier=4")
    assert res_four.status_code == 422

    res_str = client.get("/api/challenges/agent-unsanitized-exec/hints?tier=abc")
    assert res_str.status_code == 422


def test_get_challenge_hints_not_found(client: TestClient, session: Session):
    """GET /api/challenges/{identifier}/hints returns 404 for invalid identifier."""
    seed_challenges(session)

    res = client.get("/api/challenges/nonexistent-challenge/hints")
    assert res.status_code == 404
    assert res.json() == {"detail": "Challenge not found"}

    res_id = client.get("/api/challenges/999999/hints")
    assert res_id.status_code == 404
    assert res_id.json() == {"detail": "Challenge not found"}


def test_get_challenge_solution_forbidden_without_submission_or_reveal(
    client: TestClient, session: Session
):
    """GET solution returns 403 when unattempted and reveal=false."""
    challenges = seed_challenges(session)
    ch = challenges[0]

    # Anonymous user without header
    res_anon = client.get(f"/api/challenges/{ch.slug}/solution")
    assert res_anon.status_code == 403
    assert "submission" in res_anon.json()["detail"].lower()

    # Guest user with session header but no submissions
    res_guest = client.get(
        f"/api/challenges/{ch.slug}/solution",
        headers={"X-Diffly-Session-Id": "unattempted-guest"},
    )
    assert res_guest.status_code == 403

    # Authenticated user with no submissions
    user = User(email="nosub@diffly.dev", username="nosub", hashed_password="pw")
    session.add(user)
    session.commit()
    session.refresh(user)

    app.dependency_overrides[get_optional_current_user] = lambda: user
    try:
        res_user = client.get(f"/api/challenges/{ch.slug}/solution")
        assert res_user.status_code == 403
    finally:
        app.dependency_overrides.pop(get_optional_current_user, None)


def test_get_challenge_solution_with_reveal_param(client: TestClient, session: Session):
    """GET solution succeeds with reveal=true without prior submission."""
    challenges = seed_challenges(session)
    ch = challenges[0]

    res = client.get(f"/api/challenges/{ch.slug}/solution?reveal=true")
    assert res.status_code == 200
    data = res.json()

    assert data["challenge_id"] == ch.id
    assert data["slug"] == ch.slug
    assert len(data["canonical_review"]) > 0
    assert len(data["recommended_fix_diff"]) > 0
    assert isinstance(data["expected_issues"], list)
    assert len(data["expected_issues"]) > 0

    first_issue = data["expected_issues"][0]
    assert "id" in first_issue
    assert "title" in first_issue
    assert "severity" in first_issue
    assert "explanation" in first_issue


def test_get_challenge_solution_allowed_after_guest_submission(
    client: TestClient, session: Session
):
    """Guest user can access solution after making at least one submission."""
    challenges = seed_challenges(session)
    ch = challenges[0]
    session_id = "attempted-guest-session-42"

    sub = Submission(
        challenge_id=ch.id,
        session_id=session_id,
        score=60,
        comments="First review attempt",
    )
    session.add(sub)
    session.commit()

    # Query with session header
    res_header = client.get(
        f"/api/challenges/{ch.slug}/solution",
        headers={"X-Diffly-Session-Id": session_id},
    )
    assert res_header.status_code == 200
    assert res_header.json()["slug"] == ch.slug

    # Query with session query parameter
    res_query = client.get(
        f"/api/challenges/{ch.slug}/solution?session_id={session_id}"
    )
    assert res_query.status_code == 200

    # Query with different session is forbidden
    res_diff = client.get(
        f"/api/challenges/{ch.slug}/solution",
        headers={"X-Diffly-Session-Id": "different-guest"},
    )
    assert res_diff.status_code == 403


def test_get_challenge_solution_allowed_after_user_submission(
    client: TestClient, session: Session
):
    """Authenticated user can access solution after making at least one submission."""
    challenges = seed_challenges(session)
    ch = challenges[0]

    user = User(email="soluser@diffly.dev", username="soluser", hashed_password="pw")
    session.add(user)
    session.commit()
    session.refresh(user)

    sub = Submission(
        challenge_id=ch.id,
        user_id=user.id,
        score=75,
        comments="Submitted user attempt",
    )
    session.add(sub)
    session.commit()

    app.dependency_overrides[get_optional_current_user] = lambda: user
    try:
        res = client.get(f"/api/challenges/{ch.slug}/solution")
        assert res.status_code == 200
        assert res.json()["slug"] == ch.slug
    finally:
        app.dependency_overrides.pop(get_optional_current_user, None)

    # Another user without submission is forbidden
    other_user = User(email="other@diffly.dev", username="other", hashed_password="pw")
    session.add(other_user)
    session.commit()
    session.refresh(other_user)

    app.dependency_overrides[get_optional_current_user] = lambda: other_user
    try:
        res_other = client.get(f"/api/challenges/{ch.slug}/solution")
        assert res_other.status_code == 403
    finally:
        app.dependency_overrides.pop(get_optional_current_user, None)


def test_get_challenge_solution_by_numeric_id(client: TestClient, session: Session):
    """GET /api/challenges/{identifier}/solution supports numeric challenge ID."""
    challenges = seed_challenges(session)
    ch = challenges[0]

    res = client.get(f"/api/challenges/{ch.id}/solution?reveal=true")
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == ch.id
    assert data["slug"] == ch.slug


def test_get_challenge_solution_not_found(client: TestClient, session: Session):
    """GET /api/challenges/{identifier}/solution returns 404 for invalid identifier."""
    seed_challenges(session)

    res = client.get("/api/challenges/nonexistent/solution?reveal=true")
    assert res.status_code == 404
    assert res.json() == {"detail": "Challenge not found"}

    res_id = client.get("/api/challenges/999999/solution?reveal=true")
    assert res_id.status_code == 404
    assert res_id.json() == {"detail": "Challenge not found"}
