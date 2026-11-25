"""Coach failure pattern aggregation and actor-scoped submission debriefs."""

import json
from collections import defaultdict
from collections.abc import Callable, Sequence
from datetime import datetime
from enum import StrEnum
from typing import Any, TypeVar

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy.orm import load_only
from sqlmodel import Session, or_, select

from backend.models.challenge import (
    Challenge,
    ChallengeFile,
    DefectCriterion,
    FlaggedLineItem,
    FlaggedLineRef,
)
from backend.models.submission import Submission
from backend.services.analytics_service import (
    compute_submission_precision_recall,
    has_submission_eval_metadata,
    to_utc_aware,
)
from backend.services.grading.review import ScopedLine, normalize_scoped_flagged_lines
from backend.services.ownership import (
    Actor,
    challenge_owner_filter,
    submission_owner_filter,
)


PASS_THRESHOLD = 80.0
TRUNCATION_MARKER = "\n... [truncated]"
MAX_DEBRIEF_CODE_SNIPPET_CHARS = 6000
MAX_DEBRIEF_FILES = 6
MAX_DEBRIEF_FILE_CHARS = 6000
MAX_DEBRIEF_COMMENTS_CHARS = 1500
MAX_DEBRIEF_COMMENTS_SUMMARY_CHARS = 700
MAX_DEBRIEF_CANONICAL_REVIEW_CHARS = 2500
MAX_DEBRIEF_FIX_DIFF_CHARS = 2500
MAX_DEBRIEF_FLAGGED_LINES = 100
MAX_DEBRIEF_ISSUES = 15
MAX_DEBRIEF_ISSUE_EXPLANATION_CHARS = 400
MAX_DEBRIEF_ISSUE_KEYWORDS = 12
MAX_DEBRIEF_ISSUE_LINES = 30
MAX_DEBRIEF_ISSUE_ID_CHARS = 200
MAX_DEBRIEF_ISSUE_TITLE_CHARS = 300
MAX_DEBRIEF_ISSUE_SEVERITY_CHARS = 50
MAX_DEBRIEF_ISSUE_KEYWORD_CHARS = 200
MAX_DEBRIEF_FILE_PATH_CHARS = 500

_T = TypeVar("_T")


class FailureMode(StrEnum):
    """Primary failure pattern for a category/language/difficulty slice."""

    LOW_RECALL = "low_recall"
    LOW_PRECISION = "low_precision"
    LOW_CONCEPT_COVERAGE = "low_concept_coverage"


class PatternSlice(BaseModel):
    """Aggregated review performance for a (category, language, difficulty) slice."""

    model_config = ConfigDict(extra="ignore")

    category: str
    language: str
    difficulty: str
    attempts: int = Field(ge=1)
    unique_challenges: int = Field(ge=1)
    average_score: float = Field(ge=0.0, le=100.0)
    precision: float = Field(ge=0.0, le=100.0)
    recall: float = Field(ge=0.0, le=100.0)
    concept_coverage: float = Field(ge=0.0, le=100.0)
    dominant_failure_mode: FailureMode | None = None


class MissedSubmissionSummary(BaseModel):
    """Summary of a recent review submission with missed defects or low score."""

    model_config = ConfigDict(extra="ignore")

    challenge_slug: str
    title: str
    category: str
    language: str
    difficulty: str
    score: int = Field(ge=0, le=100)
    missed_line_count: int = Field(ge=0)
    false_positive_count: int = Field(ge=0)
    submitted_at: datetime


class CoachPatternsResponse(BaseModel):
    """Aggregated failure patterns and recent missed reviews for an actor."""

    model_config = ConfigDict(extra="ignore")

    total_submissions: int = Field(default=0, ge=0)
    total_missed_submissions: int = Field(default=0, ge=0)
    weakest_slices: list[PatternSlice] = Field(default_factory=list)
    strongest_slices: list[PatternSlice] = Field(default_factory=list)
    recent_missed: list[MissedSubmissionSummary] = Field(default_factory=list)


class DebriefIssueItem(BaseModel):
    """Normalized defect item across expected, detected, and missed issue lists."""

    model_config = ConfigDict(extra="ignore")

    id: str
    title: str
    severity: str
    lines: list[FlaggedLineItem] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    explanation: str = ""


