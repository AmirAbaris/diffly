"""Tests for user progress statistics and guest session claiming."""

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlmodel import Session

from backend.core.config import settings
from backend.models.submission import Submission
from backend.seed.seed_data import seed_challenges


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


def test_get_user_progress_guest_via_cookie(
    client: TestClient, session: Session, as_guest
):
    """Guest session metrics calculated accurately from signed guest cookie."""
    challenges = seed_challenges(session)
    ch1 = challenges[0]
    ch2 = challenges[1]
    sid = as_guest(client, "guest-session-456")

    sub1 = Submission(
        challenge_id=ch1.id,
        session_id=sid,
        score=85,
        comments="Great catch on the vulnerability",
        flagged_lines=[5],
    )
    sub2 = Submission(
        challenge_id=ch2.id,
        session_id=sid,
        score=60,
        comments="Partially spotted race condition",
        flagged_lines=[10],
    )
    session.add_all([sub1, sub2])
    session.commit()

    res = client.get("/api/user/progress")
    assert res.status_code == 200
    data = res.json()

    assert data["total_challenges"] == len(challenges)
    assert data["total_attempted"] == 2
    assert data["total_solved"] == 1  # 85 >= 80, 60 < 80
    assert data["average_score"] == 72.5  # (85 + 60) / 2
    assert data["streak_days"] == 1


def test_get_user_progress_ignores_raw_query_param_and_header(
    client: TestClient, session: Session
):
    """Raw session_id query param or X-Diffly-Session-Id header never exposes data."""
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

    res = client.get(
        "/api/user/progress?session_id=guest-param-789",
        headers={"X-Diffly-Session-Id": "guest-param-789"},
    )
    assert res.status_code == 200
    data = res.json()

    assert data["total_attempted"] == 0
    assert data["total_solved"] == 0
    assert data["average_score"] == 0.0


def test_get_user_progress_best_score_supersedes_earlier_attempt(
    client: TestClient, session: Session, as_guest
):
    """Re-attempts update solved status and average score using best score."""
    challenges = seed_challenges(session)
    ch = challenges[0]
    sid = as_guest(client, "guest-retry-123")

    sub_initial = Submission(
        challenge_id=ch.id,
        session_id=sid,
        score=50,
        comments="First attempt",
        flagged_lines=[1],
    )
    sub_retry = Submission(
        challenge_id=ch.id,
        session_id=sid,
        score=90,
        comments="Second attempt was much better",
        flagged_lines=[1, 2],
    )
    session.add_all([sub_initial, sub_retry])
    session.commit()

    res = client.get("/api/user/progress")
    assert res.status_code == 200
    data = res.json()

    assert data["total_attempted"] == 1
    assert data["total_solved"] == 1
    assert data["average_score"] == 90.0


def test_get_user_progress_streak_calculation(
    client: TestClient, session: Session, as_guest
):
    """Streak accurately counts consecutive active UTC days."""
    challenges = seed_challenges(session)
    ch = challenges[0]
    now = datetime.now(UTC)
    sid = as_guest(client, "guest-streak-xyz")

    # 3 consecutive days: today, yesterday, 2 days ago
    s1 = Submission(
        challenge_id=ch.id,
        session_id=sid,
        score=80,
        comments="Day 0 review",
        flagged_lines=[2],
        created_at=now,
    )
    s2 = Submission(
        challenge_id=ch.id,
        session_id=sid,
        score=80,
        comments="Day -1 review",
        flagged_lines=[2],
        created_at=now - timedelta(days=1),
    )
    s3 = Submission(
        challenge_id=ch.id,
        session_id=sid,
        score=80,
        comments="Day -2 review",
        flagged_lines=[2],
        created_at=now - timedelta(days=2),
    )
    # Day -5 review (broken streak before day -2)
    s4 = Submission(
        challenge_id=ch.id,
        session_id=sid,
        score=80,
        comments="Day -5 review",
        flagged_lines=[2],
        created_at=now - timedelta(days=5),
    )
    session.add_all([s1, s2, s3, s4])
    session.commit()

    res = client.get("/api/user/progress")
    assert res.status_code == 200
    data = res.json()
    assert data["streak_days"] == 3


