"""User profile, progress, analytics, and guest session management API routes."""

import json
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import Session, func, select

from api.deps import ActorDep, CurrentUserDep, GuestSessionDep, SessionDep
from backend.core.config import settings
from backend.core.guest_session import clear_guest_cookie
from backend.models.challenge import Challenge
from backend.models.submission import Submission
from backend.services.analytics_service import (
    compute_longest_streak_days,
    compute_public_category_mastery,
    compute_streak_days_from_dates,
    compute_submission_precision_recall,
    fetch_actor_public_submissions,
    get_public_category_totals,
    resolve_timezone,
    to_local_date,
)
from backend.services.coach_service import (
    CoachPatternsResponse,
    get_actor_coach_patterns,
)
from backend.services.ownership import (
    Actor,
    CustomQuotaExceeded,
    challenge_owner_filter,
    claim_guest_session,
    submission_owner_filter,
)


router = APIRouter(prefix="/api/user", tags=["user"])


class CategoryProgress(BaseModel):
    model_config = ConfigDict(extra="ignore")

    category: str
    solved: int = Field(ge=0, description="Challenges with best score >= 80")
    total: int = Field(ge=0, description="Total challenges available in category")
    accuracy: float = Field(
        ge=0.0,
        le=100.0,
        description="Average score of best attempts in category (0-100)",
    )


class UserProgressResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    total_challenges: int = Field(ge=0, description="Total challenges in catalog")
    total_attempted: int = Field(ge=0, description="Distinct challenges attempted")
    total_solved: int = Field(
        ge=0, description="Distinct challenges with best score >= 80"
    )
    average_score: float = Field(
        ge=0.0,
        le=100.0,
        description="Average accuracy percentage across best attempts per challenge",
    )
    streak_days: int = Field(
        ge=0,
        description="Consecutive local days with at least one review submission",
    )
    timezone: str = Field(
        default="UTC",
        description="IANA timezone used to compute local streak days",
    )
    custom_attempted: int = Field(
        default=0,
        ge=0,
        description="Distinct private custom challenges attempted",
    )
    custom_solved: int = Field(
        default=0,
        ge=0,
        description="Distinct private custom challenges with best score >= 80",
    )
    categories_breakdown: list[CategoryProgress] = Field(
        default_factory=list,
        description="Category mastery breakdown",
    )


class ActivityDay(BaseModel):
    model_config = ConfigDict(extra="ignore")

    date: str
    count: int = Field(ge=0)


class CategoryMasteryItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    category: str
    total: int = Field(ge=0)
    attempted: int = Field(ge=0)
    solved: int = Field(ge=0)
    mastery: float = Field(ge=0.0, le=100.0)
    precision: float = Field(ge=0.0, le=100.0)
    recall: float = Field(ge=0.0, le=100.0)


class TrendPoint(BaseModel):
    model_config = ConfigDict(extra="ignore")

    date: str
    submissions: int = Field(ge=0)
    precision: float = Field(ge=0.0, le=100.0)
    recall: float = Field(ge=0.0, le=100.0)
    average_score: float = Field(ge=0.0, le=100.0)


class CustomChallengeStats(BaseModel):
    model_config = ConfigDict(extra="ignore")

    attempted: int = Field(ge=0)
    solved: int = Field(ge=0)
    submissions: int = Field(ge=0)


class UserAnalyticsResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    timezone: str
    days: int = Field(ge=7, le=365)
    streak_days: int = Field(ge=0)
    longest_streak_days: int = Field(ge=0)
    total_submissions: int = Field(ge=0)
    activity: list[ActivityDay] = Field(default_factory=list)
    category_mastery: list[CategoryMasteryItem] = Field(default_factory=list)
    trends: list[TrendPoint] = Field(default_factory=list)
    custom: CustomChallengeStats


class ClaimSessionResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    claimed_count: int
    claimed_challenges_count: int = 0
    user_id: int
    session_id: str


def compute_streak_days(submissions: list[Submission], now_utc: datetime) -> int:
    """Compute consecutive UTC days with >=1 submission up to today or yesterday."""
    if not submissions:
        return 0
    submission_dates = {to_local_date(sub.created_at, UTC) for sub in submissions}
    return compute_streak_days_from_dates(submission_dates, now_utc)


def _compute_custom_challenge_stats(
    session: Session,
    actor: Actor,
) -> CustomChallengeStats:
    ch_owner_filter = challenge_owner_filter(actor)
    sub_owner_filter = submission_owner_filter(actor)
    if ch_owner_filter is None or sub_owner_filter is None:
        return CustomChallengeStats(attempted=0, solved=0, submissions=0)

    best_rows = session.exec(
        select(
            Submission.challenge_id,
            func.max(Submission.score),
            func.count(Submission.id),
        )
        .join(Challenge, Submission.challenge_id == Challenge.id)
        .where(
            Challenge.is_public.is_(False),
            ch_owner_filter,
            sub_owner_filter,
        )
        .group_by(Submission.challenge_id)
    ).all()

    attempted = len(best_rows)
    solved = sum(1 for _, best, _ in best_rows if best >= 80)
    total_subs = sum(int(cnt) for _, _, cnt in best_rows)
    return CustomChallengeStats(
        attempted=attempted,
        solved=solved,
        submissions=total_subs,
    )


