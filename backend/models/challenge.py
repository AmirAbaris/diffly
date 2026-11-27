import json
import re
from datetime import UTC, datetime
from enum import StrEnum
from pathlib import Path
from typing import (
    TYPE_CHECKING,
    Annotated,
    Any,
    Final,
    Literal,
    Optional,
    cast,
    get_args,
)

from pydantic import (
    AfterValidator,
    BaseModel,
    ConfigDict,
    computed_field,
    field_validator,
    model_validator,
)
from sqlalchemy import CheckConstraint, Index
from sqlmodel import Field, Relationship, SQLModel

from backend.models.languages import (
    CHALLENGE_LANGUAGE_SPECS,
    EXTENSION_LANGUAGE_MAP,
    assert_language_enum_parity,
    resolve_language_alias,
)
from backend.models.languages import (
    SUPPORTED_CHALLENGE_EXTENSIONS as SUPPORTED_CHALLENGE_EXTENSIONS,
)


if TYPE_CHECKING:
    from backend.models.submission import Submission
    from backend.models.user import User


Severity = Literal["critical", "high", "medium", "low"]
_VALID_SEVERITIES: Final[frozenset[str]] = frozenset(get_args(Severity))


def coerce_severity(raw: object) -> Severity:
    """Normalize an arbitrary severity value to a valid Severity literal."""
    if isinstance(raw, str):
        normalized = raw.strip().lower()
        if normalized in _VALID_SEVERITIES:
            return cast(Severity, normalized)
    return "medium"


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
            clean_val = " ".join(
                value.lower().replace("-", " ").replace("_", " ").split()
            )
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
                "performance": cls.PERFORMANCE,
                "perf": cls.PERFORMANCE,
                "performance issue": cls.PERFORMANCE,
                "performance bottleneck": cls.PERFORMANCE,
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
    CSHARP = "csharp"

    @classmethod
    def _missing_(cls, value: object):
        canonical = resolve_language_alias(value)
        if canonical is not None:
            return cls(canonical)
        return None


assert_language_enum_parity({member.value for member in Language})

_EXTENSION_LANGUAGE_MAP: dict[str, str] = EXTENSION_LANGUAGE_MAP

_DIFF_HUNK_RE = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")


def infer_language_from_path(file_path: str, fallback: str = "python") -> str:
    """Infer syntax highlighting language identifier from a file path."""
    suffix = Path(file_path).suffix.lower()
    return EXTENSION_LANGUAGE_MAP.get(suffix, fallback)


def extract_patch_line_numbers(patch: str) -> tuple[set[int], int]:
    """Return selectable line numbers and body line count from a unified diff."""
    if not patch:
        return set(), 0

    lines = patch.splitlines()
    valid: set[int] = set()
    body_count = 0
    old_line = 0
    new_line = 0
    in_hunk = False
    found_hunk = False

    for raw in lines:
        if raw.startswith(("diff --git ", "index ")):
            in_hunk = False
            continue
        if raw.startswith(("--- a/", "+++ b/", "--- /dev/null", "+++ /dev/null")):
            in_hunk = False
            continue
        if raw.startswith(("--- ", "+++ ")) and not in_hunk:
            continue

        match = _DIFF_HUNK_RE.match(raw)
        if match:
            found_hunk = True
            in_hunk = True
            old_line = int(match.group(1))
            new_line = int(match.group(3))
            continue

        if not in_hunk:
            continue

        if raw.startswith("\\ No newline"):
            continue

        body_count += 1
        if raw.startswith("-"):
            if old_line > 0:
                valid.add(old_line)
            old_line += 1
        elif raw.startswith("+"):
            if new_line > 0:
                valid.add(new_line)
            new_line += 1
        else:
            if new_line > 0:
                valid.add(new_line)
            old_line += 1
            new_line += 1

    if not found_hunk and lines:
        return set(range(1, len(lines) + 1)), len(lines)

    return valid, body_count


