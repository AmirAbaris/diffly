"""Centralized ownership rules for submissions and private custom challenges.

Ownership rules:
- Claimed rows (user_id IS NOT NULL) are never visible via session_id and must
  always have session_id = NULL.
- Guest rows (user_id IS NULL) are only visible via a verified signed guest cookie.
- Private custom challenges (is_public IS False) are only visible and modifiable
  by their owning user_id or owning unclaimed guest session, unless an unlisted
  share_token is explicitly enabled by the owner for read-only link access.
"""

import hmac
from dataclasses import dataclass
from typing import Any

from sqlmodel import Session, and_, func, or_, select, text

from backend.core.guest_session import GuestSession
from backend.models.challenge import Challenge
from backend.models.submission import Submission
from backend.models.user import User


CUSTOM_CHALLENGE_QUOTA = 5


class CustomQuotaExceeded(Exception):
    """Raised when creating or claiming custom challenges exceeds the quota."""

    def __init__(
        self,
        owned: int,
        incoming: int,
        limit: int = CUSTOM_CHALLENGE_QUOTA,
    ) -> None:
        self.owned = owned
        self.incoming = incoming
        self.limit = limit
        self.message = (
            f"Cannot claim {incoming} guest custom challenge(s): "
            f"{owned} already owned + {incoming} incoming exceeds limit of {limit}."
        )
        super().__init__(self.message)


@dataclass(frozen=True, slots=True)
class ClaimResult:
    """Count of guest rows transferred to an authenticated user."""

    submissions: int
    challenges: int


@dataclass(frozen=True)
class Actor:
    """Resolved request identity: authenticated user_id or verified guest_session_id."""

    user_id: int | None = None
    guest_session_id: str | None = None

    @classmethod
    def resolve(
        cls,
        user: User | None = None,
        guest: GuestSession | None = None,
    ) -> "Actor":
        user_id = user.id if user is not None and user.id is not None else None
        if user_id is not None:
            return cls(user_id=user_id, guest_session_id=None)
        if guest is not None:
            return cls(user_id=None, guest_session_id=guest.id)
        return cls(user_id=None, guest_session_id=None)


def submission_owner_filter(actor: Actor) -> Any | None:
    """Return SQL filter matching submissions owned by actor, or None."""
    conditions: list[Any] = []
    if actor.user_id is not None:
        conditions.append(Submission.user_id == actor.user_id)
    if actor.guest_session_id is not None:
        conditions.append(
            and_(
                Submission.session_id == actor.guest_session_id,
                Submission.user_id.is_(None),
            )
        )
    if not conditions:
        return None
    return conditions[0] if len(conditions) == 1 else or_(*conditions)


def challenge_owner_filter(actor: Actor) -> Any | None:
    """Return SQL filter matching private challenges owned by actor, or None."""
    conditions: list[Any] = []
    if actor.user_id is not None:
        conditions.append(Challenge.user_id == actor.user_id)
    if actor.guest_session_id is not None:
        conditions.append(
            and_(
                Challenge.session_id == actor.guest_session_id,
                Challenge.user_id.is_(None),
            )
        )
    if not conditions:
        return None
    return conditions[0] if len(conditions) == 1 else or_(*conditions)


def is_challenge_owner(challenge: Challenge, actor: Actor) -> bool:
    """Return True when actor owns the challenge by user_id or unclaimed session."""
    if actor.user_id is not None and challenge.user_id == actor.user_id:
        return True
    return (
        challenge.user_id is None
        and actor.guest_session_id is not None
        and challenge.session_id == actor.guest_session_id
    )


def has_valid_share_token(challenge: Challenge, share_token: str | None) -> bool:
    """Return True when a private challenge has an exact matching share token."""
    if (
        challenge.is_public
        or not challenge.share_token
        or not share_token
        or not challenge.share_token.isascii()
        or not share_token.isascii()
    ):
        return False
    return hmac.compare_digest(
        challenge.share_token.encode("ascii"),
        share_token.encode("ascii"),
    )


def can_access_challenge(
    challenge: Challenge,
    actor: Actor,
    share_token: str | None = None,
) -> bool:
    """Return True when public, owned by actor, or matching share_token."""
    return (
        challenge.is_public
        or is_challenge_owner(challenge, actor)
        or has_valid_share_token(challenge, share_token)
    )


def _lock_actor_scope(session: Session, actor: Actor) -> None:
    if actor.user_id is not None:
        session.exec(
            select(User.id).where(User.id == actor.user_id).with_for_update()
        ).first()
        return

    if (
        actor.guest_session_id is not None
        and session.get_bind().dialect.name == "postgresql"
    ):
        session.exec(
            text("SELECT pg_advisory_xact_lock(hashtext(:guest_id))").bindparams(
                guest_id=actor.guest_session_id
            )
        )


def ensure_custom_quota(
    session: Session,
    actor: Actor,
    adding: int = 1,
    *,
    lock: bool = True,
) -> None:
    """Ensure actor can hold `adding` more private custom challenges."""
    if lock:
        _lock_actor_scope(session, actor)

    owner_filter = challenge_owner_filter(actor)
    owned = 0
    if owner_filter is not None:
        owned = session.exec(
            select(func.count(Challenge.id)).where(
                Challenge.is_public.is_(False),
                owner_filter,
            )
        ).one()

    if owned + adding > CUSTOM_CHALLENGE_QUOTA:
        raise CustomQuotaExceeded(
            owned=owned,
            incoming=adding,
            limit=CUSTOM_CHALLENGE_QUOTA,
        )


def claim_guest_session(
    session: Session,
    user_id: int,
    guest: GuestSession,
) -> ClaimResult:
    """Atomically transfer unclaimed guest rows to user_id and scrub session_id."""
    user_actor = Actor(user_id=user_id)
    _lock_actor_scope(session, user_actor)

    unclaimed_challenges = session.exec(
        select(Challenge).where(
            Challenge.session_id == guest.id,
            Challenge.user_id.is_(None),
            Challenge.is_public.is_(False),
        )
    ).all()

    if len(unclaimed_challenges) > 0:
        ensure_custom_quota(
            session,
            user_actor,
            adding=len(unclaimed_challenges),
            lock=False,
        )

    unclaimed_subs = session.exec(
        select(Submission).where(
            Submission.session_id == guest.id,
            Submission.user_id.is_(None),
        )
    ).all()

    for sub in unclaimed_subs:
        sub.user_id = user_id
        sub.session_id = None

    for challenge in unclaimed_challenges:
        challenge.user_id = user_id
        challenge.session_id = None

    sub_count = len(unclaimed_subs)
    ch_count = len(unclaimed_challenges)
    if sub_count > 0 or ch_count > 0:
        session.commit()

    return ClaimResult(submissions=sub_count, challenges=ch_count)
