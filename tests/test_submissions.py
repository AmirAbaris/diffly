"""Tests for review submission REST API and result persistence."""

from fastapi.testclient import TestClient
from sqlmodel import Session

from api.deps import get_optional_current_user
from api.index import app
from backend.models.submission import Submission
from backend.models.user import User
from backend.seed.seed_data import seed_challenges


def test_submit_review_guest_via_body_session_id(client: TestClient, session: Session):
    """Guest user submits review with session_id in request body."""
    challenges = seed_challenges(session)
    ch = challenges[0]

    payload = {
        "flagged_lines": [6],
        "comments": (
            "The eval function executes unsanitized user expression "
            "without safe globals."
        ),
        "session_id": "guest-session-abc-123",
    }

    res = client.post(f"/api/challenges/{ch.slug}/review", json=payload)
    assert res.status_code == 200
    data = res.json()

    assert "submission_id" in data
    assert data["submission_id"] > 0
    assert data["id"] == data["submission_id"]
    assert "score" in data
    assert 0 <= data["score"] <= 100
    assert "feedback" in data
    assert len(data["feedback"]) > 0
    assert isinstance(data["detected_issues"], list)
    assert isinstance(data["missed_issues"], list)
    assert "created_at" in data

    # Verify database persistence
    saved = session.get(Submission, data["submission_id"])
    assert saved is not None
    assert saved.challenge_id == ch.id
    assert saved.user_id is None
    assert saved.session_id == "guest-session-abc-123"
    assert saved.score == data["score"]
    assert saved.feedback == data["feedback"]
    assert saved.get_flagged_lines() == [6]
    assert saved.comments == payload["comments"]
    assert len(saved.get_detected_issues()) == len(data["detected_issues"])


