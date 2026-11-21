"""Automated Code Review Evaluation and Defect Matching Engine.

Evaluates user code review submissions against expected defects, scoring
line precision, keyword and concept matching, and penalizing false positives.
"""

import functools
import json
import re
import time
from collections import deque
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from backend.models.challenge import (
    Challenge,
    ChallengeFile,
    DefectCriterion,
    FlaggedLineItem,
    FlaggedLineRef,
)


PASS_SCORE_THRESHOLD = 80
MAX_BLIND_ATTEMPTS = 3
OFF_BY_ONE_PROXIMITY_SCORE = 0.5
ScopedLine = tuple[str | None, int]


class EvaluationInput(BaseModel):
    """Pydantic model representing user input for code review evaluation."""

    model_config = ConfigDict(extra="allow", populate_by_name=True)

    challenge_id: int | None = None
    challenge_slug: str | None = None
    flagged_lines: list[FlaggedLineItem] = Field(default_factory=list)
    user_comments: str = Field(default="")


class DetectedIssue(BaseModel):
    """Details of an expected defect correctly identified by the reviewer."""

    model_config = ConfigDict(extra="allow")

    id: str
    title: str
    severity: str
    matched_lines: list[FlaggedLineItem] = Field(default_factory=list)
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
    expected_lines: list[FlaggedLineItem] = Field(default_factory=list)
    missing_keywords: list[str] = Field(default_factory=list)
    explanation: str = ""


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


def get_proximity_lines(
    lines: list[int],
    tolerance: int = 1,
    allow_single_line_tolerance: bool = False,
) -> set[int]:
    """Return off-by-one proximity lines around single-line defects."""
    if not lines or tolerance <= 0 or allow_single_line_tolerance:
        return set()
    tolerated = get_tolerated_lines(
        lines,
        tolerance=tolerance,
        allow_single_line_tolerance=False,
    )
    all_near = get_tolerated_lines(
        lines,
        tolerance=tolerance,
        allow_single_line_tolerance=True,
    )
    return all_near - tolerated


def redact_missed_issues(missed_issues: list[MissedIssue]) -> list[MissedIssue]:
    """Strip spoiler details from missed issues while retaining title and severity."""
    return [
        MissedIssue(
            id=issue.id,
            title=issue.title,
            severity=issue.severity,
            expected_lines=[],
            missing_keywords=[],
            explanation="",
        )
        for issue in missed_issues
    ]


@functools.lru_cache(maxsize=1024)
def _compile_word_pattern(kw: str) -> re.Pattern[str]:
    return re.compile(rf"\b{re.escape(kw)}\b", re.IGNORECASE)


@functools.lru_cache(maxsize=1024)
def _compile_compound_pattern(kw: str) -> re.Pattern[str]:
    return re.compile(rf"(?:\b|^){re.escape(kw)}(?:\b|$)", re.IGNORECASE)


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
        return bool(_compile_word_pattern(kw).search(text))

    # For terms with symbols (e.g. text(), f-string, cwe-89) or multi-word phrases
    if _compile_compound_pattern(kw).search(text):
        return True
    return kw.lower() in text.lower()


def extract_challenge_files(
    challenge: Challenge | dict[str, Any] | Any,
) -> list[ChallengeFile]:
    """Extract and validate ChallengeFile objects from a Challenge model or dict."""
    if hasattr(challenge, "get_files"):
        return challenge.get_files()

    raw_files: Any = None
    if isinstance(challenge, dict):
        raw_files = challenge.get("files", [])
    elif hasattr(challenge, "files"):
        raw_files = challenge.files

    if isinstance(raw_files, str):
        try:
            raw_files = json.loads(raw_files or "[]")
        except json.JSONDecodeError:
            return []

    if isinstance(raw_files, list):
        return [
            item
            if isinstance(item, ChallengeFile)
            else ChallengeFile.model_validate(item)
            for item in raw_files
        ]

    return []


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
            return [
                item
                if isinstance(item, DefectCriterion)
                else DefectCriterion.model_validate(item)
                for item in raw_issues
            ]
        return []

    if hasattr(challenge, "expected_issues"):
        raw = challenge.expected_issues
        if isinstance(raw, str):
            try:
                raw = json.loads(raw or "[]")
            except json.JSONDecodeError:
                raw = []
        if isinstance(raw, list):
            return [
                item
                if isinstance(item, DefectCriterion)
                else DefectCriterion.model_validate(item)
                for item in raw
            ]

    return []


