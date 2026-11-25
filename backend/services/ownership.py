"""Centralized ownership rules for submissions, custom challenges, and coach threads.

Ownership rules:
- Claimed rows (user_id IS NOT NULL) are never visible via session_id and must
  always have session_id = NULL.
- Guest rows (user_id IS NULL) are only visible via a verified signed guest cookie.
- Private custom challenges (is_public IS False) are only visible and modifiable
  by their owning user_id or owning unclaimed guest session, unless an unlisted
  share_token is explicitly enabled by the owner for read-only link access.
- Coach threads are strictly private to their owning user_id or unclaimed guest session.
"""

import hmac
from dataclasses import dataclass
from typing import Any

from sqlmodel import Session, and_, func, or_, select, text

from backend.core.guest_session import GuestSession
from backend.models.challenge import Challenge
from backend.models.coach_thread import CoachThread
from backend.models.submission import Submission
from backend.models.user import User


CUSTOM_CHALLENGE_QUOTA = 5
COACH_THREAD_QUOTA = 50


class _QuotaExceededError(Exception):
    """Base error raised when creating or claiming a bounded resource exceeds quota."""

    def __init__(
        self,
        resource_label: str,
        owned: int,
        incoming: int,
        limit: int,
    ) -> None:
        self.owned = owned
        self.incoming = incoming
        self.limit = limit
        self.message = (
            f"Cannot claim {incoming} guest {resource_label}: "
            f"{owned} already owned + {incoming} incoming exceeds limit of {limit}."
        )
        super().__init__(self.message)


class CustomQuotaExceeded(_QuotaExceededError):
    """Raised when creating or claiming custom challenges exceeds the quota."""

    def __init__(
        self,
        owned: int,
        incoming: int,
        limit: int = CUSTOM_CHALLENGE_QUOTA,
    ) -> None:
        super().__init__("custom challenge(s)", owned, incoming, limit)


class CoachThreadQuotaExceeded(_QuotaExceededError):
    """Raised when creating or claiming coach threads exceeds the quota."""

    def __init__(
        self,
        owned: int,
        incoming: int,
        limit: int = COACH_THREAD_QUOTA,
    ) -> None:
        super().__init__("coach thread(s)", owned, incoming, limit)


@dataclass(frozen=True, slots=True)
class ClaimResult:
    """Count of guest rows transferred to an authenticated user."""

    submissions: int
    challenges: int
    coach_threads: int = 0


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


def _owner_filter(model: Any, actor: Actor) -> Any | None:
    conditions: list[Any] = []
    if actor.user_id is not None:
        conditions.append(model.user_id == actor.user_id)
    if actor.guest_session_id is not None:
        conditions.append(
            and_(
                model.session_id == actor.guest_session_id,
                model.user_id.is_(None),
            )
        )
    if not conditions:
        return None
    return conditions[0] if len(conditions) == 1 else or_(*conditions)


def submission_owner_filter(actor: Actor) -> Any | None:
    """Return SQL filter matching submissions owned by actor, or None."""
    return _owner_filter(Submission, actor)


def challenge_owner_filter(actor: Actor) -> Any | None:
    """Return SQL filter matching private challenges owned by actor, or None."""
    return _owner_filter(Challenge, actor)


def coach_thread_owner_filter(actor: Actor) -> Any | None:
    """Return SQL filter matching coach threads owned by actor, or None."""
    return _owner_filter(CoachThread, actor)


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


def lock_actor_scope(session: Session, actor: Actor) -> None:
    """Serialize concurrent actor-scoped writes via row or advisory lock."""
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
        lock_actor_scope(session, actor)

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


def ensure_coach_thread_quota(
    session: Session,
    actor: Actor,
    adding: int = 1,
    *,
    lock: bool = True,
) -> None:
    """Ensure actor can hold `adding` more coach threads."""
    if lock:
        lock_actor_scope(session, actor)

    owner_filter = coach_thread_owner_filter(actor)
    owned = 0
    if owner_filter is not None:
        owned = session.exec(
            select(func.count(CoachThread.id)).where(owner_filter)
        ).one()

    if owned + adding > COACH_THREAD_QUOTA:
        raise CoachThreadQuotaExceeded(
            owned=owned,
            incoming=adding,
            limit=COACH_THREAD_QUOTA,
        )


def claim_guest_session(
    session: Session,
    user_id: int,
    guest: GuestSession,
) -> ClaimResult:
    """Atomically transfer unclaimed guest rows to user_id and scrub session_id."""
    user_actor = Actor(user_id=user_id)
    lock_actor_scope(session, user_actor)
    try:
        lock_actor_scope(session, Actor(guest_session_id=guest.id))

        unclaimed_challenges = session.exec(
            select(Challenge)
            .where(
                Challenge.session_id == guest.id,
                Challenge.user_id.is_(None),
                Challenge.is_public.is_(False),
            )
            .with_for_update()
        ).all()

        if len(unclaimed_challenges) > 0:
            ensure_custom_quota(
                session,
                user_actor,
                adding=len(unclaimed_challenges),
                lock=False,
            )

        unclaimed_threads = session.exec(
            select(CoachThread)
            .where(
                CoachThread.session_id == guest.id,
                CoachThread.user_id.is_(None),
            )
            .with_for_update()
        ).all()

        if len(unclaimed_threads) > 0:
            ensure_coach_thread_quota(
                session,
                user_actor,
                adding=len(unclaimed_threads),
                lock=False,
            )

        unclaimed_subs = session.exec(
            select(Submission)
            .where(
                Submission.session_id == guest.id,
                Submission.user_id.is_(None),
            )
            .with_for_update()
        ).all()

        for sub in unclaimed_subs:
            sub.user_id = user_id
            sub.session_id = None

        for challenge in unclaimed_challenges:
            challenge.user_id = user_id
            challenge.session_id = None

        for thread in unclaimed_threads:
            thread.user_id = user_id
            thread.session_id = None

        sub_count = len(unclaimed_subs)
        ch_count = len(unclaimed_challenges)
        thread_count = len(unclaimed_threads)
        if sub_count > 0 or ch_count > 0 or thread_count > 0:
            session.commit()
        else:
            session.rollback()
    except Exception:
        session.rollback()
        raise

    return ClaimResult(
        submissions=sub_count,
        challenges=ch_count,
        coach_threads=thread_count,
    )
