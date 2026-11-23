"""Unit and API tests for backend coach failure pattern aggregation."""

import json
import time
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi.testclient import TestClient
from sqlmodel import Session

from backend.core.config import settings
from backend.core.security import create_access_token
from backend.models.challenge import (
    Category,
    Challenge,
    Difficulty,
    Language,
)
from backend.models.submission import Submission
from backend.models.user import User
from backend.services.analytics_service import compute_submission_precision_recall
from backend.services.coach_service import (
    FailureMode,
    aggregate_coach_patterns,
)


def _make_challenge(
    session: Session | None,
    *,
    slug: str,
    title: str | None = None,
    category: Category = Category.SECURITY,
    language: Language = Language.PYTHON,
    difficulty: Difficulty = Difficulty.MEDIUM,
    is_public: bool = True,
    user_id: int | None = None,
    session_id: str | None = None,
    share_token: str | None = None,
    challenge_id: int | None = None,
) -> Challenge:
    ch = Challenge(
        slug=slug,
        title=title or f"Title {slug}",
        difficulty=difficulty,
        category=category,
        language=language,
        description=f"Description for {slug}",
        code_snippet="secret_code_snippet = 'never-leak'\n",
        expected_issues=json.dumps(
            [
                {
                    "id": "issue-1",
                    "title": "Secret expected issue",
                    "severity": "high",
                    "lines": [1],
                    "keywords": ["secret"],
                    "explanation": "Never leak expected_issues",
                }
            ]
        ),
        canonical_review="Canonical secret review",
        recommended_fix_diff="- secret\n+ fixed_secret",
        is_public=is_public,
        user_id=user_id,
        session_id=session_id,
        share_token=share_token,
    )
    if challenge_id is not None:
        ch.id = challenge_id
    if session is not None:
        session.add(ch)
        session.commit()
        session.refresh(ch)
    return ch


def _make_submission(
    session: Session | None,
    *,
    challenge_id: int,
    user_id: int | None = None,
    session_id: str | None = None,
    score: int = 80,
    line_precision_score: float = 0.0,
    concept_score: float = 0.0,
    flagged_lines: list[Any] | None = None,
    false_positive_lines: list[Any] | None = None,
    detected_issues: list[Any] | None = None,
    missed_issues: list[Any] | None = None,
    comments: str = "Review comment secret",
    created_at: datetime | None = None,
    submission_id: int | None = None,
) -> Submission:
    sub = Submission(
        challenge_id=challenge_id,
        user_id=user_id,
        session_id=session_id,
        flagged_lines=flagged_lines if flagged_lines is not None else [1],
        false_positive_lines=false_positive_lines or [],
        detected_issues=detected_issues or [],
        missed_issues=missed_issues or [],
        comments=comments,
        score=score,
        line_precision_score=line_precision_score,
        concept_score=concept_score,
        created_at=created_at or datetime.now(UTC),
    )
    if submission_id is not None:
        sub.id = submission_id
    if session is not None:
        session.add(sub)
        session.commit()
        session.refresh(sub)
    return sub


def test_coach_patterns_empty_history(
    client: TestClient,
    session: Session,
    register_user,
    login_as,
    as_guest,
):
    """Anonymous, new authenticated user, and new guest all get zeroed patterns."""
    _make_challenge(session, slug="unattempted-public-ch", is_public=True)

    anon_res = client.get("/api/user/coach-patterns")
    assert anon_res.status_code == 200
    assert anon_res.json() == {
        "total_submissions": 0,
        "total_missed_submissions": 0,
        "weakest_slices": [],
        "strongest_slices": [],
        "recent_missed": [],
    }

    register_user("fresh_coach_user")
    auth_client = login_as("fresh_coach_user")
    user_res = auth_client.get("/api/user/coach-patterns")
    assert user_res.status_code == 200
    assert user_res.json()["total_submissions"] == 0
    assert user_res.json()["recent_missed"] == []

    as_guest(client, "fresh-guest-coach-sid")
    guest_res = client.get("/api/user/coach-patterns")
    assert guest_res.status_code == 200
    assert guest_res.json()["total_submissions"] == 0


