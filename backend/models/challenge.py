import json
from datetime import UTC, datetime
from enum import StrEnum
from typing import TYPE_CHECKING, Annotated, Any, Optional

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    computed_field,
    field_validator,
    model_validator,
)
from sqlalchemy import CheckConstraint
from sqlmodel import Field, Relationship, SQLModel


if TYPE_CHECKING:
    from backend.models.submission import Submission
    from backend.models.user import User


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
    LOGIC_FLAWS = "Logic Flaws"

    @classmethod
    def _missing_(cls, value: object):
        if isinstance(value, str):
            clean_val = value.lower().replace("-", " ").replace("_", " ")
            aliases = {
                "agent antipatterns": cls.AGENT_ANTIPATHS,
                "agent antipattern": cls.AGENT_ANTIPATHS,
                "agent antipaths": cls.AGENT_ANTIPATHS,
                "agent antipath": cls.AGENT_ANTIPATHS,
                "security vuln": cls.SECURITY,
                "security vulnerability": cls.SECURITY,
                "security": cls.SECURITY,
                "concurrency race": cls.CONCURRENCY,
                "concurrency": cls.CONCURRENCY,
                "logic flaws": cls.LOGIC_FLAWS,
                "logic flaw": cls.LOGIC_FLAWS,
            }
            if clean_val in aliases:
                return aliases[clean_val]
            for member in cls:
                if member.value.lower() == clean_val:
                    return member
        return None


class Language(StrEnum):
    PYTHON = "python"
    TYPESCRIPT = "typescript"
    GO = "go"
    RUST = "rust"
    JAVA = "java"

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
    lines: list[int] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    explanation: str = ""

    model_config = ConfigDict(extra="allow", populate_by_name=True)

    @computed_field
    @property
    def matched_lines(self) -> list[int]:
        return self.lines

    @computed_field
    @property
    def matched_keywords(self) -> list[str]:
        return self.keywords

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
                raw_line = d["line"]
                if isinstance(raw_line, bool) or not isinstance(raw_line, (int, str)):
                    raise ValueError("line must be an integer")
                d["lines"] = [int(raw_line)]
            if "matched_lines" in d and not d.get("lines"):
                raw_lines = d["matched_lines"]
                if not isinstance(raw_lines, list):
                    raise ValueError("matched_lines must be a list of integers")
                parsed_lines: list[int] = []
                for item in raw_lines:
                    if isinstance(item, bool) or not isinstance(item, (int, str)):
                        raise ValueError("matched_lines items must be integers")
                    parsed_lines.append(int(item))
                d["lines"] = parsed_lines
            if "matched_keywords" in d and not d.get("keywords"):
                raw_keywords = d["matched_keywords"]
                if not isinstance(raw_keywords, list):
                    raise ValueError("matched_keywords must be a list of strings")
                d["keywords"] = [str(item) for item in raw_keywords]
            if "id" not in d or d["id"] == "":
                lines_val = d.get("lines")
                fallback_line = d.get("line") or (
                    lines_val[0] if isinstance(lines_val, list) and lines_val else "1"
                )
                d["id"] = str(fallback_line)
            return d
        return data


def validate_flagged_lines(lines: list[int]) -> list[int]:
    """Ensure all flagged line numbers are positive integers (>= 1)."""
    for line in lines:
        if isinstance(line, bool) or not isinstance(line, int) or line <= 0:
            raise ValueError("Flagged lines must be valid positive integers (>= 1)")
    return lines


FlaggedLines = Annotated[
    list[int],
    Field(max_length=500),
    AfterValidator(validate_flagged_lines),
]


DEFAULT_TIER_LABELS: dict[int, str] = {
    1: "Contextual clue",
    2: "Vulnerability class",
    3: "Line pointer",
}


class HintResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    tier: int
    label: str
    text: str


class ChallengeSolutionResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: int
    challenge_id: int
    slug: str
    canonical_review: str
    recommended_fix_diff: str
    expected_issues: list[DefectCriterion]


