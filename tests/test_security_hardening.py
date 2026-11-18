import re
from collections.abc import Callable, Generator
from contextlib import ExitStack
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session

from api.index import app
from backend.core.config import settings
from backend.core.db import get_session
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


@pytest.mark.parametrize("bad_username", ["   ", " ab "])
def test_register_rejects_whitespace_and_padded_short_usernames(
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


def test_login_rejects_oversized_password(client: TestClient):
    res = client.post(
        "/api/auth/login",
        json={
            "identifier": "someone@diffly.dev",
            "password": "a" * 200,
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


@pytest.mark.parametrize("bad_id", ["99999999999999999999", "²"])
def test_get_challenge_out_of_range_and_unicode_digit_return_404(
    client: TestClient,
    bad_id: str,
):
    res = client.get(f"/api/challenges/{bad_id}")
    assert res.status_code == 404


@pytest.mark.parametrize("bad_id", ["99999999999999999999", "²"])
def test_delete_custom_challenge_out_of_range_and_unicode_digit_return_404(
    client: TestClient,
    bad_id: str,
):
    res = client.delete(f"/api/challenges/custom/{bad_id}")
    assert res.status_code == 404


def test_cors_origin_regex_restricts_to_diffly_vercel_deployments():
    pattern = re.compile(settings.CORS_ORIGIN_REGEX)
    assert pattern.fullmatch("https://evil-attacker.vercel.app") is None
    assert pattern.fullmatch("https://diffly.vercel.app") is not None
    assert pattern.fullmatch("https://diffly-sigma.vercel.app") is not None
    assert (
        pattern.fullmatch("https://diffly-git-main-amirabaris.vercel.app") is not None
    )


def test_cors_headers_on_health_endpoint(client: TestClient):
    evil_preflight = client.options(
        "/api/health",
        headers={
            "Origin": "https://evil-attacker.vercel.app",
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


def test_rate_limit_auth_login(ip_client_factory: Callable[[str], TestClient]):
    rl_client = ip_client_factory("198.51.100.11")
    statuses: list[int] = []
    for _ in range(120):
        res = rl_client.post(
            "/api/auth/login",
            json={
                "identifier": "ratelimit_login@diffly.dev",
                "password": "WrongPassword123!",
            },
        )
        statuses.append(res.status_code)
        if res.status_code == 429:
            break

    assert statuses[0] == 401
    assert 429 in statuses


def test_rate_limit_auth_register(ip_client_factory: Callable[[str], TestClient]):
    rl_client = ip_client_factory("198.51.100.12")
    statuses: list[int] = []
    for _ in range(120):
        res = rl_client.post(
            "/api/auth/register",
            json={
                "email": "ratelimit_register@diffly.dev",
                "username": "ratelimit_register",
                "password": DEFAULT_TEST_PASSWORD,
            },
        )
        statuses.append(res.status_code)
        if res.status_code == 429:
            break

    assert statuses[0] == 200
    assert 429 in statuses


def test_rate_limit_challenge_review(
    ip_client_factory: Callable[[str], TestClient],
    session: Session,
):
    challenge = _create_public_challenge(session, slug="ratelimit-review")
    rl_client = ip_client_factory("198.51.100.13")
    statuses: list[int] = []
    for _ in range(120):
        res = rl_client.post(
            f"/api/challenges/{challenge.id}/review",
            json={
                "flagged_lines": [1],
                "comments": "Review submission for rate limit verification",
            },
        )
        statuses.append(res.status_code)
        if res.status_code == 429:
            break

    assert statuses[0] == 200
    assert 429 in statuses


def test_rate_limit_generate_custom(ip_client_factory: Callable[[str], TestClient]):
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
    statuses: list[int] = []
    with patch(
        "api.routes.challenges.generate_custom_challenge",
        new=AsyncMock(return_value=mocked_challenge),
    ):
        for _ in range(120):
            res = rl_client.post(
                "/api/challenges/generate-custom",
                json={
                    "topic": "Python eval injection",
                    "language": "python",
                    "difficulty": "Medium",
                },
                headers={"X-Gemini-Key": "test-gemini-key"},
            )
            statuses.append(res.status_code)
            if res.status_code == 429:
                break

    assert statuses[0] == 200
    assert 429 in statuses


def test_rate_limit_evaluate_custom(ip_client_factory: Callable[[str], TestClient]):
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
    statuses: list[int] = []
    for _ in range(120):
        res = rl_client.post("/api/challenges/evaluate-custom", json=payload)
        statuses.append(res.status_code)
        if res.status_code == 429:
            break

    assert statuses[0] == 200
    assert 429 in statuses