def test_aggregate_failure_modes_tie_breaking_and_concept_fallback():
    """Verify failure modes, deterministic tie-breaking, and legacy fallback."""
    ch_low_recall = _make_challenge(
        None,
        slug="ch-recall",
        category=Category.SECURITY,
        language=Language.PYTHON,
        difficulty=Difficulty.EASY,
        challenge_id=1,
    )
    ch_low_precision = _make_challenge(
        None,
        slug="ch-precision",
        category=Category.CONCURRENCY,
        language=Language.GO,
        difficulty=Difficulty.MEDIUM,
        challenge_id=2,
    )
    ch_low_concept = _make_challenge(
        None,
        slug="ch-concept",
        category=Category.LOGIC_FLAWS,
        language=Language.TYPESCRIPT,
        difficulty=Difficulty.HARD,
        challenge_id=3,
    )
    ch_tie = _make_challenge(
        None,
        slug="ch-tie",
        category=Category.PERFORMANCE,
        language=Language.RUST,
        difficulty=Difficulty.MEDIUM,
        challenge_id=4,
    )
    ch_strong = _make_challenge(
        None,
        slug="ch-strong",
        category=Category.AGENT_ANTIPATHS,
        language=Language.JAVA,
        difficulty=Difficulty.EASY,
        challenge_id=5,
    )
    ch_legacy = _make_challenge(
        None,
        slug="ch-legacy",
        category=Category.SECURITY,
        language=Language.GO,
        difficulty=Difficulty.HARD,
        challenge_id=6,
    )

    now = datetime.now(UTC)
    rows = [
        (
            _make_submission(
                None,
                challenge_id=1,
                score=70,
                line_precision_score=100.0,
                concept_score=90.0,
                flagged_lines=[1],
                detected_issues=[{"id": "d1"}],
                missed_issues=[{"id": "d2", "expected_lines": [5]}],
                created_at=now - timedelta(minutes=6),
                submission_id=1,
            ),
            ch_low_recall,
        ),
        (
            _make_submission(
                None,
                challenge_id=2,
                score=62,
                line_precision_score=33.3,
                concept_score=85.0,
                flagged_lines=[1, 2, 3],
                false_positive_lines=[2, 3],
                detected_issues=[{"id": "d1"}],
                missed_issues=[],
                created_at=now - timedelta(minutes=5),
                submission_id=2,
            ),
            ch_low_precision,
        ),
        (
            _make_submission(
                None,
                challenge_id=3,
                score=60,
                line_precision_score=100.0,
                concept_score=20.0,
                flagged_lines=[1],
                detected_issues=[{"id": "d1"}],
                missed_issues=[],
                created_at=now - timedelta(minutes=4),
                submission_id=3,
            ),
            ch_low_concept,
        ),
        (
            _make_submission(
                None,
                challenge_id=4,
                score=50,
                line_precision_score=50.0,
                concept_score=50.0,
                flagged_lines=[1, 2],
                false_positive_lines=[2],
                detected_issues=[{"id": "d1"}],
                missed_issues=[{"id": "d2", "expected_lines": [9]}],
                created_at=now - timedelta(minutes=3),
                submission_id=4,
            ),
            ch_tie,
        ),
        (
            _make_submission(
                None,
                challenge_id=5,
                score=96,
                line_precision_score=100.0,
                concept_score=92.0,
                flagged_lines=[1],
                detected_issues=[{"id": "d1"}],
                missed_issues=[],
                created_at=now - timedelta(minutes=2),
                submission_id=5,
            ),
            ch_strong,
        ),
        (
            _make_submission(
                None,
                challenge_id=6,
                score=84,
                line_precision_score=0.0,
                concept_score=0.0,
                flagged_lines=[1],
                created_at=now - timedelta(minutes=1),
                submission_id=6,
            ),
            ch_legacy,
        ),
    ]

    result = aggregate_coach_patterns(rows, slice_limit=5, missed_limit=10)
    assert result.total_submissions == 6
    assert result.total_missed_submissions == 4

    by_cat = {
        (s.category, s.language, s.difficulty): s
        for s in [*result.weakest_slices, *result.strongest_slices]
    }
    assert len(by_cat) == 6
    assert (
        by_cat[("Security", "python", "Easy")].dominant_failure_mode
        == FailureMode.LOW_RECALL
    )
    assert (
        by_cat[("Concurrency", "go", "Medium")].dominant_failure_mode
        == FailureMode.LOW_PRECISION
    )
    assert (
        by_cat[("Logic Flaws", "typescript", "Hard")].dominant_failure_mode
        == FailureMode.LOW_CONCEPT_COVERAGE
    )
    assert (
        by_cat[("Performance", "rust", "Medium")].dominant_failure_mode
        == FailureMode.LOW_RECALL
    )
    assert by_cat[("Agent Antipaths", "java", "Easy")].dominant_failure_mode is None
    assert by_cat[("Security", "go", "Hard")].concept_coverage == 84.0
    assert by_cat[("Security", "go", "Hard")].dominant_failure_mode is None

    weakest_keys = {
        (s.category, s.language, s.difficulty) for s in result.weakest_slices
    }
    strongest_keys = {
        (s.category, s.language, s.difficulty) for s in result.strongest_slices
    }
    assert weakest_keys.isdisjoint(strongest_keys)
    assert [s.average_score for s in result.weakest_slices] == sorted(
        s.average_score for s in result.weakest_slices
    )
    assert [s.average_score for s in result.strongest_slices] == sorted(
        (s.average_score for s in result.strongest_slices),
        reverse=True,
    )


