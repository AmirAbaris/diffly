"""Automated Code Review Evaluation and Defect Matching Engine.

Evaluates user code review submissions against expected defects, scoring
line precision, keyword and concept matching, and penalizing false positives.
"""

import json
import re
import time
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from backend.models.challenge import Challenge, DefectCriterion


class EvaluationInput(BaseModel):
    """Pydantic model representing user input for code review evaluation."""

    model_config = ConfigDict(extra="allow", populate_by_name=True)

    challenge_id: int | None = None
    challenge_slug: str | None = None
    flagged_lines: list[int] = Field(default_factory=list)
    user_comments: str = Field(default="")


class DetectedIssue(BaseModel):
    """Details of an expected defect correctly identified by the reviewer."""

    model_config = ConfigDict(extra="allow")

    id: str
    title: str
    severity: str
    matched_lines: list[int] = Field(default_factory=list)
    matched_keywords: list[str] = Field(default_factory=list)
    line_score: float = Field(default=0.0, ge=0.0, le=1.0)
    concept_score: float = Field(default=0.0, ge=0.0, le=1.0)
    explanation: str = ""


class MissedIssue(BaseModel):
    """Details of an expected defect missed or omitted by the reviewer."""

    model_config = ConfigDict(extra="allow")

    id: str
    title: str
    severity: str
    expected_lines: list[int] = Field(default_factory=list)
    missing_keywords: list[str] = Field(default_factory=list)
    explanation: str = ""


class EvaluationResult(BaseModel):
    """Comprehensive evaluation result for a code review submission."""

    model_config = ConfigDict(extra="allow")

    score: int = Field(ge=0, le=100)
    line_precision_score: float = Field(default=0.0, ge=0.0, le=100.0)
    concept_score: float = Field(default=0.0, ge=0.0, le=100.0)
    false_positive_penalty: float = Field(default=0.0, ge=0.0)
    false_positive_lines: list[int] = Field(default_factory=list)
    detected_issues: list[DetectedIssue] = Field(default_factory=list)
    missed_issues: list[MissedIssue] = Field(default_factory=list)
    summary: str = ""
    critique: str = ""
    execution_time_ms: float = 0.0


def find_contiguous_blocks(lines: list[int]) -> list[tuple[int, int]]:
    """Group sorted unique line numbers into contiguous (start, end) ranges."""
    if not lines:
        return []
    sorted_unique = sorted(set(lines))
    blocks: list[tuple[int, int]] = []
    start = sorted_unique[0]
    end = sorted_unique[0]
    for n in sorted_unique[1:]:
        if n == end + 1:
            end = n
        else:
            blocks.append((start, end))
            start = n
            end = n
    blocks.append((start, end))
    return blocks


def get_tolerated_lines(
    lines: list[int],
    tolerance: int = 1,
    allow_single_line_tolerance: bool = False,
) -> set[int]:
    """Calculate acceptable lines including +/- tolerance for multi-line blocks.

    Multi-line blocks (span > 1 line) expand by +/- tolerance lines on both ends.
    Single-line blocks are exact unless allow_single_line_tolerance is True.
    """
    if not lines:
        return set()
    blocks = find_contiguous_blocks(lines)
    tolerated: set[int] = set()
    for start, end in blocks:
        if end > start:
            # Multi-line block: expand by tolerance
            for line_no in range(start - tolerance, end + tolerance + 1):
                if line_no > 0:
                    tolerated.add(line_no)
        else:
            # Single-line block
            if allow_single_line_tolerance:
                for line_no in range(start - tolerance, end + tolerance + 1):
                    if line_no > 0:
                        tolerated.add(line_no)
            else:
                tolerated.add(start)
    return tolerated


def is_keyword_matched(keyword: str, text: str) -> bool:
    """Check case-insensitively if a keyword or concept is present in the review text.

    Uses word boundaries for pure word tokens and substring/token search for
    punctuated or compound terms.
    """
    if not keyword or not text:
        return False
    kw = keyword.strip()
    if not kw:
        return False

    if re.fullmatch(r"[\w]+", kw):
        pattern = rf"\b{re.escape(kw)}\b"
        return bool(re.search(pattern, text, re.IGNORECASE))

    # For terms with symbols (e.g. text(), f-string, cwe-89) or multi-word phrases
    pattern = rf"(?:\b|^){re.escape(kw)}(?:\b|$)"
    if re.search(pattern, text, re.IGNORECASE):
        return True
    return kw.lower() in text.lower()


def extract_expected_issues(
    challenge: Challenge | dict[str, Any] | Any,
) -> list[DefectCriterion]:
    """Extract and validate DefectCriterion objects from a Challenge model or dict."""
    if hasattr(challenge, "get_expected_issues"):
        return challenge.get_expected_issues()

    if isinstance(challenge, dict):
        raw_issues = challenge.get("expected_issues", [])
        if isinstance(raw_issues, str):
            try:
                raw_issues = json.loads(raw_issues or "[]")
            except json.JSONDecodeError:
                raw_issues = []
        if isinstance(raw_issues, list):
            return [DefectCriterion.model_validate(item) for item in raw_issues]
        return []

    if hasattr(challenge, "expected_issues"):
        raw = challenge.expected_issues
        if isinstance(raw, str):
            try:
                raw = json.loads(raw or "[]")
            except json.JSONDecodeError:
                raw = []
        if isinstance(raw, list):
            return [DefectCriterion.model_validate(item) for item in raw]

    return []