class ChallengeFile(BaseModel):
    """A file entry in a multi-file or PR diff challenge."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    path: str = Field(..., min_length=1, max_length=500)
    language: str = Field(default="", max_length=50)
    content: str | None = Field(default=None, max_length=50000)
    patch: str | None = Field(default=None, max_length=50000)

    @model_validator(mode="before")
    @classmethod
    def normalize_file_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            d = dict(data)
            raw_path = d.get("path")
            if (
                raw_path is None
                or not isinstance(raw_path, str)
                or not raw_path.strip()
            ):
                raise ValueError("Challenge file path must be a non-empty string")
            clean_path = raw_path.strip()
            if (
                clean_path.startswith("/")
                or "\\" in clean_path
                or ".." in clean_path.split("/")
            ):
                raise ValueError(
                    f"Challenge file path must be a safe relative path: {clean_path}"
                )
            d["path"] = clean_path
            raw_lang = d.get("language")
            if not isinstance(raw_lang, str) or not raw_lang.strip():
                d["language"] = infer_language_from_path(clean_path)
            else:
                d["language"] = raw_lang.strip().lower()
            return d
        return data

    @model_validator(mode="after")
    def validate_payload(self) -> "ChallengeFile":
        if not self.path.strip():
            raise ValueError("Challenge file path must be non-empty")
        if self.content is None and self.patch is None:
            raise ValueError(
                f"Challenge file '{self.path}' must define 'patch' or 'content'"
            )
        return self

    def valid_line_numbers(self) -> set[int]:
        """Return valid 1-based selectable line numbers for this file."""
        valid: set[int] = set()
        if self.patch is not None:
            patch_lines, _ = extract_patch_line_numbers(self.patch)
            valid.update(patch_lines)
        if self.content is not None:
            valid.update(range(1, len(self.content.splitlines()) + 1))
        return valid

    def line_count(self) -> int:
        """Return display line count for this file."""
        if self.patch is not None:
            _, body_count = extract_patch_line_numbers(self.patch)
            if body_count > 0:
                return body_count
        if self.content is not None:
            return len(self.content.splitlines())
        return 0


class FlaggedLineRef(BaseModel):
    """File-scoped line reference for multi-file PR challenges."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    file_path: str = Field(..., min_length=1, max_length=500)
    line_number: int = Field(..., ge=1)

    @model_validator(mode="before")
    @classmethod
    def normalize_ref(cls, data: Any) -> Any:
        if isinstance(data, (list, tuple)) and len(data) == 2:
            data = {"file_path": data[0], "line_number": data[1]}
        if isinstance(data, dict):
            d = dict(data)
            if "file_path" not in d:
                if "path" in d:
                    d["file_path"] = d["path"]
                elif "file" in d:
                    d["file_path"] = d["file"]
            if "line_number" not in d and "line" in d:
                d["line_number"] = d["line"]
            raw_path = d.get("file_path")
            if isinstance(raw_path, str):
                d["file_path"] = raw_path.strip()
            raw_line = d.get("line_number")
            if isinstance(raw_line, bool) or not isinstance(raw_line, int):
                raise ValueError("Flagged lines must be valid positive integers (>= 1)")
            return d
        return data


FlaggedLineItem = int | FlaggedLineRef


def _parse_defect_line_entry(item: Any) -> FlaggedLineItem:
    if isinstance(item, FlaggedLineRef):
        return item
    if isinstance(item, dict):
        return FlaggedLineRef.model_validate(
            {
                "file_path": item.get("file_path")
                or item.get("path")
                or item.get("file"),
                "line_number": _coerce_positive_int(
                    item.get("line_number")
                    if "line_number" in item
                    else item.get("line")
                ),
            }
        )
    if isinstance(item, (list, tuple)) and len(item) == 2:
        return FlaggedLineRef.model_validate(
            {
                "file_path": item[0],
                "line_number": _coerce_positive_int(item[1]),
            }
        )
    if isinstance(item, bool) or not isinstance(item, (int, str)):
        raise ValueError(
            "matched_lines items must be integers or file-scoped references"
        )
    return int(item)


def _coerce_positive_int(raw: Any) -> int:
    if isinstance(raw, bool) or not isinstance(raw, (int, str)):
        raise ValueError("line_number must be an integer")
    val = int(raw)
    if val <= 0:
        raise ValueError("line_number must be >= 1")
    return val


