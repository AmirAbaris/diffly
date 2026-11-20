"""Timezone-aware streaks, category mastery, precision/recall, and SRS helpers."""

from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta, tzinfo
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, status
from sqlmodel import Session, func, select

from backend.models.challenge import Category, Challenge
from backend.models.submission import Submission
from backend.services.ownership import Actor, submission_owner_filter


@dataclass(frozen=True, slots=True)
class CategoryMasteryStats:
    """Aggregated public catalog mastery and precision/recall stats per category."""

    category: str
    total: int
    attempted: int
    solved: int
    mastery: float
    accuracy: float
    precision: float
    recall: float


def resolve_timezone(raw_tz: str | None) -> tuple[str, ZoneInfo]:
    """Validate and resolve an IANA timezone name, defaulting blank inputs to UTC."""
    if raw_tz is None:
        return "UTC", ZoneInfo("UTC")

    cleaned = raw_tz.strip()
    if not cleaned:
        return "UTC", ZoneInfo("UTC")

    if (
        len(cleaned) > 64
        or "\\" in cleaned
        or ".." in cleaned
        or any(ord(ch) < 0x20 or ord(ch) == 0x7F for ch in cleaned)
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Invalid IANA timezone",
        )

    try:
        zone = ZoneInfo(cleaned)
    except (ZoneInfoNotFoundError, KeyError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Invalid IANA timezone",
        ) from exc

    return cleaned, zone


