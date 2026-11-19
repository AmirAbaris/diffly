"""Tests for review submission REST API and result persistence."""

from fastapi.testclient import TestClient
from sqlmodel import Session

from backend.core.config import settings
from backend.models.submission import Submission
from backend.seed.seed_data import seed_challenges


def test_submit_review_guest_via_signed_cookie(
    client: TestClient, session: Session, as_guest
):
    """Guest user submits review using an existing signed guest cookie."""
    challenges = seed_challenges(session)
    ch = challenges[0]
    guest_id = as_guest(client, "guest-session-abc-123")

    payload = {
        "flagged_lines": [6],
        "comments": (
            "The eval function executes unsanitized user expression "
            "without safe globals."
        ),
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
    assert data["flagged_lines"] == [6]
    assert data["comments"] == payload["comments"]

    # Verify database persistence
    saved = session.get(Submission, data["submission_id"])
    assert saved is not None
    assert saved.challenge_id == ch.id
    assert saved.user_id is None
    assert saved.session_id == guest_id
    assert saved.score == data["score"]
    assert saved.feedback == data["feedback"]
    assert saved.get_flagged_lines() == [6]
    assert saved.comments == payload["comments"]
    assert len(saved.get_detected_issues()) == len(data["detected_issues"])


def test_submit_review_ignores_raw_header_and_body_session_id(
    client: TestClient, session: Session
):
    """Server ignores unsigned X-Diffly-Session-Id and body session_id."""
    challenges = seed_challenges(session)
    ch = challenges[0]

    payload = {
        "flagged_lines": [6],
        "comments": "Critical vulnerability: eval arbitrary code execution.",
        "session_id": "forged-body-session",
    }
    headers = {"X-Diffly-Session-Id": "forged-header-session"}

    res = client.post(
        f"/api/challenges/{ch.id}/review",
        json=payload,
        headers=headers,
    )
    assert res.status_code == 200
    assert "X-Diffly-Session-Id" not in res.headers
    data = res.json()

    saved = session.get(Submission, data["submission_id"])
    assert saved is not None
    assert saved.user_id is None
    assert saved.session_id is not None
    assert saved.session_id.startswith("g_")
    assert saved.session_id not in ("forged-body-session", "forged-header-session")


def test_submit_review_guest_mints_signed_cookie(client: TestClient, session: Session):
    """Guest submitting without cookie receives auto-minted signed guest cookie."""
    challenges = seed_challenges(session)
    ch = challenges[0]

    payload = {
        "flagged_lines": [6],
        "comments": "Arbitrary code execution via python eval function.",
    }

    res = client.post(f"/api/challenges/{ch.slug}/review", json=payload)
    assert res.status_code == 200
    assert settings.GUEST_COOKIE_NAME in res.cookies
    data = res.json()

    saved = session.get(Submission, data["submission_id"])
    assert saved is not None
    assert saved.session_id is not None
    assert saved.session_id.startswith("g_")
    assert data["session_id"] == saved.session_id


def test_submit_review_authenticated_user(session: Session, register_user, login_as):
    """Authenticated user submission is linked to user_id with null session_id."""
    challenges = seed_challenges(session)
    ch = challenges[0]

    user = register_user("developer")
    auth_client = login_as("developer")

    payload = {
        "flagged_lines": [6],
        "comments": "Use of eval() on untrusted user calculator expression.",
    }
    res = auth_client.post(f"/api/challenges/{ch.slug}/review", json=payload)
    assert res.status_code == 200
    data = res.json()

    saved = session.get(Submission, data["submission_id"])
    assert saved is not None
    assert saved.user_id == user["id"]
    assert saved.session_id is None


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
    assert settings.GUEST_COOKIE_NAME not in res_slug.cookies

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
    """GET /submissions filters attempts by guest cookie and returns descending."""
    challenges = seed_challenges(session)
    ch = challenges[0]

    # Submit first attempt (auto-mints signed guest cookie)
    res1 = client.post(
        f"/api/challenges/{ch.slug}/review",
        json={
            "flagged_lines": [1],
            "comments": "Initial incomplete attempt.",
        },
    )
    assert res1.status_code == 200
    sub1_id = res1.json()["submission_id"]

    # Submit second attempt (reuses same guest cookie jar)
    res2 = client.post(
        f"/api/challenges/{ch.slug}/review",
        json={
            "flagged_lines": [6],
            "comments": "Accurate attempt targeting eval execution defect.",
        },
    )
    assert res2.status_code == 200
    sub2_id = res2.json()["submission_id"]

    # Retrieve history using signed guest cookie
    hist_res = client.get(f"/api/challenges/{ch.slug}/submissions")
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

    # Raw query param without signed cookie returns empty list
    guest_sid = res1.json()["session_id"]
    client.cookies.clear()
    hist_query = client.get(
        f"/api/challenges/{ch.id}/submissions?session_id={guest_sid}",
    )
    assert hist_query.status_code == 200
    assert hist_query.json() == []


def test_get_submissions_history_authenticated_user(
    session: Session, register_user, login_as
):
    """GET /submissions filters attempts by authenticated user_id."""
    challenges = seed_challenges(session)
    ch = challenges[0]

    register_user("historyuser")
    auth_client = login_as("historyuser")

    # Attempt 1
    res1 = auth_client.post(
        f"/api/challenges/{ch.slug}/review",
        json={
            "flagged_lines": [2],
            "comments": "First attempt with partial understanding.",
        },
    )
    assert res1.status_code == 200

    # Attempt 2
    res2 = auth_client.post(
        f"/api/challenges/{ch.slug}/review",
        json={
            "flagged_lines": [6],
            "comments": "Second attempt with comprehensive eval explanation.",
        },
    )
    assert res2.status_code == 200

    hist_res = auth_client.get(f"/api/challenges/{ch.slug}/submissions")
    assert hist_res.status_code == 200
    history = hist_res.json()

    assert len(history) == 2
    assert history[0]["attempt_number"] == 2
    assert history[0]["id"] == res2.json()["submission_id"]
    assert history[1]["attempt_number"] == 1
    assert history[1]["id"] == res1.json()["submission_id"]


def test_get_submissions_history_isolation(client_factory, session: Session):
    """Submissions from one guest cookie jar are not visible to another."""
    challenges = seed_challenges(session)
    ch = challenges[0]

    client_a = client_factory()
    client_b = client_factory()
    client_none = client_factory()

    # Session A submits
    client_a.post(
        f"/api/challenges/{ch.slug}/review",
        json={
            "flagged_lines": [6],
            "comments": "Session A review on eval.",
        },
    )

    # Session B submits
    client_b.post(
        f"/api/challenges/{ch.slug}/review",
        json={
            "flagged_lines": [6],
            "comments": "Session B review on eval.",
        },
    )

    # Query Session A
    res_a = client_a.get(f"/api/challenges/{ch.slug}/submissions")
    assert len(res_a.json()) == 1
    assert res_a.json()[0]["comments"] == "Session A review on eval."

    # Query unauthenticated request with no cookie returns empty list
    res_none = client_none.get(f"/api/challenges/{ch.slug}/submissions")
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
    }

    res = client.post(f"/api/challenges/{ch.slug}/review", json=payload)
    assert res.status_code == 200
    data = res.json()

    assert data["score"] >= 80
    assert len(data["detected_issues"]) > 0
    assert data["detected_issues"][0]["id"] == "crit-rce-eval"
    assert len(data["missed_issues"]) == 0


