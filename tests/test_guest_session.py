"""Unit tests for HMAC-signed guest session tokens and DB ownership invariants."""

import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

from backend.core.config import settings
from backend.core.guest_session import (
    GuestSession,
    _decode,
    _encode,
    mint_guest_session,
)
from backend.core.security import create_access_token, hash_password
from backend.models.challenge import Category, Challenge, Difficulty, Language
from backend.models.submission import Submission
from backend.models.user import User


def test_guest_token_roundtrip_and_rejection_cases():
    now = 1_700_000_000
    guest = GuestSession(id="g_test_valid_1234", issued_at=now)
    token = _encode(guest)

    decoded = _decode(token, now=now)
    assert decoded == guest

    assert _decode("not-signed-raw-string", now=now) is None
    assert _decode("", now=now) is None
    assert _decode("v1.a.1", now=now) is None
    assert _decode("v1.a.1.sig.extra", now=now) is None
    assert _decode("v2." + token[3:], now=now) is None
    assert _decode("x" * 257, now=now) is None
    assert _decode(123, now=now) is None  # type: ignore[arg-type]

    parts = token.split(".")
    tampered_id = ".".join([parts[0], "g_evil_id", parts[2], parts[3]])
    assert _decode(tampered_id, now=now) is None

    tampered_sig = ".".join([parts[0], parts[1], parts[2], parts[3][:-2] + "AA"])
    assert _decode(tampered_sig, now=now) is None

    bad_chars = _encode(GuestSession(id="bad.id$!", issued_at=now))
    assert _decode(bad_chars, now=now) is None

    bad_iat = ".".join([parts[0], parts[1], "not_an_int", parts[3]])
    assert _decode(bad_iat, now=now) is None

    future_token = _encode(GuestSession(id="g_future", issued_at=now + 120))
    assert _decode(future_token, now=now) is None

    skew_ok = _encode(GuestSession(id="g_skew_ok", issued_at=now + 30))
    assert _decode(skew_ok, now=now) is not None

    max_age = settings.GUEST_SESSION_MAX_AGE_DAYS * 86400
    expired_token = _encode(GuestSession(id="g_expired", issued_at=now - max_age - 1))
    assert _decode(expired_token, now=now) is None


def test_guest_token_needs_refresh_threshold():
    now = int(time.time())
    half_age = (settings.GUEST_SESSION_MAX_AGE_DAYS * 86400) // 2

    fresh = GuestSession(id="g_fresh", issued_at=now - 10)
    assert fresh.needs_refresh is False

    stale = GuestSession(id="g_stale", issued_at=now - half_age - 5)
    assert stale.needs_refresh is True


def test_access_jwt_in_guest_cookie_and_guest_cookie_as_bearer_rejected(
    client: TestClient, session: Session
):
    user = User(
        email="cross_token@diffly.dev",
        username="cross_token",
        hashed_password=hash_password("Password123!"),
        is_active=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    access_jwt = create_access_token(
        {"sub": str(user.id), "username": user.username, "email": user.email}
    )
    guest_token = _encode(mint_guest_session())

    client.cookies.clear()
    client.cookies.set(
        settings.GUEST_COOKIE_NAME, access_jwt, domain="testserver.local"
    )
    prog_res = client.get("/api/user/progress")
    assert prog_res.status_code == 200
    assert prog_res.json()["total_attempted"] == 0
    assert settings.GUEST_COOKIE_NAME in prog_res.headers.get("set-cookie", "")

    client.cookies.clear()
    me_res = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {guest_token}"},
    )
    assert me_res.status_code == 401


def test_stale_guest_cookie_refreshes_on_read_and_write(
    client: TestClient, session: Session
):
    half_age = (settings.GUEST_SESSION_MAX_AGE_DAYS * 86400) // 2
    stale_time = int(time.time()) - half_age - 60
    stale_guest = GuestSession(id="g_stale_refresh", issued_at=stale_time)
    client.cookies.set(
        settings.GUEST_COOKIE_NAME, _encode(stale_guest), domain="testserver.local"
    )

    res = client.get("/api/user/progress")
    assert res.status_code == 200
    set_cookie = res.headers.get("set-cookie", "")
    assert settings.GUEST_COOKIE_NAME in set_cookie
    refreshed = _decode(client.cookies.get(settings.GUEST_COOKIE_NAME) or "")
    assert refreshed is not None
    assert refreshed.id == "g_stale_refresh"
    assert refreshed.issued_at > stale_time


def test_single_owner_check_constraint():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)

    with Session(engine) as db:
        user = User(
            email="constraint@diffly.dev",
            username="constraint_user",
            hashed_password=hash_password("Password123!"),
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        ch = Challenge(
            slug="constraint-bad-ch",
            title="Constraint Bad",
            difficulty=Difficulty.EASY,
            category=Category.SECURITY,
            language=Language.PYTHON,
            description="desc",
            code_snippet="x = 1",
            is_public=False,
            user_id=user.id,
            session_id="g_should_fail",
        )
        db.add(ch)
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

        pub = Challenge(
            slug="constraint-pub-ch",
            title="Constraint Pub",
            difficulty=Difficulty.EASY,
            category=Category.SECURITY,
            language=Language.PYTHON,
            description="desc",
            code_snippet="x = 1",
            is_public=True,
        )
        db.add(pub)
        db.commit()
        db.refresh(pub)

        sub = Submission(
            challenge_id=pub.id,
            user_id=user.id,
            session_id="g_should_fail",
            flagged_lines=[1],
            comments="Bad dual owner",
            score=50,
        )
        db.add(sub)
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    engine.dispose()


def test_tampered_guest_cookie_on_write_emits_single_set_cookie(
    client: TestClient, session: Session
):
    pub = Challenge(
        slug="tampered-write-pub",
        title="Tampered Write Pub",
        difficulty=Difficulty.EASY,
        category=Category.SECURITY,
        language=Language.PYTHON,
        description="desc",
        code_snippet="x = 1",
        is_public=True,
    )
    session.add(pub)
    session.commit()

    client.cookies.set(
        settings.GUEST_COOKIE_NAME,
        "v1.g_tampered.1700000000.invalidsig",
        domain="testserver.local",
    )
    res = client.post(
        f"/api/challenges/{pub.slug}/review",
        json={"flagged_lines": [1], "comments": "Write with tampered cookie."},
    )
    assert res.status_code == 200

    guest_set_cookies = [
        value
        for name, value in res.headers.raw
        if name.lower() == b"set-cookie"
        and value.lstrip().startswith(
            f"{settings.GUEST_COOKIE_NAME}=".encode("latin-1")
        )
    ]
    assert len(guest_set_cookies) == 1
    assert b"Max-Age=0" not in guest_set_cookies[0]
    new_guest = _decode(client.cookies.get(settings.GUEST_COOKIE_NAME) or "")
    assert new_guest is not None
    assert new_guest.id != "g_tampered"