def to_utc_aware(dt: datetime) -> datetime:
    """Normalize naive or aware datetimes to UTC."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def to_local_date(dt: datetime, tz: tzinfo) -> date:
    """Convert a timestamp to a calendar date in the target timezone."""
    return to_utc_aware(dt).astimezone(tz).date()


def compute_streak_days_from_dates(
    submission_dates: set[date],
    now_local: datetime,
) -> int:
    """Compute consecutive local dates with >=1 submission up to today or yesterday."""
    if not submission_dates:
        return 0

    today = now_local.date()
    yesterday = today - timedelta(days=1)

    if today in submission_dates:
        start_date = today
    elif yesterday in submission_dates:
        start_date = yesterday
    else:
        return 0

    streak = 0
    curr = start_date
    while curr in submission_dates:
        streak += 1
        curr -= timedelta(days=1)

    return streak


def compute_longest_streak_days(submission_dates: set[date]) -> int:
    """Compute the longest run of consecutive active dates."""
    if not submission_dates:
        return 0

    sorted_dates = sorted(submission_dates)
    longest = 1
    current = 1
    for idx in range(1, len(sorted_dates)):
        if sorted_dates[idx] == sorted_dates[idx - 1] + timedelta(days=1):
            current += 1
            if current > longest:
                longest = current
        else:
            current = 1
    return longest


def compute_submission_precision_recall(sub: Submission) -> tuple[float, float]:
    """Compute (precision, recall) percentages (0-100) for a submission."""
    flagged = sub.get_flagged_lines()
    fp_lines = sub.get_false_positive_lines()
    detected = sub.get_detected_issues()
    missed = sub.get_missed_issues()

    has_eval_metadata = bool(detected or missed or fp_lines) or (
        sub.line_precision_score > 0.0
    )
    fallback_score = float(max(0, min(100, sub.score)))
    if not has_eval_metadata:
        return round(fallback_score, 1), round(fallback_score, 1)

    total_issues = len(detected) + len(missed)
    if total_issues > 0:
        recall = (len(detected) / total_issues) * 100.0
    else:
        recall = fallback_score

    unique_flagged = set(flagged)
    unique_fp = set(fp_lines) & unique_flagged

    if len(unique_flagged) > 0:
        if not detected and missed:
            precision = 0.0
        elif detected and sub.line_precision_score == 0.0 and not unique_fp:
            precision = fallback_score
        else:
            true_positives = max(0, len(unique_flagged) - len(unique_fp))
            precision = (true_positives / len(unique_flagged)) * 100.0
    elif sub.line_precision_score > 0.0:
        precision = float(sub.line_precision_score)
    else:
        precision = fallback_score

    return (
        round(max(0.0, min(100.0, precision)), 1),
        round(max(0.0, min(100.0, recall)), 1),
    )


def get_public_category_totals(session: Session) -> dict[str, int]:
    """Count public catalog challenges per Category."""
    cat_rows = session.exec(
        select(Challenge.category, func.count(Challenge.id))
        .where(Challenge.is_public.is_(True))
        .group_by(Challenge.category)
    ).all()

    totals: dict[str, int] = {cat.value: 0 for cat in Category}
    for cat_val, count in cat_rows:
        cat_name = cat_val.value if hasattr(cat_val, "value") else str(cat_val)
        totals[cat_name] = int(count)
    return totals


def compute_public_category_mastery(
    cat_totals: dict[str, int],
    public_rows: list[tuple[Submission, Category]],
) -> tuple[list[CategoryMasteryStats], dict[int, int]]:
    """Compute per-category mastery/precision/recall and challenge best-score map."""
    best_by_challenge: dict[int, tuple[str, int]] = {}
    precisions_by_cat: dict[str, list[float]] = defaultdict(list)
    recalls_by_cat: dict[str, list[float]] = defaultdict(list)

    for sub, cat_val in public_rows:
        cat_name = cat_val.value if hasattr(cat_val, "value") else str(cat_val)
        ch_id = sub.challenge_id
        prev = best_by_challenge.get(ch_id)
        if prev is None or sub.score > prev[1]:
            best_by_challenge[ch_id] = (cat_name, int(sub.score))
        precision, recall = compute_submission_precision_recall(sub)
        precisions_by_cat[cat_name].append(precision)
        recalls_by_cat[cat_name].append(recall)

    scores_by_cat: dict[str, list[int]] = defaultdict(list)
    for cat_name, best_score in best_by_challenge.values():
        scores_by_cat[cat_name].append(best_score)

    stats_list: list[CategoryMasteryStats] = []
    for cat_name, cat_total in cat_totals.items():
        cat_scores = scores_by_cat.get(cat_name, [])
        attempted = len(cat_scores)
        solved = sum(1 for s in cat_scores if s >= 80)
        accuracy = round(sum(cat_scores) / attempted, 1) if attempted > 0 else 0.0
        mastery = round(sum(cat_scores) / cat_total, 1) if cat_total > 0 else 0.0
        cat_precisions = precisions_by_cat.get(cat_name, [])
        cat_recalls = recalls_by_cat.get(cat_name, [])
        avg_precision = (
            round(sum(cat_precisions) / len(cat_precisions), 1)
            if cat_precisions
            else 0.0
        )
        avg_recall = (
            round(sum(cat_recalls) / len(cat_recalls), 1) if cat_recalls else 0.0
        )
        stats_list.append(
            CategoryMasteryStats(
                category=cat_name,
                total=cat_total,
                attempted=attempted,
                solved=solved,
                mastery=mastery,
                accuracy=accuracy,
                precision=avg_precision,
                recall=avg_recall,
            )
        )

    best_map = {ch_id: score for ch_id, (_, score) in best_by_challenge.items()}
    return stats_list, best_map


def fetch_actor_public_submissions(
    session: Session,
    actor: Actor,
) -> list[tuple[Submission, Category]]:
    """Fetch actor's public challenge submissions ordered chronologically."""
    owner_filter = submission_owner_filter(actor)
    if owner_filter is None:
        return []
    return list(
        session.exec(
            select(Submission, Challenge.category)
            .join(Challenge, Submission.challenge_id == Challenge.id)
            .where(Challenge.is_public.is_(True), owner_filter)
            .order_by(Submission.created_at.asc(), Submission.id.asc())
        ).all()
    )


def compute_review_schedule(submissions: list[Submission]) -> tuple[datetime, int]:
    """Compute (due_at, interval_days) from chronologically ordered attempts."""
    last_sub = submissions[-1]
    last_at = to_utc_aware(last_sub.created_at)

    if last_sub.score < 80:
        interval_days = 1
    else:
        pass_streak = 0
        for sub in reversed(submissions):
            if sub.score >= 80:
                pass_streak += 1
            else:
                break

        if pass_streak <= 1:
            interval_days = 4 if last_sub.score >= 95 else 3
        elif pass_streak == 2:
            interval_days = 7
        elif pass_streak == 3:
            interval_days = 14
        else:
            interval_days = 30

    return last_at + timedelta(days=interval_days), interval_days
