"""Tests for GitHub OAuth sign-in, signup, account linking, and abuse cases."""

import asyncio
import time
from unittest.mock import AsyncMock, patch
from urllib.parse import parse_qs, urlsplit

import httpx
from fastapi import Request
from fastapi.testclient import TestClient
from sqlmodel import Session

from backend.core.config import settings
from backend.core.security import hash_password
from backend.models.challenge import Category, Challenge, Difficulty, Language
from backend.models.submission import Submission
from backend.models.user import User
from backend.services.github_oauth import (
    GitHubOAuthError,
    GitHubProfile,
    exchange_github_code,
    mint_oauth_state,
    resolve_github_callback_url,
    sanitize_next_path,
)


def test_auth_providers_reflects_configuration(client: TestClient, monkeypatch):
    monkeypatch.setattr(settings, "GITHUB_CLIENT_ID", "")
    monkeypatch.setattr(settings, "GITHUB_CLIENT_SECRET", "")
    res_off = client.get("/api/auth/providers")
    assert res_off.status_code == 200
    assert res_off.json() == {"github": False}

    monkeypatch.setattr(settings, "GITHUB_CLIENT_ID", "gh-client-123")
    monkeypatch.setattr(settings, "GITHUB_CLIENT_SECRET", "gh-secret-456")
    res_on = client.get("/api/auth/providers")
    assert res_on.status_code == 200
    assert res_on.json() == {"github": True}


def test_github_login_returns_503_when_unconfigured(client: TestClient, monkeypatch):
    monkeypatch.setattr(settings, "GITHUB_CLIENT_ID", "")
    monkeypatch.setattr(settings, "GITHUB_CLIENT_SECRET", "")

    res = client.get("/api/auth/github/login?next=/settings", follow_redirects=False)
    assert res.status_code == 503


def test_sanitize_next_path_prevents_open_redirects():
    assert sanitize_next_path("/settings") == "/settings"
    assert sanitize_next_path("/stats?window=90") == "/stats?window=90"
    assert sanitize_next_path("/stats?auth_error=old&tab=1") == "/stats?tab=1"
    assert sanitize_next_path("https://evil.com/phish") == "/challenges"
    assert sanitize_next_path("//evil.com/phish") == "/challenges"
    assert sanitize_next_path("/\\evil.com") == "/challenges"
    assert sanitize_next_path("/stats\r\nSet-Cookie: a=1") == "/challenges"
    assert sanitize_next_path("") == "/challenges"
    assert sanitize_next_path(None) == "/challenges"


def test_resolve_github_callback_url_validates_forwarded_host(monkeypatch):
    monkeypatch.setattr(settings, "GITHUB_OAUTH_REDIRECT_URI", "")
    monkeypatch.setattr(settings, "FRONTEND_URL", "")

    def _make_request(headers: list[tuple[bytes, bytes]]) -> Request:
        return Request(
            {
                "type": "http",
                "scheme": "http",
                "server": ("127.0.0.1", 8000),
                "path": "/api/auth/github/login",
                "headers": headers,
            }
        )

    trusted_req = _make_request(
        [
            (b"host", b"127.0.0.1:8000"),
            (b"x-forwarded-host", b"localhost:3000"),
            (b"x-forwarded-proto", b"http"),
        ]
    )
    assert (
        resolve_github_callback_url(trusted_req)
        == "http://localhost:3000/api/auth/github/callback"
    )

    spoofed_req = _make_request(
        [
            (b"host", b"evil.com"),
            (b"x-forwarded-host", b"attacker.example"),
            (b"x-forwarded-proto", b"https"),
        ]
    )
    assert (
        resolve_github_callback_url(spoofed_req)
        == "http://localhost:3000/api/auth/github/callback"
    )

    tls_proxy_req = _make_request(
        [
            (b"host", b"diffly.vercel.app"),
            (b"x-forwarded-proto", b"https"),
        ]
    )
    assert (
        resolve_github_callback_url(tls_proxy_req)
        == "https://diffly.vercel.app/api/auth/github/callback"
    )


def test_github_login_redirects_and_sets_signed_state_cookie(
    client: TestClient, monkeypatch
):
    monkeypatch.setattr(settings, "GITHUB_CLIENT_ID", "gh-client-abc")
    monkeypatch.setattr(settings, "GITHUB_CLIENT_SECRET", "gh-secret-xyz")

    res = client.get("/api/auth/github/login?next=/stats", follow_redirects=False)
    assert res.status_code == 302
    location = res.headers["location"]
    parsed = urlsplit(location)
    assert parsed.netloc == "github.com"
    assert parsed.path == "/login/oauth/authorize"
    qs = parse_qs(parsed.query)
    assert qs["client_id"] == ["gh-client-abc"]
    assert qs["scope"] == ["read:user user:email"]
    state_cookie = res.cookies.get(settings.OAUTH_STATE_COOKIE_NAME)
    assert state_cookie is not None
    assert qs["state"] == [state_cookie]


