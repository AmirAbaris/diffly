from datetime import timedelta
from unittest.mock import Mock

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from api.deps import get_optional_current_user
from backend.core.config import settings
from backend.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from backend.models.challenge import Category, Challenge, Difficulty, Language
from backend.models.submission import Submission
from backend.models.user import User


def test_password_hashing():
    raw_pw = "SuperSecurePassword123!"
    hashed = hash_password(raw_pw)

    assert hashed != raw_pw
    assert verify_password(raw_pw, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False
    assert verify_password(raw_pw, "invalid_hash_string") is False


def test_jwt_create_and_decode():
    data = {"sub": "42", "username": "alice", "email": "alice@diffly.dev"}
    token = create_access_token(data)

    payload = decode_access_token(token)
    assert payload is not None
    assert payload["sub"] == "42"
    assert payload["username"] == "alice"
    assert payload["email"] == "alice@diffly.dev"
    assert "exp" in payload

    # Expired token test
    expired_token = create_access_token(data, expires_delta=timedelta(seconds=-10))
    assert decode_access_token(expired_token) is None

    # Invalid token test
    assert decode_access_token("not-a-valid-jwt-token") is None


def test_register_success(client: TestClient):
    payload = {
        "email": "developer@diffly.dev",
        "username": "devreviewer",
        "password": "StrongPassword123!",
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert data["id"] is not None
    assert data["email"] == "developer@diffly.dev"
    assert data["username"] == "devreviewer"
    assert "hashed_password" not in data

    # Verify auth cookie was set
    set_cookie_header = response.headers.get("set-cookie", "")
    assert settings.AUTH_COOKIE_NAME in set_cookie_header
    assert "HttpOnly" in set_cookie_header
    assert "samesite=lax" in set_cookie_header.lower()


def test_register_duplicate_email_fails(client: TestClient):
    payload1 = {
        "email": "unique@diffly.dev",
        "username": "userone",
        "password": "Password123!",
    }
    resp1 = client.post("/api/auth/register", json=payload1)
    assert resp1.status_code == 200

    payload2 = {
        "email": "UNIQUE@diffly.dev",
        "username": "usertwo",
        "password": "Password123!",
    }
    resp2 = client.post("/api/auth/register", json=payload2)
    assert resp2.status_code == 400
    assert "Email already registered" in resp2.json()["detail"]


def test_register_duplicate_username_fails(client: TestClient):
    payload1 = {
        "email": "user1@diffly.dev",
        "username": "coder",
        "password": "Password123!",
    }
    resp1 = client.post("/api/auth/register", json=payload1)
    assert resp1.status_code == 200

    payload2 = {
        "email": "user2@diffly.dev",
        "username": "coder",
        "password": "Password123!",
    }
    resp2 = client.post("/api/auth/register", json=payload2)
    assert resp2.status_code == 400
    assert "Username already taken" in resp2.json()["detail"]


def test_register_invalid_email_format(client: TestClient):
    payload = {
        "email": "not-an-email",
        "username": "bademailuser",
        "password": "Password123!",
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 422


def test_register_claims_guest_submissions(client: TestClient, session: Session):
    challenge = Challenge(
        slug="guest-challenge-1",
        title="Guest Challenge",
        difficulty=Difficulty.EASY,
        category=Category.SECURITY,
        language=Language.PYTHON,
        description="Find bug",
        threat_model="None",
        defect_target="Find bug",
        code_snippet="x = 1",
    )
    session.add(challenge)
    session.commit()
    session.refresh(challenge)

    guest_sub = Submission(
        challenge_id=challenge.id,
        user_id=None,
        session_id="guest-session-reg",
        flagged_lines=[1],
        comments="Potential vulnerability spotted",
        score=90,
    )
    session.add(guest_sub)
    session.commit()
    session.refresh(guest_sub)

    assert guest_sub.user_id is None

    register_payload = {
        "email": "claimer@diffly.dev",
        "username": "claimer",
        "password": "Password123!",
        "session_id": "guest-session-reg",
    }
    response = client.post("/api/auth/register", json=register_payload)
    assert response.status_code == 200
    user_id = response.json()["id"]

    session.refresh(guest_sub)
    assert guest_sub.user_id == user_id


def test_register_claims_guest_submissions_via_header(
    client: TestClient, session: Session
):
    challenge = Challenge(
        slug="guest-challenge-header",
        title="Header Challenge",
        difficulty=Difficulty.EASY,
        category=Category.SECURITY,
        language=Language.PYTHON,
        description="Find bug",
        threat_model="None",
        defect_target="Find bug",
        code_snippet="x = 1",
    )
    session.add(challenge)
    session.commit()
    session.refresh(challenge)

    guest_sub = Submission(
        challenge_id=challenge.id,
        user_id=None,
        session_id="guest-session-header-123",
        flagged_lines=[1],
        comments="Found bug",
        score=85,
    )
    session.add(guest_sub)
    session.commit()
    session.refresh(guest_sub)

    register_payload = {
        "email": "headeruser@diffly.dev",
        "username": "headeruser",
        "password": "Password123!",
    }
    response = client.post(
        "/api/auth/register",
        json=register_payload,
        headers={"X-Diffly-Session-Id": "guest-session-header-123"},
    )
    assert response.status_code == 200
    user_id = response.json()["id"]

    session.refresh(guest_sub)
    assert guest_sub.user_id == user_id


def test_login_success_with_username(client: TestClient, session: Session):
    user = User(
        email="loginuser@diffly.dev",
        username="loginuser",
        hashed_password=hash_password("MySecretPass123!"),
    )
    session.add(user)
    session.commit()

    response = client.post(
        "/api/auth/login",
        json={"username": "loginuser", "password": "MySecretPass123!"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["username"] == "loginuser"
    assert data["email"] == "loginuser@diffly.dev"
    assert "hashed_password" not in data

    set_cookie = response.headers.get("set-cookie", "")
    assert settings.AUTH_COOKIE_NAME in set_cookie
    assert "HttpOnly" in set_cookie


def test_login_success_with_email(client: TestClient, session: Session):
    user = User(
        email="emailuser@diffly.dev",
        username="emailuser",
        hashed_password=hash_password("MySecretPass123!"),
    )
    session.add(user)
    session.commit()

    response = client.post(
        "/api/auth/login",
        json={"email": "emailuser@diffly.dev", "password": "MySecretPass123!"},
    )
    assert response.status_code == 200
    assert response.json()["username"] == "emailuser"


def test_login_success_with_identifier(client: TestClient, session: Session):
    user = User(
        email="identuser@diffly.dev",
        username="identuser",
        hashed_password=hash_password("MySecretPass123!"),
    )
    session.add(user)
    session.commit()

    # Log in using identifier = username
    resp1 = client.post(
        "/api/auth/login",
        json={"identifier": "identuser", "password": "MySecretPass123!"},
    )
    assert resp1.status_code == 200

    # Log in using identifier = email
    resp2 = client.post(
        "/api/auth/login",
        json={"identifier": "identuser@diffly.dev", "password": "MySecretPass123!"},
    )
    assert resp2.status_code == 200


def test_login_wrong_password_fails(client: TestClient, session: Session):
    user = User(
        email="pwuser@diffly.dev",
        username="pwuser",
        hashed_password=hash_password("CorrectPass123!"),
    )
    session.add(user)
    session.commit()

    response = client.post(
        "/api/auth/login",
        json={"username": "pwuser", "password": "WrongPassword!"},
    )
    assert response.status_code == 401
    assert "Invalid credentials" in response.json()["detail"]


def test_login_nonexistent_user_fails(client: TestClient):
    response = client.post(
        "/api/auth/login",
        json={"username": "ghostuser", "password": "AnyPassword123!"},
    )
    assert response.status_code == 401
    assert "Invalid credentials" in response.json()["detail"]


def test_login_inactive_user_fails(client: TestClient, session: Session):
    user = User(
        email="inactive@diffly.dev",
        username="inactiveuser",
        hashed_password=hash_password("Password123!"),
        is_active=False,
    )
    session.add(user)
    session.commit()

    response = client.post(
        "/api/auth/login",
        json={"username": "inactiveuser", "password": "Password123!"},
    )
    assert response.status_code == 403
    assert "inactive" in response.json()["detail"].lower()


def test_login_claims_guest_submissions(client: TestClient, session: Session):
    user = User(
        email="loginclaimer@diffly.dev",
        username="loginclaimer",
        hashed_password=hash_password("Password123!"),
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    challenge = session.exec(select(Challenge)).first()
    if not challenge:
        challenge = Challenge(
            slug="login-claim-ch",
            title="Claim Challenge",
            difficulty=Difficulty.EASY,
            category=Category.SECURITY,
            language=Language.PYTHON,
            description="Find bug",
            threat_model="None",
            defect_target="Find bug",
            code_snippet="x = 1",
        )
        session.add(challenge)
        session.commit()
        session.refresh(challenge)

    guest_sub = Submission(
        challenge_id=challenge.id,
        user_id=None,
        session_id="guest-login-claim-sid",
        flagged_lines=[1],
        comments="Pre-login review",
        score=75,
    )
    session.add(guest_sub)
    session.commit()
    session.refresh(guest_sub)

    resp = client.post(
        "/api/auth/login",
        json={
            "username": "loginclaimer",
            "password": "Password123!",
            "session_id": "guest-login-claim-sid",
        },
    )
    assert resp.status_code == 200

    session.refresh(guest_sub)
    assert guest_sub.user_id == user.id


def test_get_me_authenticated_via_cookie(client: TestClient):
    reg_payload = {
        "email": "me_cookie@diffly.dev",
        "username": "mecookie",
        "password": "Password123!",
    }
    reg_resp = client.post("/api/auth/register", json=reg_payload)
    assert reg_resp.status_code == 200
    user_id = reg_resp.json()["id"]

    # TestClient retains cookies across requests in session
    me_resp = client.get("/api/auth/me")
    assert me_resp.status_code == 200
    me_data = me_resp.json()
    assert me_data["id"] == user_id
    assert me_data["email"] == "me_cookie@diffly.dev"
    assert me_data["username"] == "mecookie"


def test_get_me_authenticated_via_bearer_header(client: TestClient, session: Session):
    user = User(
        email="me_bearer@diffly.dev",
        username="mebearer",
        hashed_password=hash_password("Password123!"),
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    token = create_access_token(
        {"sub": str(user.id), "username": user.username, "email": user.email}
    )

    client.cookies.clear()
    resp = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["id"] == user.id
    assert resp.json()["username"] == "mebearer"


def test_get_me_unauthenticated_fails(client: TestClient):
    client.cookies.clear()
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401
    assert "Authentication required" in resp.json()["detail"]


def test_get_me_invalid_token_fails(client: TestClient):
    client.cookies.clear()
    resp = client.get(
        "/api/auth/me",
        headers={"Authorization": "Bearer invalid.malformed.token"},
    )
    assert resp.status_code == 401


def test_logout_clears_cookie(client: TestClient):
    # Register/login first
    client.post(
        "/api/auth/register",
        json={
            "email": "logoutuser@diffly.dev",
            "username": "logoutuser",
            "password": "Password123!",
        },
    )

    # Logout
    logout_resp = client.post("/api/auth/logout")
    assert logout_resp.status_code == 200
    assert logout_resp.json() == {"message": "Logged out successfully"}

    set_cookie = logout_resp.headers.get("set-cookie", "")
    assert settings.AUTH_COOKIE_NAME in set_cookie
    assert "max-age=0" in set_cookie.lower() or "expires=" in set_cookie.lower()

    # Subsequent /me should fail
    me_resp = client.get("/api/auth/me")
    assert me_resp.status_code == 401


def test_login_missing_credentials_fails(client: TestClient):
    resp = client.post("/api/auth/login", json={"username": "", "password": ""})
    assert resp.status_code == 400
    assert "Username or email and password are required" in resp.json()["detail"]


def test_deps_request_state_override(session: Session):
    mock_user = User(
        id=999,
        email="mocked@diffly.dev",
        username="mocked",
        hashed_password="pw",
    )
    request = Mock()
    request.state.user = mock_user

    resolved = get_optional_current_user(request=request, session=session)
    assert resolved is mock_user


def test_register_and_login_claim_guest_custom_challenges(
    client: TestClient, session: Session
):
    """Guest custom private challenges are migrated to user_id on signup/login."""
    custom_ch_reg = Challenge(
        slug="guest-custom-reg-ch",
        title="Guest Custom Reg Challenge",
        difficulty=Difficulty.MEDIUM,
        category=Category.SECURITY,
        language=Language.PYTHON,
        description="Custom challenge created as guest",
        code_snippet="x = 1",
        is_public=False,
        user_id=None,
        session_id="guest-custom-reg-sid",
    )
    custom_ch_login = Challenge(
        slug="guest-custom-login-ch",
        title="Guest Custom Login Challenge",
        difficulty=Difficulty.HARD,
        category=Category.CONCURRENCY,
        language=Language.GO,
        description="Second custom challenge created as guest",
        code_snippet="package main",
        is_public=False,
        user_id=None,
        session_id="guest-custom-login-sid",
    )
    session.add_all([custom_ch_reg, custom_ch_login])
    session.commit()
    session.refresh(custom_ch_reg)
    session.refresh(custom_ch_login)

    # 1. Register claims custom_ch_reg
    reg_res = client.post(
        "/api/auth/register",
        json={
            "email": "custom_owner@diffly.dev",
            "username": "custom_owner",
            "password": "Password123!",
            "session_id": "guest-custom-reg-sid",
        },
    )
    assert reg_res.status_code == 200
    user_id = reg_res.json()["id"]

    session.refresh(custom_ch_reg)
    assert custom_ch_reg.user_id == user_id

    # 2. Login on another device (with guest-custom-login-sid) claims custom_ch_login
    login_res = client.post(
        "/api/auth/login",
        json={
            "username": "custom_owner",
            "password": "Password123!",
            "session_id": "guest-custom-login-sid",
        },
    )
    assert login_res.status_code == 200
    session.refresh(custom_ch_login)
    assert custom_ch_login.user_id == user_id

    # 3. User sees both custom challenges even without a session_id
    list_res = client.get("/api/challenges/custom")
    assert list_res.status_code == 200
    slugs = {item["slug"] for item in list_res.json()["items"]}
    assert slugs == {"guest-custom-reg-ch", "guest-custom-login-ch"}


def test_claimed_records_not_leaked_via_session_id_after_logout(
    client: TestClient, session: Session
):
    """Claimed user records are not leaked to logged-out requests with session_id."""
    custom_ch = Challenge(
        slug="private-claimed-ch",
        title="Private Claimed Challenge",
        difficulty=Difficulty.EASY,
        category=Category.SECURITY,
        language=Language.PYTHON,
        description="Private",
        code_snippet="x = 1",
        is_public=False,
        user_id=None,
        session_id="shared-browser-sid",
    )
    session.add(custom_ch)
    session.commit()

    # Register & claim
    reg_res = client.post(
        "/api/auth/register",
        json={
            "email": "usera@diffly.dev",
            "username": "usera",
            "password": "Password123!",
            "session_id": "shared-browser-sid",
        },
    )
    assert reg_res.status_code == 200

    # Logout (clear auth cookies)
    client.post("/api/auth/logout")
    client.cookies.clear()

    # Logged-out requests with old session_id must not leak User A's challenge
    anon_list = client.get(
        "/api/challenges/custom",
        headers={"X-Diffly-Session-Id": "shared-browser-sid"},
    )
    assert anon_list.status_code == 200
    assert anon_list.json()["items"] == []

    anon_del = client.delete(
        "/api/challenges/custom/private-claimed-ch",
        headers={"X-Diffly-Session-Id": "shared-browser-sid"},
    )
    assert anon_del.status_code == 403


def test_x_user_id_header_rejected_in_production_and_for_inactive_users(
    client: TestClient, session: Session, monkeypatch
):
    """x-user-id header is ignored in production and for inactive users."""
    active_user = User(
        email="produser@diffly.dev",
        username="produser",
        hashed_password=hash_password("Password123!"),
        is_active=True,
    )
    inactive_user = User(
        email="banned@diffly.dev",
        username="banneduser",
        hashed_password=hash_password("Password123!"),
        is_active=False,
    )
    session.add_all([active_user, inactive_user])
    session.commit()
    session.refresh(active_user)
    session.refresh(inactive_user)

    client.cookies.clear()

    # Inactive user rejected even in dev
    res_inactive = client.get(
        "/api/auth/me",
        headers={"x-user-id": str(inactive_user.id)},
    )
    assert res_inactive.status_code == 401

    # Active user rejected via x-user-id when ENVIRONMENT=production
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    res_prod = client.get(
        "/api/auth/me",
        headers={"x-user-id": str(active_user.id)},
    )
    assert res_prod.status_code == 401
