"""Tests for user progress statistics and guest session claiming."""

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlmodel import Session

from backend.models.submission import Submission
from backend.models.user import User
from backend.seed.seed_data import seed_challenges


def create_test_user(session: Session, username: str = "coder1") -> User:
    user = User(
        email=f"{username}@example.com",
        username=username,
        hashed_password="hashed_pw_secret",
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def test_get_user_progress_empty_no_identity(client: TestClient, session: Session):
    """Unauthenticated visitor without session gets zeroed progress."""
    challenges = seed_challenges(session)
    total_challenges = len(challenges)

    res = client.get("/api/user/progress")
    assert res.status_code == 200
    data = res.json()

    assert data["total_challenges"] == total_challenges
    assert data["total_attempted"] == 0
    assert data["total_solved"] == 0
    assert data["average_score"] == 0.0
    assert data["streak_days"] == 0
    assert isinstance(data["categories_breakdown"], list)
    assert len(data["categories_breakdown"]) >= 4

    for cat in data["categories_breakdown"]:
        assert cat["solved"] == 0
        assert cat["accuracy"] == 0.0
        assert cat["total"] >= 0


def test_get_user_progress_guest_via_header(client: TestClient, session: Session):
    """Guest session metrics calculated accurately from session header."""
    challenges = seed_challenges(session)
    ch1 = challenges[0]
    ch2 = challenges[1]

    sub1 = Submission(
        challenge_id=ch1.id,
        session_id="guest-session-456",
        score=85,
        comments="Great catch on the vulnerability",
        flagged_lines=[5],
    )
    sub2 = Submission(
        challenge_id=ch2.id,
        session_id="guest-session-456",
        score=60,
        comments="Partially spotted race condition",
        flagged_lines=[10],
    )
    session.add_all([sub1, sub2])
    session.commit()

    res = client.get(
        "/api/user/progress",
        headers={"X-Diffly-Session-Id": "guest-session-456"},
    )
    assert res.status_code == 200
    data = res.json()

    assert data["total_challenges"] == len(challenges)
    assert data["total_attempted"] == 2
    assert data["total_solved"] == 1  # 85 >= 80, 60 < 80
    assert data["average_score"] == 72.5  # (85 + 60) / 2
    assert data["streak_days"] == 1


def test_get_user_progress_guest_via_query_param(client: TestClient, session: Session):
    """Guest session metrics accessible via query param."""
    challenges = seed_challenges(session)
    ch = challenges[0]

    sub = Submission(
        challenge_id=ch.id,
        session_id="guest-param-789",
        score=95,
        comments="Clean review",
        flagged_lines=[3],
    )
    session.add(sub)
    session.commit()

    res = client.get("/api/user/progress?session_id=guest-param-789")
    assert res.status_code == 200
    data = res.json()

    assert data["total_attempted"] == 1
    assert data["total_solved"] == 1
    assert data["average_score"] == 95.0


def test_get_user_progress_best_score_supersedes_earlier_attempt(
    client: TestClient, session: Session
):
    """Re-attempts update solved status and average score using best score."""
    challenges = seed_challenges(session)
    ch = challenges[0]

    sub_initial = Submission(
        challenge_id=ch.id,
        session_id="guest-retry-123",
        score=50,
        comments="First attempt",
        flagged_lines=[1],
    )
    sub_retry = Submission(
        challenge_id=ch.id,
        session_id="guest-retry-123",
        score=90,
        comments="Second attempt was much better",
        flagged_lines=[1, 2],
    )
    session.add_all([sub_initial, sub_retry])
    session.commit()

    res = client.get(
        "/api/user/progress",
        headers={"X-Diffly-Session-Id": "guest-retry-123"},
    )
    assert res.status_code == 200
    data = res.json()

    assert data["total_attempted"] == 1
    assert data["total_solved"] == 1
    assert data["average_score"] == 90.0


def test_get_user_progress_streak_calculation(client: TestClient, session: Session):
    """Streak accurately counts consecutive active UTC days."""
    challenges = seed_challenges(session)
    ch = challenges[0]
    now = datetime.now(UTC)

    # 3 consecutive days: today, yesterday, 2 days ago
    s1 = Submission(
        challenge_id=ch.id,
        session_id="guest-streak-xyz",
        score=80,
        comments="Day 0 review",
        flagged_lines=[2],
        created_at=now,
    )
    s2 = Submission(
        challenge_id=ch.id,
        session_id="guest-streak-xyz",
        score=80,
        comments="Day -1 review",
        flagged_lines=[2],
        created_at=now - timedelta(days=1),
    )
    s3 = Submission(
        challenge_id=ch.id,
        session_id="guest-streak-xyz",
        score=80,
        comments="Day -2 review",
        flagged_lines=[2],
        created_at=now - timedelta(days=2),
    )
    # Day -5 review (broken streak before day -2)
    s4 = Submission(
        challenge_id=ch.id,
        session_id="guest-streak-xyz",
        score=80,
        comments="Day -5 review",
        flagged_lines=[2],
        created_at=now - timedelta(days=5),
    )
    session.add_all([s1, s2, s3, s4])
    session.commit()

    res = client.get(
        "/api/user/progress",
        headers={"X-Diffly-Session-Id": "guest-streak-xyz"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["streak_days"] == 3


def test_get_user_progress_streak_zero_when_expired(
    client: TestClient, session: Session
):
    """Streak is zero if no submissions exist for today or yesterday."""
    challenges = seed_challenges(session)
    ch = challenges[0]
    now = datetime.now(UTC)

    old_sub = Submission(
        challenge_id=ch.id,
        session_id="guest-expired-streak",
        score=80,
        comments="Old review from 4 days ago",
        flagged_lines=[1],
        created_at=now - timedelta(days=4),
    )
    session.add(old_sub)
    session.commit()

    res = client.get(
        "/api/user/progress",
        headers={"X-Diffly-Session-Id": "guest-expired-streak"},
    )
    assert res.status_code == 200
    assert res.json()["streak_days"] == 0


def test_claim_session_requires_auth(client: TestClient, session: Session):
    """POST /api/user/claim-session rejects unauthenticated requests with 401."""
    res = client.post(
        "/api/user/claim-session",
        json={"session_id": "guest-anonymous-111"},
    )
    assert res.status_code == 401
    assert "detail" in res.json()


def test_claim_session_missing_session_id(client: TestClient, session: Session):
    """POST /api/user/claim-session without session_id returns 400."""
    user = create_test_user(session, username="claim_tester")

    res = client.post(
        "/api/user/claim-session",
        headers={"x-user-id": str(user.id)},
        json={},
    )
    assert res.status_code == 400
    assert "session_id is required" in res.json()["detail"]


def test_claim_session_success_and_idempotence(client: TestClient, session: Session):
    """Unclaimed guest submissions transfer to authenticated user idempotently."""
    challenges = seed_challenges(session)
    user = create_test_user(session, username="alice_reviewer")

    sub1 = Submission(
        challenge_id=challenges[0].id,
        session_id="guest-claimable-999",
        user_id=None,
        score=88,
        comments="Guest review 1",
        flagged_lines=[1],
    )
    sub2 = Submission(
        challenge_id=challenges[1].id,
        session_id="guest-claimable-999",
        user_id=None,
        score=92,
        comments="Guest review 2",
        flagged_lines=[2],
    )
    session.add_all([sub1, sub2])
    session.commit()

    # Claim guest submissions
    res = client.post(
        "/api/user/claim-session",
        headers={"x-user-id": str(user.id)},
        json={"session_id": "guest-claimable-999"},
    )
    assert res.status_code == 200
    claim_data = res.json()
    assert claim_data["claimed_count"] == 2
    assert claim_data["user_id"] == user.id
    assert claim_data["session_id"] == "guest-claimable-999"

    # Verify DB rows are now linked to user
    session.refresh(sub1)
    session.refresh(sub2)
    assert sub1.user_id == user.id
    assert sub2.user_id == user.id

    # Idempotence: second claim call finds 0 unclaimed rows
    res_repeat = client.post(
        "/api/user/claim-session",
        headers={"x-user-id": str(user.id)},
        json={"session_id": "guest-claimable-999"},
    )
    assert res_repeat.status_code == 200
    assert res_repeat.json()["claimed_count"] == 0

    # User progress endpoint reflects claimed submissions
    progress_res = client.get(
        "/api/user/progress",
        headers={"x-user-id": str(user.id)},
    )
    assert progress_res.status_code == 200
    user_prog = progress_res.json()
    assert user_prog["total_attempted"] == 2
    assert user_prog["total_solved"] == 2
    assert user_prog["average_score"] == 90.0


def test_claim_session_via_header(client: TestClient, session: Session):
    """Claiming also accepts session_id from X-Diffly-Session-Id header."""
    challenges = seed_challenges(session)
    user = create_test_user(session, username="bob_reviewer")

    sub = Submission(
        challenge_id=challenges[0].id,
        session_id="guest-header-claim",
        user_id=None,
        score=75,
        comments="Bob guest submission",
        flagged_lines=[4],
    )
    session.add(sub)
    session.commit()

    res = client.post(
        "/api/user/claim-session",
        headers={
            "x-user-id": str(user.id),
            "X-Diffly-Session-Id": "guest-header-claim",
        },
    )
    assert res.status_code == 200
    assert res.json()["claimed_count"] == 1
    assert res.json()["session_id"] == "guest-header-claim"

    session.refresh(sub)
    assert sub.user_id == user.id