def test_github_callback_rejects_invalid_and_expired_states(
    client_factory, monkeypatch
):
    monkeypatch.setattr(settings, "GITHUB_CLIENT_ID", "gh-client-abc")
    monkeypatch.setattr(settings, "GITHUB_CLIENT_SECRET", "gh-secret-xyz")

    # Missing state cookie
    c1 = client_factory()
    res_missing = c1.get(
        "/api/auth/github/callback?code=abc&state=some_state",
        follow_redirects=False,
    )
    assert res_missing.status_code == 302
    assert res_missing.headers["location"] == "/challenges?auth_error=github_state"

    # Tampered state signature
    c2 = client_factory()
    valid_state = mint_oauth_state("/stats", None)
    c2.cookies.set(
        settings.OAUTH_STATE_COOKIE_NAME, valid_state, domain="testserver.local"
    )
    res_mismatch = c2.get(
        "/api/auth/github/callback?code=abc&state=different_state",
        follow_redirects=False,
    )
    assert res_mismatch.status_code == 302
    assert "auth_error=github_state" in res_mismatch.headers["location"]

    # Expired state
    c3 = client_factory()
    expired_state = mint_oauth_state("/stats", None, now=int(time.time()) - 3600)
    c3.cookies.set(
        settings.OAUTH_STATE_COOKIE_NAME, expired_state, domain="testserver.local"
    )
    res_expired = c3.get(
        f"/api/auth/github/callback?code=abc&state={expired_state}",
        follow_redirects=False,
    )
    assert res_expired.status_code == 302
    assert "auth_error=github_state" in res_expired.headers["location"]


def test_github_callback_handles_access_denied_and_missing_code(
    client_factory, monkeypatch
):
    monkeypatch.setattr(settings, "GITHUB_CLIENT_ID", "gh-client-abc")
    monkeypatch.setattr(settings, "GITHUB_CLIENT_SECRET", "gh-secret-xyz")

    c = client_factory()
    init_res = c.get("/api/auth/github/login?next=/profile", follow_redirects=False)
    state = init_res.cookies.get(settings.OAUTH_STATE_COOKIE_NAME)
    assert state is not None

    denied_res = c.get(
        f"/api/auth/github/callback?error=access_denied&state={state}",
        follow_redirects=False,
    )
    assert denied_res.status_code == 302
    assert denied_res.headers["location"] == "/profile?auth_error=github_denied"

    init_res2 = c.get("/api/auth/github/login?next=/profile", follow_redirects=False)
    state2 = init_res2.cookies.get(settings.OAUTH_STATE_COOKIE_NAME)
    no_code_res = c.get(
        f"/api/auth/github/callback?state={state2}",
        follow_redirects=False,
    )
    assert no_code_res.status_code == 302
    assert no_code_res.headers["location"] == "/profile?auth_error=github_failed"


def test_github_signup_creates_passwordless_user_claims_guest_and_blocks_pw_login(
    client_factory, session: Session, as_guest, monkeypatch
):
    monkeypatch.setattr(settings, "GITHUB_CLIENT_ID", "gh-client-abc")
    monkeypatch.setattr(settings, "GITHUB_CLIENT_SECRET", "gh-secret-xyz")

    ch = Challenge(
        slug="gh-claim-pub",
        title="GH Claim Pub",
        difficulty=Difficulty.EASY,
        category=Category.SECURITY,
        language=Language.PYTHON,
        description="Public",
        code_snippet="x = 1",
        is_public=True,
    )
    session.add(ch)
    session.commit()
    session.refresh(ch)

    c = client_factory()
    guest_sid = as_guest(c, "g_gh_claim_test")
    sub = Submission(
        challenge_id=ch.id,
        session_id=guest_sid,
        score=88,
        comments="Guest work before GitHub sign-in",
        flagged_lines=[1],
    )
    session.add(sub)
    session.commit()

    init_res = c.get("/api/auth/github/login?next=/stats", follow_redirects=False)
    state = init_res.cookies.get(settings.OAUTH_STATE_COOKIE_NAME)
    assert state is not None

    with patch(
        "api.routes.auth.exchange_github_code",
        new=AsyncMock(
            return_value=GitHubProfile(
                github_id="987654",
                github_login="octocat",
                email="octocat@github.example",
                avatar_url="https://avatars.githubusercontent.com/u/583231?v=4",
            )
        ),
    ):
        cb_res = c.get(
            f"/api/auth/github/callback?code=valid-code&state={state}",
            follow_redirects=False,
        )

    assert cb_res.status_code == 302
    assert cb_res.headers["location"] == "/stats?auth=github_success"
    assert settings.AUTH_COOKIE_NAME in cb_res.cookies
    assert c.cookies.get(settings.GUEST_COOKIE_NAME) is None

    me_res = c.get("/api/auth/me")
    assert me_res.status_code == 200
    me = me_res.json()
    assert me["username"] == "octocat"
    assert me["email"] == "octocat@github.example"
    assert me["github_login"] == "octocat"
    assert me["has_password"] is False

    session.refresh(sub)
    assert sub.user_id == me["id"]
    assert sub.session_id is None

    # Password login must fail for passwordless GitHub user
    pw_login = c.post(
        "/api/auth/login",
        json={"identifier": "octocat", "password": "any-password"},
    )
    assert pw_login.status_code == 401


