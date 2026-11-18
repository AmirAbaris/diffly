import re
from collections.abc import Callable, Generator
from contextlib import ExitStack
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

from api.index import app
from backend.core.config import Settings, settings
from backend.core.db import get_session
from backend.core.rate_limit import _SlidingWindowRateLimiter
from backend.core.security import hash_password, verify_password
from backend.models.challenge import (
    Category,
    Challenge,
    CustomChallengeResponse,
    Difficulty,
    Language,
)
from backend.models.user import User
from tests.conftest import DEFAULT_TEST_PASSWORD


def _create_public_challenge(
    session: Session,
    *,
    slug: str,
    code_snippet: str = "line_1 = 1\nline_2 = 2\nline_3 = 3",
) -> Challenge:
    challenge = Challenge(
        slug=slug,
        title=f"Challenge {slug}",
        difficulty=Difficulty.EASY,
        category=Category.SECURITY,
        language=Language.PYTHON,
        description="Security hardening test challenge",
        code_snippet=code_snippet,
        expected_issues=[
            {
                "id": "issue-1",
                "title": "Sample defect",
                "severity": "medium",
                "lines": [1],
                "keywords": ["defect", "line"],
                "explanation": "Sample explanation",
            }
        ],
        is_public=True,
    )
    session.add(challenge)
    session.commit()
    session.refresh(challenge)
    return challenge


@pytest.fixture
def ip_client_factory(
    session: Session,
) -> Generator[Callable[[str], TestClient], None, None]:
    def get_session_override() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[get_session] = get_session_override
    with (
        ExitStack() as stack,
        patch("api.index.init_db"),
        patch("api.index.seed_missing_challenges"),
    ):

        def _make_client(ip: str) -> TestClient:
            return stack.enter_context(TestClient(app, client=(ip, 50000)))

        try:
            yield _make_client
        finally:
            app.dependency_overrides.clear()


@pytest.mark.parametrize(
    "bad_username",
    [
        "   ",
        " ab ",
        "alice@diffly.dev",
        "alice\x00bob",
        "alice\x1fbob",
        "alice\x7fbob",
        "alice\nbob",
        "\talice",
        "alice bob",
        "alice\u00a0bob",
    ],
)
def test_register_rejects_invalid_and_control_usernames(
    client: TestClient,
    bad_username: str,
):
    res = client.post(
        "/api/auth/register",
        json={
            "email": "whitespace_user@diffly.dev",
            "username": bad_username,
            "password": DEFAULT_TEST_PASSWORD,
        },
    )
    assert res.status_code == 422


def test_register_trims_outer_spaces_on_valid_username(client: TestClient):
    res = client.post(
        "/api/auth/register",
        json={
            "email": "trimmed_user@diffly.dev",
            "username": "  valid_trimmed  ",
            "password": DEFAULT_TEST_PASSWORD,
        },
    )
    assert res.status_code == 200
    assert res.json()["username"] == "valid_trimmed"


@pytest.mark.parametrize("oversized_password", ["é" * 40, "a" * 73])
def test_register_rejects_password_over_72_utf8_bytes(
    client: TestClient,
    oversized_password: str,
):
    res = client.post(
        "/api/auth/register",
        json={
            "email": "longpw_user@diffly.dev",
            "username": "longpw_user",
            "password": oversized_password,
        },
    )
    assert res.status_code == 422


@pytest.mark.parametrize("oversized_password", ["é" * 40, "a" * 73, "a" * 200])
def test_login_rejects_oversized_password(
    client: TestClient,
    oversized_password: str,
):
    res = client.post(
        "/api/auth/login",
        json={
            "identifier": "someone@diffly.dev",
            "password": oversized_password,
        },
    )
    assert res.status_code == 422


@pytest.mark.parametrize("field_name", ["username", "email", "identifier"])
def test_login_rejects_oversized_identity_fields(
    client: TestClient,
    field_name: str,
):
    res = client.post(
        "/api/auth/login",
        json={
            field_name: "a" * 255,
            "password": DEFAULT_TEST_PASSWORD,
        },
    )
    assert res.status_code == 422