@router.get(
    "/progress",
    response_model=UserProgressResponse,
    status_code=status.HTTP_200_OK,
)
def get_user_progress(
    session: SessionDep,
    actor: ActorDep,
    tz: Annotated[
        str,
        Query(max_length=64, description="IANA timezone name for streak calculation"),
    ] = "UTC",
) -> UserProgressResponse:
    """Retrieve user or guest review progress, accuracy stats, and local streak."""
    tz_name, zone = resolve_timezone(tz)
    cat_totals = get_public_category_totals(session)
    total_challenges = sum(cat_totals.values())

    owner_filter = submission_owner_filter(actor)
    if owner_filter is None:
        return UserProgressResponse(
            total_challenges=total_challenges,
            total_attempted=0,
            total_solved=0,
            average_score=0.0,
            streak_days=0,
            timezone=tz_name,
            custom_attempted=0,
            custom_solved=0,
            categories_breakdown=[
                CategoryProgress(
                    category=cat_name,
                    solved=0,
                    total=cat_total,
                    accuracy=0.0,
                )
                for cat_name, cat_total in cat_totals.items()
            ],
        )

    public_rows = fetch_actor_public_submissions(session, actor)
    cat_stats, best_map = compute_public_category_mastery(cat_totals, public_rows)

    total_attempted = len(best_map)
    total_solved = sum(1 for best in best_map.values() if best >= 80)
    average_score = (
        round(sum(best_map.values()) / total_attempted, 1)
        if total_attempted > 0
        else 0.0
    )

    custom_stats = _compute_custom_challenge_stats(session, actor)

    submission_timestamps = session.exec(
        select(Submission.created_at).where(owner_filter)
    ).all()
    submission_dates = {
        to_local_date(ts, zone) for ts in submission_timestamps if ts is not None
    }
    now_local = datetime.now(UTC).astimezone(zone)
    streak_days = compute_streak_days_from_dates(submission_dates, now_local)

    return UserProgressResponse(
        total_challenges=total_challenges,
        total_attempted=total_attempted,
        total_solved=total_solved,
        average_score=average_score,
        streak_days=streak_days,
        timezone=tz_name,
        custom_attempted=custom_stats.attempted,
        custom_solved=custom_stats.solved,
        categories_breakdown=[
            CategoryProgress(
                category=item.category,
                solved=item.solved,
                total=item.total,
                accuracy=item.accuracy,
            )
            for item in cat_stats
        ],
    )