def normalize_flagged_lines(flagged_lines: Any) -> list[int]:
    """Parse and normalize flagged lines into a deduplicated sorted list of integers."""
    if flagged_lines is None:
        return []
    if isinstance(flagged_lines, str):
        flagged_lines = flagged_lines.strip()
        if not flagged_lines or flagged_lines == "[]":
            return []
        try:
            parsed = json.loads(flagged_lines)
            if isinstance(parsed, list):
                return sorted(
                    {int(x) for x in parsed if str(x).isdigit() or isinstance(x, int)}
                )
        except (json.JSONDecodeError, ValueError):
            pass
        # Fallback to comma/whitespace separated numbers
        tokens = re.findall(r"\b\d+\b", flagged_lines)
        return sorted({int(t) for t in tokens})

    if isinstance(flagged_lines, (list, tuple, set)):
        result: set[int] = set()
        for item in flagged_lines:
            try:
                result.add(int(item))
            except (ValueError, TypeError):
                continue
        return sorted(result)

    return []


def generate_critique(
    score: int,
    detected_issues: list[DetectedIssue],
    missed_issues: list[MissedIssue],
    false_positive_lines: list[int],
    false_positive_penalty: float,
) -> tuple[str, str]:
    """Generate high-level summary phrase and actionable review critique."""
    if score == 100:
        summary_phrase = (
            "Outstanding review! You precisely identified all defect locations "
            "and explained the root cause."
        )
    elif score >= 80:
        summary_phrase = (
            "Great review! You identified the core defects with solid explanations."
        )
    elif score >= 50:
        summary_phrase = (
            "Satisfactory review. You identified some defects or concepts, "
            "but missed key lines or explanations."
        )
    elif score > 0:
        summary_phrase = (
            "Needs improvement. Some defect concepts or lines were noted, "
            "but major defects or line accuracy were missed."
        )
    else:
        summary_phrase = (
            "No defects identified. Review the code snippet and consider "
            "potential security, concurrency, or agent flaws."
        )

    parts: list[str] = [summary_phrase]

    if false_positive_lines:
        lines_str = ", ".join(str(ln) for ln in false_positive_lines)
        deduction = int(round(false_positive_penalty))
        parts.append(
            f"Penalty Applied: Flagged {len(false_positive_lines)} clean/unrelated "
            f"line(s) ({lines_str}), deducting {deduction} points."
        )

    if detected_issues:
        parts.append("Identified Defects:")
        for issue in detected_issues:
            lines_str = ", ".join(str(ln) for ln in issue.matched_lines)
            kws_str = (
                ", ".join(issue.matched_keywords) if issue.matched_keywords else "none"
            )
            parts.append(
                f"  ✓ {issue.title} [{issue.severity.upper()}] "
                f"(Line(s): {lines_str} | Concepts: {kws_str})"
            )

    if missed_issues:
        parts.append("Missed Defects:")
        for issue in missed_issues:
            lines_str = ", ".join(str(ln) for ln in issue.expected_lines)
            parts.append(
                f"  ✗ {issue.title} [{issue.severity.upper()}] "
                f"(Expected line(s): {lines_str})"
            )
            if issue.explanation:
                parts.append(f"    Root Cause: {issue.explanation}")

    critique = "\n".join(parts)
    return summary_phrase, critique