def test_user_db_rejects_case_insensitive_duplicate_username(session: Session):
    first = User(
        email="alice_one@diffly.dev",
        username="Alice",
        hashed_password=hash_password(DEFAULT_TEST_PASSWORD),
    )
    session.add(first)
    session.commit()

    duplicate = User(
        email="alice_two@diffly.dev",
        username="alice",
        hashed_password=hash_password(DEFAULT_TEST_PASSWORD),
    )
    session.add(duplicate)
    with pytest.raises(IntegrityError):
        session.commit()
    session.rollback()


def test_user_db_rejects_case_insensitive_duplicate_email(session: Session):
    first = User(
        email="A@B.com",
        username="upper_email_user",
        hashed_password=hash_password(DEFAULT_TEST_PASSWORD),
    )
    session.add(first)
    session.commit()

    duplicate = User(
        email="a@b.com",
        username="lower_email_user",
        hashed_password=hash_password(DEFAULT_TEST_PASSWORD),
    )
    session.add(duplicate)
    with pytest.raises(IntegrityError):
        session.commit()
    session.rollback()


def test_user_lower_columns_sync_on_update_and_unicode_folding(session: Session):
    user = User(
        email="Üser@Diffly.dev",
        username="ÜserName",
        hashed_password=hash_password(DEFAULT_TEST_PASSWORD),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    assert user.email_lower == "üser@diffly.dev"
    assert user.username_lower == "üsername"

    duplicate = User(
        email="other_unicode@diffly.dev",
        username="üsername",
        hashed_password=hash_password(DEFAULT_TEST_PASSWORD),
    )
    session.add(duplicate)
    with pytest.raises(IntegrityError):
        session.commit()
    session.rollback()

    user.email = "Updated_Üser@Diffly.dev"
    user.username = "Updated_Üser"
    session.commit()
    session.refresh(user)
    assert user.email_lower == "updated_üser@diffly.dev"
    assert user.username_lower == "updated_üser"


def test_login_verifies_password_even_when_user_is_missing(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
):
    calls: list[tuple[str, str]] = []

    def spy_verify(plain_password: str, hashed_password: str) -> bool:
        calls.append((plain_password, hashed_password))
        return verify_password(plain_password, hashed_password)

    monkeypatch.setattr("api.routes.auth.verify_password", spy_verify)

    res = client.post(
        "/api/auth/login",
        json={
            "identifier": "missing_user_timing@diffly.dev",
            "password": DEFAULT_TEST_PASSWORD,
        },
    )
    assert res.status_code == 401
    assert len(calls) == 1
    # Ensure a real bcrypt hash is verified to keep work symmetric with real users.
    assert calls[0][1].startswith("$2")


def test_review_rejects_comments_over_20000_chars(
    client: TestClient,
    session: Session,
):
    challenge = _create_public_challenge(session, slug="review-long-comments")
    res = client.post(
        f"/api/challenges/{challenge.id}/review",
        json={
            "flagged_lines": [1],
            "comments": "x" * 20001,
        },
    )
    assert res.status_code == 422


def test_review_rejects_over_500_flagged_lines(
    client: TestClient,
    session: Session,
):
    long_snippet = "\n".join(f"line_{idx} = {idx}" for idx in range(1, 506))
    challenge = _create_public_challenge(
        session,
        slug="review-too-many-lines",
        code_snippet=long_snippet,
    )
    res = client.post(
        f"/api/challenges/{challenge.id}/review",
        json={
            "flagged_lines": list(range(1, 502)),
            "comments": "Excessive number of flagged lines in submission",
        },
    )
    assert res.status_code == 422


def test_review_rejects_flagged_lines_past_snippet_line_count(
    client: TestClient,
    session: Session,
):
    challenge = _create_public_challenge(
        session,
        slug="review-line-bounds",
        code_snippet="a = 1\nb = 2\nc = 3",
    )

    res_huge = client.post(
        f"/api/challenges/{challenge.id}/review",
        json={
            "flagged_lines": [999999],
            "comments": "Flagged line far past snippet end",
        },
    )
    assert res_huge.status_code == 422

    res_off_by_one = client.post(
        f"/api/challenges/{challenge.id}/review",
        json={
            "flagged_lines": [4],
            "comments": "Flagged line one past snippet end",
        },
    )
    assert res_off_by_one.status_code == 422

    res_valid_edge = client.post(
        f"/api/challenges/{challenge.id}/review",
        json={
            "flagged_lines": [3],
            "comments": "Valid defect critique on last snippet line",
        },
    )
    assert res_valid_edge.status_code == 200


def test_review_on_empty_code_snippet_rejects_flagged_lines(
    client: TestClient,
    session: Session,
):
    challenge = _create_public_challenge(
        session,
        slug="review-empty-snippet",
        code_snippet="",
    )
    res_flagged = client.post(
        f"/api/challenges/{challenge.id}/review",
        json={
            "flagged_lines": [1],
            "comments": "Flagging line on empty challenge snippet",
        },
    )
    assert res_flagged.status_code == 422
    assert res_flagged.json()["detail"] == "Challenge has no code lines to flag"

    res_empty = client.post(
        f"/api/challenges/{challenge.id}/review",
        json={
            "flagged_lines": [],
            "comments": "General review without line flags",
        },
    )
    assert res_empty.status_code == 200


def test_evaluate_custom_validates_expected_issues_and_line_bounds(
    client: TestClient,
):
    valid_issue = [
        {
            "id": "ev-1",
            "title": "Sample defect",
            "severity": "high",
            "matched_lines": [1],
            "matched_keywords": ["eval"],
            "explanation": "Unsafe eval",
        }
    ]

    res_out_of_bounds = client.post(
        "/api/challenges/evaluate-custom",
        json={
            "expected_issues": valid_issue,
            "code_snippet": "a = 1\nb = 2\n",
            "flagged_lines": [3],
            "comments": "Line out of snippet bounds",
        },
    )
    assert res_out_of_bounds.status_code == 422

    res_empty_snippet = client.post(
        "/api/challenges/evaluate-custom",
        json={
            "expected_issues": valid_issue,
            "code_snippet": "",
            "flagged_lines": [1],
            "comments": "Stateless evaluation without snippet",
        },
    )
    assert res_empty_snippet.status_code == 200

    for bad_issues in (
        ["not-a-dict"],
        [{"matched_lines": 123}],
        [{"lines": "invalid"}],
    ):
        res_bad = client.post(
            "/api/challenges/evaluate-custom",
            json={
                "expected_issues": bad_issues,
                "code_snippet": "a = 1\n",
                "flagged_lines": [1],
                "comments": "Malformed criteria",
            },
        )
        assert res_bad.status_code == 422


def test_generate_custom_rejects_topic_over_200_chars(client: TestClient):
    res = client.post(
        "/api/challenges/generate-custom",
        json={
            "topic": "x" * 201,
            "language": "python",
            "difficulty": "Medium",
        },
        headers={"X-Gemini-Key": "test-gemini-key"},
    )
    assert res.status_code == 422


@pytest.mark.parametrize(
    "bad_id",
    ["0", "01", "2147483648", "99999999999999999999", "9" * 5000, "²"],
)
def test_get_challenge_out_of_range_and_unicode_digit_return_404(
    client: TestClient,
    bad_id: str,
):
    res = client.get(f"/api/challenges/{bad_id}")
    assert res.status_code == 404


@pytest.mark.parametrize(
    "bad_id",
    ["0", "01", "2147483648", "99999999999999999999", "9" * 5000, "²"],
)
def test_delete_custom_challenge_out_of_range_and_unicode_digit_return_404(
    client: TestClient,
    bad_id: str,
):
    res = client.delete(f"/api/challenges/custom/{bad_id}")
    assert res.status_code == 404


def test_cors_origin_regex_restricts_to_diffly_vercel_deployments():
    pattern = re.compile(settings.CORS_ORIGIN_REGEX)
    assert pattern.fullmatch("https://evil-attacker.vercel.app") is None
    assert pattern.fullmatch("https://diffly-attacker.vercel.app") is None
    assert pattern.fullmatch("https://diffly-sigma-evil.vercel.app") is None
    assert pattern.fullmatch("https://diffly.vercel.app.evil.com") is None
    assert pattern.fullmatch("https://diffly.vercel.app") is not None
    assert pattern.fullmatch("https://diffly-sigma.vercel.app") is not None
    assert pattern.fullmatch("https://diffly-amirabaris.vercel.app") is not None
    assert (
        pattern.fullmatch("https://diffly-git-main-amirabaris.vercel.app") is not None
    )


def test_cors_headers_on_health_endpoint(client: TestClient):
    for rejected_origin in (
        "https://evil-attacker.vercel.app",
        "https://diffly-attacker.vercel.app",
    ):
        evil_preflight = client.options(
            "/api/health",
            headers={
                "Origin": rejected_origin,
                "Access-Control-Request-Method": "GET",
            },
        )
        assert "access-control-allow-origin" not in evil_preflight.headers

    allowed_origin = "https://diffly.vercel.app"
    preflight = client.options(
        "/api/health",
        headers={
            "Origin": allowed_origin,
            "Access-Control-Request-Method": "GET",
        },
    )
    assert preflight.status_code == 200
    assert preflight.headers.get("access-control-allow-origin") == allowed_origin

    # Starlette's CORSMiddleware emits Access-Control-Expose-Headers on actual
    # (non-preflight) responses rather than preflight OPTIONS responses.
    get_res = client.get("/api/health", headers={"Origin": allowed_origin})
    assert get_res.status_code == 200
    assert get_res.headers.get("access-control-allow-origin") == allowed_origin
    raw_expose = get_res.headers.get("access-control-expose-headers", "")
    exposed = {
        header.strip().lower() for header in raw_expose.split(",") if header.strip()
    }
    assert {"x-diffly-session-id", "x-diffly-claim-status"}.issubset(exposed)


def test_health_endpoint_does_not_leak_db_exception(
    client: TestClient,
    session: Session,
    monkeypatch: pytest.MonkeyPatch,
):
    def failing_exec(*_args: object, **_kwargs: object) -> object:
        raise RuntimeError("secret_db_password_leak")

    monkeypatch.setattr(session, "exec", failing_exec)

    res = client.get("/api/health")
    assert res.status_code == 503
    body = res.json()
    assert body["status"] == "unhealthy"
    assert body["database"] == "disconnected"
    assert "secret_db_password_leak" not in res.text


def test_rate_limit_auth_login_exact_threshold_and_isolation(
    ip_client_factory: Callable[[str], TestClient],
):
    rl_client = ip_client_factory("198.51.100.11")
    for _ in range(15):
        res = rl_client.post(
            "/api/auth/login",
            json={
                "identifier": "ratelimit_login@diffly.dev",
                "password": "WrongPassword123!",
            },
        )
        assert res.status_code == 401

    blocked = rl_client.post(
        "/api/auth/login",
        json={
            "identifier": "ratelimit_login@diffly.dev",
            "password": "WrongPassword123!",
        },
    )
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) >= 1

    other_client = ip_client_factory("198.51.100.99")
    for _ in range(15):
        res = other_client.post(
            "/api/auth/login",
            json={
                "identifier": "ratelimit_login@diffly.dev",
                "password": "WrongPassword123!",
            },
        )
        assert res.status_code == 401


