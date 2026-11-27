"""Leaderboard ranking query and visibility preference service."""

from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import CTE, case, func, select
from sqlmodel import Session

from backend.models.challenge import Category, Challenge, Difficulty
from backend.models.leaderboard import (
    CurrentUserRank,
    LeaderboardEntry,
    LeaderboardQuery,
    LeaderboardResponse,
    LeaderboardVisibilityResponse,
    LeaderboardWindow,
)
from backend.models.submission import Submission
from backend.models.user import User, get_utc_now
from backend.services.grading import PASS_SCORE_THRESHOLD


DIFFICULTY_WEIGHTS: Mapping[Difficulty, int] = {
    Difficulty.EASY: 1,
    Difficulty.MEDIUM: 2,
    Difficulty.HARD: 3,
}

_WINDOW_DAYS: Mapping[LeaderboardWindow, int] = {
    LeaderboardWindow.DAYS_7: 7,
    LeaderboardWindow.DAYS_30: 30,
}


def _normalize_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def _catalog_challenge_filters(category: Category | None) -> list[Any]:
    # Require null owner fields so shared or user-owned rows never count as catalog.
    filters: list[Any] = [
        Challenge.is_public.is_(True),
        Challenge.user_id.is_(None),
        Challenge.session_id.is_(None),
    ]
    if category is not None:
        filters.append(Challenge.category == category)
    return filters


def _build_ranked_cte(query: LeaderboardQuery, reference_time: datetime) -> CTE:
    eligibility_filters: list[Any] = [
        Submission.user_id.is_not(None),
        User.is_active.is_(True),
        User.leaderboard_opt_out.is_(False),
        *_catalog_challenge_filters(query.category),
    ]
    window_days = _WINDOW_DAYS.get(query.window)
    if window_days is not None:
        cutoff = reference_time - timedelta(days=window_days)
        eligibility_filters.append(Submission.created_at >= cutoff)

    difficulty_weight_case = case(
        *(
            (Challenge.difficulty == difficulty, weight)
            for difficulty, weight in DIFFICULTY_WEIGHTS.items()
        ),
        else_=1,
    )

    ranked_submissions = (
        select(
            Submission.user_id.label("user_id"),
            User.username.label("username"),
            Submission.challenge_id.label("challenge_id"),
            Submission.score.label("score"),
            Submission.created_at.label("created_at"),
            Challenge.difficulty.label("difficulty"),
            difficulty_weight_case.label("difficulty_weight"),
            func.row_number()
            .over(
                partition_by=(Submission.user_id, Submission.challenge_id),
                order_by=(
                    Submission.score.desc(),
                    Submission.created_at.asc(),
                    Submission.id.asc(),
                ),
            )
            .label("rn"),
        )
        .join(User, Submission.user_id == User.id)
        .join(Challenge, Submission.challenge_id == Challenge.id)
        .where(*eligibility_filters)
        .cte("ranked_submissions")
    )

    best_per_challenge = (
        select(
            ranked_submissions.c.user_id,
            ranked_submissions.c.username,
            ranked_submissions.c.score,
            ranked_submissions.c.created_at,
            ranked_submissions.c.difficulty,
            ranked_submissions.c.difficulty_weight,
        )
        .where(
            ranked_submissions.c.rn == 1,
            ranked_submissions.c.score >= PASS_SCORE_THRESHOLD,
        )
        .cte("best_per_challenge")
    )

    user_totals = (
        select(
            best_per_challenge.c.user_id,
            best_per_challenge.c.username,
            func.sum(
                best_per_challenge.c.score * best_per_challenge.c.difficulty_weight
            ).label("points"),
            func.count().label("challenges_solved"),
            func.sum(
                case(
                    (best_per_challenge.c.difficulty == Difficulty.HARD, 1),
                    else_=0,
                )
            ).label("hard_solved"),
            func.round(func.avg(best_per_challenge.c.score), 1).label("average_score"),
            func.max(best_per_challenge.c.created_at).label("reached_at"),
        )
        .group_by(best_per_challenge.c.user_id, best_per_challenge.c.username)
        .cte("user_totals")
    )

    return select(
        user_totals.c.user_id,
        user_totals.c.username,
        user_totals.c.points,
        user_totals.c.challenges_solved,
        user_totals.c.hard_solved,
        user_totals.c.average_score,
        func.rank()
        .over(
            order_by=(
                user_totals.c.points.desc(),
                user_totals.c.challenges_solved.desc(),
            )
        )
        .label("rank"),
        func.row_number()
        .over(
            order_by=(
                user_totals.c.points.desc(),
                user_totals.c.challenges_solved.desc(),
                user_totals.c.reached_at.asc(),
                user_totals.c.user_id.asc(),
            )
        )
        .label("row_num"),
        func.count().over().label("total_entries"),
    ).cte("ranked")