class DefectCriterion(BaseModel):
    id: str = ""
    title: str = ""
    severity: Severity = "medium"
    file_path: str | None = None
    lines: list[FlaggedLineItem] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    keyword_polarity: dict[str, Literal["hazard", "safeguard"]] = Field(
        default_factory=dict
    )
    explanation: str = ""

    model_config = ConfigDict(extra="allow", populate_by_name=True)

    @field_validator("severity", mode="before")
    @classmethod
    def _coerce_severity(cls, value: Any) -> Severity:
        return coerce_severity(value)

    @computed_field
    @property
    def matched_lines(self) -> list[FlaggedLineItem]:
        return self.lines

    @computed_field
    @property
    def matched_keywords(self) -> list[str]:
        return self.keywords

    def get_scoped_lines(
        self, default_file_path: str | None = None
    ) -> list[tuple[str | None, int]]:
        """Return all defect target lines resolved as (file_path, line_number)."""
        scoped: list[tuple[str | None, int]] = []
        fallback_path = self.file_path or default_file_path
        for item in self.lines:
            if isinstance(item, FlaggedLineRef):
                if item.line_number > 0:
                    scoped.append((item.file_path, item.line_number))
            elif item > 0:
                scoped.append((fallback_path, item))
        return scoped

    @model_validator(mode="before")
    @classmethod
    def normalize_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            d = dict(data)
            for str_field in ("title", "explanation", "severity"):
                if str_field in d and d[str_field] is None:
                    d.pop(str_field)
            if "file_path" not in d:
                for alias in ("path", "file"):
                    if d.get(alias) is not None:
                        d["file_path"] = d[alias]
                        break
            if isinstance(d.get("file_path"), str):
                stripped_fp = d["file_path"].strip()
                d["file_path"] = stripped_fp or None
            if "lines" in d and d["lines"] is None:
                d["lines"] = []
            if "keywords" in d and d["keywords"] is None:
                d["keywords"] = []
            if "keyword_polarity" in d and d["keyword_polarity"] is None:
                d["keyword_polarity"] = {}
            if d.get("defect") is not None:
                if not d.get("title"):
                    d["title"] = str(d["defect"])
                if not d.get("explanation"):
                    d["explanation"] = str(d["defect"])
            if d.get("line") is not None and not d.get("lines"):
                raw_line = d["line"]
                if isinstance(raw_line, bool) or not isinstance(raw_line, (int, str)):
                    raise ValueError("line must be an integer")
                d["lines"] = [int(raw_line)]
            if d.get("lines") is not None and isinstance(d["lines"], list):
                d["lines"] = [
                    _parse_defect_line_entry(item)
                    for item in d["lines"]
                    if item is not None
                ]
            raw_matched_lines = d.pop("matched_lines", None)
            if raw_matched_lines is not None and not d.get("lines"):
                if not isinstance(raw_matched_lines, list):
                    raise ValueError("matched_lines must be a list")
                d["lines"] = [
                    _parse_defect_line_entry(item)
                    for item in raw_matched_lines
                    if item is not None
                ]
            raw_matched_keywords = d.pop("matched_keywords", None)
            if raw_matched_keywords is not None and not d.get("keywords"):
                if not isinstance(raw_matched_keywords, list):
                    raise ValueError("matched_keywords must be a list of strings")
                d["keywords"] = [
                    str(item) for item in raw_matched_keywords if item is not None
                ]
            if not d.get("id"):
                lines_val = d.get("lines")
                fallback_line = d.get("line")
                if not fallback_line and isinstance(lines_val, list) and lines_val:
                    first = lines_val[0]
                    fallback_line = (
                        f"{first.file_path}:{first.line_number}"
                        if isinstance(first, FlaggedLineRef)
                        else first
                    )
                d["id"] = str(fallback_line or "1")
            return d
        return data


def validate_flagged_lines(lines: list[FlaggedLineItem]) -> list[FlaggedLineItem]:
    """Ensure all flagged lines are positive integers (>= 1) or file-scoped refs."""
    for line in lines:
        if isinstance(line, FlaggedLineRef):
            continue
        if isinstance(line, bool) or not isinstance(line, int) or line <= 0:
            raise ValueError("Flagged lines must be valid positive integers (>= 1)")
    return lines


