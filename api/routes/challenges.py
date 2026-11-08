"""Challenge catalog API routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, or_, select

from backend.core.db import get_session
from backend.models.challenge import Category, Challenge, Difficulty, Language


router = APIRouter(prefix="/api/challenges", tags=["challenges"])


@router.get("", response_model=list[Challenge])
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
) -> list[Challenge]:
    """Retrieve list of challenges with optional filtering."""
    statement = select(Challenge)

    if difficulty is not None:
        statement = statement.where(Challenge.difficulty == difficulty)
    if category is not None:
        statement = statement.where(Challenge.category == category)
    if language is not None:
        statement = statement.where(Challenge.language == language)
    if search:
        search_pattern = f"%{search}%"
        statement = statement.where(
            or_(
                Challenge.title.ilike(search_pattern),
                Challenge.description.ilike(search_pattern),
                Challenge.slug.ilike(search_pattern),
            )
        )

    statement = statement.order_by(Challenge.id)
    return list(session.exec(statement).all())


@router.get("/{identifier}", response_model=Challenge)
def get_challenge(
    identifier: str,
    session: Annotated[Session, Depends(get_session)],
) -> Challenge:
    """Retrieve a challenge by its numerical ID or URL slug."""
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
    return challenge
