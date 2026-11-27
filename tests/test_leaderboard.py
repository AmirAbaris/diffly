"""Behavioral tests for public leaderboard ranking, filtering, and visibility."""

from datetime import UTC, datetime, timedelta
from itertools import count
from typing import Any

from fastapi.testclient import TestClient
from sqlmodel import Session

from backend.models.challenge import Category, Challenge, Difficulty, Language
from backend.models.submission import Submission
from backend.models.user import User


_SLUG_COUNTER = count(1)

TOP_LEVEL_KEYS = {
    "window",
    "category",
    "limit",
    "offset",
    "total_entries",
    "total_catalog_challenges",
    "entries",
    "current_user",
}
ENTRY_KEYS = {
    "rank",
    "username",
    "points",
    "challenges_solved",
    "hard_solved",
    "average_score",
    "is_current_user",
}
CURRENT_USER_KEYS = {
    "rank",
    "username",
    "points",
    "challenges_solved",
    "hard_solved",
    "average_score",
    "percentile",
    "hidden",
}
FORBIDDEN_PII_KEYS = {
    "email",
    "avatar_url",
    "user_id",
    "github_id",
    "github_login",
    "session_id",
    "hashed_password",
    "leaderboard_opt_out",
}


def _make_challenge(
    session: Session,
    *,
    difficulty: Difficulty = Difficulty.EASY,
    category: Category = Category.SECURITY,
    is_public: bool = True,
    user_id: int | None = None,
    session_id: str | None = None,
    share_token: str | None = None,
) -> Challenge:
    idx = next(_SLUG_COUNTER)
    ch = Challenge(
        slug=f"lb-ch-{idx}",
        title=f"Leaderboard Challenge {idx}",
        difficulty=difficulty,
        category=category,
        language=Language.PYTHON,
        description="Find defect",
        code_snippet="x = eval(inp)\n",
        is_public=is_public,
        user_id=user_id,
        session_id=session_id,
        share_token=share_token,
    )
    session.add(ch)
    session.commit()
    session.refresh(ch)
    return ch


def _add_submission(
    session: Session,
    *,
    challenge_id: int,
    score: int,
    user_id: int | None = None,
    session_id: str | None = None,
    created_at: datetime | None = None,
) -> Submission:
    sub = Submission(
        challenge_id=challenge_id,
        user_id=user_id,
        session_id=session_id,
        flagged_lines=[1],
        comments="Test review",
        score=score,
        created_at=created_at or datetime.now(UTC),
    )
    session.add(sub)
    session.commit()
    session.refresh(sub)
    return sub


def _assert_whitelist_and_no_pii(payload: dict[str, Any]) -> None:
    assert set(payload.keys()) == TOP_LEVEL_KEYS
    assert not (FORBIDDEN_PII_KEYS & set(payload.keys()))
    for entry in payload["entries"]:
        assert set(entry.keys()) == ENTRY_KEYS
        assert not (FORBIDDEN_PII_KEYS & set(entry.keys()))
    if payload["current_user"] is not None:
        assert set(payload["current_user"].keys()) == CURRENT_USER_KEYS
        assert not (FORBIDDEN_PII_KEYS & set(payload["current_user"].keys()))


def test_difficulty_weighting_threshold_and_best_score_deduplication(
    client: TestClient,
    session: Session,
    register_user,
    login_as,
):
    easy = _make_challenge(session, difficulty=Difficulty.EASY)
    medium = _make_challenge(session, difficulty=Difficulty.MEDIUM)
    hard = _make_challenge(session, difficulty=Difficulty.HARD)
    unsolved_ch = _make_challenge(session, difficulty=Difficulty.HARD)

    alice = register_user("alice_weighted")
    bob = register_user("bob_boundary")
    carol = register_user("carol_unsolved")

    _add_submission(session, challenge_id=easy.id, user_id=alice["id"], score=60)
    _add_submission(session, challenge_id=easy.id, user_id=alice["id"], score=90)
    _add_submission(session, challenge_id=easy.id, user_id=alice["id"], score=82)
    _add_submission(session, challenge_id=medium.id, user_id=alice["id"], score=85)
    _add_submission(session, challenge_id=hard.id, user_id=alice["id"], score=80)
    _add_submission(session, challenge_id=unsolved_ch.id, user_id=alice["id"], score=79)

    # Bob: exact threshold score 80 on easy -> 80 points
    _add_submission(session, challenge_id=easy.id, user_id=bob["id"], score=80)
    # Carol: only score 79 -> excluded from leaderboard
    _add_submission(session, challenge_id=hard.id, user_id=carol["id"], score=79)

    res = client.get("/api/leaderboard")
    assert res.status_code == 200
    assert res.headers["Cache-Control"] == "private, no-store"
    assert "Cookie" in {v.strip() for v in res.headers.get("Vary", "").split(",")}
    assert res.headers["X-Total-Count"] == "2"

    data = res.json()
    _assert_whitelist_and_no_pii(data)
    assert data["total_entries"] == 2
    assert data["total_catalog_challenges"] == 4
    assert data["current_user"] is None
    assert data["entries"] == [
        {
            "rank": 1,
            "username": "alice_weighted",
            "points": 500,
            "challenges_solved": 3,
            "hard_solved": 1,
            "average_score": 85.0,
            "is_current_user": False,
        },
        {
            "rank": 2,
            "username": "bob_boundary",
            "points": 80,
            "challenges_solved": 1,
            "hard_solved": 0,
            "average_score": 80.0,
            "is_current_user": False,
        },
    ]

    carol_client = login_as("carol_unsolved")
    carol_data = carol_client.get("/api/leaderboard").json()
    _assert_whitelist_and_no_pii(carol_data)
    assert carol_data["current_user"] == {
        "rank": None,
        "username": "carol_unsolved",
        "points": 0,
        "challenges_solved": 0,
        "hard_solved": 0,
        "average_score": 0.0,
        "percentile": None,
        "hidden": False,
    }


