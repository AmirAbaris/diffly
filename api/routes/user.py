"""User profile, progress, and guest session management API routes."""

from collections import defaultdict
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlmodel import Session, or_, select

from api.deps import get_current_user, get_optional_current_user
from backend.core.db import get_session
from backend.models.challenge import Category, Challenge
from backend.models.submission import Submission
from backend.models.user import User


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


class ClaimSessionRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    session_id: str | None = Field(
        default=None,
        description="Guest session identifier to claim",
    )


class ClaimSessionResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    claimed_count: int
    user_id: int
    session_id: str


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

    today = now_utc.date()
    yesterday = today - timedelta(days=1)

    start_date = None
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


@router.get(
    "/progress",
    response_model=UserProgressResponse,
    status_code=status.HTTP_200_OK,
)
def get_user_progress(
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User | None, Depends(get_optional_current_user)] = None,
    header_session_id: Annotated[
        str | None,
        Header(alias="X-Diffly-Session-Id", description="Guest session identifier"),
    ] = None,
    query_session_id: Annotated[
        str | None,
        Query(alias="session_id", description="Guest session query parameter"),
    ] = None,
) -> UserProgressResponse:
    """Retrieve user or guest review progress, accuracy stats, and streak."""
    challenges = session.exec(select(Challenge)).all()
    total_challenges = len(challenges)

    categories_map: dict[str, list[Challenge]] = {cat.value: [] for cat in Category}
    for ch in challenges:
        cat_name = (
            ch.category.value if hasattr(ch.category, "value") else str(ch.category)
        )
        if cat_name not in categories_map:
            categories_map[cat_name] = []
        categories_map[cat_name].append(ch)

    conditions = []
    if current_user and current_user.id is not None:
        conditions.append(Submission.user_id == current_user.id)

    session_id = (
        header_session_id.strip()
        if header_session_id and header_session_id.strip()
        else None
    ) or (
        query_session_id.strip()
        if query_session_id and query_session_id.strip()
        else None
    )

    if session_id:
        conditions.append(Submission.session_id == session_id)

    if not conditions:
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
                    total=len(cat_list),
                    accuracy=0.0,
                )
                for cat_name, cat_list in categories_map.items()
            ],
        )

    submissions = session.exec(
        select(Submission).where(or_(*conditions)).order_by(Submission.created_at.asc())
    ).all()

    submissions_by_challenge: dict[int, list[Submission]] = defaultdict(list)
    for sub in submissions:
        submissions_by_challenge[sub.challenge_id].append(sub)

    total_attempted = len(submissions_by_challenge)

    best_scores: dict[int, int] = {
        ch_id: max(sub.score for sub in subs)
        for ch_id, subs in submissions_by_challenge.items()
    }

    total_solved = sum(1 for score in best_scores.values() if score >= 80)

    average_score = (
        round(sum(best_scores.values()) / total_attempted, 1)
        if total_attempted > 0
        else 0.0
    )

    now_utc = datetime.now(UTC)
    streak_days = compute_streak_days(submissions, now_utc)

    categories_breakdown: list[CategoryProgress] = []
    for cat_name, cat_challenges in categories_map.items():
        cat_ch_ids = {ch.id for ch in cat_challenges if ch.id is not None}
        cat_solved = sum(1 for ch_id in cat_ch_ids if best_scores.get(ch_id, 0) >= 80)
        cat_attempted_scores = [
            best_scores[ch_id] for ch_id in cat_ch_ids if ch_id in best_scores
        ]
        cat_accuracy = (
            round(sum(cat_attempted_scores) / len(cat_attempted_scores), 1)
            if cat_attempted_scores
            else 0.0
        )
        categories_breakdown.append(
            CategoryProgress(
                category=cat_name,
                solved=cat_solved,
                total=len(cat_challenges),
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


@router.post(
    "/claim-session",
    response_model=ClaimSessionResponse,
    status_code=status.HTTP_200_OK,
)
def claim_guest_session(
    current_user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    payload: ClaimSessionRequest | None = None,
    header_session_id: Annotated[
        str | None,
        Header(alias="X-Diffly-Session-Id", description="Guest session identifier"),
    ] = None,
) -> ClaimSessionResponse:
    """Claim anonymous guest submissions and assign them to the authenticated user."""
    target_session_id = (
        payload.session_id.strip()
        if payload and payload.session_id and payload.session_id.strip()
        else None
    ) or (
        header_session_id.strip()
        if header_session_id and header_session_id.strip()
        else None
    )

    if not target_session_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "session_id is required in request body or X-Diffly-Session-Id header"
            ),
        )

    statement = select(Submission).where(
        Submission.session_id == target_session_id,
        Submission.user_id.is_(None),
    )
    unclaimed = session.exec(statement).all()
    claimed_count = len(unclaimed)

    for sub in unclaimed:
        sub.user_id = current_user.id

    session.commit()

    return ClaimSessionResponse(
        claimed_count=claimed_count,
        user_id=current_user.id or 0,
        session_id=target_session_id,
    )