def evaluate_review(
    challenge: Challenge | dict[str, Any] | Any,
    flagged_lines: list[int] | set[int] | str | None = None,
    user_comments: str | list[str] | None = None,
    *,
    input_data: EvaluationInput | None = None,
    tolerance: int = 1,
    false_positive_penalty_per_line: float = 15.0,
    line_weight: float = 0.5,
    concept_weight: float = 0.5,
    target_keyword_matches: int = 2,
    allow_single_line_tolerance: bool = False,
) -> EvaluationResult:
    """Evaluate a code review submission against expected challenge defects.

    Args:
        challenge: Challenge instance or dictionary containing expected_issues.
        flagged_lines: Line numbers flagged by user as defective.
        user_comments: Written review critique explaining the defect.
        input_data: Optional EvaluationInput model holding parameters.
        tolerance: Line tolerance for multi-line blocks (default +/- 1 line).
        false_positive_penalty_per_line: Points deducted per clean line flagged.
        line_weight: Weight of line precision in base score (default 0.5).
        concept_weight: Weight of keyword matching in base score (default 0.5).
        target_keyword_matches: Number of matching keywords for full concept score.
        allow_single_line_tolerance: If True, allows +/- 1 tolerance for single lines.

    Returns:
        EvaluationResult containing normalized score, detected/missed issues,
        false positive penalties, and actionable critique.
    """
    start_time = time.perf_counter()

    # Merge optional EvaluationInput
    if input_data is not None:
        if flagged_lines is None:
            flagged_lines = input_data.flagged_lines
        if user_comments is None:
            user_comments = input_data.user_comments

    user_lines = normalize_flagged_lines(flagged_lines)

    if user_comments is None:
        comments_str = ""
    elif isinstance(user_comments, (list, tuple)):
        comments_str = " ".join(str(c) for c in user_comments).strip()
    else:
        comments_str = str(user_comments).strip()

    expected_issues = extract_expected_issues(challenge)

    # Edge case: No expected defects configured
    if not expected_issues:
        elapsed = round((time.perf_counter() - start_time) * 1000, 2)
        penalty = len(user_lines) * false_positive_penalty_per_line
        score = 100 if not user_lines else max(0, 100 - int(round(penalty)))
        return EvaluationResult(
            score=score,
            line_precision_score=100.0 if not user_lines else 0.0,
            concept_score=100.0 if comments_str else 0.0,
            false_positive_penalty=penalty,
            false_positive_lines=user_lines,
            detected_issues=[],
            missed_issues=[],
            summary="No expected defects configured for this challenge.",
            critique="No expected defects configured for this challenge.",
            execution_time_ms=elapsed,
        )

    # Determine tolerated lines per defect
    defect_tolerated: dict[str, set[int]] = {}
    all_tolerated_lines: set[int] = set()

    for defect in expected_issues:
        tolerated = get_tolerated_lines(
            defect.lines,
            tolerance=tolerance,
            allow_single_line_tolerance=allow_single_line_tolerance,
        )
        defect_tolerated[defect.id] = tolerated
        all_tolerated_lines.update(tolerated)

    # Compute false positive lines (clean/unrelated lines flagged by user)
    false_positive_lines = [
        line_num for line_num in user_lines if line_num not in all_tolerated_lines
    ]
    false_positive_penalty = len(false_positive_lines) * false_positive_penalty_per_line

    detected_issues: list[DetectedIssue] = []
    missed_issues: list[MissedIssue] = []

    total_line_score = 0.0
    total_concept_score = 0.0

    for defect in expected_issues:
        tolerated = defect_tolerated[defect.id]
        matched_lines = [line_num for line_num in user_lines if line_num in tolerated]
        has_line_match = len(matched_lines) > 0

        # Line precision for this defect
        line_score = 1.0 if has_line_match else 0.0

        # Keyword matching for this defect
        matched_keywords = [
            kw for kw in defect.keywords if is_keyword_matched(kw, comments_str)
        ]
        missing_keywords = [kw for kw in defect.keywords if kw not in matched_keywords]

        if not defect.keywords:
            concept_score = 1.0 if comments_str else 0.0
        else:
            required_target = min(target_keyword_matches, len(defect.keywords))
            if required_target == 0:
                concept_score = 1.0
            else:
                concept_score = min(1.0, len(matched_keywords) / required_target)

        total_line_score += line_score
        total_concept_score += concept_score

        if has_line_match:
            detected_issues.append(
                DetectedIssue(
                    id=defect.id,
                    title=defect.title or defect.id,
                    severity=defect.severity,
                    matched_lines=matched_lines,
                    matched_keywords=matched_keywords,
                    line_score=line_score,
                    concept_score=concept_score,
                    explanation=defect.explanation,
                )
            )
        else:
            missed_issues.append(
                MissedIssue(
                    id=defect.id,
                    title=defect.title or defect.id,
                    severity=defect.severity,
                    expected_lines=defect.lines,
                    missing_keywords=missing_keywords,
                    explanation=defect.explanation,
                )
            )

    num_defects = len(expected_issues)
    avg_line_score = (total_line_score / num_defects) * 100.0
    avg_concept_score = (total_concept_score / num_defects) * 100.0

    # Calculate weighted base score
    base_score = (avg_line_score * line_weight) + (avg_concept_score * concept_weight)

    # Apply false positive penalty and normalize to 0..100
    raw_final_score = base_score - false_positive_penalty
    normalized_score = max(0, min(100, int(round(raw_final_score))))

    summary_phrase, critique = generate_critique(
        score=normalized_score,
        detected_issues=detected_issues,
        missed_issues=missed_issues,
        false_positive_lines=false_positive_lines,
        false_positive_penalty=false_positive_penalty,
    )

    elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)

    return EvaluationResult(
        score=normalized_score,
        line_precision_score=round(avg_line_score, 2),
        concept_score=round(avg_concept_score, 2),
        false_positive_penalty=round(false_positive_penalty, 2),
        false_positive_lines=false_positive_lines,
        detected_issues=detected_issues,
        missed_issues=missed_issues,
        summary=summary_phrase,
        critique=critique,
        execution_time_ms=elapsed_ms,
    )
