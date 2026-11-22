"""v2 grading engine: per-finding line tightness, concept attribution, and verdicts."""

import json
import time
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from backend.models.challenge import (
    Challenge,
    DefectCriterion,
    FlaggedLineItem,
    FlaggedLineRef,
)
from backend.services.grading.concepts import (
    ConceptMatch,
    Evidence,
    EvidenceSource,
    bind_evidence,
    match_concepts,
)
from backend.services.grading.concepts import (
    is_keyword_matched as is_keyword_matched,
)
from backend.services.grading.matching import match_one_to_one
from backend.services.grading.reveal import should_reveal
from backend.services.grading.review import (
    ReviewSubmission,
    ScopedLine,
    extract_challenge_files,
)
from backend.services.grading.text.normalize import normalize_text
from backend.services.grading.weights import defect_weights


PASS_SCORE_THRESHOLD = 80
MAX_BLIND_ATTEMPTS = 3
OFF_BY_ONE_PROXIMITY_SCORE = 0.5


@dataclass(frozen=True)
class GradingPolicy:
    """Configurable grading weights, tolerances, and spoiler-gating thresholds."""

    attempt_number: int = 1
    reveal: bool = False
    tolerance: int = 1
    line_weight: float = 0.5
    concept_weight: float = 0.5
    false_positive_penalty_per_line: float = 15.0
    target_keyword_matches: int = 2
    allow_single_line_tolerance: bool = False
    pass_threshold: int = PASS_SCORE_THRESHOLD
    max_attempts: int = MAX_BLIND_ATTEMPTS
    severity_weights: Mapping[str, float] | None = None
    shared_summary_weight: float = 0.5


class FindingVerdict(BaseModel):
    """Per-finding grading outcome."""

    model_config = ConfigDict(extra="ignore")

    finding_id: str
    verdict: Literal["matched", "redundant", "false_positive"]
    defect_id: str | None = None
    line_score: float = 0.0
    severity_agrees: bool | None = None


class DetectedIssue(BaseModel):
    """Details of an expected defect correctly identified by the reviewer."""

    model_config = ConfigDict(extra="allow")

    id: str
    title: str
    severity: str
    matched_lines: list[FlaggedLineItem] = Field(default_factory=list)
    matched_keywords: list[str] = Field(default_factory=list)
    denied_keywords: list[str] = Field(default_factory=list)
    evidence: list[EvidenceSource] = Field(default_factory=list)
    concept_source: Literal["keywords", "judge"] = "keywords"
    line_score: float = Field(default=0.0, ge=0.0, le=1.0)
    concept_score: float = Field(default=0.0, ge=0.0, le=1.0)
    weight: float = 0.0
    explanation: str = ""
    finding_ids: list[str] = Field(default_factory=list)


class MissedIssue(BaseModel):
    """Details of an expected defect missed or omitted by the reviewer."""

    model_config = ConfigDict(extra="allow")

    id: str
    title: str
    severity: str
    expected_lines: list[FlaggedLineItem] = Field(default_factory=list)
    missing_keywords: list[str] = Field(default_factory=list)
    denied_keywords: list[str] = Field(default_factory=list)
    weight: float = 0.0
    explanation: str = ""


class GradeReport(BaseModel):
    """Comprehensive v2 grading report for a code review submission."""

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
    finding_verdicts: list[FindingVerdict] = Field(default_factory=list)
    borderline_defect_ids: list[str] = Field(default_factory=list)


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
    """Calculate acceptable lines including +/- tolerance for multi-line blocks."""
    if not lines:
        return set()
    blocks = find_contiguous_blocks(lines)
    tolerated: set[int] = set()
    for start, end in blocks:
        if end > start or allow_single_line_tolerance:
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
            denied_keywords=[],
            weight=issue.weight,
            explanation="",
        )
        for issue in missed_issues
    ]