class DebriefFileItem(BaseModel):
    """Challenge file snippet or diff included in a submission debrief."""

    model_config = ConfigDict(extra="ignore")

    path: str
    language: str
    content: str | None = None
    patch: str | None = None


class CoachSubmissionDebriefResponse(BaseModel):
    """Line-specific debrief payload for an actor's latest submission."""

    model_config = ConfigDict(extra="ignore")

    challenge_slug: str
    title: str
    category: str
    language: str
    difficulty: str
    submission_id: int
    submitted_at: datetime
    score: int = Field(ge=0, le=100)
    flagged_lines: list[FlaggedLineItem] = Field(default_factory=list)
    false_positive_lines: list[FlaggedLineItem] = Field(default_factory=list)
    comments: str = ""
    detected_issues: list[DebriefIssueItem] = Field(default_factory=list)
    missed_issues: list[DebriefIssueItem] = Field(default_factory=list)
    code_snippet: str = ""
    files: list[DebriefFileItem] = Field(default_factory=list)
    canonical_review: str = ""
    recommended_fix_diff: str = ""
    expected_issues: list[DebriefIssueItem] = Field(default_factory=list)
    truncated: bool = False


def _enum_str(value: Any) -> str:
    return value.value if hasattr(value, "value") else str(value)


def _compute_submission_concept_coverage(sub: Submission) -> float:
    if has_submission_eval_metadata(sub):
        return round(max(0.0, min(100.0, float(sub.concept_score))), 1)
    return round(float(max(0, min(100, sub.score))), 1)


def _dominant_failure_mode(
    *,
    average_score: float,
    recall: float,
    precision: float,
    concept_coverage: float,
) -> FailureMode | None:
    if (
        average_score >= PASS_THRESHOLD
        and recall >= PASS_THRESHOLD
        and precision >= PASS_THRESHOLD
        and concept_coverage >= PASS_THRESHOLD
    ):
        return None
    candidates = [
        (recall, 0, FailureMode.LOW_RECALL),
        (precision, 1, FailureMode.LOW_PRECISION),
        (concept_coverage, 2, FailureMode.LOW_CONCEPT_COVERAGE),
    ]
    return min(candidates, key=lambda item: (item[0], item[1]))[2]


def _count_missed_lines(missed_issues: list[Any]) -> int:
    if not missed_issues:
        return 0
    unique_lines: set[ScopedLine] = set()
    for issue in missed_issues:
        raw_lines = (
            issue.get("expected_lines")
            if isinstance(issue, dict)
            else getattr(issue, "expected_lines", None)
        )
        if raw_lines:
            try:
                scoped, _ = normalize_scoped_flagged_lines(raw_lines)
            except (ValidationError, ValueError, TypeError):
                continue
            unique_lines.update(scoped)
    if unique_lines:
        return len(unique_lines)
    return len(missed_issues)


def _count_false_positives(sub: Submission) -> int:
    scoped, _ = normalize_scoped_flagged_lines(sub.get_false_positive_lines())
    return len(set(scoped))


def _weakest_sort_key(
    item: PatternSlice,
) -> tuple[float, float, float, float, int, str, str, str]:
    return (
        item.average_score,
        item.recall,
        item.precision,
        item.concept_coverage,
        -item.attempts,
        item.category,
        item.language,
        item.difficulty,
    )


def _strongest_sort_key(
    item: PatternSlice,
) -> tuple[float, float, float, float, int, str, str, str]:
    return (
        -item.average_score,
        -item.recall,
        -item.precision,
        -item.concept_coverage,
        -item.attempts,
        item.category,
        item.language,
        item.difficulty,
    )


def _rank_slices(
    slices: list[PatternSlice],
    slice_limit: int,
) -> tuple[list[PatternSlice], list[PatternSlice]]:
    if not slices:
        return [], []
    if len(slices) == 1:
        only = slices[0]
        if (
            only.average_score < PASS_THRESHOLD
            or only.dominant_failure_mode is not None
        ):
            return [only], []
        return [], [only]

    effective_limit = max(1, slice_limit)
    weakest_ordered = sorted(slices, key=_weakest_sort_key)
    strongest_ordered = sorted(slices, key=_strongest_sort_key)

    weakest_count = (
        len(slices) // 2 if len(slices) < 2 * effective_limit else effective_limit
    )
    weakest_slices = weakest_ordered[:weakest_count]
    weakest_keys = {
        (item.category, item.language, item.difficulty) for item in weakest_slices
    }
    strongest_slices = [
        item
        for item in strongest_ordered
        if (item.category, item.language, item.difficulty) not in weakest_keys
    ][:effective_limit]
    return weakest_slices, strongest_slices


