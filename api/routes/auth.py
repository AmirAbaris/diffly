"""Authentication API routes: registration, login, logout, and current user profile."""

from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, func, or_, select

from api.deps import get_current_user
from backend.core.config import settings
from backend.core.db import get_session
from backend.core.security import (
    create_access_token,
    hash_password,
    verify_password,
)
from backend.models.challenge import Challenge
from backend.models.submission import Submission
from backend.models.user import User, UserRead


router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    email: EmailStr
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=6, max_length=128)
    session_id: str | None = None


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    username: str | None = None
    email: str | None = None
    identifier: str | None = None
    password: str
    session_id: str | None = None


def claim_guest_submissions(
    session: Session,
    user_id: int,
    session_ids: set[str],
) -> int:
    """Migrate guest submissions and private custom challenges to the user."""
    valid_ids = {s.strip() for s in session_ids if s and s.strip()}
    if not valid_ids:
        return 0

    sub_statement = select(Submission).where(
        col(Submission.session_id).in_(valid_ids),
        Submission.user_id.is_(None),
    )
    unclaimed_subs = session.exec(sub_statement).all()
    for sub in unclaimed_subs:
        sub.user_id = user_id

    challenge_statement = select(Challenge).where(
        col(Challenge.session_id).in_(valid_ids),
        Challenge.user_id.is_(None),
        Challenge.is_public.is_(False),
    )
    unclaimed_challenges = session.exec(challenge_statement).all()
    for challenge in unclaimed_challenges:
        challenge.user_id = user_id

    total_claimed = len(unclaimed_subs) + len(unclaimed_challenges)
    if total_claimed > 0:
        session.commit()
    return total_claimed


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
    session: Annotated[Session, Depends(get_session)],
    header_session_id: Annotated[
        str | None,
        Header(alias="X-Diffly-Session-Id", description="Guest session identifier"),
    ] = None,
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

    if user.id is not None:
        candidate_sessions = {payload.session_id, header_session_id}
        claim_guest_submissions(
            session=session,
            user_id=user.id,
            session_ids={s for s in candidate_sessions if s is not None},
        )

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
    session: Annotated[Session, Depends(get_session)],
    header_session_id: Annotated[
        str | None,
        Header(alias="X-Diffly-Session-Id", description="Guest session identifier"),
    ] = None,
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

    if user.id is not None:
        candidate_sessions = {payload.session_id, header_session_id}
        claim_guest_submissions(
            session=session,
            user_id=user.id,
            session_ids={s for s in candidate_sessions if s is not None},
        )

    set_auth_cookie(response, user)
    return UserRead.model_validate(user)


@router.get(
    "/me",
    response_model=UserRead,
    status_code=status.HTTP_200_OK,
)
def get_me(
    current_user: Annotated[User, Depends(get_current_user)],
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
