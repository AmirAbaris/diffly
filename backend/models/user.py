from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from pydantic import EmailStr
from sqlalchemy import Connection, event
from sqlalchemy.orm import Mapper
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
    email_lower: str = Field(default="", unique=True, index=True)
    username_lower: str = Field(default="", unique=True, index=True)
    hashed_password: str | None = Field(default=None)
    github_id: str | None = Field(default=None, unique=True, index=True)
    github_login: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=get_utc_now)
    updated_at: datetime = Field(default_factory=get_utc_now)

    submissions: list["Submission"] = Relationship(back_populates="user")
    challenges: list["Challenge"] = Relationship(back_populates="user")

    @property
    def has_password(self) -> bool:
        return bool(self.hashed_password)

    def __init__(self, **data: Any) -> None:
        super().__init__(**data)
        self.email_lower = (getattr(self, "email", None) or "").strip().lower()
        self.username_lower = (getattr(self, "username", None) or "").strip().lower()


def _sync_user_lower_columns(
    _mapper: Mapper[Any],
    _connection: Connection,
    target: User,
) -> None:
    target.email_lower = (target.email or "").strip().lower()
    target.username_lower = (target.username or "").strip().lower()


event.listen(User, "before_insert", _sync_user_lower_columns)
event.listen(User, "before_update", _sync_user_lower_columns)


class UserRead(UserBase):
    id: int
    created_at: datetime
    updated_at: datetime
    github_login: str | None = None
    has_password: bool = False


class UserCreate(SQLModel):
    email: EmailStr
    username: str
    password: str
    avatar_url: str | None = None