FlaggedLines = Annotated[
    list[FlaggedLineItem],
    Field(max_length=500),
    AfterValidator(validate_flagged_lines),
]


def validate_flagged_line_bounds(
    flagged_lines: list[FlaggedLineItem],
    *,
    code_snippet: str = "",
    files: list[ChallengeFile] | None = None,
    require_non_empty: bool = False,
) -> None:
    """Validate flagged lines against challenge snippet or multi-file patch bounds."""
    challenge_files = files or []
    if challenge_files:
        valid_by_path: dict[str, set[int]] = {}
        for f in challenge_files:
            if f.path in valid_by_path:
                raise ValueError(f"Duplicate file path in challenge files: {f.path}")
            valid_by_path[f.path] = f.valid_line_numbers()
        total_selectable = sum(len(lines) for lines in valid_by_path.values())
        if total_selectable == 0:
            if flagged_lines:
                raise ValueError("Challenge has no code lines to flag")
            return
        if require_non_empty and not flagged_lines:
            raise ValueError("At least one line must be flagged")

        single_file_path = (
            challenge_files[0].path if len(challenge_files) == 1 else None
        )
        for item in flagged_lines:
            if isinstance(item, FlaggedLineRef):
                if item.file_path not in valid_by_path:
                    raise ValueError(
                        f"Unknown file path in flagged_lines: {item.file_path}"
                    )
                if item.line_number not in valid_by_path[item.file_path]:
                    raise ValueError(
                        f"Flagged line {item.line_number} is out of bounds "
                        f"for {item.file_path}"
                    )
            else:
                if single_file_path is None:
                    raise ValueError(
                        "Multi-file challenges require file-scoped flagged lines "
                        "(file_path and line_number)"
                    )
                if item not in valid_by_path[single_file_path]:
                    raise ValueError(
                        f"Flagged line {item} is out of bounds for {single_file_path}"
                    )
        return

    snippet_line_count = len(code_snippet.splitlines())
    if snippet_line_count == 0:
        if flagged_lines:
            raise ValueError("Challenge has no code lines to flag")
        return

    if require_non_empty and not flagged_lines:
        raise ValueError("At least one line must be flagged")

    for item in flagged_lines:
        if isinstance(item, FlaggedLineRef):
            raise ValueError(
                "File-scoped flagged lines are only supported for multi-file challenges"
            )
        line_no = item
        if line_no > snippet_line_count:
            raise ValueError(
                f"Flagged lines must be between 1 and {snippet_line_count}"
            )


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
    code_snippet: str = Field(default="")
    files: str = Field(default="[]")
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

    @field_validator("files", mode="before")
    @classmethod
    def validate_files(cls, value: Any) -> str:
        if value is None or value == "":
            return "[]"
        if isinstance(value, list):
            seen_paths: set[str] = set()
            validated: list[dict[str, Any]] = []
            for item in value:
                f = (
                    item
                    if isinstance(item, ChallengeFile)
                    else ChallengeFile.model_validate(item)
                )
                if f.path in seen_paths:
                    raise ValueError(
                        f"Duplicate file path in challenge files: {f.path}"
                    )
                seen_paths.add(f.path)
                validated.append(f.model_dump())
            return json.dumps(validated)
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
                if not isinstance(parsed, list):
                    raise ValueError("files must be a JSON array")
                seen_paths = set()
                for item in parsed:
                    f = ChallengeFile.model_validate(item)
                    if f.path in seen_paths:
                        raise ValueError(
                            f"Duplicate file path in challenge files: {f.path}"
                        )
                    seen_paths.add(f.path)
            except json.JSONDecodeError as err:
                raise ValueError(f"Invalid JSON for files: {err}") from err
            return value
        raise ValueError("files must be a JSON string or list of ChallengeFile")

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
        Index("ix_challenges_public_user", "is_public", "user_id"),
    )

    id: int | None = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=get_utc_now)
    content_hash: str | None = Field(default=None)
    share_token: str | None = Field(default=None, index=True, unique=True)

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
            return [item.model_copy(deep=True) for item in cached]

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
        return [item.model_copy(deep=True) for item in result]

    def get_hints(self) -> list[HintItem]:
        cached = getattr(self, "_cached_hints", None)
        raw_cached = getattr(self, "_cached_hints_raw", None)
        if cached is not None and raw_cached == self.hints:
            return [item.model_copy(deep=True) for item in cached]

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
        return [item.model_copy(deep=True) for item in result]

    def get_files(self) -> list[ChallengeFile]:
        cached = getattr(self, "_cached_files", None)
        raw_cached = getattr(self, "_cached_files_raw", None)
        if cached is not None and raw_cached == self.files:
            return [item.model_copy(deep=True) for item in cached]

        if isinstance(self.files, list):
            data = self.files
        else:
            data = json.loads(self.files or "[]")
        result = [
            item
            if isinstance(item, ChallengeFile)
            else ChallengeFile.model_validate(item)
            for item in data
        ]
        object.__setattr__(self, "_cached_files", result)
        object.__setattr__(self, "_cached_files_raw", self.files)
        return [item.model_copy(deep=True) for item in result]

    def _compute_line_and_file_counts(self) -> tuple[int, int]:
        files = self.get_files()
        if files:
            line_count = sum(file.line_count() for file in files)
            if line_count == 0 and self.code_snippet:
                line_count = len(self.code_snippet.splitlines())
            return line_count, len(files)
        line_count = len(self.code_snippet.splitlines()) if self.code_snippet else 0
        return line_count, 1

    def to_summary(
        self,
        is_solved: bool = False,
        best_score: int | None = None,
        *,
        include_share_token: bool = False,
    ) -> "ChallengeSummary":
        line_count, file_count = self._compute_line_and_file_counts()
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
            file_count=file_count,
            total_hints=total_hints,
            is_solved=is_solved,
            best_score=best_score,
            is_public=self.is_public,
            is_shared=bool(self.share_token),
            share_token=self.share_token if include_share_token else None,
        )

    def to_detail(
        self,
        is_solved: bool = False,
        best_score: int | None = None,
        *,
        is_owner: bool = False,
        include_share_token: bool = False,
    ) -> "ChallengeDetail":
        files = self.get_files()
        line_count, file_count = self._compute_line_and_file_counts()
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
            files=files,
            estimated_minutes=self.estimated_minutes,
            line_count=line_count,
            file_count=file_count,
            total_hints=total_hints,
            is_solved=is_solved,
            best_score=best_score,
            is_public=self.is_public,
            is_shared=bool(self.share_token),
            share_token=self.share_token if include_share_token else None,
            is_owner=is_owner,
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
    file_count: int = 1
    total_hints: int = 0
    is_solved: bool = False
    best_score: int | None = None
    is_public: bool = True
    is_shared: bool = False
    share_token: str | None = None