def test_single_slice_and_two_slice_disjoint_ranking():
    """Verify single-slice routing and multi-slice disjoint split."""
    ch_a = _make_challenge(
        None,
        slug="single-slice",
        category=Category.SECURITY,
        language=Language.PYTHON,
        difficulty=Difficulty.EASY,
        challenge_id=10,
    )
    ch_b = _make_challenge(
        None,
        slug="second-slice",
        category=Category.CONCURRENCY,
        language=Language.GO,
        difficulty=Difficulty.HARD,
        challenge_id=11,
    )

    low_res = aggregate_coach_patterns(
        [(_make_submission(None, challenge_id=10, score=79, submission_id=1), ch_a)]
    )
    assert len(low_res.weakest_slices) == 1
    assert low_res.strongest_slices == []

    high_res = aggregate_coach_patterns(
        [(_make_submission(None, challenge_id=10, score=80, submission_id=2), ch_a)]
    )
    assert high_res.weakest_slices == []
    assert len(high_res.strongest_slices) == 1

    two_res = aggregate_coach_patterns(
        [
            (_make_submission(None, challenge_id=10, score=85, submission_id=3), ch_a),
            (_make_submission(None, challenge_id=11, score=95, submission_id=4), ch_b),
        ],
        slice_limit=5,
    )
    assert len(two_res.weakest_slices) == 1
    assert len(two_res.strongest_slices) == 1
    assert two_res.weakest_slices[0].category == "Security"
    assert two_res.strongest_slices[0].category == "Concurrency"


