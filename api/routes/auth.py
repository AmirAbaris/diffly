"""Authentication API routes: registration, login, GitHub OAuth, logout, and profile."""

from typing import Annotated, Any
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import RedirectResponse
from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    StringConstraints,
    field_validator,
)
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, or_, select

from api.deps import CurrentUserDep, GuestSessionDep, OptionalUserDep, SessionDep
from backend.core.config import settings
from backend.core.guest_session import GuestSession, clear_guest_cookie
from backend.core.rate_limit import rate_limit
from backend.core.security import (
    DUMMY_PASSWORD_HASH,
    create_access_token,
    hash_password,
    verify_password,
)
from backend.models.user import User, UserRead, get_utc_now
from backend.services.github_oauth import (
    GitHubOAuthError,
    build_oauth_redirect_url,
    exchange_github_code,
    generate_unique_username,
    mint_oauth_state,
    resolve_github_callback_url,
    sanitize_next_path,
    verify_oauth_state,
)
from backend.services.ownership import (
    CoachThreadQuotaExceeded,
    CustomQuotaExceeded,
    claim_guest_session,
)


router = APIRouter(prefix="/api/auth", tags=["auth"])


def _validate_password_utf8_bytes(value: str) -> str:
    if len(value.encode("utf-8")) > 72:
        raise ValueError("Password must not exceed 72 UTF-8 bytes")
    return value


def _validate_username_characters(value: str) -> str:
    if "@" in value:
        raise ValueError("Username must not contain '@'")
    if any(ord(ch) < 0x20 or ord(ch) == 0x7F or ch.isspace() for ch in value):
        raise ValueError("Username must not contain whitespace or control characters")
    return value


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    email: EmailStr
    username: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=3, max_length=50),
        AfterValidator(_validate_username_characters),
    ]
    password: Annotated[
        str,
        Field(min_length=6, max_length=72),
        AfterValidator(_validate_password_utf8_bytes),
    ]

    @field_validator("username", mode="before")
    @classmethod
    def reject_username_control_chars(cls, value: Any) -> Any:
        if isinstance(value, str) and any(
            ord(ch) < 0x20 or ord(ch) == 0x7F for ch in value
        ):
            raise ValueError("Username must not contain control characters")
        return value


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    username: str | None = Field(default=None, max_length=254)
    email: str | None = Field(default=None, max_length=254)
    identifier: str | None = Field(default=None, max_length=254)
    password: Annotated[
        str,
        Field(max_length=72),
        AfterValidator(_validate_password_utf8_bytes),
    ]


def adopt_guest_on_sign_in(
    session: Session,
    response: Response,
    user: User,
    guest: GuestSession | None,
) -> str | None:
    """Adopt verified guest records on sign-in without ever failing auth on quota."""
    if guest is None or user.id is None:
        return None
    try:
        claim_guest_session(session=session, user_id=user.id, guest=guest)
    except (CustomQuotaExceeded, CoachThreadQuotaExceeded):
        session.rollback()
        response.headers["X-Diffly-Claim-Status"] = "quota_exceeded"
        return "quota_exceeded"
    clear_guest_cookie(response)
    return None


def set_auth_cookie(response: Response, user: User) -> str:
    """Generate access token and set HttpOnly auth cookie on response."""
    token = create_access_token(
        {
            "sub": str(user.id),
            "username": user.username,
            "email": user.email,
        }
    )
    max_age = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    response.set_cookie(
        key=settings.AUTH_COOKIE_NAME,
        value=token,
        max_age=max_age,
        httponly=True,
        samesite="lax",
        secure=settings.is_cookie_secure,
        path="/",
    )
    return token


@router.post(
    "/register",
    response_model=UserRead,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(rate_limit("register", 10, 60))],
)
def register(
    payload: RegisterRequest,
    response: Response,
    session: SessionDep,
    guest: GuestSessionDep,
) -> UserRead:
    """Register a new user account, claim guest records, and issue auth cookie."""
    normalized_email = payload.email.lower().strip()
    clean_username = payload.username

    existing_email = session.exec(
        select(User).where(User.email_lower == normalized_email)
    ).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    existing_username = session.exec(
        select(User).where(User.username_lower == clean_username.lower())
    ).first()
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken",
        )

    user = User(
        email=normalized_email,
        username=clean_username,
        hashed_password=hash_password(payload.password),
    )
    session.add(user)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email or username already registered",
        ) from exc
    session.refresh(user)

    adopt_guest_on_sign_in(session=session, response=response, user=user, guest=guest)
    set_auth_cookie(response, user)
    return UserRead.model_validate(user)


