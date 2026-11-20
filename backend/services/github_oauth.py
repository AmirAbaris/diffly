"""GitHub OAuth 2.0 flow helpers, state signing, and redirect sanitization."""

import base64
import hashlib
import hmac
import json
import re
import secrets
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import httpx
from fastapi import Request
from sqlmodel import Session, select

from backend.core.config import settings
from backend.models.user import User


_STATE_KEY_PURPOSE = b"diffly/github-oauth-state/v1"
_STATE_VERSION = 1
_MAX_STATE_LENGTH = 2048
_MAX_NEXT_LENGTH = 512
_USERNAME_CLEAN_RE = re.compile(r"[^A-Za-z0-9_-]+")


class GitHubOAuthError(Exception):
    """Typed error mapped to frontend ?auth_error=<code> query parameter."""

    def __init__(self, code: str, message: str = "") -> None:
        self.code = code
        super().__init__(message or code)


@dataclass(frozen=True, slots=True)
class OAuthStatePayload:
    """Verified OAuth state decoded from cookie and query parameter."""

    nonce: str
    exp: int
    next_path: str
    link_user_id: int | None


@dataclass(frozen=True, slots=True)
class GitHubProfile:
    """Verified GitHub identity extracted from GitHub REST APIs."""

    github_id: str
    github_login: str
    email: str
    avatar_url: str | None


def _state_key() -> bytes:
    return hmac.new(
        settings.JWT_SECRET_KEY.encode("utf-8"),
        _STATE_KEY_PURPOSE,
        hashlib.sha256,
    ).digest()


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(raw: str) -> bytes | None:
    if not raw or not raw.isascii():
        return None
    padding = "=" * (-len(raw) % 4)
    try:
        return base64.urlsafe_b64decode(raw + padding)
    except Exception:
        return None


def _sign_state(body: str) -> str:
    digest = hmac.new(_state_key(), body.encode("ascii"), hashlib.sha256).digest()
    return _b64url_encode(digest)


def sanitize_next_path(raw_next: str | None, default: str = "/challenges") -> str:
    """Allow only safe relative application paths to prevent open redirects."""
    if not isinstance(raw_next, str):
        return default
    cleaned = raw_next.strip()
    if not cleaned or len(cleaned) > _MAX_NEXT_LENGTH:
        return default
    if "\\" in cleaned or any(ord(ch) < 0x20 or ord(ch) == 0x7F for ch in cleaned):
        return default
    if not cleaned.startswith("/") or cleaned.startswith("//"):
        return default

    parsed = urlsplit(cleaned)
    if parsed.scheme or parsed.netloc:
        return default
    if not parsed.path.startswith("/") or parsed.path.startswith("//"):
        return default

    filtered_query = [
        (k, v)
        for k, v in parse_qsl(parsed.query, keep_blank_values=True)
        if k not in {"auth", "auth_error", "claim_status"}
    ]
    return urlunsplit(("", "", parsed.path, urlencode(filtered_query), ""))


def build_oauth_redirect_url(
    next_path: str,
    *,
    auth: str | None = None,
    auth_error: str | None = None,
    claim_status: str | None = None,
) -> str:
    """Build safe post-OAuth redirect URL with auth status query params."""
    safe_next = sanitize_next_path(next_path)
    parsed = urlsplit(safe_next)
    params = [
        (k, v)
        for k, v in parse_qsl(parsed.query, keep_blank_values=True)
        if k not in {"auth", "auth_error", "claim_status"}
    ]
    if auth:
        params.append(("auth", auth))
    if auth_error:
        params.append(("auth_error", auth_error))
    if claim_status:
        params.append(("claim_status", claim_status))

    relative = urlunsplit(("", "", parsed.path, urlencode(params), ""))
    frontend_origin = settings.FRONTEND_URL.strip().rstrip("/")
    if frontend_origin:
        return f"{frontend_origin}{relative}"
    return relative


