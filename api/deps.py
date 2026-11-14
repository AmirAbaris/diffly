"""API dependency providers."""

from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlmodel import Session

from backend.core.config import settings
from backend.core.db import get_session
from backend.core.security import decode_access_token
from backend.models.user import User


def extract_token_from_request(request: Request) -> str | None:
    """Extract auth token from HttpOnly cookie or Authorization Bearer header."""
    cookie_token = request.cookies.get(settings.AUTH_COOKIE_NAME)
    if cookie_token and cookie_token.strip():
        return cookie_token.strip()

    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        bearer_token = auth_header[7:].strip()
        if bearer_token:
            return bearer_token

    return None


def get_optional_current_user(
    request: Request,
    session: Annotated[Session, Depends(get_session)],
) -> User | None:
    """Extract optional authenticated user from request state, cookies, or headers.

    Returns User instance if authenticated, or None for guest requests.
    Can be overridden in tests via app.dependency_overrides.
    """
    if hasattr(request.state, "user") and request.state.user:
        return request.state.user

    token = extract_token_from_request(request)
    if token:
        payload = decode_access_token(token)
        if payload:
            sub = payload.get("sub")
            if sub is not None and str(sub).isdigit():
                user = session.get(User, int(sub))
                if user and user.is_active:
                    return user

    if not settings.is_cookie_secure:
        user_id_header = request.headers.get("x-user-id")
        if user_id_header and user_id_header.isdigit():
            user = session.get(User, int(user_id_header))
            if user and user.is_active:
                return user

    return None


def get_current_user(
    current_user: Annotated[User | None, Depends(get_optional_current_user)],
) -> User:
    """Require an authenticated user or raise 401 Unauthorized."""
    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    return current_user