def extract_expected_issues(
    challenge: Challenge | dict[str, Any] | Any,
) -> list[DefectCriterion]:
    """Extract and validate DefectCriterion objects from a Challenge model or dict."""
    if hasattr(challenge, "get_expected_issues"):
        return challenge.get_expected_issues()

    raw_issues: Any = None
    if isinstance(challenge, dict):
        raw_issues = challenge.get("expected_issues", [])
    elif hasattr(challenge, "expected_issues"):
        raw_issues = challenge.expected_issues

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


def _sorted_evidence_sources(
    sources: frozenset[EvidenceSource],
) -> list[EvidenceSource]:
    return [src for src in EvidenceSource if src in sources]


def _has_non_empty_evidence(evidence: Sequence[Evidence]) -> bool:
    return any(sent.raw.strip() for ev in evidence for sent in ev.sentences)


def _join_finding_evidence(
    bound_indices: Sequence[int],
    finding_evidence: Sequence[tuple[Evidence, ...]],
    findings: Sequence[Any],
    shared_summary_weight: float,
) -> tuple[Evidence, ...]:
    if len(bound_indices) == 1:
        return finding_evidence[bound_indices[0]]
    has_any_inline_body = any(findings[fi].body.strip() for fi in bound_indices)
    joined: list[Evidence] = []
    for fi in bound_indices:
        for ev in finding_evidence[fi]:
            if (
                has_any_inline_body
                and ev.source == EvidenceSource.SUMMARY_SHARED
                and ev.weight > shared_summary_weight
            ):
                joined.append(
                    Evidence(
                        sentences=ev.sentences,
                        source=ev.source,
                        weight=shared_summary_weight,
                    )
                )
            else:
                joined.append(ev)
    return tuple(joined)