def aggregate_coach_patterns(
    rows: Sequence[tuple[Submission, Challenge]],
    *,
    slice_limit: int = 5,
    missed_limit: int = 10,
) -> CoachPatternsResponse:
    """Pure aggregation of performance slices and missed submissions."""
    if not rows:
        return CoachPatternsResponse()

    grouped: dict[tuple[str, str, str], list[tuple[Submission, Challenge]]] = (
        defaultdict(list)
    )
    missed_entries: list[tuple[Submission, Challenge, list[Any]]] = []

    for sub, challenge in rows:
        slice_key = (
            _enum_str(challenge.category),
            _enum_str(challenge.language),
            _enum_str(challenge.difficulty),
        )
        grouped[slice_key].append((sub, challenge))

        missed_issues = sub.get_missed_issues()
        if sub.score < PASS_THRESHOLD or len(missed_issues) > 0:
            missed_entries.append((sub, challenge, missed_issues))

    slices: list[PatternSlice] = []
    for (category, language, difficulty), items in grouped.items():
        attempts = len(items)
        challenge_keys = {
            ch.id if ch.id is not None else (sub.challenge_id, ch.slug)
            for sub, ch in items
        }
        pr_pairs = [compute_submission_precision_recall(sub) for sub, _ in items]
        avg_score = round(
            sum(max(0, min(100, int(sub.score))) for sub, _ in items) / attempts,
            1,
        )
        avg_precision = round(sum(p for p, _ in pr_pairs) / attempts, 1)
        avg_recall = round(sum(r for _, r in pr_pairs) / attempts, 1)
        avg_concept = round(
            sum(_compute_submission_concept_coverage(sub) for sub, _ in items)
            / attempts,
            1,
        )
        slices.append(
            PatternSlice(
                category=category,
                language=language,
                difficulty=difficulty,
                attempts=attempts,
                unique_challenges=len(challenge_keys),
                average_score=avg_score,
                precision=avg_precision,
                recall=avg_recall,
                concept_coverage=avg_concept,
                dominant_failure_mode=_dominant_failure_mode(
                    average_score=avg_score,
                    recall=avg_recall,
                    precision=avg_precision,
                    concept_coverage=avg_concept,
                ),
            )
        )

    weakest_slices, strongest_slices = _rank_slices(slices, slice_limit)

    missed_entries.sort(
        key=lambda entry: (to_utc_aware(entry[0].created_at), entry[0].id or 0),
        reverse=True,
    )
    bounded_missed = missed_entries[: max(0, missed_limit)]
    recent_missed = [
        MissedSubmissionSummary(
            challenge_slug=challenge.slug,
            title=challenge.title,
            category=_enum_str(challenge.category),
            language=_enum_str(challenge.language),
            difficulty=_enum_str(challenge.difficulty),
            score=max(0, min(100, int(sub.score))),
            missed_line_count=_count_missed_lines(missed_issues),
            false_positive_count=_count_false_positives(sub),
            submitted_at=to_utc_aware(sub.created_at),
        )
        for sub, challenge, missed_issues in bounded_missed
    ]

    return CoachPatternsResponse(
        total_submissions=len(rows),
        total_missed_submissions=len(missed_entries),
        weakest_slices=weakest_slices,
        strongest_slices=strongest_slices,
        recent_missed=recent_missed,
    )


def _accessible_challenge_filter(actor: Actor) -> Any:
    ch_owner_filter = challenge_owner_filter(actor)
    if ch_owner_filter is not None:
        return or_(Challenge.is_public.is_(True), ch_owner_filter)
    return Challenge.is_public.is_(True)


def _truncate_text(text: str, max_chars: int) -> tuple[str, bool]:
    if len(text) <= max_chars:
        return text, False
    if max_chars <= len(TRUNCATION_MARKER):
        return TRUNCATION_MARKER[:max_chars], True
    budget = max_chars - len(TRUNCATION_MARKER)
    if text[budget] == "\n":
        return f"{text[:budget]}{TRUNCATION_MARKER}", True
    head = text[:budget]
    last_nl = head.rfind("\n")
    if last_nl > 0:
        head = head[:last_nl]
    return f"{head}{TRUNCATION_MARKER}", True


