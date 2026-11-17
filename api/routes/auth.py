"""Authentication API routes: registration, login, logout, and current user profile."""

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, func, or_, select

from api.deps import CurrentUserDep, GuestSessionDep, SessionDep
from backend.core.config import settings
from backend.core.guest_session import GuestSession, clear_guest_cookie
from backend.core.security import (
    create_access_token,
    hash_password,
    verify_password,
)
from backend.models.user import User, UserRead
from backend.services.ownership import CustomQuotaExceeded, claim_guest_session


router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    email: EmailStr
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=6, max_length=128)


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    username: str | None = None
    email: str | None = None
    identifier: str | None = None
    password: str


def adopt_guest_on_sign_in(
    session: Session,
    response: Response,
    user: User,
    guest: GuestSession | None,
) -> None:
    """Adopt verified guest records on sign-in without ever failing auth on quota."""
    if guest is None or user.id is None:
        return
    try:
        claim_guest_session(session=session, user_id=user.id, guest=guest)
    except CustomQuotaExceeded:
        session.rollback()
        response.headers["X-Diffly-Claim-Status"] = "quota_exceeded"
        return
    clear_guest_cookie(response)


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
)
def register(
    payload: RegisterRequest,
    response: Response,
    session: SessionDep,
    guest: GuestSessionDep,
) -> UserRead:
    """Register a new user account, claim guest records, and issue auth cookie."""
    normalized_email = payload.email.lower().strip()
    clean_username = payload.username.strip()

    existing_email = session.exec(
        select(User).where(func.lower(User.email) == normalized_email)
    ).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    existing_username = session.exec(
        select(User).where(func.lower(User.username) == clean_username.lower())
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
            func.lower(User.username) == identifier.lower(),
            func.lower(User.email) == identifier.lower(),
        )
    )
    user = session.exec(statement).first()

    if not user or not verify_password(payload.password, user.hashed_password):
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