def test_tie_breaking_shared_rank_reached_at_and_challenges_solved(
    client: TestClient,
    session: Session,
    register_user,
    login_as,
):
    easy_1 = _make_challenge(session, difficulty=Difficulty.EASY)
    easy_2 = _make_challenge(session, difficulty=Difficulty.EASY)
    easy_3 = _make_challenge(session, difficulty=Difficulty.EASY)
    hard_1 = _make_challenge(session, difficulty=Difficulty.HARD)
    medium_1 = _make_challenge(session, difficulty=Difficulty.MEDIUM)

    # Register u_late first so u_early winning proves timestamp beats user_id.
    u_late = register_user("tie_late")
    u_early = register_user("tie_early")
    u_fewer = register_user("tie_fewer_solved")
    u_fourth = register_user("fourth_place")

    now = datetime.now(UTC)
    t1 = now - timedelta(hours=5)
    t2 = now - timedelta(hours=2)
    t3 = now - timedelta(hours=1)

    # Repeat 90 at t3 for u_late to verify reached_at stays anchored to earliest t2.
    for ch in (easy_1, easy_2, easy_3):
        _add_submission(
            session,
            challenge_id=ch.id,
            user_id=u_early["id"],
            score=90,
            created_at=t1,
        )
        _add_submission(
            session,
            challenge_id=ch.id,
            user_id=u_late["id"],
            score=90,
            created_at=t2,
        )
    _add_submission(
        session,
        challenge_id=easy_1.id,
        user_id=u_late["id"],
        score=90,
        created_at=t3,
    )

    # Same 270 points, but only 1 challenge solved (Hard 90 * 3) -> rank 3.
    _add_submission(
        session,
        challenge_id=hard_1.id,
        user_id=u_fewer["id"],
        score=90,
        created_at=t1 - timedelta(hours=1),
    )
    # 180 points -> rank 4 (not 3, verifying SQL RANK competition ranking).
    _add_submission(
        session,
        challenge_id=medium_1.id,
        user_id=u_fourth["id"],
        score=90,
        created_at=t1,
    )

    res = client.get("/api/leaderboard")
    assert res.status_code == 200
    entries = res.json()["entries"]
    assert [(e["rank"], e["username"], e["points"]) for e in entries] == [
        (1, "tie_early", 270),
        (1, "tie_late", 270),
        (3, "tie_fewer_solved", 270),
        (4, "fourth_place", 180),
    ]

    fourth_client = login_as("fourth_place")
    fourth_view = fourth_client.get("/api/leaderboard").json()
    assert fourth_view["current_user"]["rank"] == 4
    assert fourth_view["current_user"]["percentile"] == 100.0

    early_client = login_as("tie_early")
    early_view = early_client.get("/api/leaderboard").json()
    assert early_view["current_user"]["rank"] == 1
    assert early_view["current_user"]["percentile"] == 25.0