def test_slice_tie_precision_vs_concept_coverage_and_unique_challenges():
    """Tie on precision/concept_coverage picks LOW_PRECISION; tracks unique ids."""
    ch_a = _make_challenge(
        None,
        slug="same-slice-a",
        category=Category.SECURITY,
        language=Language.PYTHON,
        difficulty=Difficulty.MEDIUM,
        challenge_id=21,
    )
    ch_b = _make_challenge(
        None,
        slug="same-slice-b",
        category=Category.SECURITY,
        language=Language.PYTHON,
        difficulty=Difficulty.MEDIUM,
        challenge_id=22,
    )
    rows = [
        (
            _make_submission(
                None,
                challenge_id=21,
                score=70,
                line_precision_score=50.0,
                concept_score=50.0,
                flagged_lines=[1, 2],
                false_positive_lines=[2],
                detected_issues=[{"id": "d1"}],
                missed_issues=[],
                submission_id=1,
            ),
            ch_a,
        ),
        (
            _make_submission(
                None,
                challenge_id=21,
                score=70,
                line_precision_score=50.0,
                concept_score=50.0,
                flagged_lines=[1, 2],
                false_positive_lines=[2],
                detected_issues=[{"id": "d1"}],
                missed_issues=[],
                submission_id=2,
            ),
            ch_a,
        ),
        (
            _make_submission(
                None,
                challenge_id=22,
                score=70,
                line_precision_score=50.0,
                concept_score=50.0,
                flagged_lines=[1, 2],
                false_positive_lines=[2],
                detected_issues=[{"id": "d1"}],
                missed_issues=[],
                submission_id=3,
            ),
            ch_b,
        ),
    ]
    res = aggregate_coach_patterns(rows)
    assert len(res.weakest_slices) == 1
    sl = res.weakest_slices[0]
    assert sl.attempts == 3
    assert sl.unique_challenges == 2
    assert sl.recall == 100.0
    assert sl.precision == 50.0
    assert sl.concept_coverage == 50.0
    assert sl.dominant_failure_mode == FailureMode.LOW_PRECISION


def test_multifile_flagged_line_refs_in_precision_recall_and_coach_patterns(
    client: TestClient,
    session: Session,
    as_guest,
):
    """Multi-file FlaggedLineRef dicts work cleanly without unhashable dict errors."""
    sid = as_guest(client, "guest-multifile-coach")
    ch = _make_challenge(
        session,
        slug="multifile-pr-coach",
        category=Category.SECURITY,
        language=Language.PYTHON,
        difficulty=Difficulty.HARD,
        is_public=True,
    )
    sub = _make_submission(
        session,
        challenge_id=ch.id,
        session_id=sid,
        score=55,
        line_precision_score=50.0,
        concept_score=60.0,
        flagged_lines=[
            {"file_path": "api/auth.py", "line_number": 12},
            {"file_path": "db/users.py", "line_number": 12},
        ],
        false_positive_lines=[
            {"file_path": "db/users.py", "line_number": 12},
        ],
        detected_issues=[{"id": "auth-backdoor", "title": "Backdoor"}],
        missed_issues=[
            {
                "id": "sql-injection",
                "title": "SQLi",
                "expected_lines": [
                    {"file_path": "db/users.py", "line_number": 21},
                    {"file_path": "db/users.py", "line_number": 22},
                ],
            },
            {
                "id": "overlap-same-line-diff-file",
                "title": "Other file line 21",
                "expected_lines": [
                    {"file_path": "api/auth.py", "line_number": 21},
                ],
            },
        ],
    )

    precision, recall = compute_submission_precision_recall(sub)
    assert precision == 50.0
    assert round(recall, 1) == 33.3

    res = client.get("/api/user/coach-patterns")
    assert res.status_code == 200
    data = res.json()
    assert data["total_submissions"] == 1
    assert data["total_missed_submissions"] == 1
    assert len(data["weakest_slices"]) == 1
    assert data["weakest_slices"][0]["precision"] == 50.0
    assert data["weakest_slices"][0]["recall"] == 33.3
    assert data["weakest_slices"][0]["concept_coverage"] == 60.0
    assert data["weakest_slices"][0]["dominant_failure_mode"] == "low_recall"

    missed = data["recent_missed"][0]
    assert missed["challenge_slug"] == "multifile-pr-coach"
    assert missed["missed_line_count"] == 3
    assert missed["false_positive_count"] == 1