def _truncate_list(items: list[_T], max_items: int) -> tuple[list[_T], bool]:
    if len(items) <= max_items:
        return items, False
    return items[:max_items], True


def _safe_list_getter(getter: Callable[[], list[_T]]) -> list[_T]:
    try:
        result = getter()
    except (ValueError, TypeError, ValidationError):
        return []
    return result if isinstance(result, list) else []


def _clip_nonempty_str(
    value: Any,
    max_chars: int,
    fallback: str,
) -> tuple[str, bool]:
    raw = "" if value is None or isinstance(value, bool) else str(value).strip()
    if not raw:
        return fallback[:max_chars], False
    if len(raw) > max_chars:
        clipped = raw[:max_chars].strip() or fallback[:max_chars]
        return clipped, True
    return raw, False


def _clip_file_path(value: Any) -> tuple[str | None, bool]:
    if not isinstance(value, str):
        return None, False
    stripped = value.strip()
    if not stripped:
        return None, False
    if len(stripped) > MAX_DEBRIEF_FILE_PATH_CHARS:
        clipped = stripped[:MAX_DEBRIEF_FILE_PATH_CHARS].strip()
        return (clipped or None), True
    return stripped, False


def _clip_line_ref_input(item: Any) -> Any:
    if isinstance(item, (list, tuple)) and len(item) == 2:
        fp, clipped = _clip_file_path(item[0])
        if clipped and fp is not None:
            return (fp, item[1])
        return item
    if isinstance(item, dict):
        d = dict(item)
        for key in ("file_path", "path", "file"):
            if key in d and isinstance(d[key], str):
                fp, _ = _clip_file_path(d[key])
                d[key] = fp or ""
        return d
    return item


def _clip_debrief_line_items(
    lines: list[FlaggedLineItem],
) -> tuple[list[FlaggedLineItem], bool]:
    result: list[FlaggedLineItem] = []
    was_clipped = False
    for item in lines:
        if isinstance(item, FlaggedLineRef):
            fp, fp_clipped = _clip_file_path(item.file_path)
            if fp is None:
                continue
            if fp_clipped:
                was_clipped = True
            if fp_clipped or fp != item.file_path:
                result.append(
                    FlaggedLineRef(file_path=fp, line_number=item.line_number)
                )
            else:
                result.append(item)
        else:
            result.append(item)
    return result, was_clipped


def _normalize_keywords(raw_keywords: Any) -> tuple[list[str], bool]:
    if not isinstance(raw_keywords, list):
        return [], False
    keywords: list[str] = []
    was_clipped = False
    for kw in raw_keywords:
        if kw is None:
            continue
        kw_str = str(kw)
        if len(kw_str) > MAX_DEBRIEF_ISSUE_KEYWORD_CHARS:
            kw_str = kw_str[:MAX_DEBRIEF_ISSUE_KEYWORD_CHARS]
            was_clipped = True
        keywords.append(kw_str)
    return keywords, was_clipped


def _normalize_issue_metadata(
    raw_id: Any,
    raw_title: Any,
    raw_severity: Any,
    *,
    index: int,
) -> tuple[str, str, str, bool]:
    issue_id, id_clipped = _clip_nonempty_str(
        raw_id, MAX_DEBRIEF_ISSUE_ID_CHARS, f"issue-{index}"
    )
    title, title_clipped = _clip_nonempty_str(
        raw_title, MAX_DEBRIEF_ISSUE_TITLE_CHARS, issue_id
    )
    severity, severity_clipped = _clip_nonempty_str(
        raw_severity, MAX_DEBRIEF_ISSUE_SEVERITY_CHARS, "medium"
    )
    return (
        issue_id,
        title,
        severity,
        id_clipped or title_clipped or severity_clipped,
    )


