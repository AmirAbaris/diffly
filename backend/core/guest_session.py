"""HMAC-signed guest session cookies."""

import base64
import hashlib
import hmac
import re
import secrets
import time
from dataclasses import dataclass

from fastapi import Request, Response

from backend.core.config import settings


_GUEST_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}\Z")
_INT_RE = re.compile(r"^[0-9]+\Z")
_KEY_PURPOSE = b"diffly/guest-session/v1"
_TOKEN_VERSION = "v1"  # noqa: S105
_MAX_TOKEN_LENGTH = 256
_FUTURE_SKEW_SECONDS = 60


@dataclass(frozen=True, slots=True)
class GuestSession:
    """Verified guest session extracted from an HMAC-signed cookie."""

    id: str
    issued_at: int

    @property
    def needs_refresh(self) -> bool:
        max_age_seconds = settings.GUEST_SESSION_MAX_AGE_DAYS * 86400
        age = int(time.time()) - self.issued_at
        return age >= (max_age_seconds // 2)


def _guest_key() -> bytes:
    return hmac.new(
        settings.JWT_SECRET_KEY.encode("utf-8"),
        _KEY_PURPOSE,
        hashlib.sha256,
    ).digest()


def _sign(payload: str) -> str:
    digest = hmac.new(
        _guest_key(),
        payload.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def mint_guest_session() -> GuestSession:
    """Create a fresh guest session with a high-entropy opaque ID."""
    return GuestSession(
        id=f"g_{secrets.token_urlsafe(18)}",
        issued_at=int(time.time()),
    )


def _encode(guest: GuestSession) -> str:
    payload = f"{_TOKEN_VERSION}.{guest.id}.{guest.issued_at}"
    sig = _sign(payload)
    return f"{payload}.{sig}"


def _decode(raw: str, now: int | None = None) -> GuestSession | None:
    if not isinstance(raw, str):
        return None
    if not raw or len(raw) > _MAX_TOKEN_LENGTH:
        return None

    parts = raw.split(".")
    if len(parts) != 4:
        return None

    version, guest_id, issued_at_str, sig = parts
    if version != _TOKEN_VERSION:
        return None
    if not _GUEST_ID_RE.match(guest_id):
        return None
    if not _INT_RE.match(issued_at_str):
        return None
    if not sig or not sig.isascii():
        return None

    try:
        issued_at = int(issued_at_str)
    except ValueError:
        return None

    now_ts = int(time.time()) if now is None else now
    if issued_at > now_ts + _FUTURE_SKEW_SECONDS:
        return None

    max_age_seconds = settings.GUEST_SESSION_MAX_AGE_DAYS * 86400
    if (now_ts - issued_at) > max_age_seconds:
        return None

    payload = f"{version}.{guest_id}.{issued_at}"
    expected_sig = _sign(payload)
    if not hmac.compare_digest(sig, expected_sig):
        return None

    return GuestSession(id=guest_id, issued_at=issued_at)


def read_guest_session(request: Request) -> GuestSession | None:
    """Read and verify the signed guest session strictly from the HttpOnly cookie."""
    raw = request.cookies.get(settings.GUEST_COOKIE_NAME)
    if not raw:
        return None
    return _decode(raw)


def _strip_guest_cookie_headers(response: Response) -> None:
    prefix = f"{settings.GUEST_COOKIE_NAME}=".encode("latin-1")
    response.raw_headers[:] = [
        (name, value)
        for name, value in response.raw_headers
        if not (name.lower() == b"set-cookie" and value.lstrip().startswith(prefix))
    ]


def write_guest_cookie(response: Response, guest: GuestSession) -> None:
    """Write an HMAC-signed guest session cookie onto the HTTP response."""
    _strip_guest_cookie_headers(response)
    response.set_cookie(
        key=settings.GUEST_COOKIE_NAME,
        value=_encode(guest),
        max_age=settings.GUEST_SESSION_MAX_AGE_DAYS * 86400,
        httponly=True,
        samesite="lax",
        secure=settings.is_cookie_secure,
        path="/",
    )


def clear_guest_cookie(response: Response) -> None:
    """Delete the guest session cookie with matching cookie attributes."""
    _strip_guest_cookie_headers(response)
    response.delete_cookie(
        key=settings.GUEST_COOKIE_NAME,
        path="/",
        httponly=True,
        samesite="lax",
        secure=settings.is_cookie_secure,
    )
