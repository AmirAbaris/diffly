"""Domain models and validation for v2 inline review submissions."""

import json
import re
from typing import Any

from pydantic import (
    AliasChoices,
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

from backend.models.challenge import Challenge, ChallengeFile, FlaggedLineRef
from backend.services.grading.weights import Severity as Severity


MAX_ANCHOR_SPAN = 15
MIN_REVIEW_TEXT_CHARS = 5
ScopedLine = tuple[str | None, int]


def _parse_scoped_item(
    item: Any,
    default_file_path: str | None = None,
) -> tuple[ScopedLine | None, bool]:
    if isinstance(item, FlaggedLineRef):
        return (item.file_path, item.line_number), True
    if isinstance(item, dict):
        ref = FlaggedLineRef.model_validate(item)
        return (ref.file_path, ref.line_number), True
    if isinstance(item, (list, tuple)) and len(item) == 2:
        ref = FlaggedLineRef.model_validate(item)
        return (ref.file_path, ref.line_number), True
    if isinstance(item, bool):
        return None, False
    try:
        return (default_file_path, int(item)), False
    except (ValueError, TypeError):
        return None, False


def normalize_scoped_flagged_lines(
    flagged_lines: Any,
    default_file_path: str | None = None,
) -> tuple[list[ScopedLine], bool]:
    """Parse flagged lines into deduplicated sorted (file_path, line_number) tuples."""
    if flagged_lines is None:
        return [], False

    parsed_items: Any = flagged_lines
    if isinstance(flagged_lines, str):
        trimmed = flagged_lines.strip()
        if not trimmed or trimmed == "[]":
            return [], False
        try:
            decoded = json.loads(trimmed)
            if isinstance(decoded, list):
                parsed_items = decoded
            else:
                tokens = re.findall(r"\b\d+\b", trimmed)
                return sorted({(default_file_path, int(t)) for t in tokens}), False
        except (json.JSONDecodeError, ValueError):
            tokens = re.findall(r"\b\d+\b", trimmed)
            return sorted({(default_file_path, int(t)) for t in tokens}), False

    if isinstance(parsed_items, (list, tuple, set)):
        result: set[ScopedLine] = set()
        had_explicit_scope = False
        for item in parsed_items:
            scoped, is_explicit = _parse_scoped_item(
                item, default_file_path=default_file_path
            )
            if scoped is not None:
                result.add(scoped)
                if is_explicit:
                    had_explicit_scope = True
        sorted_lines = sorted(result, key=lambda pair: (pair[0] or "", pair[1]))
        return sorted_lines, had_explicit_scope

    return [], False


def extract_challenge_files(
    challenge: Challenge | dict[str, Any] | Any,
) -> list[ChallengeFile]:
    """Extract and validate ChallengeFile objects from a Challenge model or dict."""
    if hasattr(challenge, "get_files"):
        return challenge.get_files()

    raw_files: Any = None
    if isinstance(challenge, dict):
        raw_files = challenge.get("files", [])
    elif hasattr(challenge, "files"):
        raw_files = challenge.files

    if isinstance(raw_files, str):
        try:
            raw_files = json.loads(raw_files or "[]")
        except json.JSONDecodeError:
            return []

    if isinstance(raw_files, list):
        return [
            item
            if isinstance(item, ChallengeFile)
            else ChallengeFile.model_validate(item)
            for item in raw_files
        ]

    return []


class Anchor(BaseModel):
    """Contiguous line range within an optional file path."""

    model_config = ConfigDict(frozen=True, extra="ignore")

    file_path: str | None = Field(default=None, max_length=500)
    start_line: int = Field(ge=1)
    end_line: int = Field(ge=1)

    @field_validator("file_path", mode="before")
    @classmethod
    def _clean_file_path(cls, value: Any) -> str | None:
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip()
            return stripped or None
        return value

    @model_validator(mode="after")
    def _check_span(self) -> "Anchor":
        if self.start_line > self.end_line:
            raise ValueError(
                f"start_line ({self.start_line}) must be <= end_line ({self.end_line})"
            )
        if self.end_line - self.start_line >= MAX_ANCHOR_SPAN:
            raise ValueError(
                f"Anchor span cannot exceed {MAX_ANCHOR_SPAN} lines "
                f"(got {self.end_line - self.start_line + 1})"
            )
        return self

    def lines(self) -> range:
        """Return the inclusive 1-based range of lines covered by this anchor."""
        return range(self.start_line, self.end_line + 1)


class Finding(BaseModel):
    """Single inline review thread anchored to a line or contiguous range."""

    model_config = ConfigDict(frozen=True, extra="ignore")

    id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,40}$")
    anchor: Anchor
    body: str = Field(default="", max_length=4000)
    severity: Severity | None = None

    @model_validator(mode="before")
    @classmethod
    def _normalize_flat_wire_dict(cls, data: Any) -> Any:
        if (
            isinstance(data, dict)
            and "anchor" not in data
            and ("start_line" in data or "end_line" in data or "file_path" in data)
        ):
            normalized = dict(data)
            normalized["anchor"] = {
                "file_path": normalized.pop("file_path", None),
                "start_line": normalized.pop("start_line", None),
                "end_line": normalized.pop("end_line", None),
            }
            if normalized.get("body") is None:
                normalized["body"] = ""
            return normalized
        if isinstance(data, dict) and data.get("body") is None:
            normalized = dict(data)
            normalized["body"] = ""
            return normalized
        return data


