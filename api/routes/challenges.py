"""Challenge catalog API routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlmodel import Session, or_, select

from api.deps import get_optional_current_user
from backend.core.db import get_session
from backend.models.challenge import (
    Category,
    Challenge,
    ChallengeDetail,
    ChallengeSummary,
    Difficulty,
    Language,
)
from backend.models.submission import Submission
from backend.models.user import User


router = APIRouter(prefix="/api/challenges", tags=["challenges"])


@router.get("", response_model=list[ChallengeSummary])
def list_challenges(
    session: Annotated[Session, Depends(get_session)],
    difficulty: Annotated[
        Difficulty | None,
        Query(description="Filter by challenge difficulty level"),
    ] = None,
    category: Annotated[
        Category | None,
        Query(description="Filter by challenge category"),
    ] = None,
    language: Annotated[
        Language | None,
        Query(description="Filter by programming language"),
    ] = None,
    search: Annotated[
        str | None,
        Query(description="Search by title, description, or slug"),
    ] = None,
    current_user: Annotated[User | None, Depends(get_optional_current_user)] = None,
    session_id: Annotated[
        str | None,
        Header(alias="X-Diffly-Session-Id", description="Guest session identifier"),
    ] = None,
) -> list[ChallengeSummary]:
    """Retrieve list of challenges with optional filtering and completion status."""
    statement = select(Challenge)

    if difficulty is not None:
        statement = statement.where(Challenge.difficulty == difficulty)
    if category is not None:
        statement = statement.where(Challenge.category == category)
    if language is not None:
        statement = statement.where(Challenge.language == language)
    if search and search.strip():
        search_pattern = f"%{search.strip()}%"
        statement = statement.where(
            or_(
                Challenge.title.ilike(search_pattern),
                Challenge.description.ilike(search_pattern),
                Challenge.slug.ilike(search_pattern),
            )
        )

    statement = statement.order_by(Challenge.id)
    challenges = session.exec(statement).all()

    # User context: compute completion status and best score per challenge
    conditions = []
    if current_user and current_user.id is not None:
        conditions.append(Submission.user_id == current_user.id)
    if session_id and session_id.strip():
        conditions.append(Submission.session_id == session_id.strip())

    best_scores_map: dict[int, int] = {}
    if conditions and challenges:
        challenge_ids = [ch.id for ch in challenges if ch.id is not None]
        sub_stmt = select(Submission.challenge_id, Submission.score).where(
            Submission.challenge_id.in_(challenge_ids),
            or_(*conditions),
        )
        for ch_id, score in session.exec(sub_stmt).all():
            if ch_id not in best_scores_map or score > best_scores_map[ch_id]:
                best_scores_map[ch_id] = score

    return [
        ch.to_summary(
            is_solved=(
                best_scores_map.get(ch.id or 0) is not None
                and best_scores_map[ch.id or 0] >= 80
            ),
            best_score=best_scores_map.get(ch.id or 0),
        )
        for ch in challenges
    ]


@router.get("/{identifier}", response_model=ChallengeDetail)
def get_challenge(
    identifier: str,
    session: Annotated[Session, Depends(get_session)],
    current_user: Annotated[User | None, Depends(get_optional_current_user)] = None,
    session_id: Annotated[
        str | None,
        Header(alias="X-Diffly-Session-Id", description="Guest session identifier"),
    ] = None,
) -> ChallengeDetail:
    """Retrieve challenge detail by numeric ID or URL slug with completion status."""
    if identifier.isdigit():
        challenge_id = int(identifier)
        statement = select(Challenge).where(
            or_(Challenge.id == challenge_id, Challenge.slug == identifier)
        )
    else:
        statement = select(Challenge).where(Challenge.slug == identifier)

    challenge = session.exec(statement).first()
    if challenge is None:
        raise HTTPException(status_code=404, detail="Challenge not found")

    conditions = []
    if current_user and current_user.id is not None:
        conditions.append(Submission.user_id == current_user.id)
    if session_id and session_id.strip():
        conditions.append(Submission.session_id == session_id.strip())

    best_score: int | None = None
    if conditions and challenge.id is not None:
        sub_stmt = select(Submission.score).where(
            Submission.challenge_id == challenge.id,
            or_(*conditions),
        )
        scores = session.exec(sub_stmt).all()
        if scores:
            best_score = max(scores)

    is_solved = best_score is not None and best_score >= 80

    return challenge.to_detail(is_solved=is_solved, best_score=best_score)