def test_recent_missed_ordering_limits_redacted_fallback_and_validation(
    client: TestClient,
    session: Session,
    as_guest,
):
    """Verify missed ordering, query limits, 422 bounds, and redacted fallback."""
    sid = as_guest(client, "guest-limits-coach")
    now = datetime.now(UTC)

    challenges: list[Challenge] = []
    for idx in range(4):
        challenges.append(
            _make_challenge(
                session,
                slug=f"limit-ch-{idx}",
                category=list(Category)[idx % len(Category)],
                language=list(Language)[idx % len(Language)],
                difficulty=list(Difficulty)[idx % len(Difficulty)],
                is_public=True,
            )
        )

    _make_submission(
        session,
        challenge_id=challenges[0].id,
        session_id=sid,
        score=95,
        line_precision_score=100.0,
        concept_score=90.0,
        created_at=now - timedelta(minutes=30),
    )
    # Passing score (>=80) with missed issues still counts as missed.
    _make_submission(
        session,
        challenge_id=challenges[1].id,
        session_id=sid,
        score=82,
        line_precision_score=100.0,
        concept_score=75.0,
        missed_issues=[{"id": "redacted-1", "title": "Redacted", "expected_lines": []}],
        created_at=now - timedelta(minutes=20),
    )
    # Redacted missed issues omit expected_lines; falls back to len(missed_issues).
    _make_submission(
        session,
        challenge_id=challenges[2].id,
        session_id=sid,
        score=50,
        line_precision_score=50.0,
        concept_score=50.0,
        flagged_lines=[1, 2],
        false_positive_lines=[2],
        missed_issues=[
            {"id": "r1", "expected_lines": []},
            {"id": "r2", "expected_lines": []},
        ],
        created_at=now - timedelta(minutes=10),
    )
    _make_submission(
        session,
        challenge_id=challenges[3].id,
        session_id=sid,
        score=40,
        line_precision_score=0.0,
        concept_score=25.0,
        flagged_lines=[3],
        false_positive_lines=[3],
        missed_issues=[{"id": "m1", "expected_lines": [10, 11]}],
        created_at=now,
    )

    res = client.get("/api/user/coach-patterns?slice_limit=1&missed_limit=2")
    assert res.status_code == 200
    data = res.json()
    assert data["total_submissions"] == 4
    assert data["total_missed_submissions"] == 3
    assert len(data["weakest_slices"]) == 1
    assert len(data["strongest_slices"]) == 1
    assert len(data["recent_missed"]) == 2
    assert [item["challenge_slug"] for item in data["recent_missed"]] == [
        "limit-ch-3",
        "limit-ch-2",
    ]
    assert data["recent_missed"][0]["missed_line_count"] == 2
    assert data["recent_missed"][0]["false_positive_count"] == 1
    assert data["recent_missed"][1]["missed_line_count"] == 2
    assert data["recent_missed"][1]["false_positive_count"] == 1

    assert client.get("/api/user/coach-patterns?slice_limit=0").status_code == 422
    assert client.get("/api/user/coach-patterns?slice_limit=21").status_code == 422
    assert client.get("/api/user/coach-patterns?missed_limit=0").status_code == 422
    assert client.get("/api/user/coach-patterns?missed_limit=51").status_code == 422