def _normalize_line_items(
    raw_lines: Any,
    *,
    default_file_path: str | None = None,
) -> list[FlaggedLineItem]:
    if not isinstance(raw_lines, list):
        return []
    safe_default_fp, _ = _clip_file_path(default_file_path)
    normalized: list[FlaggedLineItem] = []
    seen: set[tuple[str | None, int]] = set()
    for item in raw_lines:
        parsed: FlaggedLineItem | None = None
        if isinstance(item, FlaggedLineRef):
            fp, fp_clipped = _clip_file_path(item.file_path)
            if fp is None:
                parsed = None
            elif fp_clipped or fp != item.file_path:
                parsed = FlaggedLineRef(file_path=fp, line_number=item.line_number)
            else:
                parsed = item
        elif isinstance(item, (dict, list, tuple)):
            try:
                parsed = FlaggedLineRef.model_validate(_clip_line_ref_input(item))
            except (ValidationError, ValueError, TypeError):
                parsed = None
        elif isinstance(item, int) and not isinstance(item, bool) and item >= 1:
            parsed = (
                FlaggedLineRef(file_path=safe_default_fp, line_number=item)
                if safe_default_fp
                else item
            )

        if parsed is None:
            continue
        key = (
            (parsed.file_path, parsed.line_number)
            if isinstance(parsed, FlaggedLineRef)
            else (None, parsed)
        )
        if key in seen:
            continue
        seen.add(key)
        normalized.append(parsed)
    return normalized


def _parse_raw_findings(sub: Submission) -> list[dict[str, Any]]:
    raw = sub.findings
    if isinstance(raw, list):
        parsed = raw
    else:
        try:
            parsed = json.loads(raw or "[]")
        except (ValueError, TypeError):
            return []
    if not isinstance(parsed, list):
        return []
    return [item for item in parsed if isinstance(item, dict)]


def _format_finding_comment(item: dict[str, Any]) -> str | None:
    body = str(item.get("body") or "").strip()
    if not body:
        return None
    anchor = item.get("anchor")
    anchor_dict = anchor if isinstance(anchor, dict) else item
    file_path, _ = _clip_file_path(
        anchor_dict.get("file_path") or anchor_dict.get("path")
    )
    file_prefix = f"{file_path}:" if file_path else ""

    raw_start = anchor_dict.get("start_line")
    if raw_start is None:
        raw_start = anchor_dict.get("line_number", anchor_dict.get("line"))
    raw_end = anchor_dict.get("end_line")

    line_part = ""
    has_valid_start = (
        isinstance(raw_start, int)
        and not isinstance(raw_start, bool)
        and raw_start >= 1
    )
    if has_valid_start:
        if (
            isinstance(raw_end, int)
            and not isinstance(raw_end, bool)
            and raw_end > raw_start
        ):
            line_part = f"L{raw_start}-L{raw_end}"
        else:
            line_part = f"L{raw_start}"

    loc = f"{file_prefix}{line_part}".rstrip(":")
    raw_severity = item.get("severity")
    sev = ""
    if isinstance(raw_severity, str) and raw_severity.strip():
        sev_clean, _ = _clip_nonempty_str(
            raw_severity, MAX_DEBRIEF_ISSUE_SEVERITY_CHARS, ""
        )
        if sev_clean:
            sev = f"({sev_clean})"

    prefix_parts = [part for part in (f"[{loc}]" if loc else "", sev) if part]
    if prefix_parts:
        return f"{' '.join(prefix_parts)} {body}"
    return body


def _combine_submission_comments(sub: Submission) -> tuple[str, bool]:
    summary_note = (sub.comments or "").strip()
    finding_lines = [
        formatted
        for item in _parse_raw_findings(sub)
        if (formatted := _format_finding_comment(item))
    ]
    findings_text = "\n".join(finding_lines)

    if summary_note and findings_text:
        combined = f"{summary_note}\n{findings_text}"
        if len(combined) <= MAX_DEBRIEF_COMMENTS_CHARS:
            return combined, False

        capped_summary, summary_clipped = _truncate_text(
            summary_note, MAX_DEBRIEF_COMMENTS_SUMMARY_CHARS
        )
        findings_budget = max(0, MAX_DEBRIEF_COMMENTS_CHARS - len(capped_summary) - 1)
        capped_findings, findings_clipped = _truncate_text(
            findings_text, findings_budget
        )
        combined = (
            f"{capped_summary}\n{capped_findings}"
            if capped_findings
            else capped_summary
        )
        return combined, summary_clipped or findings_clipped

    raw_combined = summary_note or findings_text
    return _truncate_text(raw_combined, MAX_DEBRIEF_COMMENTS_CHARS)