def test_submit_review_gates_spoilers_until_exhausted_or_revealed(
    client: TestClient, session: Session
):
    """Attempts 1-2 hide spoilers; attempt 3 and reveal=true unlock them."""
    challenges = seed_challenges(session)
    ch = next(c for c in challenges if c.slug == "agent-unsanitized-exec")

    stuffing_payload = {
        "flagged_lines": [1],
        "comments": "eval exec rce remote code execution builtins ast arbitrary code",
    }

    # Attempt 1: keyword stuffing scores 0 and missed_issues details stay hidden
    res1 = client.post(f"/api/challenges/{ch.slug}/review", json=stuffing_payload)
    assert res1.status_code == 200
    d1 = res1.json()
    assert d1["score"] == 0
    assert len(d1["missed_issues"]) >= 1
    assert d1["missed_issues"][0]["expected_lines"] == []
    assert d1["missed_issues"][0]["missing_keywords"] == []
    assert d1["missed_issues"][0]["explanation"] == ""
    assert "Expected line" not in d1["feedback"]
    assert "Root Cause:" not in d1["feedback"]

    # History stays gated before passing or exhausting attempts
    hist1 = client.get(f"/api/challenges/{ch.slug}/submissions")
    assert hist1.status_code == 200
    assert hist1.json()[0]["missed_issues"][0]["expected_lines"] == []

    # Attempt 2: still gated
    res2 = client.post(f"/api/challenges/{ch.slug}/review", json=stuffing_payload)
    assert res2.status_code == 200
    d2 = res2.json()
    assert d2["missed_issues"][0]["expected_lines"] == []
    assert d2["missed_issues"][0]["explanation"] == ""

    # Attempt 3: exhausted attempts unlock missed_issues spoilers
    res3 = client.post(f"/api/challenges/{ch.slug}/review", json=stuffing_payload)
    assert res3.status_code == 200
    d3 = res3.json()
    assert len(d3["missed_issues"][0]["expected_lines"]) > 0
    assert len(d3["missed_issues"][0]["explanation"]) > 0
    assert "Expected line(s):" in d3["feedback"]


def test_submit_review_explicit_reveal_unlocks_missed_issues(
    client_factory, session: Session
):
    """Passing ?reveal=true unlocks missed_issues details on the first attempt."""
    challenges = seed_challenges(session)
    ch = next(c for c in challenges if c.slug == "agent-unsanitized-exec")
    fresh_client = client_factory()

    res = fresh_client.post(
        f"/api/challenges/{ch.slug}/review?reveal=true",
        json={"flagged_lines": [1], "comments": "First blind guess on wrong line."},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["score"] == 0
    assert len(data["missed_issues"][0]["expected_lines"]) > 0
    assert len(data["missed_issues"][0]["explanation"]) > 0