def test_get_user_progress_streak_zero_when_expired(
    client: TestClient, session: Session, as_guest
):
    """Streak is zero if no submissions exist for today or yesterday."""
    challenges = seed_challenges(session)
    ch = challenges[0]
    now = datetime.now(UTC)
    sid = as_guest(client, "guest-expired-streak")

    old_sub = Submission(
        challenge_id=ch.id,
        session_id=sid,
        score=80,
        comments="Old review from 4 days ago",
        flagged_lines=[1],
        created_at=now - timedelta(days=4),
    )
    session.add(old_sub)
    session.commit()

    res = client.get("/api/user/progress")
    assert res.status_code == 200
    assert res.json()["streak_days"] == 0


def test_claim_session_requires_auth(client: TestClient, session: Session):
    """POST /api/user/claim-session rejects unauthenticated requests with 401."""
    res = client.post("/api/user/claim-session", json={})
    assert res.status_code == 401
    assert "detail" in res.json()


def test_claim_session_missing_guest_cookie(register_user, login_as):
    """POST /api/user/claim-session without signed guest cookie returns 400."""
    register_user("claim_tester")
    auth_client = login_as("claim_tester")

    res = auth_client.post("/api/user/claim-session", json={})
    assert res.status_code == 400
    assert "guest session cookie" in res.json()["detail"].lower()


def test_claim_session_success_and_idempotence(
    session: Session, register_user, login_as, as_guest
):
    """Unclaimed guest submissions transfer to authenticated user idempotently."""
    challenges = seed_challenges(session)
    user = register_user("alice_reviewer")
    auth_client = login_as("alice_reviewer")
    sid = as_guest(auth_client, "guest-claimable-999")

    sub1 = Submission(
        challenge_id=challenges[0].id,
        session_id=sid,
        user_id=None,
        score=88,
        comments="Guest review 1",
        flagged_lines=[1],
    )
    sub2 = Submission(
        challenge_id=challenges[1].id,
        session_id=sid,
        user_id=None,
        score=92,
        comments="Guest review 2",
        flagged_lines=[2],
    )
    session.add_all([sub1, sub2])
    session.commit()

    # Claim guest submissions via signed guest cookie
    res = auth_client.post("/api/user/claim-session")
    assert res.status_code == 200
    claim_data = res.json()
    assert claim_data["claimed_count"] == 2
    assert claim_data["user_id"] == user["id"]
    assert claim_data["session_id"] == sid
    assert auth_client.cookies.get(settings.GUEST_COOKIE_NAME) is None

    # Verify DB rows are now linked to user and session_id is cleared
    session.refresh(sub1)
    session.refresh(sub2)
    assert sub1.user_id == user["id"]
    assert sub1.session_id is None
    assert sub2.user_id == user["id"]
    assert sub2.session_id is None

    # Idempotence: replaying the same signed guest cookie claims 0 rows
    as_guest(auth_client, sid)
    res_repeat = auth_client.post("/api/user/claim-session")
    assert res_repeat.status_code == 200
    assert res_repeat.json()["claimed_count"] == 0

    # User progress endpoint reflects claimed submissions
    progress_res = auth_client.get("/api/user/progress")
    assert progress_res.status_code == 200
    user_prog = progress_res.json()
    assert user_prog["total_attempted"] == 2
    assert user_prog["total_solved"] == 2
    assert user_prog["average_score"] == 90.0


def test_claim_session_rejects_raw_header_and_query(
    session: Session, register_user, login_as
):
    """Claiming rejects unsigned X-Diffly-Session-Id header or query param with 403."""
    challenges = seed_challenges(session)
    register_user("bob_reviewer")
    auth_client = login_as("bob_reviewer")

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

    res_header = auth_client.post(
        "/api/user/claim-session",
        headers={"X-Diffly-Session-Id": "guest-header-claim"},
    )
    assert res_header.status_code == 403

    res_query = auth_client.post(
        "/api/user/claim-session?session_id=guest-header-claim",
    )
    assert res_query.status_code == 403

    session.refresh(sub)
    assert sub.user_id is None