def test_time_windows_and_category_filter_and_validation(
    client: TestClient,
    session: Session,
    register_user,
):
    sec_ch = _make_challenge(
        session, difficulty=Difficulty.MEDIUM, category=Category.SECURITY
    )
    conc_ch = _make_challenge(
        session, difficulty=Difficulty.HARD, category=Category.CONCURRENCY
    )
    _make_challenge(session, difficulty=Difficulty.EASY, category=Category.CONCURRENCY)

    user = register_user("window_tester")
    now = datetime.now(UTC)

    # 2 days ago: Security 85 (170 pts); 15 days ago: Security 95 (190 pts)
    _add_submission(
        session,
        challenge_id=sec_ch.id,
        user_id=user["id"],
        score=85,
        created_at=now - timedelta(days=2),
    )
    _add_submission(
        session,
        challenge_id=sec_ch.id,
        user_id=user["id"],
        score=95,
        created_at=now - timedelta(days=15),
    )
    # 45 days ago: Concurrency 90 (270 pts)
    _add_submission(
        session,
        challenge_id=conc_ch.id,
        user_id=user["id"],
        score=90,
        created_at=now - timedelta(days=45),
    )

    res_7d = client.get("/api/leaderboard?window=7d").json()
    assert res_7d["window"] == "7d"
    assert res_7d["entries"][0]["points"] == 170
    assert res_7d["entries"][0]["challenges_solved"] == 1
    assert res_7d["total_catalog_challenges"] == 3

    res_30d = client.get("/api/leaderboard?window=30d").json()
    assert res_30d["window"] == "30d"
    assert res_30d["entries"][0]["points"] == 190
    assert res_30d["entries"][0]["challenges_solved"] == 1

    res_all = client.get("/api/leaderboard?window=all").json()
    assert res_all["entries"][0]["points"] == 190 + 270
    assert res_all["entries"][0]["challenges_solved"] == 2
    assert res_all["entries"][0]["hard_solved"] == 1

    res_cat = client.get("/api/leaderboard?category=Concurrency").json()
    assert res_cat["category"] == "Concurrency"
    assert res_cat["total_catalog_challenges"] == 2
    assert res_cat["entries"][0]["points"] == 270
    assert res_cat["entries"][0]["challenges_solved"] == 1

    assert client.get("/api/leaderboard?category=security").status_code == 200
    assert client.get("/api/leaderboard?category=InvalidCategory").status_code == 422
    assert client.get("/api/leaderboard?window=90d").status_code == 422


def test_pagination_and_empty_overflow_page_keeps_total_entries(
    client: TestClient,
    session: Session,
    register_user,
    login_as,
):
    ch = _make_challenge(session, difficulty=Difficulty.EASY)
    users = [register_user(f"paged_user_{i}") for i in range(5)]
    for i, u in enumerate(users):
        _add_submission(session, challenge_id=ch.id, user_id=u["id"], score=100 - i)

    page1 = client.get("/api/leaderboard?limit=2&offset=0")
    assert page1.status_code == 200
    assert page1.headers["X-Total-Count"] == "5"
    p1 = page1.json()
    assert p1["total_entries"] == 5
    assert [e["username"] for e in p1["entries"]] == ["paged_user_0", "paged_user_1"]

    page2 = client.get("/api/leaderboard?limit=2&offset=2")
    assert page2.status_code == 200
    assert page2.headers["X-Total-Count"] == "5"
    assert [e["username"] for e in page2.json()["entries"]] == [
        "paged_user_2",
        "paged_user_3",
    ]

    overflow = client.get("/api/leaderboard?limit=2&offset=10")
    assert overflow.status_code == 200
    assert overflow.headers["X-Total-Count"] == "5"
    ov = overflow.json()
    assert ov["entries"] == []
    assert ov["total_entries"] == 5

    # Authenticated viewer still gets rank/percentile when viewing an off-page slice.
    u0_client = login_as("paged_user_0")
    ov_auth = u0_client.get("/api/leaderboard?limit=2&offset=10").json()
    assert ov_auth["entries"] == []
    assert ov_auth["total_entries"] == 5
    assert ov_auth["current_user"]["rank"] == 1
    assert ov_auth["current_user"]["percentile"] == 20.0

    assert client.get("/api/leaderboard?limit=0").status_code == 422
    assert client.get("/api/leaderboard?limit=101").status_code == 422
    assert client.get("/api/leaderboard?offset=-1").status_code == 422
    assert client.get("/api/leaderboard?offset=10001").status_code == 422


