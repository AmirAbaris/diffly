import json
from datetime import UTC, datetime
from typing import Any

from pydantic import ConfigDict, field_validator
from sqlmodel import Field, Relationship, SQLModel

from backend.models.challenge import Challenge
from backend.models.user import User


def get_utc_now() -> datetime:
    return datetime.now(UTC)


class SubmissionBase(SQLModel):
    model_config = ConfigDict(arbitrary_types_allowed=True, extra="ignore")

    challenge_id: int = Field(foreign_key="challenges.id", index=True)
    user_id: int | None = Field(default=None, foreign_key="users.id", index=True)
    session_id: str | None = Field(default=None, index=True)
    flagged_lines: str = Field(default="[]")
    comments: str = Field(default="")
    score: int = Field(default=0, ge=0, le=100)
    feedback: str = Field(default="")
    detected_issues: str = Field(default="[]")
    missed_issues: str = Field(default="[]")

    @field_validator("flagged_lines", mode="before")
    @classmethod
    def validate_flagged_lines(cls, value: Any) -> str:
        if value is None or value == "":
            return "[]"
        if isinstance(value, list):
            return json.dumps([int(x) for x in value])
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
                if not isinstance(parsed, list) or not all(
                    isinstance(x, int) for x in parsed
                ):
                    raise ValueError("flagged_lines must be a JSON list of integers")
            except json.JSONDecodeError as err:
                raise ValueError(f"Invalid JSON for flagged_lines: {err}") from err
            return value
        raise ValueError("flagged_lines must be a list of integers or JSON string")

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

    id: int | None = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=get_utc_now)

    user: User | None = Relationship(back_populates="submissions")
    challenge: Challenge | None = Relationship(back_populates="submissions")

    def __init__(self, **data: Any):
        base_data = {k: v for k, v in data.items() if k in SubmissionBase.model_fields}
        validated = SubmissionBase.model_validate(base_data)
        merged = {**data, **validated.model_dump(exclude_unset=True)}
        super().__init__(**merged)

    def get_flagged_lines(self) -> list[int]:
        if isinstance(self.flagged_lines, list):
            return self.flagged_lines
        return json.loads(self.flagged_lines or "[]")

    def get_detected_issues(self) -> list[Any]:
        if isinstance(self.detected_issues, list):
            return self.detected_issues
        return json.loads(self.detected_issues or "[]")

    def get_missed_issues(self) -> list[Any]:
        if isinstance(self.missed_issues, list):
            return self.missed_issues
        return json.loads(self.missed_issues or "[]")