def test_user_progress_excludes_private_custom_challenges_and_claimed_session_leaks(
    client: TestClient, session: Session, register_user, login_as, as_guest
):
    """Private challenges do not inflate progress, and claimed sessions don't leak."""
    from backend.models.challenge import Category, Challenge, Difficulty, Language

    challenges = seed_challenges(session)
    public_total = len(challenges)
    user = register_user("progress_tester")
    auth_client = login_as("progress_tester")
    sid = as_guest(auth_client, "guest-prog-sid")

    # Create a private custom challenge
    private_ch = Challenge(
        slug="private-custom-prog-ch",
        title="Private Custom Challenge",
        difficulty=Difficulty.MEDIUM,
        category=Category.SECURITY,
        language=Language.PYTHON,
        description="Private",
        code_snippet="x = 1",
        is_public=False,
        user_id=None,
        session_id=sid,
    )
    session.add(private_ch)
    session.commit()
    session.refresh(private_ch)

    # Submit high score on 1 public challenge and 1 private custom challenge
    sub_public = Submission(
        challenge_id=challenges[0].id,
        session_id=sid,
        user_id=None,
        score=90,
        comments="Solved public challenge",
        flagged_lines=[1],
    )
    sub_private = Submission(
        challenge_id=private_ch.id,
        session_id=sid,
        user_id=None,
        score=100,
        comments="Solved private custom challenge",
        flagged_lines=[1],
    )
    session.add_all([sub_public, sub_private])
    session.commit()

    # Claim session via /api/user/claim-session
    claim_res = auth_client.post("/api/user/claim-session")
    assert claim_res.status_code == 200
    assert claim_res.json()["claimed_count"] == 3  # 2 submissions + 1 custom challenge
    assert claim_res.json()["claimed_challenges_count"] == 1

    session.refresh(private_ch)
    assert private_ch.user_id == user["id"]
    assert private_ch.session_id is None

    # Progress for authenticated user counts only public catalog challenges for mastery
    prog_res = auth_client.get("/api/user/progress")
    assert prog_res.status_code == 200
    prog_data = prog_res.json()
    assert prog_data["total_challenges"] == public_total
    assert prog_data["total_attempted"] == 1
    assert prog_data["total_solved"] == 1
    assert prog_data["average_score"] == 90.0
    assert prog_data["streak_days"] == 1

    # Logged-out visitor with old guest cookie does not see claimed user's progress
    as_guest(client, sid)
    anon_prog = client.get("/api/user/progress")
    assert anon_prog.status_code == 200
    assert anon_prog.json()["total_attempted"] == 0
    assert anon_prog.json()["total_solved"] == 0
    assert prog_data["custom_attempted"] == 1
    assert prog_data["custom_solved"] == 1


def test_user_progress_and_analytics_timezone_aware_streaks(
    client: TestClient, session: Session, as_guest, monkeypatch
):
    """Streak dates and activity buckets convert UTC timestamps to caller timezone."""
    from unittest.mock import patch

    challenges = seed_challenges(session)
    ch = challenges[0]
    sid = as_guest(client, "guest-tz-streak")

    # 2026-11-20 22:30 UTC is still Nov 20 in UTC / America/New_York,
    # but already Nov 21 in Asia/Tokyo (UTC+9).
    sub_late_utc = Submission(
        challenge_id=ch.id,
        session_id=sid,
        score=85,
        comments="Late UTC night review",
        flagged_lines=[1],
        created_at=datetime(2026, 11, 20, 22, 30, tzinfo=UTC),
    )
    sub_prev_utc = Submission(
        challenge_id=ch.id,
        session_id=sid,
        score=90,
        comments="Previous day review",
        flagged_lines=[1],
        created_at=datetime(2026, 11, 20, 10, 0, tzinfo=UTC),
    )
    session.add_all([sub_late_utc, sub_prev_utc])
    session.commit()

    fixed_now = datetime(2026, 11, 21, 1, 0, tzinfo=UTC)

    class FixedDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            if tz is not None:
                return fixed_now.astimezone(tz)
            return fixed_now.replace(tzinfo=None)

    with patch("api.routes.user.datetime", FixedDatetime):
        # UTC: today is Nov 21 and both submissions were on Nov 20 -> streak 1
        res_utc = client.get("/api/user/progress?tz=UTC")
        assert res_utc.status_code == 200
        assert res_utc.json()["timezone"] == "UTC"
        assert res_utc.json()["streak_days"] == 1

        # Asia/Tokyo (UTC+9): 10:00Z is Nov 20, 22:30Z is Nov 21 -> streak 2
        res_tokyo = client.get("/api/user/progress?tz=Asia/Tokyo")
        assert res_tokyo.status_code == 200
        assert res_tokyo.json()["timezone"] == "Asia/Tokyo"
        assert res_tokyo.json()["streak_days"] == 2

        analytics_tokyo = client.get("/api/user/analytics?tz=Asia/Tokyo&days=7")
        assert analytics_tokyo.status_code == 200
        a_data = analytics_tokyo.json()
        assert a_data["timezone"] == "Asia/Tokyo"
        assert a_data["days"] == 7
        assert a_data["streak_days"] == 2
        assert a_data["longest_streak_days"] == 2
        assert len(a_data["activity"]) == 7
        assert a_data["activity"][-1] == {"date": "2026-11-21", "count": 1}
        assert a_data["activity"][-2] == {"date": "2026-11-20", "count": 1}


