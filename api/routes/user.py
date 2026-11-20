"""User profile, progress, and guest session management API routes."""

import json
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import func, select

from api.deps import ActorDep, CurrentUserDep, GuestSessionDep, SessionDep
from backend.core.config import settings
from backend.core.guest_session import clear_guest_cookie
from backend.models.challenge import Category, Challenge
from backend.models.submission import Submission
from backend.services.ownership import (
    CustomQuotaExceeded,
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
        description="Consecutive UTC days with at least one review submission",
    )
    categories_breakdown: list[CategoryProgress] = Field(
        default_factory=list,
        description="Category mastery breakdown",
    )


class ClaimSessionResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    claimed_count: int
    claimed_challenges_count: int = 0
    user_id: int
    session_id: str


def compute_streak_days_from_dates(
    submission_dates: set[date], now_utc: datetime
) -> int:
    """Compute consecutive UTC days with >=1 submission up to today or yesterday."""
    if not submission_dates:
        return 0

    today = now_utc.date()
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


def compute_streak_days(submissions: list[Submission], now_utc: datetime) -> int:
    """Compute consecutive UTC days with >=1 submission up to today or yesterday."""
    if not submissions:
        return 0

    submission_dates = {
        (
            sub.created_at.astimezone(UTC).date()
            if sub.created_at.tzinfo
            else sub.created_at.replace(tzinfo=UTC).date()
        )
        for sub in submissions
    }
    return compute_streak_days_from_dates(submission_dates, now_utc)


@router.get(
    "/progress",
    response_model=UserProgressResponse,
    status_code=status.HTTP_200_OK,
)
def get_user_progress(
    session: SessionDep,
    actor: ActorDep,
) -> UserProgressResponse:
    """Retrieve user or guest review progress, accuracy stats, and streak."""
    cat_rows = session.exec(
        select(Challenge.category, func.count(Challenge.id))
        .where(Challenge.is_public.is_(True))
        .group_by(Challenge.category)
    ).all()

    cat_totals: dict[str, int] = {cat.value: 0 for cat in Category}
    for cat_val, count in cat_rows:
        cat_name = cat_val.value if hasattr(cat_val, "value") else str(cat_val)
        cat_totals[cat_name] = int(count)
    total_challenges = sum(cat_totals.values())

    owner_filter = submission_owner_filter(actor)

    if owner_filter is None:
        return UserProgressResponse(
            total_challenges=total_challenges,
            total_attempted=0,
            total_solved=0,
            average_score=0.0,
            streak_days=0,
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

    best_rows = session.exec(
        select(
            Submission.challenge_id,
            Challenge.category,
            func.max(Submission.score),
        )
        .join(Challenge, Submission.challenge_id == Challenge.id)
        .where(Challenge.is_public.is_(True), owner_filter)
        .group_by(Submission.challenge_id, Challenge.category)
    ).all()

    total_attempted = len(best_rows)
    total_solved = sum(1 for _, _, best in best_rows if best >= 80)
    average_score = (
        round(sum(best for _, _, best in best_rows) / total_attempted, 1)
        if total_attempted > 0
        else 0.0
    )

    scores_by_category: dict[str, list[int]] = defaultdict(list)
    for _, cat_val, best in best_rows:
        cat_name = cat_val.value if hasattr(cat_val, "value") else str(cat_val)
        scores_by_category[cat_name].append(int(best))

    raw_dates = session.exec(
        select(func.date(Submission.created_at)).where(owner_filter).distinct()
    ).all()
    submission_dates = {
        (
            d
            if isinstance(d, date) and not isinstance(d, datetime)
            else date.fromisoformat(str(d)[:10])
        )
        for d in raw_dates
        if d is not None
    }
    streak_days = compute_streak_days_from_dates(submission_dates, datetime.now(UTC))

    categories_breakdown: list[CategoryProgress] = []
    for cat_name, cat_total in cat_totals.items():
        cat_scores = scores_by_category.get(cat_name, [])
        cat_solved = sum(1 for score in cat_scores if score >= 80)
        cat_accuracy = (
            round(sum(cat_scores) / len(cat_scores), 1) if cat_scores else 0.0
        )
        categories_breakdown.append(
            CategoryProgress(
                category=cat_name,
                solved=cat_solved,
                total=cat_total,
                accuracy=cat_accuracy,
            )
        )

    return UserProgressResponse(
        total_challenges=total_challenges,
        total_attempted=total_attempted,
        total_solved=total_solved,
        average_score=average_score,
        streak_days=streak_days,
        categories_breakdown=categories_breakdown,
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