@router.post(
    "/login",
    response_model=UserRead,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(rate_limit("login", 15, 60))],
)
def login(
    payload: LoginRequest,
    response: Response,
    session: SessionDep,
    guest: GuestSessionDep,
) -> UserRead:
    """Authenticate user with email/username and password, claim guest records."""
    identifier = (payload.identifier or payload.username or payload.email or "").strip()
    if not identifier or not payload.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email and password are required",
        )

    statement = select(User).where(
        or_(
            User.username_lower == identifier.lower(),
            User.email_lower == identifier.lower(),
        )
    )
    user = session.exec(statement).first()

    target_hash = (
        user.hashed_password
        if (user is not None and user.hashed_password)
        else DUMMY_PASSWORD_HASH
    )
    password_valid = verify_password(payload.password, target_hash)
    if not user or not user.hashed_password or not password_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )

    adopt_guest_on_sign_in(session=session, response=response, user=user, guest=guest)
    set_auth_cookie(response, user)
    return UserRead.model_validate(user)


class AuthProvidersResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    github: bool


def _clear_oauth_state_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.OAUTH_STATE_COOKIE_NAME,
        path="/",
        httponly=True,
        samesite="lax",
        secure=settings.is_cookie_secure,
    )


def _oauth_error_redirect(next_path: str, error_code: str) -> RedirectResponse:
    resp = RedirectResponse(
        url=build_oauth_redirect_url(next_path, auth_error=error_code),
        status_code=status.HTTP_302_FOUND,
    )
    _clear_oauth_state_cookie(resp)
    return resp


@router.get(
    "/providers",
    response_model=AuthProvidersResponse,
    status_code=status.HTTP_200_OK,
)
def get_auth_providers() -> AuthProvidersResponse:
    """Return enabled external authentication providers."""
    return AuthProvidersResponse(github=settings.github_oauth_enabled)


@router.get(
    "/github/login",
    status_code=status.HTTP_302_FOUND,
    dependencies=[Depends(rate_limit("github_login", 30, 60))],
)
def github_oauth_login(
    request: Request,
    optional_user: OptionalUserDep,
    next: Annotated[
        str | None,
        Query(max_length=512, description="Relative post-login destination path"),
    ] = None,
) -> RedirectResponse:
    """Redirect caller to GitHub OAuth authorization endpoint with signed state."""
    if not settings.github_oauth_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GitHub OAuth is not configured",
        )

    sec_fetch_site = (request.headers.get("sec-fetch-site") or "").strip().lower()
    if optional_user is not None and sec_fetch_site not in {
        "",
        "same-origin",
        "same-site",
        "none",
    }:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cross-site account linking is not permitted",
        )

    safe_next = sanitize_next_path(next)
    link_user_id = optional_user.id if optional_user is not None else None
    state_token = mint_oauth_state(next_path=safe_next, link_user_id=link_user_id)
    callback_url = resolve_github_callback_url(request)

    query = urlencode(
        {
            "client_id": settings.GITHUB_CLIENT_ID.strip(),
            "redirect_uri": callback_url,
            "scope": "read:user user:email",
            "state": state_token,
        }
    )
    authorize_url = f"https://github.com/login/oauth/authorize?{query}"
    redirect_resp = RedirectResponse(
        url=authorize_url,
        status_code=status.HTTP_302_FOUND,
    )
    redirect_resp.set_cookie(
        key=settings.OAUTH_STATE_COOKIE_NAME,
        value=state_token,
        max_age=settings.OAUTH_STATE_TTL_SECONDS,
        httponly=True,
        samesite="lax",
        secure=settings.is_cookie_secure,
        path="/",
    )
    return redirect_resp


def _link_github_to_current_user(
    *,
    session: Session,
    current_user: User,
    github_id: str,
    github_login: str,
    avatar_url: str | None,
) -> str | None:
    """Link a verified GitHub account to current_user; returns error code or None."""
    if not current_user.is_active:
        return "account_inactive"

    existing_owner = session.exec(
        select(User).where(User.github_id == github_id)
    ).first()
    if existing_owner is not None and existing_owner.id != current_user.id:
        return "github_already_linked"

    if current_user.github_id is not None and current_user.github_id != github_id:
        return "github_already_linked"

    current_user.github_id = github_id
    current_user.github_login = github_login
    if not current_user.avatar_url and avatar_url:
        current_user.avatar_url = avatar_url
    current_user.updated_at = get_utc_now()
    session.add(current_user)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        return "github_already_linked"
    session.refresh(current_user)
    return None


