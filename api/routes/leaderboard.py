"""Public leaderboard and authenticated visibility preference API routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status

from api.deps import CurrentUserDep, OptionalUserDep, SessionDep
from backend.core.rate_limit import rate_limit
from backend.models.challenge import Category
from backend.models.leaderboard import (
    LeaderboardQuery,
    LeaderboardResponse,
    LeaderboardVisibilityResponse,
    LeaderboardVisibilityUpdate,
    LeaderboardWindow,
)
from backend.services.leaderboard_service import (
    get_leaderboard,
    set_leaderboard_visibility,
)


router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])


@router.get(
    "",
    response_model=LeaderboardResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(rate_limit("leaderboard-read", 120, 60))],
)
def get_leaderboard_endpoint(
    response: Response,
    session: SessionDep,
    current_user: OptionalUserDep,
    window: Annotated[
        LeaderboardWindow,
        Query(description="Time window filter: all, 30d, or 7d"),
    ] = LeaderboardWindow.ALL,
    category: Annotated[
        Category | None,
        Query(description="Optional challenge category filter"),
    ] = None,
    limit: Annotated[
        int,
        Query(ge=1, le=100, description="Maximum number of entries to return"),
    ] = 25,
    offset: Annotated[
        int,
        Query(ge=0, le=10_000, description="Number of entries to skip for pagination"),
    ] = 0,
) -> LeaderboardResponse:
    """Retrieve ranked public leaderboard entries and optional viewer rank."""
    query = LeaderboardQuery(
        window=window,
        category=category,
        limit=limit,
        offset=offset,
    )
    result = get_leaderboard(session, query, viewer=current_user)
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["Vary"] = "Cookie, Authorization"
    response.headers["X-Total-Count"] = str(result.total_entries)
    return result


@router.put(
    "/me/visibility",
    response_model=LeaderboardVisibilityResponse,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(rate_limit("leaderboard-visibility", 60, 60))],
)
def update_leaderboard_visibility(
    payload: LeaderboardVisibilityUpdate,
    response: Response,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> LeaderboardVisibilityResponse:
    """Set whether the authenticated user appears on the public leaderboard."""
    response.headers["Cache-Control"] = "private, no-store"
    return set_leaderboard_visibility(session, current_user, payload.visible)