def grade_review(
    challenge: Challenge | dict[str, Any] | Any,
    review: ReviewSubmission,
    policy: GradingPolicy | None = None,
) -> GradeReport:
    """Grade a v2 ReviewSubmission against expected challenge defects."""
    start_time = time.perf_counter()
    active_policy = policy or GradingPolicy()

    challenge_files = extract_challenge_files(challenge)
    default_file_path = challenge_files[0].path if len(challenge_files) == 1 else None
    expected_issues = extract_expected_issues(challenge)

    had_explicit_user_scope = any(
        f.anchor.file_path is not None for f in review.findings
    )
    has_explicit_defect_scope = any(
        defect.file_path is not None
        or any(isinstance(item, FlaggedLineRef) for item in defect.lines)
        for defect in expected_issues
    )
    scoped_output = (
        len(challenge_files) > 1 or had_explicit_user_scope or has_explicit_defect_scope
    )

    if not expected_issues:
        elapsed = round((time.perf_counter() - start_time) * 1000, 2)
        return GradeReport(
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
            finding_verdicts=[],
            borderline_defect_ids=[],
        )

    weights = defect_weights(expected_issues, active_policy.severity_weights)

    defect_exact: list[set[ScopedLine]] = []
    defect_tolerated: list[set[ScopedLine]] = []
    defect_proximity: list[set[ScopedLine]] = []
    defect_scoped_lines: list[list[ScopedLine]] = []
    all_eligible_lines: set[ScopedLine] = set()
    line_defect_indices: list[int] = []

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
                    tolerance=active_policy.tolerance,
                    allow_single_line_tolerance=active_policy.allow_single_line_tolerance,
                )
            )
            proximity_set.update(
                (fp, ln)
                for ln in get_proximity_lines(
                    lines_in_file,
                    tolerance=active_policy.tolerance,
                    allow_single_line_tolerance=active_policy.allow_single_line_tolerance,
                )
            )

        defect_exact.append(exact_set)
        defect_tolerated.append(tolerated_set)
        defect_proximity.append(proximity_set)
        all_eligible_lines.update(tolerated_set)
        all_eligible_lines.update(proximity_set)
        if exact_set:
            line_defect_indices.append(idx)

    finding_scoped_lines: list[list[ScopedLine]] = []
    exact_lines_by_file: dict[str | None, set[int]] = {}
    for finding in review.findings:
        fp = (
            finding.anchor.file_path
            if finding.anchor.file_path is not None
            else default_file_path
        )
        lines_list = [(fp, ln) for ln in finding.anchor.lines()]
        finding_scoped_lines.append(lines_list)
        exact_lines_by_file.setdefault(fp, set()).update(finding.anchor.lines())

    summary_note = review.summary_note.strip()
    summary_norm = normalize_text(summary_note)
    finding_evidence: list[tuple[Evidence, ...]] = []
    for finding in review.findings:
        fp = (
            finding.anchor.file_path
            if finding.anchor.file_path is not None
            else default_file_path
        )
        own_lines = set(finding.anchor.lines())
        other_exact = exact_lines_by_file.get(fp, set()) - own_lines
        tol = max(0, active_policy.tolerance)
        anchor_lines = frozenset(
            ln
            for raw_ln in own_lines
            for ln in range(max(1, raw_ln - tol), raw_ln + tol + 1)
            if ln in own_lines or ln not in other_exact
        )
        finding_evidence.append(
            bind_evidence(finding, summary_norm, anchor_lines, active_policy)
        )

    pair_line_scores: dict[tuple[int, int], float] = {}
    pair_concept_matches: dict[tuple[int, int], ConceptMatch] = {}
    match_weights: dict[tuple[int, int], float] = {}

    for f_idx, _finding in enumerate(review.findings):
        f_lines = finding_scoped_lines[f_idx]
        f_evidence = finding_evidence[f_idx]
        for d_idx in line_defect_indices:
            best_rank = 0.0
            has_exact = False
            for line_key in f_lines:
                if line_key in defect_tolerated[d_idx]:
                    best_rank = max(best_rank, 1.0)
                    if line_key in defect_exact[d_idx]:
                        has_exact = True
                elif line_key in defect_proximity[d_idx]:
                    best_rank = max(best_rank, OFF_BY_ONE_PROXIMITY_SCORE)

            if best_rank <= 0.0:
                continue

            tightness = min(
                1.0,
                (len(defect_exact[d_idx]) + 2 * active_policy.tolerance) / len(f_lines),
            )
            line_fd = best_rank * tightness
            concept_match = match_concepts(
                expected_issues[d_idx],
                f_evidence,
                has_lines=True,
                target=active_policy.target_keyword_matches,
            )

            pair_line_scores[(f_idx, d_idx)] = line_fd
            pair_concept_matches[(f_idx, d_idx)] = concept_match

            kw_bonus = round(concept_match.score * 100)
            match_weights[(f_idx, d_idx)] = (
                line_fd
                + (0.001 if has_exact else 0.0)
                + weights[d_idx] * 1e-4
                + kw_bonus * 1e-6
            )

    assigned = match_one_to_one(
        weights=match_weights,
        node_count=len(review.findings),
        defect_indices=line_defect_indices,
    )
    finding_to_defect = {f_idx: d_idx for d_idx, f_idx in assigned.items()}

    matched_lines_by_defect: dict[int, list[ScopedLine]] = {
        d_idx: [lk for lk in finding_scoped_lines[f_idx] if lk in all_eligible_lines]
        or list(finding_scoped_lines[f_idx])
        for d_idx, f_idx in assigned.items()
    }
    finding_ids_by_defect: dict[int, list[str]] = {
        d_idx: [review.findings[f_idx].id] for d_idx, f_idx in assigned.items()
    }
    finding_indices_by_defect: dict[int, list[int]] = {
        d_idx: [f_idx] for d_idx, f_idx in assigned.items()
    }

    matched_defect_ids = list(assigned.keys())
    false_positive_scoped: list[ScopedLine] = []
    fp_finding_count = 0
    finding_verdicts: list[FindingVerdict] = []

    for f_idx, finding in enumerate(review.findings):
        f_lines = finding_scoped_lines[f_idx]
        if f_idx in finding_to_defect:
            d_idx = finding_to_defect[f_idx]
            defect = expected_issues[d_idx]
            severity_agrees = (
                None
                if finding.severity is None
                else finding.severity.lower() == defect.severity.lower()
            )
            finding_verdicts.append(
                FindingVerdict(
                    finding_id=finding.id,
                    verdict="matched",
                    defect_id=defect.id,
                    line_score=pair_line_scores[(f_idx, d_idx)],
                    severity_agrees=severity_agrees,
                )
            )
            continue

        touches_eligible = any(lk in all_eligible_lines for lk in f_lines)
        if touches_eligible:
            best_defect: int | None = None
            best_rank = -1
            for d_idx in matched_defect_ids:
                for lk in f_lines:
                    if lk in defect_exact[d_idx]:
                        rank = 3
                    elif lk in defect_tolerated[d_idx]:
                        rank = 2
                    elif lk in defect_proximity[d_idx]:
                        rank = 1
                    else:
                        continue
                    if rank > best_rank:
                        best_rank = rank
                        best_defect = d_idx
            if best_defect is not None:
                matched_lines_by_defect[best_defect].extend(
                    lk for lk in f_lines if lk in all_eligible_lines
                )
                finding_ids_by_defect[best_defect].append(finding.id)
                finding_indices_by_defect[best_defect].append(f_idx)
            finding_verdicts.append(
                FindingVerdict(
                    finding_id=finding.id,
                    verdict="redundant",
                    defect_id=(
                        expected_issues[best_defect].id
                        if best_defect is not None
                        else None
                    ),
                    line_score=0.0,
                    severity_agrees=None,
                )
            )
        else:
            fp_finding_count += 1
            false_positive_scoped.extend(f_lines)
            finding_verdicts.append(
                FindingVerdict(
                    finding_id=finding.id,
                    verdict="false_positive",
                    defect_id=None,
                    line_score=0.0,
                    severity_agrees=None,
                )
            )

    false_positive_lines = _format_output_lines(
        false_positive_scoped, scoped_output=scoped_output
    )
    false_positive_penalty = (
        fp_finding_count * active_policy.false_positive_penalty_per_line
    )

    has_lineless_defect = any(not defect_exact[i] for i in range(len(expected_issues)))
    lineless_evidence: tuple[Evidence, ...] = ()
    if has_lineless_defect:
        lineless_items: list[Evidence] = []
        if summary_norm.sentences:
            lineless_items.append(
                Evidence(
                    sentences=summary_norm.sentences,
                    source=EvidenceSource.SUMMARY_SHARED,
                    weight=1.0,
                )
            )
        for finding in review.findings:
            body_stripped = finding.body.strip()
            if body_stripped:
                body_norm = normalize_text(body_stripped)
                if body_norm.sentences:
                    lineless_items.append(
                        Evidence(
                            sentences=body_norm.sentences,
                            source=EvidenceSource.INLINE,
                            weight=1.0,
                        )
                    )
        lineless_evidence = tuple(lineless_items)

    detected_issues: list[DetectedIssue] = []
    missed_issues: list[MissedIssue] = []
    borderline_defect_ids: list[str] = []
    weighted_line_score = 0.0
    weighted_concept_score = 0.0

    for idx, defect in enumerate(expected_issues):
        has_lines = bool(defect_exact[idx])
        if has_lines:
            if idx in assigned:
                f_idx = assigned[idx]
                line_score = pair_line_scores[(f_idx, idx)]
                bound_indices = finding_indices_by_defect[idx]
                defect_evidence = _join_finding_evidence(
                    bound_indices,
                    finding_evidence,
                    review.findings,
                    active_policy.shared_summary_weight,
                )
                if len(bound_indices) == 1:
                    concept_match = pair_concept_matches[(f_idx, idx)]
                else:
                    concept_match = match_concepts(
                        defect,
                        defect_evidence,
                        has_lines=True,
                        target=active_policy.target_keyword_matches,
                    )
                concept_score = concept_match.score if line_score > 0.0 else 0.0
                matched_kws = list(concept_match.matched)
                missing_kws = list(concept_match.missing)
                denied_kws = list(concept_match.denied)
                evidence_sources = _sorted_evidence_sources(concept_match.sources)
                matched_lines = _format_output_lines(
                    matched_lines_by_defect.get(idx, []),
                    scoped_output=scoped_output,
                )
                is_detected = line_score > 0.0
                if (
                    is_detected
                    and line_score >= 0.5
                    and concept_score < 1.0
                    and _has_non_empty_evidence(defect_evidence)
                ):
                    borderline_defect_ids.append(defect.id)
            else:
                line_score = 0.0
                concept_score = 0.0
                matched_kws = []
                missing_kws = list(defect.keywords)
                denied_kws = []
                evidence_sources = []
                matched_lines = []
                is_detected = False
        else:
            concept_match = match_concepts(
                defect,
                lineless_evidence,
                has_lines=False,
                target=active_policy.target_keyword_matches,
            )
            is_detected = bool(defect.keywords) and concept_match.score > 0.0
            line_score = 1.0 if is_detected else 0.0
            concept_score = concept_match.score if is_detected else 0.0
            matched_kws = list(concept_match.matched)
            missing_kws = list(concept_match.missing)
            denied_kws = list(concept_match.denied)
            evidence_sources = _sorted_evidence_sources(concept_match.sources)
            matched_lines = []
            if (
                bool(concept_match.matched)
                and concept_score < 1.0
                and _has_non_empty_evidence(lineless_evidence)
            ):
                borderline_defect_ids.append(defect.id)

        defect_weight = weights[idx]
        weighted_line_score += defect_weight * line_score
        weighted_concept_score += defect_weight * concept_score

        if is_detected:
            detected_issues.append(
                DetectedIssue(
                    id=defect.id,
                    title=defect.title or defect.id,
                    severity=defect.severity,
                    matched_lines=matched_lines,
                    matched_keywords=matched_kws,
                    denied_keywords=denied_kws,
                    evidence=evidence_sources,
                    concept_source="keywords",
                    line_score=line_score,
                    concept_score=concept_score,
                    weight=round(defect_weight, 4),
                    explanation=defect.explanation,
                    finding_ids=finding_ids_by_defect.get(idx, []),
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
                    denied_keywords=denied_kws,
                    weight=round(defect_weight, 4),
                    explanation=defect.explanation,
                )
            )

    avg_line_score = weighted_line_score * 100.0
    avg_concept_score = weighted_concept_score * 100.0
    base_score = (avg_line_score * active_policy.line_weight) + (
        avg_concept_score * active_policy.concept_weight
    )
    raw_final_score = base_score - false_positive_penalty
    normalized_score = max(0, min(100, int(round(raw_final_score))))

    if not should_reveal(active_policy, review, normalized_score) and missed_issues:
        missed_issues = redact_missed_issues(missed_issues)

    summary_phrase, critique = generate_critique(
        score=normalized_score,
        detected_issues=detected_issues,
        missed_issues=missed_issues,
        false_positive_lines=false_positive_lines,
        false_positive_penalty=false_positive_penalty,
    )

    elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)

    return GradeReport(
        score=normalized_score,
        line_precision_score=min(100.0, round(avg_line_score, 2)),
        concept_score=min(100.0, round(avg_concept_score, 2)),
        false_positive_penalty=round(false_positive_penalty, 2),
        false_positive_lines=false_positive_lines,
        detected_issues=detected_issues,
        missed_issues=missed_issues,
        summary=summary_phrase,
        critique=critique,
        execution_time_ms=elapsed_ms,
        finding_verdicts=finding_verdicts,
        borderline_defect_ids=borderline_defect_ids,
    )