def _normalize_expected_issues(
    criteria: list[DefectCriterion],
) -> list[DebriefIssueItem]:
    items: list[DebriefIssueItem] = []
    for index, criterion in enumerate(criteria, start=1):
        issue_id, title, severity, _ = _normalize_issue_metadata(
            criterion.id,
            criterion.title,
            criterion.severity,
            index=index,
        )
        keywords, _ = _normalize_keywords(criterion.keywords)
        items.append(
            DebriefIssueItem(
                id=issue_id,
                title=title,
                severity=severity,
                lines=_normalize_line_items(
                    criterion.lines, default_file_path=criterion.file_path
                ),
                keywords=keywords,
                explanation=criterion.explanation or "",
            )
        )
    return items


def _normalize_submission_issue(
    raw: Any,
    *,
    lines_key: str,
    keywords_key: str,
    expected_by_id: dict[str, DebriefIssueItem] | None = None,
    index: int = 1,
) -> DebriefIssueItem | None:
    if not isinstance(raw, dict):
        return None
    raw_id = raw.get("id")
    has_explicit_id = (
        raw_id is not None
        and not isinstance(raw_id, bool)
        and bool(str(raw_id).strip())
    )
    issue_id, _ = _clip_nonempty_str(
        raw_id, MAX_DEBRIEF_ISSUE_ID_CHARS, f"issue-{index}"
    )

    raw_title = raw.get("title")
    title_str = (
        ""
        if raw_title is None or isinstance(raw_title, bool)
        else str(raw_title).strip()
    )
    raw_severity = raw.get("severity")
    severity_str = (
        ""
        if raw_severity is None or isinstance(raw_severity, bool)
        else str(raw_severity).strip()
    )

    default_fp, _ = _clip_file_path(raw.get("file_path") or raw.get("path"))

    raw_lines = raw.get(lines_key)
    if raw_lines is None:
        raw_lines = raw.get("lines")
    lines = _normalize_line_items(raw_lines, default_file_path=default_fp)

    raw_keywords = raw.get(keywords_key)
    if raw_keywords is None:
        raw_keywords = raw.get("keywords")
    keywords, _ = _normalize_keywords(raw_keywords)
    explanation = str(raw.get("explanation") or "")

    if has_explicit_id and expected_by_id is not None and issue_id in expected_by_id:
        expected = expected_by_id[issue_id]
        was_redacted = not lines and not explanation.strip()
        if not lines:
            lines = list(expected.lines)
        if not explanation.strip():
            explanation = expected.explanation
        if not keywords and was_redacted:
            keywords = list(expected.keywords)
        if not title_str:
            title_str = expected.title
        if not severity_str:
            severity_str = expected.severity

    issue_id, title, severity, _ = _normalize_issue_metadata(
        issue_id,
        title_str,
        severity_str,
        index=index,
    )

    return DebriefIssueItem(
        id=issue_id,
        title=title,
        severity=severity,
        lines=lines,
        keywords=keywords,
        explanation=explanation,
    )


def _clip_debrief_issues(
    issues: list[DebriefIssueItem],
) -> tuple[list[DebriefIssueItem], bool]:
    bounded, was_clipped = _truncate_list(issues, MAX_DEBRIEF_ISSUES)
    clipped_items: list[DebriefIssueItem] = []
    for index, item in enumerate(bounded, start=1):
        issue_id, title, severity, meta_clipped = _normalize_issue_metadata(
            item.id, item.title, item.severity, index=index
        )
        lines_bounded, lines_clipped = _truncate_list(
            item.lines, MAX_DEBRIEF_ISSUE_LINES
        )
        lines, line_paths_clipped = _clip_debrief_line_items(lines_bounded)
        keywords_bounded, kw_list_clipped = _truncate_list(
            item.keywords, MAX_DEBRIEF_ISSUE_KEYWORDS
        )
        keywords, kw_item_clipped = _normalize_keywords(keywords_bounded)
        explanation, exp_clipped = _truncate_text(
            item.explanation, MAX_DEBRIEF_ISSUE_EXPLANATION_CHARS
        )
        if (
            meta_clipped
            or lines_clipped
            or line_paths_clipped
            or kw_list_clipped
            or kw_item_clipped
            or exp_clipped
        ):
            was_clipped = True
        clipped_items.append(
            DebriefIssueItem(
                id=issue_id,
                title=title,
                severity=severity,
                lines=lines,
                keywords=keywords,
                explanation=explanation,
            )
        )
    return clipped_items, was_clipped