def test_rate_limit_ignores_spoofed_x_forwarded_for(
    ip_client_factory: Callable[[str], TestClient],
):
    rl_client = ip_client_factory("198.51.100.20")
    for idx in range(15):
        res = rl_client.post(
            "/api/auth/login",
            json={
                "identifier": "spoof_login@diffly.dev",
                "password": "WrongPassword123!",
            },
            headers={"X-Forwarded-For": f"203.0.113.{idx + 1}"},
        )
        assert res.status_code == 401

    blocked = rl_client.post(
        "/api/auth/login",
        json={
            "identifier": "spoof_login@diffly.dev",
            "password": "WrongPassword123!",
        },
        headers={"X-Forwarded-For": "203.0.113.250"},
    )
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) >= 1


def test_rate_limit_trusted_proxy_uses_rightmost_untrusted_hop(
    ip_client_factory: Callable[[str], TestClient],
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(settings, "TRUSTED_PROXY_CIDRS", ["10.0.0.0/8"])
    proxy_client = ip_client_factory("10.0.0.5")

    for _ in range(15):
        res = proxy_client.post(
            "/api/auth/login",
            json={
                "identifier": "proxied_a@diffly.dev",
                "password": "WrongPassword123!",
            },
            headers={"X-Forwarded-For": "1.1.1.1, 203.0.113.50, 10.0.0.2"},
        )
        assert res.status_code == 401

    blocked = proxy_client.post(
        "/api/auth/login",
        json={
            "identifier": "proxied_a@diffly.dev",
            "password": "WrongPassword123!",
        },
        headers={"X-Forwarded-For": "8.8.8.8, 203.0.113.50, 10.0.0.3"},
    )
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) >= 1

    different_client_via_same_proxy = proxy_client.post(
        "/api/auth/login",
        json={
            "identifier": "proxied_b@diffly.dev",
            "password": "WrongPassword123!",
        },
        headers={"X-Forwarded-For": "203.0.113.51, 10.0.0.2"},
    )
    assert different_client_via_same_proxy.status_code == 401

    multi_header_blocked = proxy_client.post(
        "/api/auth/login",
        json={
            "identifier": "proxied_a@diffly.dev",
            "password": "WrongPassword123!",
        },
        headers=[
            ("X-Forwarded-For", "198.51.100.77"),
            ("X-Forwarded-For", "203.0.113.50, 10.0.0.2"),
        ],
    )
    assert multi_header_blocked.status_code == 429