class ReviewSubmission(BaseModel):
    """Validated v2 review submission (lifted automatically from legacy v1 payloads)."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    findings: list[Finding] = Field(default_factory=list, max_length=200)
    summary_note: str = Field(
        default="",
        max_length=20000,
        validation_alias=AliasChoices("summary_note", "comments"),
    )
    reveal: bool = False

    @model_validator(mode="before")
    @classmethod
    def lift_legacy(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        if "flagged_lines" in data and (
            "findings" not in data or data.get("findings") is None
        ):
            normalized = dict(data)
            scoped, _ = normalize_scoped_flagged_lines(normalized.get("flagged_lines"))
            normalized["findings"] = [
                Finding(
                    id=f"l{idx}",
                    anchor=Anchor(file_path=fp, start_line=ln, end_line=ln),
                    body="",
                    severity=None,
                )
                for idx, (fp, ln) in enumerate(scoped, start=1)
                if ln >= 1
            ]
            return normalized
        return data

    @model_validator(mode="after")
    def check_invariants(self) -> "ReviewSubmission":
        seen_ids: set[str] = set()
        for finding in self.findings:
            if finding.id in seen_ids:
                raise ValueError(f"Duplicate finding id: {finding.id}")
            seen_ids.add(finding.id)

        ordered = sorted(
            self.findings,
            key=lambda f: (f.anchor.file_path or "", f.anchor.start_line),
        )
        for prev, curr in zip(ordered, ordered[1:], strict=False):
            if (
                prev.anchor.file_path == curr.anchor.file_path
                and curr.anchor.start_line <= prev.anchor.end_line
            ):
                raise ValueError(
                    f"Overlapping anchors between findings '{prev.id}' and '{curr.id}'"
                )
        return self


def validate_review_text(
    review: ReviewSubmission, *, require_findings: bool = False
) -> None:
    """Ensure combined text across finding bodies and summary note meets minimum."""
    if require_findings and not review.findings:
        raise ValueError("At least one line must be flagged")
    total_chars = len(review.summary_note.strip()) + sum(
        len(f.body.strip()) for f in review.findings
    )
    if total_chars < MIN_REVIEW_TEXT_CHARS:
        raise ValueError(
            f"Review must contain at least {MIN_REVIEW_TEXT_CHARS} characters "
            "across finding comments or summary note"
        )


def validate_review_bounds(
    review: ReviewSubmission,
    challenge: Challenge | dict[str, Any] | Any,
    *,
    require_non_empty: bool = True,
) -> None:
    """Validate all finding anchors against challenge snippet or multi-file bounds."""
    challenge_files = extract_challenge_files(challenge)
    if challenge_files:
        valid_by_path: dict[str, set[int]] = {}
        for f in challenge_files:
            if f.path in valid_by_path:
                raise ValueError(f"Duplicate file path in challenge files: {f.path}")
            valid_by_path[f.path] = f.valid_line_numbers()

        total_selectable = sum(len(lines) for lines in valid_by_path.values())
        if total_selectable == 0:
            if review.findings:
                raise ValueError("Challenge has no code lines to flag")
            return
        if require_non_empty and not review.findings:
            raise ValueError("At least one line must be flagged")

        single_file_path = (
            challenge_files[0].path if len(challenge_files) == 1 else None
        )
        for finding in review.findings:
            fp = finding.anchor.file_path
            if fp is None:
                if single_file_path is None:
                    raise ValueError(
                        "Multi-file challenges require file_path on every finding"
                    )
                target_path = single_file_path
            else:
                if fp not in valid_by_path:
                    raise ValueError(
                        f"Unknown file path in finding '{finding.id}': {fp}"
                    )
                target_path = fp

            valid_lines = valid_by_path[target_path]
            for line_no in finding.anchor.lines():
                if line_no not in valid_lines:
                    raise ValueError(
                        f"Flagged line {line_no} is out of bounds for {target_path}"
                    )
        return

    code_snippet = (
        challenge.get("code_snippet", "")
        if isinstance(challenge, dict)
        else getattr(challenge, "code_snippet", "")
    )
    snippet_line_count = len((code_snippet or "").splitlines())
    if snippet_line_count == 0:
        if review.findings:
            raise ValueError("Challenge has no code lines to flag")
        return
    if require_non_empty and not review.findings:
        raise ValueError("At least one line must be flagged")

    for finding in review.findings:
        if finding.anchor.file_path is not None:
            raise ValueError(
                "File-scoped findings are only supported for multi-file challenges"
            )
        for line_no in finding.anchor.lines():
            if line_no > snippet_line_count:
                raise ValueError(
                    f"Flagged lines must be between 1 and {snippet_line_count}"
                )