def resolve_github_callback_url(request: Request) -> str:
    """Resolve the OAuth callback URL while rejecting untrusted Host headers."""
    explicit_uri = settings.GITHUB_OAUTH_REDIRECT_URI.strip()
    if explicit_uri:
        return explicit_uri

    frontend_origin = settings.FRONTEND_URL.strip().rstrip("/")
    if frontend_origin:
        return f"{frontend_origin}/api/auth/github/callback"

    raw_proto = (
        (request.headers.get("x-forwarded-proto") or request.url.scheme)
        .split(",")[0]
        .strip()
        .lower()
    )
    proto = raw_proto if raw_proto in {"http", "https"} else request.url.scheme

    forwarded_host = (
        (request.headers.get("x-forwarded-host") or "").split(",")[0].strip()
    )
    if forwarded_host:
        candidate_origin = f"{proto}://{forwarded_host}"
        if settings.is_allowed_origin(candidate_origin):
            return f"{candidate_origin}/api/auth/github/callback"

    host_header = (request.headers.get("host") or "").split(",")[0].strip()
    if host_header:
        for scheme_candidate in dict.fromkeys((proto, request.url.scheme)):
            candidate_origin = f"{scheme_candidate}://{host_header}"
            if settings.is_allowed_origin(candidate_origin):
                return f"{candidate_origin}/api/auth/github/callback"
        if host_header in {"testserver", "testserver.local"}:
            return f"{request.url.scheme}://{host_header}/api/auth/github/callback"

    if settings.CORS_ORIGINS:
        fallback_origin = settings.CORS_ORIGINS[0].strip().rstrip("/")
        if fallback_origin:
            return f"{fallback_origin}/api/auth/github/callback"

    raise GitHubOAuthError("github_unavailable", "Unable to resolve callback origin")


def mint_oauth_state(
    next_path: str,
    link_user_id: int | None,
    now: int | None = None,
) -> str:
    """Create an HMAC-signed, short-lived OAuth state token."""
    now_ts = int(time.time()) if now is None else now
    payload = {
        "v": _STATE_VERSION,
        "nonce": secrets.token_urlsafe(24),
        "exp": now_ts + settings.OAUTH_STATE_TTL_SECONDS,
        "next": sanitize_next_path(next_path),
        "uid": link_user_id,
    }
    raw_json = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode(
        "utf-8"
    )
    body = _b64url_encode(raw_json)
    sig = _sign_state(body)
    return f"v{_STATE_VERSION}.{body}.{sig}"


