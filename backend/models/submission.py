import json
from datetime import UTC, datetime
from typing import Any

from pydantic import ConfigDict, field_validator
from sqlalchemy import CheckConstraint, Index
from sqlmodel import Field, Relationship, SQLModel

from backend.models.challenge import Challenge, FlaggedLineRef
from backend.models.user import User


def get_utc_now() -> datetime:
    return datetime.now(UTC)


def _normalize_flagged_line_entry(item: Any, field_name: str) -> int | dict[str, Any]:
    if isinstance(item, FlaggedLineRef):
        return item.model_dump()
    if isinstance(item, dict):
        return FlaggedLineRef.model_validate(item).model_dump()
    if isinstance(item, (list, tuple)) and len(item) == 2:
        return FlaggedLineRef.model_validate(item).model_dump()
    if isinstance(item, bool) or not isinstance(item, int):
        raise ValueError(
            f"{field_name} items must be integers or file-scoped line references"
        )
    return item


def _validate_flagged_lines_json(value: Any, field_name: str) -> str:
    if value is None or value == "":
        return "[]"
    if isinstance(value, list):
        normalized = [_normalize_flagged_line_entry(x, field_name) for x in value]
        return json.dumps(normalized)
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if not isinstance(parsed, list):
                raise ValueError(f"{field_name} must be a JSON list")
            [_normalize_flagged_line_entry(x, field_name) for x in parsed]
        except json.JSONDecodeError as err:
            raise ValueError(f"Invalid JSON for {field_name}: {err}") from err
        return value
    raise ValueError(f"{field_name} must be a list or JSON string")


class SubmissionBase(SQLModel):
    model_config = ConfigDict(arbitrary_types_allowed=True, extra="ignore")

    challenge_id: int = Field(
        foreign_key="challenges.id",
        index=True,
        ondelete="CASCADE",
    )
    user_id: int | None = Field(
        default=None,
        foreign_key="users.id",
        index=True,
        ondelete="SET NULL",
    )
    session_id: str | None = Field(default=None, index=True)
    flagged_lines: str = Field(default="[]")
    comments: str = Field(default="")
    score: int = Field(default=0, ge=0, le=100)
    line_precision_score: float = Field(default=0.0, ge=0.0, le=100.0)
    concept_score: float = Field(default=0.0, ge=0.0, le=100.0)
    false_positive_penalty: float = Field(default=0.0, ge=0.0)
    false_positive_lines: str = Field(default="[]")
    summary: str = Field(default="")
    feedback: str = Field(default="")
    detected_issues: str = Field(default="[]")
    missed_issues: str = Field(default="[]")

    @field_validator("flagged_lines", mode="before")
    @classmethod
    def validate_flagged_lines(cls, value: Any) -> str:
        return _validate_flagged_lines_json(value, "flagged_lines")

    @field_validator("false_positive_lines", mode="before")
    @classmethod
    def validate_false_positive_lines(cls, value: Any) -> str:
        return _validate_flagged_lines_json(value, "false_positive_lines")

    @field_validator("detected_issues", mode="before")
    @classmethod
    def validate_detected_issues(cls, value: Any) -> str:
        if value is None or value == "":
            return "[]"
        if isinstance(value, list):
            return json.dumps(value)
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
                if not isinstance(parsed, list):
                    raise ValueError("detected_issues must be a JSON array")
            except json.JSONDecodeError as err:
                raise ValueError(f"Invalid JSON for detected_issues: {err}") from err
            return value
        raise ValueError("detected_issues must be a list or JSON string")

    @field_validator("missed_issues", mode="before")
    @classmethod
    def validate_missed_issues(cls, value: Any) -> str:
        if value is None or value == "":
            return "[]"
        if isinstance(value, list):
            return json.dumps(value)
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
                if not isinstance(parsed, list):
                    raise ValueError("missed_issues must be a JSON array")
            except json.JSONDecodeError as err:
                raise ValueError(f"Invalid JSON for missed_issues: {err}") from err
            return value
        raise ValueError("missed_issues must be a list or JSON string")


class Submission(SubmissionBase, table=True):
    __tablename__ = "submissions"
    __table_args__ = (
        CheckConstraint(
            "user_id IS NULL OR session_id IS NULL",
            name="ck_submissions_single_owner",
        ),
        Index("ix_submissions_user_challenge", "user_id", "challenge_id"),
        Index("ix_submissions_session_challenge", "session_id", "challenge_id"),
    )

    id: int | None = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=get_utc_now)

    user: User | None = Relationship(back_populates="submissions")
    challenge: Challenge | None = Relationship(back_populates="submissions")

    def __init__(self, **data: Any):
        base_data = {k: v for k, v in data.items() if k in SubmissionBase.model_fields}
        validated = SubmissionBase.model_validate(base_data)
        merged = {**data, **validated.model_dump(exclude_unset=True)}
        super().__init__(**merged)

    def get_flagged_lines(self) -> list[int | dict[str, Any]]:
        if isinstance(self.flagged_lines, list):
            return self.flagged_lines
        return json.loads(self.flagged_lines or "[]")

    def get_false_positive_lines(self) -> list[int | dict[str, Any]]:
        if isinstance(self.false_positive_lines, list):
            return self.false_positive_lines
        return json.loads(self.false_positive_lines or "[]")

    def get_detected_issues(self) -> list[Any]:
        if isinstance(self.detected_issues, list):
            return self.detected_issues
        return json.loads(self.detected_issues or "[]")

    def get_missed_issues(self) -> list[Any]:
        if isinstance(self.missed_issues, list):
            return self.missed_issues
        return json.loads(self.missed_issues or "[]")