def test_submit_review_guest_via_header_session_id(
    client: TestClient, session: Session
):
    """Guest user submits review with session_id in X-Diffly-Session-Id header."""
    challenges = seed_challenges(session)
    ch = challenges[0]

    payload = {
        "flagged_lines": [6],
        "comments": "Critical vulnerability: eval arbitrary code execution.",
    }
    headers = {"X-Diffly-Session-Id": "header-guest-session-789"}

    res = client.post(
        f"/api/challenges/{ch.id}/review",
        json=payload,
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()

    saved = session.get(Submission, data["submission_id"])
    assert saved is not None
    assert saved.session_id == "header-guest-session-789"
    assert saved.user_id is None


def test_submit_review_guest_fallback_session_id(client: TestClient, session: Session):
    """Guest submitting without session_id receives auto-generated guest session."""
    challenges = seed_challenges(session)
    ch = challenges[0]

    payload = {
        "flagged_lines": [6],
        "comments": "Arbitrary code execution via python eval function.",
    }

    res = client.post(f"/api/challenges/{ch.slug}/review", json=payload)
    assert res.status_code == 200
    data = res.json()

    saved = session.get(Submission, data["submission_id"])
    assert saved is not None
    assert saved.session_id is not None
    assert saved.session_id.startswith("guest-")


def test_submit_review_authenticated_user(client: TestClient, session: Session):
    """Authenticated user submission is linked to user_id."""
    challenges = seed_challenges(session)
    ch = challenges[0]

    user = User(
        email="developer@diffly.dev",
        username="developer",
        hashed_password="pw",
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    app.dependency_overrides[get_optional_current_user] = lambda: user
    try:
        payload = {
            "flagged_lines": [6],
            "comments": "Use of eval() on untrusted user calculator expression.",
        }
        res = client.post(f"/api/challenges/{ch.slug}/review", json=payload)
        assert res.status_code == 200
        data = res.json()

        saved = session.get(Submission, data["submission_id"])
        assert saved is not None
        assert saved.user_id == user.id
    finally:
        app.dependency_overrides.pop(get_optional_current_user, None)


def test_submit_review_supports_both_id_and_slug(client: TestClient, session: Session):
    """POST /review resolves challenge by numeric ID or string slug."""
    challenges = seed_challenges(session)
    ch = challenges[0]

    payload = {
        "flagged_lines": [6],
        "comments": "Arbitrary code execution vulnerability present here.",
    }

    # By slug
    res_slug = client.post(f"/api/challenges/{ch.slug}/review", json=payload)
    assert res_slug.status_code == 200

    # By numeric ID
    res_id = client.post(f"/api/challenges/{ch.id}/review", json=payload)
    assert res_id.status_code == 200


def test_submit_review_not_found(client: TestClient, session: Session):
    """POST /review returns 404 when challenge identifier does not exist."""
    seed_challenges(session)

    payload = {
        "flagged_lines": [1],
        "comments": "Some valid comments exceeding 5 chars.",
    }

    res_slug = client.post(
        "/api/challenges/non-existent-challenge-slug/review",
        json=payload,
    )
    assert res_slug.status_code == 404
    assert res_slug.json() == {"detail": "Challenge not found"}

    res_id = client.post(
        "/api/challenges/999999/review",
        json=payload,
    )
    assert res_id.status_code == 404
    assert res_id.json() == {"detail": "Challenge not found"}


def test_submit_review_validation_errors(client: TestClient, session: Session):
    """POST /review returns 422 for comments too short or invalid flagged_lines."""
    challenges = seed_challenges(session)
    ch = challenges[0]

    # Comments too short (< 5 chars)
    res_short = client.post(
        f"/api/challenges/{ch.slug}/review",
        json={"flagged_lines": [1], "comments": "bad"},
    )
    assert res_short.status_code == 422

    # Comments whitespace only
    res_spaces = client.post(
        f"/api/challenges/{ch.slug}/review",
        json={"flagged_lines": [1], "comments": "     "},
    )
    assert res_spaces.status_code == 422

    # Missing comments field
    res_missing = client.post(
        f"/api/challenges/{ch.slug}/review",
        json={"flagged_lines": [1]},
    )
    assert res_missing.status_code == 422

    # Invalid flagged line: 0
    res_zero = client.post(
        f"/api/challenges/{ch.slug}/review",
        json={"flagged_lines": [0], "comments": "Valid review comments."},
    )
    assert res_zero.status_code == 422

    # Invalid flagged line: negative number
    res_neg = client.post(
        f"/api/challenges/{ch.slug}/review",
        json={"flagged_lines": [-5], "comments": "Valid review comments."},
    )
    assert res_neg.status_code == 422

    # Invalid flagged line: non-integer
    res_str = client.post(
        f"/api/challenges/{ch.slug}/review",
        json={"flagged_lines": ["not_a_num"], "comments": "Valid review comments."},
    )
    assert res_str.status_code == 422


def test_get_submissions_history_guest(client: TestClient, session: Session):
    """GET /submissions filters attempts by guest session and returns descending."""
    challenges = seed_challenges(session)
    ch = challenges[0]
    session_id = "guest-history-session-456"

    # Submit first attempt
    res1 = client.post(
        f"/api/challenges/{ch.slug}/review",
        json={
            "flagged_lines": [1],
            "comments": "Initial incomplete attempt.",
            "session_id": session_id,
        },
    )
    assert res1.status_code == 200
    sub1_id = res1.json()["submission_id"]

    # Submit second attempt
    res2 = client.post(
        f"/api/challenges/{ch.slug}/review",
        json={
            "flagged_lines": [6],
            "comments": "Accurate attempt targeting eval execution defect.",
            "session_id": session_id,
        },
    )
    assert res2.status_code == 200
    sub2_id = res2.json()["submission_id"]

    # Retrieve history using header
    hist_res = client.get(
        f"/api/challenges/{ch.slug}/submissions",
        headers={"X-Diffly-Session-Id": session_id},
    )
    assert hist_res.status_code == 200
    history = hist_res.json()

    assert len(history) == 2
    # Ordered descending: newest attempt first
    assert history[0]["id"] == sub2_id
    assert history[0]["attempt_number"] == 2
    assert history[0]["flagged_lines"] == [6]
    assert history[0]["comments"] == "Accurate attempt targeting eval execution defect."
    assert "score" in history[0]
    assert "feedback" in history[0]
    assert "detected_issues" in history[0]
    assert "missed_issues" in history[0]
    assert "created_at" in history[0]

    assert history[1]["id"] == sub1_id
    assert history[1]["attempt_number"] == 1
    assert history[1]["flagged_lines"] == [1]

    # Retrieve history using query param
    hist_query = client.get(
        f"/api/challenges/{ch.id}/submissions?session_id={session_id}",
    )
    assert hist_query.status_code == 200
    assert len(hist_query.json()) == 2


def test_get_submissions_history_authenticated_user(
    client: TestClient, session: Session
):
    """GET /submissions filters attempts by authenticated user_id."""
    challenges = seed_challenges(session)
    ch = challenges[0]

    user = User(
        email="historyuser@diffly.dev",
        username="historyuser",
        hashed_password="pw",
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    app.dependency_overrides[get_optional_current_user] = lambda: user
    try:
        # Attempt 1
        res1 = client.post(
            f"/api/challenges/{ch.slug}/review",
            json={
                "flagged_lines": [2],
                "comments": "First attempt with partial understanding.",
            },
        )
        assert res1.status_code == 200

        # Attempt 2
        res2 = client.post(
            f"/api/challenges/{ch.slug}/review",
            json={
                "flagged_lines": [6],
                "comments": "Second attempt with comprehensive eval explanation.",
            },
        )
        assert res2.status_code == 200

        hist_res = client.get(f"/api/challenges/{ch.slug}/submissions")
        assert hist_res.status_code == 200
        history = hist_res.json()

        assert len(history) == 2
        assert history[0]["attempt_number"] == 2
        assert history[0]["id"] == res2.json()["submission_id"]
        assert history[1]["attempt_number"] == 1
        assert history[1]["id"] == res1.json()["submission_id"]
    finally:
        app.dependency_overrides.pop(get_optional_current_user, None)


def test_get_submissions_history_isolation(client: TestClient, session: Session):
    """Submissions from one session are not visible to another."""
    challenges = seed_challenges(session)
    ch = challenges[0]

    # Session A submits
    client.post(
        f"/api/challenges/{ch.slug}/review",
        json={
            "flagged_lines": [6],
            "comments": "Session A review on eval.",
            "session_id": "session-A",
        },
    )

    # Session B submits
    client.post(
        f"/api/challenges/{ch.slug}/review",
        json={
            "flagged_lines": [6],
            "comments": "Session B review on eval.",
            "session_id": "session-B",
        },
    )

    # Query Session A
    res_a = client.get(
        f"/api/challenges/{ch.slug}/submissions",
        headers={"X-Diffly-Session-Id": "session-A"},
    )
    assert len(res_a.json()) == 1
    assert res_a.json()[0]["comments"] == "Session A review on eval."

    # Query unauthenticated request with no session ID returns empty list
    res_none = client.get(f"/api/challenges/{ch.slug}/submissions")
    assert res_none.status_code == 200
    assert res_none.json() == []


def test_get_submissions_history_not_found(client: TestClient, session: Session):
    """GET /submissions returns 404 for non-existent challenge."""
    seed_challenges(session)

    res = client.get("/api/challenges/non-existent-challenge-slug/submissions")
    assert res.status_code == 404
    assert res.json() == {"detail": "Challenge not found"}

    res_id = client.get("/api/challenges/999999/submissions")
    assert res_id.status_code == 404
    assert res_id.json() == {"detail": "Challenge not found"}


def test_review_evaluation_high_score_and_detected_issues(
    client: TestClient, session: Session
):
    """Submitting expected defect line and concept keywords yields high score."""
    challenges = seed_challenges(session)
    ch = next(c for c in challenges if c.slug == "agent-unsanitized-exec")

    # Lines 28-29 are eval(expression, self.allowed_names)
    payload = {
        "flagged_lines": [28, 29],
        "comments": (
            "Line 28 executes unsanitized user expression using eval(). "
            "This enables arbitrary code execution and remote code execution (RCE)."
        ),
        "session_id": "eval-pro-session",
    }

    res = client.post(f"/api/challenges/{ch.slug}/review", json=payload)
    assert res.status_code == 200
    data = res.json()

    assert data["score"] >= 80
    assert len(data["detected_issues"]) > 0
    assert data["detected_issues"][0]["id"] == "crit-rce-eval"
    assert len(data["missed_issues"]) == 0
