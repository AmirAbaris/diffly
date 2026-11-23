"""Coach failure pattern aggregation across actor-owned review submissions."""

from collections import defaultdict
from collections.abc import Sequence
from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy.orm import load_only
from sqlmodel import Session, or_, select

from backend.models.challenge import Challenge
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

    ch_owner_filter = challenge_owner_filter(actor)
    challenge_filter = (
        or_(Challenge.is_public.is_(True), ch_owner_filter)
        if ch_owner_filter is not None
        else Challenge.is_public.is_(True)
    )

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
