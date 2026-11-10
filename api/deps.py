"""API dependency providers."""

from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from sqlmodel import Session

from backend.core.db import get_session
from backend.models.user import User


def get_optional_current_user(
    request: Request,
    session: Annotated[Session, Depends(get_session)],
) -> User | None:
    """Extract optional authenticated user from request state, headers, or cookies.

    Returns User instance if authenticated, or None for guest requests.
    Can be overridden in tests via app.dependency_overrides.
    """
    if hasattr(request.state, "user") and request.state.user:
        return request.state.user

    user_id_header = request.headers.get("x-user-id")
    if user_id_header and user_id_header.isdigit():
        return session.get(User, int(user_id_header))

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
