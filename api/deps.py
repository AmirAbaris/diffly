"""API dependency providers."""

import time
from typing import Annotated

from fastapi import Depends, HTTPException, Request, Response, status
from sqlmodel import Session

from backend.core.config import settings
from backend.core.db import get_session
from backend.core.guest_session import (
    GuestSession,
    clear_guest_cookie,
    mint_guest_session,
    read_guest_session,
    write_guest_cookie,
)
from backend.core.security import decode_access_token
from backend.models.user import User
from backend.services.ownership import Actor


def _token_candidates(request: Request) -> list[str]:
    """Extract ordered auth token candidates: auth cookie first, then Bearer header."""
    candidates: list[str] = []
    cookie_token = request.cookies.get(settings.AUTH_COOKIE_NAME)
    if isinstance(cookie_token, str):
        cleaned_cookie = cookie_token.strip()
        if cleaned_cookie:
            candidates.append(cleaned_cookie)

    auth_header = request.headers.get("Authorization")
    if isinstance(auth_header, str):
        scheme, _, rest = auth_header.strip().partition(" ")
        if scheme.lower() == "bearer":
            cleaned_bearer = rest.strip()
            if cleaned_bearer and cleaned_bearer not in candidates:
                candidates.append(cleaned_bearer)

    return candidates


def _active_user_for_token(session: Session, token: str) -> User | None:
    """Resolve an active User from a JWT access token, or return None."""
    payload = decode_access_token(token)
    if not payload:
        return None
    sub = payload.get("sub")
    if sub is None or isinstance(sub, bool):
        return None
    sub_str = str(sub).strip()
    if not sub_str.isascii() or not sub_str.isdigit():
        return None
    user = session.get(User, int(sub_str))
    if user and user.is_active:
        return user
    return None


def get_optional_current_user(
    request: Request,
    session: Annotated[Session, Depends(get_session)],
) -> User | None:
    """Extract optional authenticated user from request state, cookies, or Bearer token.

    Returns User instance if authenticated, or None for guest requests.
    Can be overridden in tests via app.dependency_overrides.
    """
    if hasattr(request.state, "user") and request.state.user:
        return request.state.user

    for token in _token_candidates(request):
        user = _active_user_for_token(session, token)
        if user is not None:
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


def get_guest_session(request: Request, response: Response) -> GuestSession | None:
    """Read signed guest cookie and clear it when invalid/tampered so browsers heal."""
    guest = read_guest_session(request)
    if settings.GUEST_COOKIE_NAME in request.cookies and guest is None:
        clear_guest_cookie(response)
    return guest


SessionDep = Annotated[Session, Depends(get_session)]
OptionalUserDep = Annotated[User | None, Depends(get_optional_current_user)]
CurrentUserDep = Annotated[User, Depends(get_current_user)]
GuestSessionDep = Annotated[GuestSession | None, Depends(get_guest_session)]


def get_actor(
    response: Response,
    current_user: OptionalUserDep,
    guest: GuestSessionDep,
) -> Actor:
    """Resolve read-only request actor without minting a new guest cookie."""
    if current_user is None and guest is not None and guest.needs_refresh:
        refreshed = GuestSession(id=guest.id, issued_at=int(time.time()))
        write_guest_cookie(response, refreshed)
    return Actor.resolve(current_user, guest)


def get_owner_actor(
    response: Response,
    current_user: OptionalUserDep,
    guest: GuestSessionDep,
) -> Actor:
    """Resolve write actor, minting a signed guest cookie when unauthenticated."""
    if current_user is not None:
        return Actor.resolve(current_user, None)
    if guest is not None:
        if guest.needs_refresh:
            guest = GuestSession(id=guest.id, issued_at=int(time.time()))
            write_guest_cookie(response, guest)
        return Actor.resolve(None, guest)
    new_guest = mint_guest_session()
    write_guest_cookie(response, new_guest)
    return Actor.resolve(None, new_guest)


ActorDep = Annotated[Actor, Depends(get_actor)]
OwnerActorDep = Annotated[Actor, Depends(get_owner_actor)]
