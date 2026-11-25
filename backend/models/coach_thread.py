import json
from datetime import datetime
from typing import TYPE_CHECKING, Any, Optional
from uuid import uuid4

from sqlalchemy import CheckConstraint, Index, UniqueConstraint
from sqlmodel import Field, Relationship, SQLModel

from backend.models.user import get_utc_now


if TYPE_CHECKING:
    from backend.models.user import User


class CoachThread(SQLModel, table=True):
    __tablename__ = "coach_threads"
    __table_args__ = (
        CheckConstraint(
            "(user_id IS NOT NULL AND session_id IS NULL) "
            "OR (user_id IS NULL AND session_id IS NOT NULL)",
            name="ck_coach_threads_single_owner",
        ),
        CheckConstraint(
            "mode IN ('patterns', 'debrief')",
            name="ck_coach_threads_mode",
        ),
        Index("ix_coach_threads_user_updated", "user_id", "updated_at"),
        Index("ix_coach_threads_session_updated", "session_id", "updated_at"),
    )

    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    user_id: int | None = Field(
        default=None,
        foreign_key="users.id",
        index=True,
        ondelete="CASCADE",
    )
    session_id: str | None = Field(default=None, index=True)
    title: str = Field(default="New chat")
    mode: str = Field(default="patterns")
    challenge_slug: str | None = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=get_utc_now)
    updated_at: datetime = Field(default_factory=get_utc_now)

    user: Optional["User"] = Relationship(back_populates="coach_threads")
    messages: list["CoachMessage"] = Relationship(
        back_populates="thread",
        cascade_delete=True,
    )


class CoachMessage(SQLModel, table=True):
    __tablename__ = "coach_messages"
    __table_args__ = (
        CheckConstraint(
            "role IN ('user', 'assistant')",
            name="ck_coach_messages_role",
        ),
        CheckConstraint(
            "sequence >= 0",
            name="ck_coach_messages_sequence_non_negative",
        ),
        UniqueConstraint(
            "thread_id",
            "sequence",
            name="uq_coach_messages_thread_sequence",
        ),
    )

    thread_id: str = Field(
        foreign_key="coach_threads.id",
        primary_key=True,
        ondelete="CASCADE",
    )
    id: str = Field(default_factory=lambda: str(uuid4()), primary_key=True)
    role: str = Field()
    parts_json: str = Field(default="[]")
    sequence: int = Field()
    created_at: datetime = Field(default_factory=get_utc_now)

    thread: CoachThread | None = Relationship(back_populates="messages")

    def get_parts(self) -> list[dict[str, Any]]:
        if isinstance(self.parts_json, list):
            return [item for item in self.parts_json if isinstance(item, dict)]
        if not self.parts_json:
            return []
        try:
            parsed = json.loads(self.parts_json)
        except (json.JSONDecodeError, TypeError, ValueError):
            return []
        if not isinstance(parsed, list):
            return []
        return [item for item in parsed if isinstance(item, dict)]