class HintItem(BaseModel):
    tier: int = 1
    hint: str = ""
    title: str | None = None
    label: str | None = None
    text: str | None = None

    model_config = ConfigDict(extra="allow", populate_by_name=True)

    @model_validator(mode="before")
    @classmethod
    def normalize_fields(cls, data: Any) -> Any:
        if isinstance(data, str):
            return {"tier": 1, "hint": data, "text": data}
        if isinstance(data, dict):
            d = dict(data)
            text_val = (
                d.get("hint")
                or d.get("content")
                or d.get("description")
                or d.get("text")
                or ""
            )
            d["hint"] = str(text_val)
            d["text"] = str(text_val)

            label_val = d.get("label") or d.get("title")
            if label_val:
                d["title"] = str(label_val)
                d["label"] = str(label_val)
            return d
        return data

    def to_response(self) -> HintResponse:
        default_label = DEFAULT_TIER_LABELS.get(self.tier, f"Tier {self.tier}")
        label = self.label or self.title or default_label
        text = self.text or self.hint
        return HintResponse(tier=self.tier, label=label, text=text)


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
    is_public: bool = Field(default=True, index=True)
    user_id: int | None = Field(
        default=None,
        foreign_key="users.id",
        index=True,
        ondelete="SET NULL",
    )
    session_id: str | None = Field(default=None, index=True)

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
    __table_args__ = (
        CheckConstraint(
            "user_id IS NULL OR session_id IS NULL",
            name="ck_challenges_single_owner",
        ),
    )

    id: int | None = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=get_utc_now)
    content_hash: str | None = Field(default=None)

    user: Optional["User"] = Relationship(back_populates="challenges")
    submissions: list["Submission"] = Relationship(
        back_populates="challenge",
        cascade_delete=True,
    )

    def __init__(self, **data: Any):
        base_data = {k: v for k, v in data.items() if k in ChallengeBase.model_fields}
        validated = ChallengeBase.model_validate(base_data)
        merged = {**data, **validated.model_dump(exclude_unset=True)}
        super().__init__(**merged)

    def get_expected_issues(self) -> list[DefectCriterion]:
        cached = getattr(self, "_cached_expected_issues", None)
        raw_cached = getattr(self, "_cached_expected_issues_raw", None)
        if cached is not None and raw_cached == self.expected_issues:
            return cached

        if isinstance(self.expected_issues, list):
            data = self.expected_issues
        else:
            data = json.loads(self.expected_issues or "[]")
        result = [
            item
            if isinstance(item, DefectCriterion)
            else DefectCriterion.model_validate(item)
            for item in data
        ]
        object.__setattr__(self, "_cached_expected_issues", result)
        object.__setattr__(self, "_cached_expected_issues_raw", self.expected_issues)
        return result

    def get_hints(self) -> list[HintItem]:
        cached = getattr(self, "_cached_hints", None)
        raw_cached = getattr(self, "_cached_hints_raw", None)
        if cached is not None and raw_cached == self.hints:
            return cached

        if isinstance(self.hints, list):
            data = self.hints
        else:
            data = json.loads(self.hints or "[]")
        result = [
            item if isinstance(item, HintItem) else HintItem.model_validate(item)
            for item in data
        ]
        object.__setattr__(self, "_cached_hints", result)
        object.__setattr__(self, "_cached_hints_raw", self.hints)
        return result

    def to_summary(
        self,
        is_solved: bool = False,
        best_score: int | None = None,
    ) -> "ChallengeSummary":
        line_count = len(self.code_snippet.splitlines()) if self.code_snippet else 0
        total_hints = len(self.get_hints())
        return ChallengeSummary(
            id=self.id or 0,
            slug=self.slug,
            title=self.title,
            difficulty=self.difficulty,
            category=self.category,
            language=self.language,
            description=self.description,
            estimated_minutes=self.estimated_minutes,
            line_count=line_count,
            total_hints=total_hints,
            is_solved=is_solved,
            best_score=best_score,
            is_public=self.is_public,
        )

    def to_detail(
        self,
        is_solved: bool = False,
        best_score: int | None = None,
    ) -> "ChallengeDetail":
        line_count = len(self.code_snippet.splitlines()) if self.code_snippet else 0
        total_hints = len(self.get_hints())
        return ChallengeDetail(
            id=self.id or 0,
            slug=self.slug,
            title=self.title,
            difficulty=self.difficulty,
            category=self.category,
            language=self.language,
            description=self.description,
            threat_model=self.threat_model,
            defect_target=self.defect_target,
            code_snippet=self.code_snippet,
            estimated_minutes=self.estimated_minutes,
            line_count=line_count,
            total_hints=total_hints,
            is_solved=is_solved,
            best_score=best_score,
            is_public=self.is_public,
        )


class ChallengeSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    title: str
    difficulty: Difficulty
    category: Category
    language: Language
    description: str
    estimated_minutes: int
    line_count: int = 0
    total_hints: int = 0
    is_solved: bool = False
    best_score: int | None = None
    is_public: bool = True


class ChallengeDetail(ChallengeSummary):
    threat_model: str = ""
    defect_target: str = ""
    code_snippet: str


class CustomChallengesListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    items: list[ChallengeSummary] = Field(default_factory=list)
    total: int = 0
    quota_limit: int = 5
    quota_remaining: int = 5


class GenerateCustomChallengeRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    topic: str = Field(
        ...,
        min_length=3,
        max_length=200,
        description=(
            "Topic or vulnerability scenario to generate "
            "(e.g. Next.js 15 Server Actions IDOR)"
        ),
    )
    language: Language = Field(
        default=Language.PYTHON,
        description="Programming language: python, typescript, go, rust, java",
    )
    difficulty: Difficulty = Field(
        default=Difficulty.MEDIUM,
        description="Challenge difficulty: Easy, Medium, Hard",
    )


class CustomChallengeResponse(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)

    id: int = 0
    slug: str
    title: str
    difficulty: Difficulty
    category: Category = Category.SECURITY
    language: Language
    description: str
    threat_model: str = ""
    defect_target: str = ""
    code_snippet: str
    expected_issues: list[DefectCriterion] = Field(default_factory=list)
    hints: list[HintResponse] = Field(default_factory=list)
    canonical_review: str = ""
    recommended_fix_diff: str = ""
    estimated_minutes: int = 5
    line_count: int = 0
    total_hints: int = 0
    is_custom: bool = True
    session_id: str | None = None

    @model_validator(mode="after")
    def compute_counts(self) -> "CustomChallengeResponse":
        if self.code_snippet and self.line_count == 0:
            self.line_count = len(self.code_snippet.splitlines())
        if self.hints and self.total_hints == 0:
            self.total_hints = len(self.hints)
        return self

    def get_expected_issues(self) -> list[DefectCriterion]:
        return self.expected_issues

    def get_hints(self) -> list[HintItem]:
        return [HintItem(tier=h.tier, label=h.label, text=h.text) for h in self.hints]