def test_rate_limit_auth_register_exact_threshold(
    ip_client_factory: Callable[[str], TestClient],
):
    rl_client = ip_client_factory("198.51.100.12")
    for idx in range(10):
        rl_client.cookies.clear()
        res = rl_client.post(
            "/api/auth/register",
            json={
                "email": f"ratelimit_reg_{idx}@diffly.dev",
                "username": f"ratelimit_reg_{idx}",
                "password": DEFAULT_TEST_PASSWORD,
            },
        )
        assert res.status_code == 200

    blocked = rl_client.post(
        "/api/auth/register",
        json={
            "email": "ratelimit_reg_10@diffly.dev",
            "username": "ratelimit_reg_10",
            "password": DEFAULT_TEST_PASSWORD,
        },
    )
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) >= 1


def test_rate_limit_challenge_review_exact_threshold(
    ip_client_factory: Callable[[str], TestClient],
    session: Session,
):
    challenge = _create_public_challenge(session, slug="ratelimit-review")
    rl_client = ip_client_factory("198.51.100.13")
    for _ in range(30):
        res = rl_client.post(
            f"/api/challenges/{challenge.id}/review",
            json={
                "flagged_lines": [1],
                "comments": "Review submission for rate limit verification",
            },
        )
        assert res.status_code == 200

    blocked = rl_client.post(
        f"/api/challenges/{challenge.id}/review",
        json={
            "flagged_lines": [1],
            "comments": "Review submission for rate limit verification",
        },
    )
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) >= 1