def _compute_percentile(rank: int, total_entries: int) -> float:
    return max(0.1, min(100.0, round((rank / total_entries) * 100.0, 1)))


def _to_current_user_rank(row: Any) -> CurrentUserRank:
    rank = int(row.rank)
    total_entries = int(row.total_entries)
    return CurrentUserRank(
        rank=rank,
        username=row.username,
        points=int(row.points),
        challenges_solved=int(row.challenges_solved),
        hard_solved=int(row.hard_solved),
        average_score=round(float(row.average_score), 1),
        percentile=_compute_percentile(rank, total_entries),
        hidden=False,
    )


def get_leaderboard(
    session: Session,
    query: LeaderboardQuery,
    *,
    viewer: User | None = None,
    now: datetime | None = None,
) -> LeaderboardResponse:
    """Compute the ranked leaderboard page and optional viewer rank in SQL."""
    reference_time = _normalize_utc(now) if now is not None else datetime.now(UTC)
    ranked = _build_ranked_cte(query, reference_time)

    page_rows = session.execute(
        select(ranked)
        .order_by(ranked.c.row_num)
        .limit(query.limit)
        .offset(query.offset)
    ).all()

    total_catalog_challenges = int(
        session.execute(
            select(func.count(Challenge.id)).where(
                *_catalog_challenge_filters(query.category)
            )
        ).scalar_one()
    )

    active_viewer = (
        viewer
        if viewer is not None and viewer.is_active and viewer.id is not None
        else None
    )
    viewer_id = (
        active_viewer.id
        if active_viewer is not None and not active_viewer.leaderboard_opt_out
        else None
    )

    viewer_row = (
        next((row for row in page_rows if row.user_id == viewer_id), None)
        if viewer_id is not None
        else None
    )
    if viewer_id is not None and viewer_row is None:
        viewer_row = session.execute(
            select(ranked).where(ranked.c.user_id == viewer_id)
        ).first()

    if page_rows:
        total_entries = int(page_rows[0].total_entries)
    elif viewer_row is not None:
        total_entries = int(viewer_row.total_entries)
    elif query.offset == 0:
        total_entries = 0
    else:
        total_entries = int(
            session.execute(select(func.count()).select_from(ranked)).scalar_one()
        )

    entries = [
        LeaderboardEntry(
            rank=int(row.rank),
            username=row.username,
            points=int(row.points),
            challenges_solved=int(row.challenges_solved),
            hard_solved=int(row.hard_solved),
            average_score=round(float(row.average_score), 1),
            is_current_user=viewer_id is not None and row.user_id == viewer_id,
        )
        for row in page_rows
    ]

    current_user: CurrentUserRank | None = None
    if active_viewer is not None:
        if active_viewer.leaderboard_opt_out:
            current_user = CurrentUserRank(
                rank=None,
                username=active_viewer.username,
                hidden=True,
            )
        elif viewer_row is not None:
            current_user = _to_current_user_rank(viewer_row)
        else:
            current_user = CurrentUserRank(
                rank=None,
                username=active_viewer.username,
                hidden=False,
            )

    return LeaderboardResponse(
        window=query.window,
        category=query.category,
        limit=query.limit,
        offset=query.offset,
        total_entries=total_entries,
        total_catalog_challenges=total_catalog_challenges,
        entries=entries,
        current_user=current_user,
    )


def set_leaderboard_visibility(
    session: Session,
    user: User,
    visible: bool,
) -> LeaderboardVisibilityResponse:
    """Persist the authenticated user's leaderboard opt-out preference."""
    user.leaderboard_opt_out = not visible
    user.updated_at = get_utc_now()
    session.add(user)
    session.commit()
    session.refresh(user)
    return LeaderboardVisibilityResponse(visible=visible)