class ChallengeDetail(ChallengeSummary):
    threat_model: str = ""
    defect_target: str = ""
    code_snippet: str = ""
    files: list[ChallengeFile] = Field(default_factory=list)
    is_owner: bool = False


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
        description=(
            "Programming language: "
            f"{', '.join(spec.id for spec in CHALLENGE_LANGUAGE_SPECS)}"
        ),
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
    code_snippet: str = ""
    files: list[ChallengeFile] = Field(default_factory=list)
    expected_issues: list[DefectCriterion] = Field(default_factory=list)
    hints: list[HintResponse] = Field(default_factory=list)
    canonical_review: str = ""
    recommended_fix_diff: str = ""
    estimated_minutes: int = 5
    line_count: int = 0
    file_count: int = 1
    total_hints: int = 0
    is_custom: bool = True
    session_id: str | None = None

    @model_validator(mode="after")
    def compute_counts(self) -> "CustomChallengeResponse":
        if self.files:
            if self.line_count == 0:
                self.line_count = sum(f.line_count() for f in self.files)
            self.file_count = len(self.files)
        elif self.code_snippet and self.line_count == 0:
            self.line_count = len(self.code_snippet.splitlines())
        if self.hints and self.total_hints == 0:
            self.total_hints = len(self.hints)
        return self

    def get_expected_issues(self) -> list[DefectCriterion]:
        return self.expected_issues

    def get_hints(self) -> list[HintItem]:
        return [HintItem(tier=h.tier, label=h.label, text=h.text) for h in self.hints]