def test_exclusions_custom_shared_guest_inactive_opted_out_deleted(
    client: TestClient,
    session: Session,
    register_user,
):
    public_ch = _make_challenge(session, difficulty=Difficulty.EASY)
    active_user = register_user("eligible_user")
    inactive_user = register_user("inactive_user")
    opted_out_user = register_user("opted_out_user")
    deleted_user = register_user("deleted_user")

    private_ch = _make_challenge(
        session,
        difficulty=Difficulty.HARD,
        is_public=False,
        user_id=active_user["id"],
    )
    shared_ch = _make_challenge(
        session,
        difficulty=Difficulty.HARD,
        is_public=False,
        user_id=active_user["id"],
        share_token="tok_shared_secret_123456",
    )
    user_owned_public_ch = _make_challenge(
        session,
        difficulty=Difficulty.HARD,
        is_public=True,
        user_id=active_user["id"],
    )

    _add_submission(
        session, challenge_id=public_ch.id, user_id=active_user["id"], score=92
    )
    _add_submission(
        session, challenge_id=private_ch.id, user_id=active_user["id"], score=100
    )
    _add_submission(
        session, challenge_id=shared_ch.id, user_id=active_user["id"], score=100
    )
    _add_submission(
        session,
        challenge_id=user_owned_public_ch.id,
        user_id=active_user["id"],
        score=100,
    )

    _add_submission(
        session, challenge_id=public_ch.id, user_id=inactive_user["id"], score=100
    )
    _add_submission(
        session, challenge_id=public_ch.id, user_id=opted_out_user["id"], score=100
    )
    _add_submission(
        session, challenge_id=public_ch.id, user_id=deleted_user["id"], score=100
    )
    _add_submission(
        session, challenge_id=public_ch.id, session_id="guest-lb-1", score=100
    )

    db_inactive = session.get(User, inactive_user["id"])
    assert db_inactive is not None
    db_inactive.is_active = False

    db_opted_out = session.get(User, opted_out_user["id"])
    assert db_opted_out is not None
    db_opted_out.leaderboard_opt_out = True

    db_deleted = session.get(User, deleted_user["id"])
    assert db_deleted is not None
    session.add_all([db_inactive, db_opted_out])
    session.delete(db_deleted)
    session.commit()

    res = client.get("/api/leaderboard")
    assert res.status_code == 200
    data = res.json()
    _assert_whitelist_and_no_pii(data)
    assert data["total_catalog_challenges"] == 1
    assert data["total_entries"] == 1
    assert len(data["entries"]) == 1
    assert data["entries"][0]["username"] == "eligible_user"
    assert data["entries"][0]["points"] == 92
    assert data["entries"][0]["challenges_solved"] == 1


def test_visibility_toggle_idempotency_and_rank_recomputation(
    client: TestClient,
    session: Session,
    register_user,
    login_as,
):
    ch = _make_challenge(session, difficulty=Difficulty.EASY)
    u1 = register_user("vis_first")
    u2 = register_user("vis_second")
    u3 = register_user("vis_third")

    _add_submission(session, challenge_id=ch.id, user_id=u1["id"], score=100)
    _add_submission(session, challenge_id=ch.id, user_id=u2["id"], score=90)
    _add_submission(session, challenge_id=ch.id, user_id=u3["id"], score=80)

    u1_client = login_as("vis_first")
    u2_client = login_as("vis_second")

    # Reject extra fields on visibility body.
    bad_payload = u1_client.put(
        "/api/leaderboard/me/visibility",
        json={"visible": False, "user_id": u2["id"]},
    )
    assert bad_payload.status_code == 422

    # Idempotent opt-out for #1 removes them and closes rank gap immediately.
    for _ in range(2):
        r = u1_client.put("/api/leaderboard/me/visibility", json={"visible": False})
        assert r.status_code == 200
        assert r.headers["Cache-Control"] == "private, no-store"
        assert r.json() == {"visible": False}

    after_opt_out = client.get("/api/leaderboard").json()
    assert after_opt_out["total_entries"] == 2
    assert [(e["rank"], e["username"]) for e in after_opt_out["entries"]] == [
        (1, "vis_second"),
        (2, "vis_third"),
    ]

    u1_view = u1_client.get("/api/leaderboard").json()
    _assert_whitelist_and_no_pii(u1_view)
    assert all(e["is_current_user"] is False for e in u1_view["entries"])
    assert u1_view["current_user"] == {
        "rank": None,
        "username": "vis_first",
        "points": 0,
        "challenges_solved": 0,
        "hard_solved": 0,
        "average_score": 0.0,
        "percentile": None,
        "hidden": True,
    }

    # u2 sees themselves as rank #1 of 2 (Top 50%).
    u2_view = u2_client.get("/api/leaderboard").json()
    assert u2_view["current_user"]["rank"] == 1
    assert u2_view["current_user"]["percentile"] == 50.0

    # Idempotent opt back in restores #1 rank.
    for _ in range(2):
        r = u1_client.put("/api/leaderboard/me/visibility", json={"visible": True})
        assert r.status_code == 200
        assert r.json() == {"visible": True}

    restored = u1_client.get("/api/leaderboard").json()
    assert [(e["rank"], e["username"]) for e in restored["entries"]] == [
        (1, "vis_first"),
        (2, "vis_second"),
        (3, "vis_third"),
    ]
    assert restored["current_user"]["rank"] == 1
    assert restored["current_user"]["hidden"] is False
    assert restored["current_user"]["percentile"] == 33.3
