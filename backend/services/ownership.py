"""Centralized ownership rules for submissions and private custom challenges.

Ownership rules:
- Claimed rows (user_id IS NOT NULL) are never visible via session_id.
- Guest rows (user_id IS NULL) are only visible via session_id AND user_id IS NULL.
- Private custom challenges (is_public IS False) are only visible and modifiable
  by their owning user_id or owning unclaimed guest session.
"""

from dataclasses import dataclass
from typing import Any

from sqlmodel import Session, and_, col, or_, select

from backend.models.challenge import Challenge
from backend.models.submission import Submission
from backend.models.user import User


@dataclass(frozen=True)
class Actor:
    """Resolved request identity: authenticated user_id and/or guest_session_id."""

    user_id: int | None = None
    guest_session_id: str | None = None

    @classmethod
    def from_request(
        cls,
        current_user: User | None = None,
        *session_candidates: str | None,
    ) -> "Actor":
        user_id = (
            current_user.id
            if current_user is not None and current_user.id is not None
            else None
        )
        guest_session_id: str | None = None
        for candidate in session_candidates:
            if candidate and candidate.strip():
                guest_session_id = candidate.strip()
                break
        return cls(user_id=user_id, guest_session_id=guest_session_id)


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


def can_access_challenge(challenge: Challenge, actor: Actor) -> bool:
    """Return True when challenge is public or owned by actor."""
    return challenge.is_public or is_challenge_owner(challenge, actor)


def claim_guest_records(
    session: Session,
    user_id: int,
    session_ids: set[str],
) -> tuple[int, int]:
    """Claim unclaimed guest submissions and private challenges for user_id.

    Returns (claimed_submissions_count, claimed_challenges_count).
    """
    valid_ids = {s.strip() for s in session_ids if s and s.strip()}
    if not valid_ids:
        return (0, 0)

    unclaimed_subs = session.exec(
        select(Submission).where(
            col(Submission.session_id).in_(valid_ids),
            Submission.user_id.is_(None),
        )
    ).all()
    for sub in unclaimed_subs:
        sub.user_id = user_id

    unclaimed_challenges = session.exec(
        select(Challenge).where(
            col(Challenge.session_id).in_(valid_ids),
            Challenge.user_id.is_(None),
            Challenge.is_public.is_(False),
        )
    ).all()
    for challenge in unclaimed_challenges:
        challenge.user_id = user_id

    sub_count = len(unclaimed_subs)
    ch_count = len(unclaimed_challenges)
    if sub_count > 0 or ch_count > 0:
        session.commit()
    return (sub_count, ch_count)