def test_rate_limit_generate_custom_exact_threshold(
    ip_client_factory: Callable[[str], TestClient],
):
    rl_client = ip_client_factory("198.51.100.14")
    mocked_challenge = CustomChallengeResponse(
        slug="ratelimit-custom",
        title="Rate Limit Custom Challenge",
        difficulty=Difficulty.MEDIUM,
        category=Category.SECURITY,
        language=Language.PYTHON,
        description="Rate limit custom generation check",
        code_snippet="def handler(x):\n    return eval(x)\n",
    )
    with patch(
        "api.routes.challenges.generate_custom_challenge",
        new=AsyncMock(return_value=mocked_challenge),
    ):
        for _ in range(10):
            rl_client.cookies.clear()
            res = rl_client.post(
                "/api/challenges/generate-custom",
                json={
                    "topic": "Python eval injection",
                    "language": "python",
                    "difficulty": "Medium",
                },
                headers={"X-Gemini-Key": "test-gemini-key"},
            )
            assert res.status_code == 200

        blocked = rl_client.post(
            "/api/challenges/generate-custom",
            json={
                "topic": "Python eval injection",
                "language": "python",
                "difficulty": "Medium",
            },
            headers={"X-Gemini-Key": "test-gemini-key"},
        )
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) >= 1


