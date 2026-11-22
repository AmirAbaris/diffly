"""Spoiler-reveal gating policy and response-boundary redaction helpers."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any


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


def redact_judge_outcome(
    judge_outcome: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """Strip spoiler-sensitive verdict feedback from a serialized judge outcome."""
    if not isinstance(judge_outcome, dict):
        return judge_outcome
    raw_verdicts = judge_outcome.get("verdicts")
    if not isinstance(raw_verdicts, list):
        return judge_outcome
    gated_verdicts = [
        {**item, "feedback": ""} if isinstance(item, dict) else item
        for item in raw_verdicts
    ]
    return {**judge_outcome, "verdicts": gated_verdicts}


def redact_missed_issue_dicts(missed_issues: list[Any]) -> list[Any]:
    """Strip spoiler fields from serialized missed-issue dictionaries."""
    gated: list[Any] = []
    for item in missed_issues:
        if isinstance(item, dict):
            gated.append(
                {
                    **item,
                    "expected_lines": [],
                    "missing_keywords": [],
                    "denied_keywords": [],
                    "explanation": "",
                }
            )
        else:
            gated.append(item)
    return gated