@router.get(
    "/github/callback",
    status_code=status.HTTP_302_FOUND,
    dependencies=[Depends(rate_limit("github_callback", 30, 60))],
)
async def github_oauth_callback(
    request: Request,
    session: SessionDep,
    current_user: OptionalUserDep,
    guest: GuestSessionDep,
    code: Annotated[str | None, Query(max_length=512)] = None,
    state: Annotated[str | None, Query(max_length=2048)] = None,
    error: Annotated[str | None, Query(max_length=128)] = None,
) -> RedirectResponse:
    """Handle GitHub OAuth callback, verify CSRF state, and issue session cookie."""
    if not settings.github_oauth_enabled:
        return _oauth_error_redirect("/challenges", "github_unavailable")

    verified_state = verify_oauth_state(
        raw_state=state,
        cookie_state=request.cookies.get(settings.OAUTH_STATE_COOKIE_NAME),
    )
    if verified_state is None:
        return _oauth_error_redirect("/challenges", "github_state")

    current_user_id = current_user.id if current_user is not None else None
    if verified_state.link_user_id != current_user_id:
        return _oauth_error_redirect(verified_state.next_path, "github_state")

    if error:
        err_code = "github_denied" if error == "access_denied" else "github_failed"
        return _oauth_error_redirect(verified_state.next_path, err_code)

    if not code or not code.strip():
        return _oauth_error_redirect(verified_state.next_path, "github_failed")

    callback_url = resolve_github_callback_url(request)
    try:
        profile = await exchange_github_code(code.strip(), callback_url)
    except GitHubOAuthError as exc:
        return _oauth_error_redirect(verified_state.next_path, exc.code)

    if current_user is not None:
        link_error = _link_github_to_current_user(
            session=session,
            current_user=current_user,
            github_id=profile.github_id,
            github_login=profile.github_login,
            avatar_url=profile.avatar_url,
        )
        if link_error is not None:
            return _oauth_error_redirect(verified_state.next_path, link_error)

        success_resp = RedirectResponse(
            url=build_oauth_redirect_url(
                verified_state.next_path, auth="github_success"
            ),
            status_code=status.HTTP_302_FOUND,
        )
        _clear_oauth_state_cookie(success_resp)
        return success_resp

    user = session.exec(select(User).where(User.github_id == profile.github_id)).first()
    if user is not None:
        if not user.is_active:
            return _oauth_error_redirect(verified_state.next_path, "account_inactive")
        user.github_login = profile.github_login
        if not user.avatar_url and profile.avatar_url:
            user.avatar_url = profile.avatar_url
        user.updated_at = get_utc_now()
        session.add(user)
        session.commit()
        session.refresh(user)
    else:
        existing_email = session.exec(
            select(User).where(User.email_lower == profile.email)
        ).first()
        if existing_email is not None:
            return _oauth_error_redirect(
                verified_state.next_path, "github_email_in_use"
            )

        user: User | None = None
        for _ in range(3):
            candidate = User(
                email=profile.email,
                username=generate_unique_username(session, profile.github_login),
                avatar_url=profile.avatar_url,
                hashed_password=None,
                github_id=profile.github_id,
                github_login=profile.github_login,
            )
            session.add(candidate)
            try:
                session.commit()
            except IntegrityError:
                session.rollback()
                raced_gh = session.exec(
                    select(User).where(User.github_id == profile.github_id)
                ).first()
                if raced_gh is not None:
                    if not raced_gh.is_active:
                        return _oauth_error_redirect(
                            verified_state.next_path, "account_inactive"
                        )
                    user = raced_gh
                    break
                raced_email = session.exec(
                    select(User).where(User.email_lower == profile.email)
                ).first()
                if raced_email is not None:
                    return _oauth_error_redirect(
                        verified_state.next_path, "github_email_in_use"
                    )
            else:
                session.refresh(candidate)
                user = candidate
                break

        if user is None:
            return _oauth_error_redirect(verified_state.next_path, "github_failed")

    temp_resp = Response()
    claim_status = adopt_guest_on_sign_in(
        session=session,
        response=temp_resp,
        user=user,
        guest=guest,
    )
    redirect_resp = RedirectResponse(
        url=build_oauth_redirect_url(
            verified_state.next_path,
            auth="github_success",
            claim_status=claim_status,
        ),
        status_code=status.HTTP_302_FOUND,
    )
    _clear_oauth_state_cookie(redirect_resp)
    if guest is not None and claim_status is None:
        clear_guest_cookie(redirect_resp)
    elif claim_status is not None:
        redirect_resp.headers["X-Diffly-Claim-Status"] = claim_status
    set_auth_cookie(redirect_resp, user)
    return redirect_resp


@router.get(
    "/me",
    response_model=UserRead,
    status_code=status.HTTP_200_OK,
)
def get_me(
    current_user: CurrentUserDep,
) -> UserRead:
    """Return currently authenticated user profile."""
    return UserRead.model_validate(current_user)


@router.post(
    "/logout",
    status_code=status.HTTP_200_OK,
)
def logout(response: Response) -> dict[str, str]:
    """Clear diffly_access_token authentication cookie."""
    response.delete_cookie(
        key=settings.AUTH_COOKIE_NAME,
        path="/",
        httponly=True,
        samesite="lax",
        secure=settings.is_cookie_secure,
    )
    return {"message": "Logged out successfully"}