def verify_oauth_state(
    raw_state: str | None,
    cookie_state: str | None,
    now: int | None = None,
) -> OAuthStatePayload | None:
    """Verify OAuth state query parameter against signed cookie value."""
    if (
        not isinstance(raw_state, str)
        or not isinstance(cookie_state, str)
        or not raw_state
        or not cookie_state
        or len(raw_state) > _MAX_STATE_LENGTH
        or len(cookie_state) > _MAX_STATE_LENGTH
    ):
        return None

    if not hmac.compare_digest(raw_state, cookie_state):
        return None

    parts = raw_state.split(".")
    if len(parts) != 3 or parts[0] != f"v{_STATE_VERSION}":
        return None

    _, body, sig = parts
    if not body or not sig or not body.isascii() or not sig.isascii():
        return None

    expected_sig = _sign_state(body)
    if not hmac.compare_digest(sig, expected_sig):
        return None

    decoded_bytes = _b64url_decode(body)
    if decoded_bytes is None:
        return None

    try:
        data = json.loads(decoded_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None

    if not isinstance(data, dict) or data.get("v") != _STATE_VERSION:
        return None

    nonce = data.get("nonce")
    exp = data.get("exp")
    uid = data.get("uid")

    if not isinstance(nonce, str) or len(nonce) < 16:
        return None
    if isinstance(exp, bool) or not isinstance(exp, int):
        return None

    now_ts = int(time.time()) if now is None else now
    if exp < now_ts or exp > now_ts + settings.OAUTH_STATE_TTL_SECONDS + 60:
        return None

    if uid is not None and (
        isinstance(uid, bool) or not isinstance(uid, int) or uid <= 0
    ):
        return None

    return OAuthStatePayload(
        nonce=nonce,
        exp=exp,
        next_path=sanitize_next_path(data.get("next")),
        link_user_id=uid,
    )


def _sanitize_avatar_url(raw_url: Any) -> str | None:
    if not isinstance(raw_url, str):
        return None
    cleaned = raw_url.strip()
    if not cleaned or len(cleaned) > 512:
        return None
    parsed = urlsplit(cleaned)
    if parsed.scheme != "https" or not parsed.netloc:
        return None
    return cleaned


def _pick_verified_email(emails_payload: Any) -> str | None:
    if not isinstance(emails_payload, list):
        return None

    fallback_verified: str | None = None
    for entry in emails_payload:
        if not isinstance(entry, dict):
            continue
        if entry.get("verified") is not True:
            continue
        raw_email = entry.get("email")
        if not isinstance(raw_email, str):
            continue
        cleaned = raw_email.strip().lower()
        if "@" not in cleaned or len(cleaned) > 254:
            continue
        if entry.get("primary") is True:
            return cleaned
        if fallback_verified is None:
            fallback_verified = cleaned

    return fallback_verified


async def exchange_github_code(code: str, redirect_uri: str) -> GitHubProfile:
    """Exchange an OAuth authorization code for a verified GitHub user profile."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            token_resp = await client.post(
                "https://github.com/login/oauth/access_token",
                headers={"Accept": "application/json"},
                data={
                    "client_id": settings.GITHUB_CLIENT_ID.strip(),
                    "client_secret": settings.GITHUB_CLIENT_SECRET.strip(),
                    "code": code,
                    "redirect_uri": redirect_uri,
                },
            )
            if token_resp.status_code != 200:
                raise GitHubOAuthError("github_failed", "GitHub token exchange failed")

            token_data = token_resp.json()
            access_token = (
                token_data.get("access_token") if isinstance(token_data, dict) else None
            )
            if not isinstance(access_token, str) or not access_token.strip():
                raise GitHubOAuthError("github_failed", "Missing GitHub access token")

            api_headers = {
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "Diffly-OAuth",
            }
            user_resp = await client.get(
                "https://api.github.com/user", headers=api_headers
            )
            emails_resp = await client.get(
                "https://api.github.com/user/emails",
                headers=api_headers,
            )
    except GitHubOAuthError:
        raise
    except (httpx.HTTPError, ValueError) as exc:
        raise GitHubOAuthError("github_failed", "GitHub API request failed") from exc

    if user_resp.status_code != 200 or emails_resp.status_code != 200:
        raise GitHubOAuthError("github_failed", "GitHub profile lookup failed")

    try:
        user_data = user_resp.json()
        emails_data = emails_resp.json()
    except ValueError as exc:
        raise GitHubOAuthError("github_failed", "Invalid JSON from GitHub") from exc

    if not isinstance(user_data, dict):
        raise GitHubOAuthError("github_failed", "Unexpected GitHub user payload")

    raw_id = user_data.get("id")
    raw_login = user_data.get("login")
    if isinstance(raw_id, bool) or raw_id is None or not str(raw_id).strip():
        raise GitHubOAuthError("github_failed", "Missing GitHub user id")
    if not isinstance(raw_login, str) or not raw_login.strip():
        raise GitHubOAuthError("github_failed", "Missing GitHub username")

    verified_email = _pick_verified_email(emails_data)
    if not verified_email:
        raise GitHubOAuthError("github_failed", "GitHub account lacks a verified email")

    return GitHubProfile(
        github_id=str(raw_id).strip(),
        github_login=raw_login.strip(),
        email=verified_email,
        avatar_url=_sanitize_avatar_url(user_data.get("avatar_url")),
    )


def generate_unique_username(session: Session, raw_login: str) -> str:
    """Derive a valid, unused Diffly username from a GitHub login."""
    cleaned = _USERNAME_CLEAN_RE.sub("_", raw_login.strip()).strip("_")
    if len(cleaned) < 3:
        cleaned = f"gh_{cleaned}" if cleaned else "gh_reviewer"
        if len(cleaned) < 3:
            cleaned = cleaned.ljust(3, "0")
    base = cleaned[:40]

    candidate = cleaned[:50]
    for attempt in range(12):
        existing = session.exec(
            select(User.id).where(User.username_lower == candidate.lower())
        ).first()
        if existing is None:
            return candidate
        suffix = secrets.token_hex(2 if attempt < 6 else 4)
        candidate = f"{base}_{suffix}"[:50]

    return f"gh_{secrets.token_hex(6)}"[:50]