def _parse_scoped_item(
    item: Any,
    default_file_path: str | None = None,
) -> tuple[ScopedLine | None, bool]:
    if isinstance(item, FlaggedLineRef):
        return (item.file_path, item.line_number), True
    if isinstance(item, dict):
        ref = FlaggedLineRef.model_validate(item)
        return (ref.file_path, ref.line_number), True
    if isinstance(item, (list, tuple)) and len(item) == 2:
        ref = FlaggedLineRef.model_validate(item)
        return (ref.file_path, ref.line_number), True
    if isinstance(item, bool):
        return None, False
    try:
        return (default_file_path, int(item)), False
    except (ValueError, TypeError):
        return None, False


def normalize_scoped_flagged_lines(
    flagged_lines: Any,
    default_file_path: str | None = None,
) -> tuple[list[ScopedLine], bool]:
    """Parse flagged lines into deduplicated sorted (file_path, line_number) tuples."""
    if flagged_lines is None:
        return [], False

    parsed_items: Any = flagged_lines
    if isinstance(flagged_lines, str):
        trimmed = flagged_lines.strip()
        if not trimmed or trimmed == "[]":
            return [], False
        try:
            decoded = json.loads(trimmed)
            if isinstance(decoded, list):
                parsed_items = decoded
            else:
                tokens = re.findall(r"\b\d+\b", trimmed)
                return sorted({(default_file_path, int(t)) for t in tokens}), False
        except (json.JSONDecodeError, ValueError):
            tokens = re.findall(r"\b\d+\b", trimmed)
            return sorted({(default_file_path, int(t)) for t in tokens}), False

    if isinstance(parsed_items, (list, tuple, set)):
        result: set[ScopedLine] = set()
        had_explicit_scope = False
        for item in parsed_items:
            scoped, is_explicit = _parse_scoped_item(
                item, default_file_path=default_file_path
            )
            if scoped is not None:
                result.add(scoped)
                if is_explicit:
                    had_explicit_scope = True
        sorted_lines = sorted(result, key=lambda pair: (pair[0] or "", pair[1]))
        return sorted_lines, had_explicit_scope

    return [], False


def normalize_flagged_lines(flagged_lines: Any) -> list[int]:
    """Parse and normalize flagged lines into a deduplicated sorted list of integers."""
    scoped, _ = normalize_scoped_flagged_lines(flagged_lines)
    return sorted({line_no for _, line_no in scoped})


def _format_line_item_text(item: FlaggedLineItem) -> str:
    if isinstance(item, FlaggedLineRef):
        return f"{item.file_path}:{item.line_number}"
    return str(item)


def _format_output_lines(
    lines: list[ScopedLine],
    scoped_output: bool,
) -> list[FlaggedLineItem]:
    formatted: list[FlaggedLineItem] = []
    for file_path, line_no in sorted(
        set(lines), key=lambda pair: (pair[0] or "", pair[1])
    ):
        if scoped_output and file_path is not None:
            formatted.append(FlaggedLineRef(file_path=file_path, line_number=line_no))
        else:
            formatted.append(line_no)
    return formatted