def test_github_signup_handles_username_collision_and_signin_by_github_id(
    client_factory, session: Session, register_user, monkeypatch
):
    monkeypatch.setattr(settings, "GITHUB_CLIENT_ID", "gh-client-abc")
    monkeypatch.setattr(settings, "GITHUB_CLIENT_SECRET", "gh-secret-xyz")

    register_user("shared_handle", email="other@diffly.dev")

    c = client_factory()
    init_res = c.get("/api/auth/github/login?next=/profile", follow_redirects=False)
    state = init_res.cookies.get(settings.OAUTH_STATE_COOKIE_NAME)

    with patch(
        "api.routes.auth.exchange_github_code",
        new=AsyncMock(
            return_value=GitHubProfile(
                github_id="112233",
                github_login="shared_handle",
                email="gh_user@github.example",
                avatar_url=None,
            )
        ),
    ):
        cb_res = c.get(
            f"/api/auth/github/callback?code=code-1&state={state}",
            follow_redirects=False,
        )
    assert cb_res.status_code == 302
    assert cb_res.headers["location"] == "/profile?auth=github_success"
    me = c.get("/api/auth/me").json()
    assert me["username"].startswith("shared_handle_")
    assert me["github_login"] == "shared_handle"

    # Subsequent login with renamed GitHub handle updates github_login
    c2 = client_factory()
    init2 = c2.get("/api/auth/github/login?next=/profile", follow_redirects=False)
    state2 = init2.cookies.get(settings.OAUTH_STATE_COOKIE_NAME)
    with patch(
        "api.routes.auth.exchange_github_code",
        new=AsyncMock(
            return_value=GitHubProfile(
                github_id="112233",
                github_login="renamed_handle",
                email="gh_user@github.example",
                avatar_url=None,
            )
        ),
    ):
        cb2 = c2.get(
            f"/api/auth/github/callback?code=code-2&state={state2}",
            follow_redirects=False,
        )
    assert cb2.status_code == 302
    me2 = c2.get("/api/auth/me").json()
    assert me2["id"] == me["id"]
    assert me2["github_login"] == "renamed_handle"


def test_github_email_collision_refuses_auto_merge_until_explicit_link(
    client_factory, session: Session, register_user, login_as, monkeypatch
):
    monkeypatch.setattr(settings, "GITHUB_CLIENT_ID", "gh-client-abc")
    monkeypatch.setattr(settings, "GITHUB_CLIENT_SECRET", "gh-secret-xyz")

    existing = register_user("pw_owner", email="victim@diffly.dev")

    anon_client = client_factory()
    init_res = anon_client.get(
        "/api/auth/github/login?next=/challenges", follow_redirects=False
    )
    state = init_res.cookies.get(settings.OAUTH_STATE_COOKIE_NAME)

    with patch(
        "api.routes.auth.exchange_github_code",
        new=AsyncMock(
            return_value=GitHubProfile(
                github_id="777888",
                github_login="attacker_gh",
                email="victim@diffly.dev",
                avatar_url=None,
            )
        ),
    ):
        cb_res = anon_client.get(
            f"/api/auth/github/callback?code=c1&state={state}",
            follow_redirects=False,
        )
    assert cb_res.status_code == 302
    assert "auth_error=github_email_in_use" in cb_res.headers["location"]
    assert settings.AUTH_COOKIE_NAME not in cb_res.cookies

    # Legitimate user signs in with password and links GitHub from Settings
    authed_client = login_as("pw_owner")
    link_init = authed_client.get(
        "/api/auth/github/login?next=/settings", follow_redirects=False
    )
    link_state = link_init.cookies.get(settings.OAUTH_STATE_COOKIE_NAME)

    with patch(
        "api.routes.auth.exchange_github_code",
        new=AsyncMock(
            return_value=GitHubProfile(
                github_id="777888",
                github_login="legit_gh",
                email="victim@diffly.dev",
                avatar_url="https://avatars.githubusercontent.com/u/1?v=4",
            )
        ),
    ):
        link_cb = authed_client.get(
            f"/api/auth/github/callback?code=c2&state={link_state}",
            follow_redirects=False,
        )
    assert link_cb.status_code == 302
    assert link_cb.headers["location"] == "/settings?auth=github_success"
    me = authed_client.get("/api/auth/me").json()
    assert me["id"] == existing["id"]
    assert me["github_login"] == "legit_gh"
    assert me["has_password"] is True