@router.get(
    "/analytics",
    response_model=UserAnalyticsResponse,
    status_code=status.HTTP_200_OK,
)
def get_user_analytics(
    session: SessionDep,
    actor: ActorDep,
    tz: Annotated[
        str,
        Query(max_length=64, description="IANA timezone name for local dates"),
    ] = "UTC",
    days: Annotated[
        int,
        Query(ge=7, le=365, description="Activity and trend window size in days"),
    ] = 90,
) -> UserAnalyticsResponse:
    """Retrieve timezone-aware activity heatmap, category mastery, and trends."""
    tz_name, zone = resolve_timezone(tz)
    cat_totals = get_public_category_totals(session)
    now_local = datetime.now(UTC).astimezone(zone)
    today_local = now_local.date()
    start_date = today_local - timedelta(days=days - 1)

    owner_filter = submission_owner_filter(actor)
    if owner_filter is None:
        return UserAnalyticsResponse(
            timezone=tz_name,
            days=days,
            streak_days=0,
            longest_streak_days=0,
            total_submissions=0,
            activity=[
                ActivityDay(
                    date=(start_date + timedelta(days=offset)).isoformat(),
                    count=0,
                )
                for offset in range(days)
            ],
            category_mastery=[
                CategoryMasteryItem(
                    category=cat_name,
                    total=cat_total,
                    attempted=0,
                    solved=0,
                    mastery=0.0,
                    precision=0.0,
                    recall=0.0,
                )
                for cat_name, cat_total in cat_totals.items()
            ],
            trends=[],
            custom=CustomChallengeStats(attempted=0, solved=0, submissions=0),
        )

    public_rows = fetch_actor_public_submissions(session, actor)
    cat_stats, _ = compute_public_category_mastery(cat_totals, public_rows)
    custom_stats = _compute_custom_challenge_stats(session, actor)

    all_submissions = list(
        session.exec(
            select(Submission)
            .where(owner_filter)
            .order_by(Submission.created_at.asc(), Submission.id.asc())
        ).all()
    )

    subs_by_date: dict[date, list[Submission]] = defaultdict(list)
    for sub in all_submissions:
        subs_by_date[to_local_date(sub.created_at, zone)].append(sub)

    public_subs_by_date: dict[date, list[Submission]] = defaultdict(list)
    for sub, _ in public_rows:
        public_subs_by_date[to_local_date(sub.created_at, zone)].append(sub)

    all_active_dates = set(subs_by_date.keys())
    streak_days = compute_streak_days_from_dates(all_active_dates, now_local)
    longest_streak_days = compute_longest_streak_days(all_active_dates)

    activity: list[ActivityDay] = []
    trends: list[TrendPoint] = []
    for offset in range(days):
        curr_date = start_date + timedelta(days=offset)
        day_subs = subs_by_date.get(curr_date, [])
        date_str = curr_date.isoformat()
        activity.append(ActivityDay(date=date_str, count=len(day_subs)))
        public_day_subs = public_subs_by_date.get(curr_date, [])
        if public_day_subs:
            pr_pairs = [compute_submission_precision_recall(s) for s in public_day_subs]
            avg_precision = round(sum(p for p, _ in pr_pairs) / len(pr_pairs), 1)
            avg_recall = round(sum(r for _, r in pr_pairs) / len(pr_pairs), 1)
            avg_score = round(
                sum(s.score for s in public_day_subs) / len(public_day_subs), 1
            )
            trends.append(
                TrendPoint(
                    date=date_str,
                    submissions=len(public_day_subs),
                    precision=avg_precision,
                    recall=avg_recall,
                    average_score=avg_score,
                )
            )

    window_submissions = sum(item.count for item in activity)

    return UserAnalyticsResponse(
        timezone=tz_name,
        days=days,
        streak_days=streak_days,
        longest_streak_days=longest_streak_days,
        total_submissions=window_submissions,
        activity=activity,
        category_mastery=[
            CategoryMasteryItem(
                category=item.category,
                total=item.total,
                attempted=item.attempted,
                solved=item.solved,
                mastery=item.mastery,
                precision=item.precision,
                recall=item.recall,
            )
            for item in cat_stats
        ],
        trends=trends,
        custom=custom_stats,
    )


@router.get(
    "/coach-patterns",
    response_model=CoachPatternsResponse,
    status_code=status.HTTP_200_OK,
)
def get_user_coach_patterns(
    session: SessionDep,
    actor: ActorDep,
    slice_limit: Annotated[
        int,
        Query(ge=1, le=20, description="Max weakest/strongest slices to return"),
    ] = 5,
    missed_limit: Annotated[
        int,
        Query(ge=1, le=50, description="Max recent missed submissions to return"),
    ] = 10,
) -> CoachPatternsResponse:
    """Aggregate actor-scoped weakness slices and recent missed reviews."""
    return get_actor_coach_patterns(
        session,
        actor,
        slice_limit=slice_limit,
        missed_limit=missed_limit,
    )


async def _has_raw_session_input(request: Request) -> bool:
    if request.headers.get("X-Diffly-Session-Id", "").strip():
        return True
    if request.query_params.get("session_id", "").strip():
        return True

    raw_body = await request.body()
    if not raw_body:
        return False

    try:
        parsed_body = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return False

    if isinstance(parsed_body, dict) and "session_id" in parsed_body:
        raw_sid = parsed_body["session_id"]
        if isinstance(raw_sid, str):
            return bool(raw_sid.strip())
        return raw_sid is not None

    return False


@router.post(
    "/claim-session",
    response_model=ClaimSessionResponse,
    status_code=status.HTTP_200_OK,
)
async def claim_guest_session_endpoint(
    current_user: CurrentUserDep,
    session: SessionDep,
    request: Request,
    response: Response,
    guest: GuestSessionDep,
) -> ClaimSessionResponse:
    """Claim anonymous guest submissions and custom challenges for the user."""
    has_tampered_cookie = (
        settings.GUEST_COOKIE_NAME in request.cookies and guest is None
    )
    if has_tampered_cookie or await _has_raw_session_input(request):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or unsigned guest session token",
        )

    if guest is None or current_user.id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Valid guest session cookie is required",
        )

    try:
        result = claim_guest_session(
            session=session,
            user_id=current_user.id,
            guest=guest,
        )
    except CustomQuotaExceeded as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=exc.message,
        ) from exc

    clear_guest_cookie(response)
    return ClaimSessionResponse(
        claimed_count=result.submissions + result.challenges,
        claimed_challenges_count=result.challenges,
        user_id=current_user.id,
        session_id=guest.id,
    )
