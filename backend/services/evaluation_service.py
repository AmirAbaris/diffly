"""Compatibility wrapper delegating v1 evaluate_review to the v2 grading engine."""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from backend.models.challenge import Challenge, FlaggedLineItem
from backend.services.grading import (
    MAX_BLIND_ATTEMPTS,
    OFF_BY_ONE_PROXIMITY_SCORE,
    PASS_SCORE_THRESHOLD,
    Anchor,
    DetectedIssue,
    Finding,
    GradingPolicy,
    MissedIssue,
    ReviewSubmission,
    ScopedLine,
    extract_challenge_files,
    extract_expected_issues,
    find_contiguous_blocks,
    generate_critique,
    get_proximity_lines,
    get_tolerated_lines,
    grade_review,
    is_keyword_matched,
    normalize_scoped_flagged_lines,
    redact_missed_issues,
)


class EvaluationInput(BaseModel):
    """Pydantic model representing user input for code review evaluation."""

    model_config = ConfigDict(extra="allow", populate_by_name=True)

    challenge_id: int | None = None
    challenge_slug: str | None = None
    flagged_lines: list[FlaggedLineItem] = Field(default_factory=list)
    user_comments: str = Field(default="")


class EvaluationResult(BaseModel):
    """Comprehensive evaluation result for a code review submission."""

    model_config = ConfigDict(extra="allow")

    score: int = Field(ge=0, le=100)
    line_precision_score: float = Field(default=0.0, ge=0.0, le=100.0)
    concept_score: float = Field(default=0.0, ge=0.0, le=100.0)
    false_positive_penalty: float = Field(default=0.0, ge=0.0)
    false_positive_lines: list[FlaggedLineItem] = Field(default_factory=list)
    detected_issues: list[DetectedIssue] = Field(default_factory=list)
    missed_issues: list[MissedIssue] = Field(default_factory=list)
    summary: str = ""
    critique: str = ""
    execution_time_ms: float = 0.0


def normalize_flagged_lines(flagged_lines: Any) -> list[int]:
    """Parse and normalize flagged lines into a deduplicated sorted list of integers."""
    scoped, _ = normalize_scoped_flagged_lines(flagged_lines)
    return sorted({line_no for _, line_no in scoped})


def evaluate_review(
    challenge: Challenge | dict[str, Any] | Any,
    flagged_lines: list[Any] | set[Any] | str | None = None,
    user_comments: str | list[str] | None = None,
    *,
    input_data: EvaluationInput | None = None,
    tolerance: int = 1,
    false_positive_penalty_per_line: float = 15.0,
    line_weight: float = 0.5,
    concept_weight: float = 0.5,
    target_keyword_matches: int = 2,
    allow_single_line_tolerance: bool = False,
    pass_threshold: int = PASS_SCORE_THRESHOLD,
    attempt_number: int = 1,
    max_attempts: int = MAX_BLIND_ATTEMPTS,
    reveal_solution: bool = False,
) -> EvaluationResult:
    """Evaluate a v1 code review submission by delegating to grade_review."""
    if input_data is not None:
        if flagged_lines is None:
            flagged_lines = input_data.flagged_lines
        if user_comments is None:
            user_comments = input_data.user_comments

    challenge_files = extract_challenge_files(challenge)
    default_file_path = challenge_files[0].path if len(challenge_files) == 1 else None
    user_lines, had_explicit_user_scope = normalize_scoped_flagged_lines(
        flagged_lines,
        default_file_path=default_file_path,
    )

    if user_comments is None:
        comments_str = ""
    elif isinstance(user_comments, (list, tuple)):
        comments_str = " ".join(str(c) for c in user_comments).strip()
    else:
        comments_str = str(user_comments).strip()

    findings = [
        Finding(
            id=f"l{idx}",
            anchor=Anchor(
                file_path=fp if had_explicit_user_scope else None,
                start_line=ln,
                end_line=ln,
            ),
            body="",
            severity=None,
        )
        for idx, (fp, ln) in enumerate(user_lines, start=1)
        if ln >= 1
    ]
    review = ReviewSubmission.model_construct(
        findings=findings,
        summary_note=comments_str,
        reveal=reveal_solution,
    )
    policy = GradingPolicy(
        attempt_number=attempt_number,
        reveal=reveal_solution,
        tolerance=tolerance,
        line_weight=line_weight,
        concept_weight=concept_weight,
        false_positive_penalty_per_line=false_positive_penalty_per_line,
        target_keyword_matches=target_keyword_matches,
        allow_single_line_tolerance=allow_single_line_tolerance,
        pass_threshold=pass_threshold,
        max_attempts=max_attempts,
    )
    report = grade_review(challenge=challenge, review=review, policy=policy)
    return EvaluationResult(
        score=report.score,
        line_precision_score=report.line_precision_score,
        concept_score=report.concept_score,
        false_positive_penalty=report.false_positive_penalty,
        false_positive_lines=report.false_positive_lines,
        detected_issues=report.detected_issues,
        missed_issues=report.missed_issues,
        summary=report.summary,
        critique=report.critique,
        execution_time_ms=report.execution_time_ms,
    )


__all__ = [
    "MAX_BLIND_ATTEMPTS",
    "OFF_BY_ONE_PROXIMITY_SCORE",
    "PASS_SCORE_THRESHOLD",
    "DetectedIssue",
    "EvaluationInput",
    "EvaluationResult",
    "MissedIssue",
    "ScopedLine",
    "evaluate_review",
    "extract_challenge_files",
    "extract_expected_issues",
    "find_contiguous_blocks",
    "generate_critique",
    "get_proximity_lines",
    "get_tolerated_lines",
    "is_keyword_matched",
    "normalize_flagged_lines",
    "normalize_scoped_flagged_lines",
    "redact_missed_issues",
]