def test_github_link_rejects_already_linked_to_another_user(
    client_factory, session: Session, register_user, login_as, monkeypatch
):
    monkeypatch.setattr(settings, "GITHUB_CLIENT_ID", "gh-client-abc")
    monkeypatch.setattr(settings, "GITHUB_CLIENT_SECRET", "gh-secret-xyz")

    u1 = register_user("gh_owner_1")
    register_user("gh_owner_2")
    db_u1 = session.get(User, u1["id"])
    assert db_u1 is not None
    db_u1.github_id = "gh-shared-id"
    db_u1.github_login = "owner1_gh"
    session.add(db_u1)
    session.commit()

    c2 = login_as("gh_owner_2")
    init2 = c2.get("/api/auth/github/login?next=/settings", follow_redirects=False)
    state2 = init2.cookies.get(settings.OAUTH_STATE_COOKIE_NAME)

    with patch(
        "api.routes.auth.exchange_github_code",
        new=AsyncMock(
            return_value=GitHubProfile(
                github_id="gh-shared-id",
                github_login="owner1_gh",
                email="owner1@github.example",
                avatar_url=None,
            )
        ),
    ):
        cb2 = c2.get(
            f"/api/auth/github/callback?code=c3&state={state2}",
            follow_redirects=False,
        )
    assert cb2.status_code == 302
    assert cb2.headers["location"] == "/settings?auth_error=github_already_linked"

    # Also test user 1 trying to link a different GitHub ID
    c1 = login_as("gh_owner_1")
    init1 = c1.get("/api/auth/github/login?next=/settings", follow_redirects=False)
    state1 = init1.cookies.get(settings.OAUTH_STATE_COOKIE_NAME)
    with patch(
        "api.routes.auth.exchange_github_code",
        new=AsyncMock(
            return_value=GitHubProfile(
                github_id="gh-other-id",
                github_login="other_gh",
                email="other@github.example",
                avatar_url=None,
            )
        ),
    ):
        cb1 = c1.get(
            f"/api/auth/github/callback?code=c4&state={state1}",
            follow_redirects=False,
        )
    assert cb1.status_code == 302
    assert cb1.headers["location"] == "/settings?auth_error=github_already_linked"


def test_exchange_github_code_requires_verified_email(monkeypatch):
    monkeypatch.setattr(settings, "GITHUB_CLIENT_ID", "cid")
    monkeypatch.setattr(settings, "GITHUB_CLIENT_SECRET", "csec")

    async def _mock_post(self, url, **kwargs):
        return httpx.Response(
            200,
            json={"access_token": "gho_secret"},
            request=httpx.Request("POST", url),
        )

    async def _mock_get_unverified(self, url, **kwargs):
        if url.endswith("/user"):
            return httpx.Response(
                200,
                json={"id": 42, "login": "unverified_user", "avatar_url": "http://bad"},
                request=httpx.Request("GET", url),
            )
        return httpx.Response(
            200,
            json=[
                {"email": "spoof@diffly.dev", "primary": True, "verified": False},
            ],
            request=httpx.Request("GET", url),
        )

    with (
        patch.object(httpx.AsyncClient, "post", new=_mock_post),
        patch.object(httpx.AsyncClient, "get", new=_mock_get_unverified),
    ):
        try:
            asyncio.run(
                exchange_github_code("code-x", "http://localhost:3000/callback")
            )
        except GitHubOAuthError as exc:
            assert exc.code == "github_failed"
        else:
            raise AssertionError("Expected GitHubOAuthError for unverified email")

    async def _mock_get_mixed(self, url, **kwargs):
        if url.endswith("/user"):
            return httpx.Response(
                200,
                json={
                    "id": 42,
                    "login": "verified_user",
                    "avatar_url": "https://avatars.githubusercontent.com/u/42",
                },
                request=httpx.Request("GET", url),
            )
        return httpx.Response(
            200,
            json=[
                {"email": "spoof@diffly.dev", "primary": True, "verified": False},
                {"email": "real@github.dev", "primary": False, "verified": True},
            ],
            request=httpx.Request("GET", url),
        )

    with (
        patch.object(httpx.AsyncClient, "post", new=_mock_post),
        patch.object(httpx.AsyncClient, "get", new=_mock_get_mixed),
    ):
        profile = asyncio.run(
            exchange_github_code("code-y", "http://localhost:3000/callback")
        )
    assert profile.email == "real@github.dev"
    assert profile.avatar_url == "https://avatars.githubusercontent.com/u/42"
    assert hash_password("pw")