def test_rate_limit_evaluate_custom_exact_threshold(
    ip_client_factory: Callable[[str], TestClient],
):
    rl_client = ip_client_factory("198.51.100.15")
    payload = {
        "expected_issues": [
            {
                "id": "rl-1",
                "title": "Sample defect",
                "severity": "high",
                "matched_lines": [1],
                "matched_keywords": ["eval"],
                "explanation": "Unsafe eval call",
            }
        ],
        "code_snippet": "eval(user_input)\n",
        "flagged_lines": [1],
        "comments": "Unsafe eval execution",
    }
    for _ in range(30):
        res = rl_client.post("/api/challenges/evaluate-custom", json=payload)
        assert res.status_code == 200

    blocked = rl_client.post("/api/challenges/evaluate-custom", json=payload)
    assert blocked.status_code == 429
    assert int(blocked.headers["Retry-After"]) >= 1


def test_sliding_window_limiter_lru_and_empty_bucket_eviction(
    monkeypatch: pytest.MonkeyPatch,
):
    now = 100.0
    monkeypatch.setattr("backend.core.rate_limit.time.monotonic", lambda: now)

    limiter = _SlidingWindowRateLimiter(max_buckets=2)
    assert (
        limiter.check_and_record(
            scope="s", client_ip="ip1", max_requests=2, window_seconds=10
        )
        is None
    )
    assert (
        limiter.check_and_record(
            scope="s", client_ip="ip2", max_requests=2, window_seconds=10
        )
        is None
    )
    assert list(limiter._buckets.keys()) == [("s", "ip1"), ("s", "ip2")]

    # Touch ip1 so ip2 becomes LRU, then insert ip3 to evict ip2.
    assert (
        limiter.check_and_record(
            scope="s", client_ip="ip1", max_requests=2, window_seconds=10
        )
        is None
    )
    assert (
        limiter.check_and_record(
            scope="s", client_ip="ip3", max_requests=2, window_seconds=10
        )
        is None
    )
    assert list(limiter._buckets.keys()) == [("s", "ip1"), ("s", "ip3")]

    # Advance past window so ip1 empties and is replaced cleanly with a fresh entry.
    now = 120.0
    assert (
        limiter.check_and_record(
            scope="s", client_ip="ip1", max_requests=1, window_seconds=10
        )
        is None
    )
    assert len(limiter._buckets[("s", "ip1")]) == 1


def test_settings_rejects_invalid_trusted_proxy_cidr():
    with pytest.raises(ValueError):
        Settings(TRUSTED_PROXY_CIDRS=["not-a-cidr"])

    parsed = Settings(TRUSTED_PROXY_CIDRS="127.0.0.1/32, 10.0.0.0/8")  # type: ignore[arg-type]
    assert parsed.TRUSTED_PROXY_CIDRS == ["127.0.0.1/32", "10.0.0.0/8"]