def test_user_analytics_precision_recall_and_custom_separation(
    client: TestClient, session: Session, as_guest
):
    """Analytics computes precision/recall trends and isolates custom stats."""
    from backend.models.challenge import Category, Challenge, Difficulty, Language

    challenges = seed_challenges(session)
    ch = challenges[0]
    sid = as_guest(client, "guest-analytics-pr")

    private_ch = Challenge(
        slug="analytics-private-custom",
        title="Private Custom",
        difficulty=Difficulty.EASY,
        category=Category.SECURITY,
        language=Language.PYTHON,
        description="Custom",
        code_snippet="x = 1",
        is_public=False,
        session_id=sid,
    )
    session.add(private_ch)
    session.commit()
    session.refresh(private_ch)

    now = datetime.now(UTC)
    # 2 flagged lines, 1 false positive -> precision 50.0%
    # 1 detected issue, 1 missed issue -> recall 50.0%
    sub_pub = Submission(
        challenge_id=ch.id,
        session_id=sid,
        score=65,
        line_precision_score=50.0,
        flagged_lines=[1, 2],
        false_positive_lines=[2],
        detected_issues=[{"id": "d1", "title": "Bug", "severity": "high"}],
        missed_issues=[{"id": "d2", "title": "Leak", "severity": "medium"}],
        comments="Found one bug",
        created_at=now - timedelta(days=2),
    )
    # Custom submission counts in custom & activity, not category_mastery
    sub_custom = Submission(
        challenge_id=private_ch.id,
        session_id=sid,
        score=95,
        line_precision_score=100.0,
        flagged_lines=[1],
        false_positive_lines=[],
        detected_issues=[{"id": "c1", "title": "Custom", "severity": "high"}],
        missed_issues=[],
        comments="Solved custom",
        created_at=now,
    )
    session.add_all([sub_pub, sub_custom])
    session.commit()

    res = client.get("/api/user/analytics?days=30")
    assert res.status_code == 200
    data = res.json()
    assert data["total_submissions"] == 2
    assert data["custom"] == {"attempted": 1, "solved": 1, "submissions": 1}
    assert len(data["trends"]) == 1
    assert data["trends"][0]["precision"] == 50.0
    assert data["trends"][0]["recall"] == 50.0
    assert data["trends"][0]["average_score"] == 65.0

    ch_cat = ch.category.value if hasattr(ch.category, "value") else str(ch.category)
    cat_item = next(c for c in data["category_mastery"] if c["category"] == ch_cat)
    assert cat_item["attempted"] == 1
    assert cat_item["solved"] == 0
    assert cat_item["precision"] == 50.0
    assert cat_item["recall"] == 50.0

    # Older submission outside 30-day window appears in 90-day window
    session.add(
        Submission(
            challenge_id=ch.id,
            session_id=sid,
            score=75,
            comments="Older submission",
            flagged_lines=[1],
            created_at=now - timedelta(days=45),
        )
    )
    session.commit()
    assert client.get("/api/user/analytics?days=30").json()["total_submissions"] == 2
    assert client.get("/api/user/analytics?days=90").json()["total_submissions"] == 3

    # Validation checks on tz and days
    assert client.get("/api/user/progress?tz=Mars/Olympus").status_code == 422
    assert client.get("/api/user/analytics?days=3").status_code == 422
    assert client.get("/api/user/analytics?days=500").status_code == 422
