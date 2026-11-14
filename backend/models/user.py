from datetime import UTC, datetime
from typing import TYPE_CHECKING

from pydantic import EmailStr
from sqlmodel import Field, Relationship, SQLModel


if TYPE_CHECKING:
    from backend.models.challenge import Challenge
    from backend.models.submission import Submission


def get_utc_now() -> datetime:
    return datetime.now(UTC)


class UserBase(SQLModel):
    email: str = Field(unique=True, index=True)
    username: str = Field(unique=True, index=True)
    avatar_url: str | None = Field(default=None)
    is_active: bool = Field(default=True)


class User(UserBase, table=True):
    __tablename__ = "users"

    id: int | None = Field(default=None, primary_key=True)
    hashed_password: str
    created_at: datetime = Field(default_factory=get_utc_now)
    updated_at: datetime = Field(default_factory=get_utc_now)

    submissions: list["Submission"] = Relationship(back_populates="user")
    challenges: list["Challenge"] = Relationship(back_populates="user")


class UserRead(UserBase):
    id: int
    created_at: datetime
    updated_at: datetime


class UserCreate(SQLModel):
    email: EmailStr
    username: str
    password: str
    avatar_url: str | None = None
    session_id: str | None = None
