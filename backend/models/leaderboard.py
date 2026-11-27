"""Domain schemas for the public difficulty-weighted leaderboard."""

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

from backend.models.challenge import Category


class LeaderboardWindow(StrEnum):
    ALL = "all"
    DAYS_30 = "30d"
    DAYS_7 = "7d"


class LeaderboardQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    window: LeaderboardWindow = LeaderboardWindow.ALL
    category: Category | None = None
    limit: int = Field(default=25, ge=1, le=100)
    offset: int = Field(default=0, ge=0, le=10_000)


class LeaderboardEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rank: int = Field(ge=1)
    username: str
    points: int = Field(ge=0)
    challenges_solved: int = Field(ge=0)
    hard_solved: int = Field(ge=0)
    average_score: float = Field(ge=0.0, le=100.0)
    is_current_user: bool = False


class CurrentUserRank(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rank: int | None = Field(default=None, ge=1)
    username: str
    points: int = Field(default=0, ge=0)
    challenges_solved: int = Field(default=0, ge=0)
    hard_solved: int = Field(default=0, ge=0)
    average_score: float = Field(default=0.0, ge=0.0, le=100.0)
    percentile: float | None = Field(default=None, ge=0.0, le=100.0)
    hidden: bool = False


class LeaderboardResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    window: LeaderboardWindow
    category: Category | None = None
    limit: int = Field(ge=1, le=100)
    offset: int = Field(ge=0, le=10_000)
    total_entries: int = Field(ge=0)
    total_catalog_challenges: int = Field(ge=0)
    entries: list[LeaderboardEntry]
    current_user: CurrentUserRank | None = None


class LeaderboardVisibilityUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    visible: bool


class LeaderboardVisibilityResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    visible: bool