def test_ownership_isolation_revoked_shared_private_and_no_canonical_leak(
    session: Session,
    client_factory,
    register_user,
    login_as,
    as_guest,
):
    """Enforce owner isolation, tampered/forged/inactive handling, and no spoilers."""
    user_a = register_user("coach_user_a")
    user_b = register_user("coach_user_b")
    inactive_user = register_user("coach_inactive")

    db_inactive = session.get(User, inactive_user["id"])
    assert db_inactive is not None
    db_inactive.is_active = False
    session.add(db_inactive)
    session.commit()

    client_a = login_as("coach_user_a")
    client_b = login_as("coach_user_b")

    guest_a_client = client_factory()
    guest_a_sid = as_guest(guest_a_client, "coach-guest-a-sid")
    guest_b_client = client_factory()
    as_guest(guest_b_client, "coach-guest-b-sid")

    pub_ch = _make_challenge(session, slug="coach-pub-ch", is_public=True)
    user_a_priv = _make_challenge(
        session,
        slug="coach-user-a-priv",
        title="User A Secret Draft",
        is_public=False,
        user_id=user_a["id"],
        share_token=None,
    )
    _make_challenge(
        session,
        slug="coach-unattempted-priv",
        title="Never Attempted Private",
        is_public=False,
        user_id=user_a["id"],
    )

    _make_submission(
        session,
        challenge_id=pub_ch.id,
        user_id=user_a["id"],
        score=55,
        missed_issues=[{"id": "m1", "expected_lines": [1]}],
    )
    _make_submission(
        session,
        challenge_id=user_a_priv.id,
        user_id=user_a["id"],
        score=60,
        missed_issues=[{"id": "m2", "expected_lines": [1]}],
    )
    # Simulates a submission created via share_token before User A revoked sharing.
    _make_submission(
        session,
        challenge_id=user_a_priv.id,
        user_id=user_b["id"],
        score=30,
        missed_issues=[{"id": "m3", "expected_lines": [1]}],
    )
    _make_submission(
        session,
        challenge_id=pub_ch.id,
        session_id=guest_a_sid,
        score=45,
        missed_issues=[{"id": "m4", "expected_lines": [1]}],
    )
    _make_submission(
        session,
        challenge_id=pub_ch.id,
        user_id=inactive_user["id"],
        score=40,
        missed_issues=[{"id": "m5", "expected_lines": [1]}],
    )

    res_a = client_a.get("/api/user/coach-patterns")
    assert res_a.status_code == 200
    body_a = res_a.json()
    assert body_a["total_submissions"] == 2
    assert {item["challenge_slug"] for item in body_a["recent_missed"]} == {
        pub_ch.slug,
        user_a_priv.slug,
    }
    serialized_a = json.dumps(body_a)
    for forbidden in (
        "Canonical secret review",
        "fixed_secret",
        "Never leak expected_issues",
        "never-leak",
        "Review comment secret",
        "coach-unattempted-priv",
        "canonical_review",
        "recommended_fix_diff",
        "expected_issues",
        "code_snippet",
        "findings",
        "comments",
    ):
        assert forbidden not in serialized_a

    # User B must not see User A's private challenge even with an existing submission.
    res_b = client_b.get("/api/user/coach-patterns")
    assert res_b.status_code == 200
    assert res_b.json()["total_submissions"] == 0
    assert res_b.json()["recent_missed"] == []

    guest_b_res = guest_b_client.get("/api/user/coach-patterns")
    assert guest_b_res.status_code == 200
    assert guest_b_res.json()["total_submissions"] == 0

    forged_client = client_factory()
    forged_res = forged_client.get(
        f"/api/user/coach-patterns?session_id={guest_a_sid}",
        headers={"X-Diffly-Session-Id": guest_a_sid},
    )
    assert forged_res.status_code == 200
    assert forged_res.json()["total_submissions"] == 0

    tampered_client = client_factory()
    tampered_client.cookies.set(
        settings.GUEST_COOKIE_NAME,
        f"v1.{guest_a_sid}.{int(time.time())}.bad_sig",
        domain="testserver.local",
    )
    tampered_res = tampered_client.get("/api/user/coach-patterns")
    assert tampered_res.status_code == 200
    assert tampered_res.json()["total_submissions"] == 0
    assert tampered_client.cookies.get(settings.GUEST_COOKIE_NAME) is None

    inactive_client = client_factory()
    inactive_token = create_access_token(
        {
            "sub": str(inactive_user["id"]),
            "username": inactive_user["username"],
            "email": inactive_user["email"],
        }
    )
    inactive_client.cookies.set(
        settings.AUTH_COOKIE_NAME,
        inactive_token,
        domain="testserver.local",
    )
    inactive_res = inactive_client.get("/api/user/coach-patterns")
    assert inactive_res.status_code == 200
    assert inactive_res.json()["total_submissions"] == 0

    saved_guest_cookie = guest_a_client.cookies.get(settings.GUEST_COOKIE_NAME)
    assert saved_guest_cookie is not None
    client_a.cookies.set(
        settings.GUEST_COOKIE_NAME, saved_guest_cookie, domain="testserver.local"
    )
    assert client_a.post("/api/user/claim-session").status_code == 200
    assert client_a.get("/api/user/coach-patterns").json()["total_submissions"] == 3

    old_guest_client = client_factory()
    old_guest_client.cookies.set(
        settings.GUEST_COOKIE_NAME, saved_guest_cookie, domain="testserver.local"
    )
    assert (
        old_guest_client.get("/api/user/coach-patterns").json()["total_submissions"]
        == 0
    )