def _build_debrief_files(
    challenge_files: list[ChallengeFile],
    *,
    missed_issues: list[DebriefIssueItem],
    raw_missed_issues: list[Any],
    flagged_lines: list[FlaggedLineItem],
) -> tuple[list[DebriefFileItem], bool]:
    if not challenge_files:
        return [], False

    missed_paths: set[str] = set()
    for issue in missed_issues:
        for line_item in issue.lines:
            if isinstance(line_item, FlaggedLineRef):
                missed_paths.add(line_item.file_path)
    for raw_item in raw_missed_issues:
        if isinstance(raw_item, dict):
            raw_fp, _ = _clip_file_path(
                raw_item.get("file_path") or raw_item.get("path")
            )
            if raw_fp:
                missed_paths.add(raw_fp)

    flagged_paths = {
        line_item.file_path
        for line_item in flagged_lines
        if isinstance(line_item, FlaggedLineRef)
    }

    def _priority(cf: ChallengeFile) -> int:
        cf_path, _ = _clip_file_path(cf.path)
        key = cf_path or cf.path
        if key in missed_paths:
            return 0
        if key in flagged_paths:
            return 1
        return 2

    prioritized = sorted(challenge_files, key=_priority)
    selected_files, was_clipped = _truncate_list(prioritized, MAX_DEBRIEF_FILES)

    remaining_chars = MAX_DEBRIEF_FILE_CHARS
    result: list[DebriefFileItem] = []
    for cf in selected_files:
        use_patch = cf.patch is not None and (cf.patch != "" or cf.content is None)
        field_name = "patch" if use_patch else "content"
        raw_text = (cf.patch if use_patch else cf.content) or ""

        if len(raw_text) <= remaining_chars:
            text_out = raw_text
            remaining_chars -= len(raw_text)
        elif remaining_chars > len(TRUNCATION_MARKER):
            text_out, _ = _truncate_text(raw_text, remaining_chars)
            remaining_chars = 0
            was_clipped = True
        else:
            was_clipped = True
            continue

        cf_path, path_clipped = _clip_file_path(cf.path)
        if path_clipped:
            was_clipped = True
        result.append(
            DebriefFileItem(
                path=cf_path or "file",
                language=cf.language,
                patch=text_out if field_name == "patch" else None,
                content=text_out if field_name == "content" else None,
            )
        )

    return result, was_clipped