def generate_critique(
    score: int,
    detected_issues: list[DetectedIssue],
    missed_issues: list[MissedIssue],
    false_positive_lines: list[FlaggedLineItem],
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
        lines_str = ", ".join(_format_line_item_text(ln) for ln in false_positive_lines)
        deduction = int(round(false_positive_penalty))
        parts.append(
            f"Penalty Applied: Flagged {len(false_positive_lines)} clean/unrelated "
            f"line(s) ({lines_str}), deducting {deduction} points."
        )

    if detected_issues:
        parts.append("Identified Defects:")
        for issue in detected_issues:
            lines_str = ", ".join(
                _format_line_item_text(ln) for ln in issue.matched_lines
            )
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
            if issue.expected_lines:
                lines_str = ", ".join(
                    _format_line_item_text(ln) for ln in issue.expected_lines
                )
                parts.append(
                    f"  ✗ {issue.title} [{issue.severity.upper()}] "
                    f"(Expected line(s): {lines_str})"
                )
            else:
                parts.append(f"  ✗ {issue.title} [{issue.severity.upper()}]")
            if issue.explanation:
                parts.append(f"    Root Cause: {issue.explanation}")

    critique = "\n".join(parts)
    return summary_phrase, critique


def _match_lines_one_to_one(
    candidate_lines: list[ScopedLine],
    defect_indices: list[int],
    defect_exact: list[set[ScopedLine]],
    defect_tolerated: list[set[ScopedLine]],
    defect_proximity: list[set[ScopedLine]],
    raw_concept_scores: list[float],
) -> tuple[dict[int, ScopedLine], dict[int, float]]:
    """Find a maximum-weight 1-to-1 matching between flagged lines and defects.

    Returns:
        Tuple of (defect_idx -> matched_line, defect_idx -> line_score).
    """
    if not candidate_lines or not defect_indices:
        return {}, {}

    num_u = len(candidate_lines)
    num_d = len(defect_indices)
    source = 0
    sink = 1 + num_u + num_d
    total_nodes = sink + 1
    adj: list[list[list[int]]] = [[] for _ in range(total_nodes)]

    def add_edge(frm: int, to: int, cap: int, cost: int) -> None:
        adj[frm].append([to, cap, cost, len(adj[to])])
        adj[to].append([frm, 0, -cost, len(adj[frm]) - 1])

    for u_pos in range(num_u):
        add_edge(source, 1 + u_pos, 1, 0)

    for d_pos in range(num_d):
        add_edge(1 + num_u + d_pos, sink, 1, 0)

    edge_credits: dict[tuple[int, int], float] = {}
    for u_pos, line_no in enumerate(candidate_lines):
        for d_pos, d_idx in enumerate(defect_indices):
            if line_no in defect_tolerated[d_idx]:
                credit = 1.0
            elif line_no in defect_proximity[d_idx]:
                credit = OFF_BY_ONE_PROXIMITY_SCORE
            else:
                continue

            is_exact = line_no in defect_exact[d_idx]
            kw_bonus = int(round(raw_concept_scores[d_idx] * 100))
            weight = (
                int(round(credit * 1_000_000)) + (1_000 if is_exact else 0) + kw_bonus
            )
            add_edge(1 + u_pos, 1 + num_u + d_pos, 1, -weight)
            edge_credits[(u_pos, d_pos)] = credit

    # Successive shortest augmenting path (SPFA) maximizes total weight.
    inf = 10**18
    while True:
        dist = [inf] * total_nodes
        in_queue = [False] * total_nodes
        parent_node = [-1] * total_nodes
        parent_edge = [-1] * total_nodes
        dist[source] = 0
        queue: deque[int] = deque([source])
        in_queue[source] = True

        while queue:
            u = queue.popleft()
            in_queue[u] = False
            for idx, edge in enumerate(adj[u]):
                v, cap, cost, _ = edge
                if cap > 0 and dist[u] + cost < dist[v]:
                    dist[v] = dist[u] + cost
                    parent_node[v] = u
                    parent_edge[v] = idx
                    if not in_queue[v]:
                        queue.append(v)
                        in_queue[v] = True

        if dist[sink] >= 0 or parent_node[sink] == -1:
            break

        curr = sink
        while curr != source:
            p = parent_node[curr]
            e_idx = parent_edge[curr]
            rev_idx = adj[p][e_idx][3]
            adj[p][e_idx][1] -= 1
            adj[curr][rev_idx][1] += 1
            curr = p

    assigned_line: dict[int, ScopedLine] = {}
    assigned_score: dict[int, float] = {}
    for u_pos, line_key in enumerate(candidate_lines):
        u_node = 1 + u_pos
        for edge in adj[u_node]:
            v, cap, _, _ = edge
            if cap == 0 and 1 + num_u <= v < sink:
                d_pos = v - (1 + num_u)
                d_idx = defect_indices[d_pos]
                assigned_line[d_idx] = line_key
                assigned_score[d_idx] = edge_credits[(u_pos, d_pos)]
                break

    return assigned_line, assigned_score


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
        pass_threshold: Minimum score required to reveal missed-issue details.
        attempt_number: Current 1-based attempt count for this challenge and actor.
        max_attempts: Attempt count at or after which missed details are unlocked.
        reveal_solution: If True, bypasses spoiler gating on missed_issues.

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

    expected_issues = extract_expected_issues(challenge)
    has_explicit_defect_scope = any(
        defect.file_path is not None
        or any(isinstance(item, FlaggedLineRef) for item in defect.lines)
        for defect in expected_issues
    )
    scoped_output = (
        len(challenge_files) > 1 or had_explicit_user_scope or has_explicit_defect_scope
    )

    # Edge case: No expected defects configured cannot award 100/100.
    if not expected_issues:
        elapsed = round((time.perf_counter() - start_time) * 1000, 2)
        return EvaluationResult(
            score=0,
            line_precision_score=0.0,
            concept_score=0.0,
            false_positive_penalty=0.0,
            false_positive_lines=[],
            detected_issues=[],
            missed_issues=[],
            summary="No expected defects configured for this challenge.",
            critique="No expected defects configured for this challenge.",
            execution_time_ms=elapsed,
        )

    # Precompute line sets and raw keyword matches per defect (scoped by file_path)
    defect_exact: list[set[ScopedLine]] = []
    defect_tolerated: list[set[ScopedLine]] = []
    defect_proximity: list[set[ScopedLine]] = []
    defect_scoped_lines: list[list[ScopedLine]] = []
    all_eligible_lines: set[ScopedLine] = set()
    line_defect_indices: list[int] = []

    matched_keywords_by_defect: list[list[str]] = []
    missing_keywords_by_defect: list[list[str]] = []
    raw_concept_scores: list[float] = []

    for idx, defect in enumerate(expected_issues):
        scoped_lines = defect.get_scoped_lines(default_file_path=default_file_path)
        defect_scoped_lines.append(scoped_lines)

        by_file: dict[str | None, list[int]] = {}
        for fp, ln in scoped_lines:
            by_file.setdefault(fp, []).append(ln)

        exact_set: set[ScopedLine] = set()
        tolerated_set: set[ScopedLine] = set()
        proximity_set: set[ScopedLine] = set()
        for fp, lines_in_file in by_file.items():
            exact_set.update((fp, ln) for ln in lines_in_file)
            tolerated_set.update(
                (fp, ln)
                for ln in get_tolerated_lines(
                    lines_in_file,
                    tolerance=tolerance,
                    allow_single_line_tolerance=allow_single_line_tolerance,
                )
            )
            proximity_set.update(
                (fp, ln)
                for ln in get_proximity_lines(
                    lines_in_file,
                    tolerance=tolerance,
                    allow_single_line_tolerance=allow_single_line_tolerance,
                )
            )

        defect_exact.append(exact_set)
        defect_tolerated.append(tolerated_set)
        defect_proximity.append(proximity_set)
        all_eligible_lines.update(tolerated_set)
        all_eligible_lines.update(proximity_set)
        if exact_set:
            line_defect_indices.append(idx)

        matched_kws = [
            kw for kw in defect.keywords if is_keyword_matched(kw, comments_str)
        ]
        missing_kws = [kw for kw in defect.keywords if kw not in matched_kws]
        matched_keywords_by_defect.append(matched_kws)
        missing_keywords_by_defect.append(missing_kws)

        if not defect.keywords:
            raw_concept = 1.0 if (exact_set and comments_str) else 0.0
        else:
            required_target = min(target_keyword_matches, len(defect.keywords))
            raw_concept = (
                1.0
                if required_target == 0
                else min(1.0, len(matched_kws) / required_target)
            )
        raw_concept_scores.append(raw_concept)

    # Compute false positive lines (clean/unrelated lines flagged by user)
    false_positive_scoped = [
        line_key for line_key in user_lines if line_key not in all_eligible_lines
    ]
    false_positive_lines = _format_output_lines(
        false_positive_scoped, scoped_output=scoped_output
    )
    false_positive_penalty = (
        len(false_positive_scoped) * false_positive_penalty_per_line
    )

    candidate_lines = [
        line_key for line_key in user_lines if line_key in all_eligible_lines
    ]
    assigned_line, assigned_line_score = _match_lines_one_to_one(
        candidate_lines=candidate_lines,
        defect_indices=line_defect_indices,
        defect_exact=defect_exact,
        defect_tolerated=defect_tolerated,
        defect_proximity=defect_proximity,
        raw_concept_scores=raw_concept_scores,
    )

    # Group all non-FP lines under matched defects for display without double-counting.
    matched_lines_by_defect: dict[int, list[ScopedLine]] = {
        d_idx: [line_key] for d_idx, line_key in assigned_line.items()
    }
    used_anchor_lines = set(assigned_line.values())
    matched_defect_ids = list(assigned_line.keys())
    for line_key in candidate_lines:
        if line_key in used_anchor_lines:
            continue
        best_defect: int | None = None
        best_rank = -1
        for d_idx in matched_defect_ids:
            if line_key in defect_exact[d_idx]:
                rank = 3
            elif line_key in defect_tolerated[d_idx]:
                rank = 2
            elif line_key in defect_proximity[d_idx]:
                rank = 1
            else:
                continue
            if rank > best_rank:
                best_rank = rank
                best_defect = d_idx
        if best_defect is not None:
            matched_lines_by_defect[best_defect].append(line_key)

    detected_issues: list[DetectedIssue] = []
    missed_issues: list[MissedIssue] = []

    total_line_score = 0.0
    total_concept_score = 0.0

    for idx, defect in enumerate(expected_issues):
        has_lines = bool(defect_exact[idx])
        matched_kws = matched_keywords_by_defect[idx]
        missing_kws = missing_keywords_by_defect[idx]
        raw_concept = raw_concept_scores[idx]

        if has_lines:
            line_score = assigned_line_score.get(idx, 0.0)
            # Anchor concept credit to line proximity to block keyword stuffing.
            concept_score = raw_concept if line_score > 0.0 else 0.0
            matched_lines = _format_output_lines(
                matched_lines_by_defect.get(idx, []),
                scoped_output=scoped_output,
            )
            is_detected = line_score > 0.0
        else:
            # Defects without configured lines are scored by concept matching so they
            # do not cap valid reviews below 100/100.
            is_detected = bool(defect.keywords) and raw_concept > 0.0
            line_score = 1.0 if is_detected else 0.0
            concept_score = raw_concept if is_detected else 0.0
            matched_lines = []

        total_line_score += line_score
        total_concept_score += concept_score

        if is_detected:
            detected_issues.append(
                DetectedIssue(
                    id=defect.id,
                    title=defect.title or defect.id,
                    severity=defect.severity,
                    matched_lines=matched_lines,
                    matched_keywords=matched_kws,
                    line_score=line_score,
                    concept_score=concept_score,
                    explanation=defect.explanation,
                )
            )
        else:
            expected_lines = (
                _format_output_lines(
                    defect_scoped_lines[idx], scoped_output=scoped_output
                )
                if defect_scoped_lines[idx]
                else defect.lines
            )
            missed_issues.append(
                MissedIssue(
                    id=defect.id,
                    title=defect.title or defect.id,
                    severity=defect.severity,
                    expected_lines=expected_lines,
                    missing_keywords=missing_kws,
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

    reveal_missed_details = (
        reveal_solution
        or normalized_score >= pass_threshold
        or attempt_number >= max_attempts
    )
    if not reveal_missed_details and missed_issues:
        missed_issues = redact_missed_issues(missed_issues)

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