def test_single_file_challenge_review_mixed_scope_false_positive_precision(
    client: TestClient,
    session: Session,
    as_guest,
):
    """POST /review -> GET /coach-patterns keeps FP precision on 1-file challenges."""
    as_guest(client, "guest-single-file-review")
    ch = Challenge(
        slug="single-file-fp-coach",
        title="Single File Mixed Scope",
        difficulty=Difficulty.MEDIUM,
        category=Category.SECURITY,
        language=Language.PYTHON,
        description="Single file challenge with explicit defect scope",
        files=json.dumps(
            [
                {
                    "path": "api/auth.py",
                    "language": "python",
                    "content": "a = eval(x)\nb = 2\nc = 3\n",
                }
            ]
        ),
        expected_issues=json.dumps(
            [
                {
                    "id": "eval-bug",
                    "title": "Unsafe eval",
                    "severity": "critical",
                    "file_path": "api/auth.py",
                    "lines": [{"file_path": "api/auth.py", "line_number": 1}],
                    "keywords": ["eval", "injection"],
                    "explanation": "Avoid eval on untrusted input",
                }
            ]
        ),
        is_public=True,
    )
    session.add(ch)
    session.commit()

    review_res = client.post(
        f"/api/challenges/{ch.slug}/review",
        json={
            "flagged_lines": [1, 3],
            "comments": "Unsafe eval injection on line 1; also flagging line 3",
        },
    )
    assert review_res.status_code == 200

    res = client.get("/api/user/coach-patterns")
    assert res.status_code == 200
    data = res.json()
    assert data["total_submissions"] == 1
    assert len(data["weakest_slices"]) == 1
    assert data["strongest_slices"] == []
    sl = data["weakest_slices"][0]
    assert sl["precision"] == 50.0
    assert sl["recall"] == 100.0
    assert sl["dominant_failure_mode"] == "low_precision"


def test_failing_score_with_high_submetrics_and_malformed_expected_lines():
    """Failing score still assigns failure mode; malformed expected_lines never 500s."""
    ch = _make_challenge(
        None,
        slug="proximity-fail",
        category=Category.LOGIC_FLAWS,
        language=Language.PYTHON,
        difficulty=Difficulty.MEDIUM,
        challenge_id=99,
    )
    proximity_sub = _make_submission(
        None,
        challenge_id=99,
        score=65,
        line_precision_score=30.0,
        concept_score=95.0,
        flagged_lines=[1],
        false_positive_lines=[],
        detected_issues=[{"id": "d1"}],
        missed_issues=[],
        submission_id=99,
    )
    res_proximity = aggregate_coach_patterns([(proximity_sub, ch)])
    assert len(res_proximity.weakest_slices) == 1
    assert (
        res_proximity.weakest_slices[0].dominant_failure_mode
        == FailureMode.LOW_CONCEPT_COVERAGE
    )

    malformed_sub = _make_submission(
        None,
        challenge_id=99,
        score=55,
        line_precision_score=100.0,
        concept_score=90.0,
        flagged_lines=[1],
        false_positive_lines=[],
        detected_issues=[{"id": "d1"}],
        missed_issues=[
            {
                "id": "bad-lines",
                "expected_lines": [{"file_path": "", "line_number": 0}],
            }
        ],
        submission_id=100,
    )
    res_malformed = aggregate_coach_patterns([(malformed_sub, ch)])
    assert res_malformed.recent_missed[0].missed_line_count == 1
