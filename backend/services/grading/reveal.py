"""Spoiler-reveal gating policy for grading missed issues."""

from __future__ import annotations

from typing import TYPE_CHECKING


if TYPE_CHECKING:
    from backend.services.grading.review import ReviewSubmission
    from backend.services.grading.scoring import GradingPolicy


def should_reveal(
    policy: GradingPolicy,
    review: ReviewSubmission,
    score: int,
) -> bool:
    """Return whether missed-issue spoilers may be revealed for this submission."""
    return bool(
        policy.reveal
        or review.reveal
        or score >= policy.pass_threshold
        or policy.attempt_number >= policy.max_attempts
    )
