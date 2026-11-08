import json
from datetime import UTC, datetime
from enum import StrEnum
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, ConfigDict, field_validator, model_validator
from sqlmodel import Field, Relationship, SQLModel


if TYPE_CHECKING:
    from backend.models.submission import Submission


def get_utc_now() -> datetime:
    return datetime.now(UTC)


class Difficulty(StrEnum):
    EASY = "Easy"
    MEDIUM = "Medium"
    HARD = "Hard"

    @classmethod
    def _missing_(cls, value: object):
        if isinstance(value, str):
            for member in cls:
                if member.value.lower() == value.lower():
                    return member
        return None


class Category(StrEnum):
    AGENT_ANTIPATHS = "Agent Antipaths"
    SECURITY = "Security"
    CONCURRENCY = "Concurrency"
    PERFORMANCE = "Performance"

    @classmethod
    def _missing_(cls, value: object):
        if isinstance(value, str):
            clean_val = value.lower().replace("-", " ").replace("_", " ")
            for member in cls:
                if member.value.lower() == clean_val:
                    return member
        return None


class Language(StrEnum):
    PYTHON = "python"
    TYPESCRIPT = "typescript"

    @classmethod
    def _missing_(cls, value: object):
        if isinstance(value, str):
            for member in cls:
                if member.value.lower() == value.lower():
                    return member
        return None


class DefectCriterion(BaseModel):
    id: str = ""
    title: str = ""
    severity: str = "medium"
    lines: list[int] = []
    keywords: list[str] = []
    explanation: str = ""

    model_config = ConfigDict(extra="allow", populate_by_name=True)

    @model_validator(mode="before")
    @classmethod
    def normalize_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            d = dict(data)
            if "defect" in d:
                if not d.get("title"):
                    d["title"] = str(d["defect"])
                if not d.get("explanation"):
                    d["explanation"] = str(d["defect"])
            if "line" in d and not d.get("lines"):
                d["lines"] = [int(d["line"])]
            if "id" not in d or d["id"] == "":
                d["id"] = str(d.get("line", "1"))
            return d
        return data


class HintItem(BaseModel):
    tier: int = 1
    hint: str = ""
    title: str | None = None

    model_config = ConfigDict(extra="allow", populate_by_name=True)

    @model_validator(mode="before")
    @classmethod
    def normalize_fields(cls, data: Any) -> Any:
        if isinstance(data, str):
            return {"tier": 1, "hint": data}
        if isinstance(data, dict):
            d = dict(data)
            if "hint" not in d and "content" in d:
                d["hint"] = str(d["content"])
            elif "hint" not in d and "description" in d:
                d["hint"] = str(d["description"])
            elif "hint" not in d and "text" in d:
                d["hint"] = str(d["text"])
            return d
        return data


class ChallengeBase(SQLModel):
    model_config = ConfigDict(arbitrary_types_allowed=True, extra="ignore")

    slug: str = Field(unique=True, index=True)
    title: str
    difficulty: Difficulty = Field(index=True)
    category: Category = Field(index=True)
    language: Language = Field(index=True)
    description: str
    threat_model: str = Field(default="")
    defect_target: str = Field(default="")
    code_snippet: str
    expected_issues: str = Field(default="[]")
    hints: str = Field(default="[]")
    canonical_review: str = Field(default="")
    recommended_fix_diff: str = Field(default="")
    estimated_minutes: int = Field(default=5)

    @field_validator("expected_issues", mode="before")
    @classmethod
    def validate_expected_issues(cls, value: Any) -> str:
        if value is None or value == "":
            return "[]"
        if isinstance(value, list):
            validated = [
                item.model_dump()
                if isinstance(item, BaseModel)
                else DefectCriterion.model_validate(item).model_dump()
                for item in value
            ]
            return json.dumps(validated)
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
                if not isinstance(parsed, list):
                    raise ValueError("expected_issues must be a JSON array")
                for item in parsed:
                    DefectCriterion.model_validate(item)
            except json.JSONDecodeError as err:
                raise ValueError(f"Invalid JSON for expected_issues: {err}") from err
            return value
        raise ValueError(
            "expected_issues must be a JSON string or list of DefectCriterion"
        )

    @field_validator("hints", mode="before")
    @classmethod
    def validate_hints(cls, value: Any) -> str:
        if value is None or value == "":
            return "[]"
        if isinstance(value, list):
            validated = [
                item.model_dump()
                if isinstance(item, BaseModel)
                else HintItem.model_validate(item).model_dump()
                for item in value
            ]
            return json.dumps(validated)
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
                if not isinstance(parsed, list):
                    raise ValueError("hints must be a JSON array")
                for item in parsed:
                    HintItem.model_validate(item)
            except json.JSONDecodeError as err:
                raise ValueError(f"Invalid JSON for hints: {err}") from err
            return value
        raise ValueError("hints must be a JSON string or list of HintItem")


class Challenge(ChallengeBase, table=True):
    __tablename__ = "challenges"

    id: int | None = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=get_utc_now)

    submissions: list["Submission"] = Relationship(back_populates="challenge")

    def __init__(self, **data: Any):
        base_data = {k: v for k, v in data.items() if k in ChallengeBase.model_fields}
        validated = ChallengeBase.model_validate(base_data)
        merged = {**data, **validated.model_dump(exclude_unset=True)}
        super().__init__(**merged)

    def get_expected_issues(self) -> list[DefectCriterion]:
        if isinstance(self.expected_issues, list):
            data = self.expected_issues
        else:
            data = json.loads(self.expected_issues or "[]")
        return [DefectCriterion.model_validate(item) for item in data]

    def get_hints(self) -> list[HintItem]:
        if isinstance(self.hints, list):
            data = self.hints
        else:
            data = json.loads(self.hints or "[]")
        return [HintItem.model_validate(item) for item in data]