def build_submission_debrief(
    sub: Submission,
    challenge: Challenge,
) -> CoachSubmissionDebriefResponse:
    """Normalize and bound a submission + challenge pair into a debrief payload."""
    expected_full = _normalize_expected_issues(
        _safe_list_getter(challenge.get_expected_issues)
    )
    expected_by_id = {item.id: item for item in expected_full if item.id}

    raw_detected = _safe_list_getter(sub.get_detected_issues)
    detected_full = [
        item
        for idx, raw in enumerate(raw_detected, start=1)
        if (
            item := _normalize_submission_issue(
                raw,
                lines_key="matched_lines",
                keywords_key="matched_keywords",
                index=idx,
            )
        )
        is not None
    ]

    raw_missed = _safe_list_getter(sub.get_missed_issues)
    missed_full = [
        item
        for idx, raw in enumerate(raw_missed, start=1)
        if (
            item := _normalize_submission_issue(
                raw,
                lines_key="expected_lines",
                keywords_key="missing_keywords",
                expected_by_id=expected_by_id,
                index=idx,
            )
        )
        is not None
    ]

    flagged_full = _normalize_line_items(_safe_list_getter(sub.get_flagged_lines))
    fp_full = _normalize_line_items(_safe_list_getter(sub.get_false_positive_lines))

    files, files_truncated = _build_debrief_files(
        _safe_list_getter(challenge.get_files),
        missed_issues=missed_full,
        raw_missed_issues=raw_missed,
        flagged_lines=flagged_full,
    )

    flagged_lines, flagged_truncated = _truncate_list(
        flagged_full, MAX_DEBRIEF_FLAGGED_LINES
    )
    false_positive_lines, fp_truncated = _truncate_list(
        fp_full, MAX_DEBRIEF_FLAGGED_LINES
    )
    detected_issues, detected_truncated = _clip_debrief_issues(detected_full)
    missed_issues, missed_truncated = _clip_debrief_issues(missed_full)
    expected_issues, expected_truncated = _clip_debrief_issues(expected_full)

    comments, comments_truncated = _combine_submission_comments(sub)
    code_snippet, snippet_truncated = _truncate_text(
        challenge.code_snippet or "", MAX_DEBRIEF_CODE_SNIPPET_CHARS
    )
    canonical_review, canonical_truncated = _truncate_text(
        challenge.canonical_review or "", MAX_DEBRIEF_CANONICAL_REVIEW_CHARS
    )
    recommended_fix_diff, fix_diff_truncated = _truncate_text(
        challenge.recommended_fix_diff or "", MAX_DEBRIEF_FIX_DIFF_CHARS
    )

    truncated = any(
        [
            files_truncated,
            flagged_truncated,
            fp_truncated,
            detected_truncated,
            missed_truncated,
            expected_truncated,
            comments_truncated,
            snippet_truncated,
            canonical_truncated,
            fix_diff_truncated,
        ]
    )

    return CoachSubmissionDebriefResponse(
        challenge_slug=challenge.slug,
        title=challenge.title,
        category=_enum_str(challenge.category),
        language=_enum_str(challenge.language),
        difficulty=_enum_str(challenge.difficulty),
        submission_id=sub.id or 0,
        submitted_at=to_utc_aware(sub.created_at),
        score=max(0, min(100, int(sub.score))),
        flagged_lines=flagged_lines,
        false_positive_lines=false_positive_lines,
        comments=comments,
        detected_issues=detected_issues,
        missed_issues=missed_issues,
        code_snippet=code_snippet,
        files=files,
        canonical_review=canonical_review,
        recommended_fix_diff=recommended_fix_diff,
        expected_issues=expected_issues,
        truncated=truncated,
    )


def get_actor_coach_patterns(
    session: Session,
    actor: Actor,
    *,
    slice_limit: int = 5,
    missed_limit: int = 10,
) -> CoachPatternsResponse:
    """Fetch actor-owned submissions on accessible challenges and aggregate patterns."""
    sub_owner_filter = submission_owner_filter(actor)
    if sub_owner_filter is None:
        return CoachPatternsResponse()

    challenge_filter = _accessible_challenge_filter(actor)

    rows = list(
        session.exec(
            select(Submission, Challenge)
            .join(Challenge, Submission.challenge_id == Challenge.id)
            .where(sub_owner_filter, challenge_filter)
            .options(
                load_only(
                    Submission.id,
                    Submission.challenge_id,
                    Submission.score,
                    Submission.line_precision_score,
                    Submission.concept_score,
                    Submission.flagged_lines,
                    Submission.false_positive_lines,
                    Submission.detected_issues,
                    Submission.missed_issues,
                    Submission.created_at,
                ),
                load_only(
                    Challenge.id,
                    Challenge.slug,
                    Challenge.title,
                    Challenge.category,
                    Challenge.language,
                    Challenge.difficulty,
                ),
            )
        ).all()
    )
    return aggregate_coach_patterns(
        rows,
        slice_limit=slice_limit,
        missed_limit=missed_limit,
    )


def get_actor_submission_debrief(
    session: Session,
    actor: Actor,
    challenge_slug: str,
) -> CoachSubmissionDebriefResponse | None:
    """Fetch actor's latest submission debrief for an accessible challenge."""
    if (
        not isinstance(challenge_slug, str)
        or not challenge_slug.strip()
        or any(ord(ch) < 0x20 or ord(ch) == 0x7F for ch in challenge_slug)
    ):
        return None

    sub_owner_filter = submission_owner_filter(actor)
    if sub_owner_filter is None:
        return None

    stmt = (
        select(Submission, Challenge)
        .join(Challenge, Submission.challenge_id == Challenge.id)
        .where(
            Challenge.slug == challenge_slug,
            sub_owner_filter,
            _accessible_challenge_filter(actor),
        )
        .order_by(Submission.created_at.desc(), Submission.id.desc())
        .limit(1)
    )
    row = session.exec(stmt).first()
    if row is None:
        return None

    sub, challenge = row
    return build_submission_debrief(sub, challenge)
