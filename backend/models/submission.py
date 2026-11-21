import json
from datetime import UTC, datetime
from typing import Any

from pydantic import ConfigDict, field_validator
from sqlalchemy import CheckConstraint, Index
from sqlmodel import Field, Relationship, SQLModel

from backend.models.challenge import Challenge, FlaggedLineRef
from backend.models.user import User
from backend.services.grading.review import normalize_scoped_flagged_lines


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


def _validate_json_array(value: Any, field_name: str) -> str:
    if value is None or value == "":
        return "[]"
    if isinstance(value, list):
        return json.dumps(value)
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if not isinstance(parsed, list):
                raise ValueError(f"{field_name} must be a JSON array")
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
    findings: str = Field(default="[]")
    finding_verdicts: str = Field(default="[]")
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

    @field_validator("findings", mode="before")
    @classmethod
    def validate_findings(cls, value: Any) -> str:
        return _validate_json_array(value, "findings")

    @field_validator("finding_verdicts", mode="before")
    @classmethod
    def validate_finding_verdicts(cls, value: Any) -> str:
        return _validate_json_array(value, "finding_verdicts")

    @field_validator("detected_issues", mode="before")
    @classmethod
    def validate_detected_issues(cls, value: Any) -> str:
        return _validate_json_array(value, "detected_issues")

    @field_validator("missed_issues", mode="before")
    @classmethod
    def validate_missed_issues(cls, value: Any) -> str:
        return _validate_json_array(value, "missed_issues")


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

    def get_findings(self) -> list[dict[str, Any]]:
        parsed = (
            self.findings
            if isinstance(self.findings, list)
            else json.loads(self.findings or "[]")
        )
        if parsed:
            return parsed
        scoped, _ = normalize_scoped_flagged_lines(self.get_flagged_lines())
        return [
            {
                "id": f"l{idx}",
                "anchor": {"file_path": fp, "start_line": ln, "end_line": ln},
                "body": "",
                "severity": None,
            }
            for idx, (fp, ln) in enumerate(scoped, start=1)
            if ln >= 1
        ]

    def get_finding_verdicts(self) -> list[dict[str, Any]]:
        if isinstance(self.finding_verdicts, list):
            return self.finding_verdicts
        return json.loads(self.finding_verdicts or "[]")

    @classmethod
    def record(
        cls,
        *,
        challenge_id: int,
        user_id: int | None,
        session_id: str | None,
        review: Any,
        report: Any,
    ) -> "Submission":
        derived_lines: list[int | dict[str, Any]] = []
        seen_lines: set[tuple[str | None, int]] = set()
        for finding in review.findings:
            fp = finding.anchor.file_path
            for ln in finding.anchor.lines():
                key = (fp, ln)
                if key in seen_lines:
                    continue
                seen_lines.add(key)
                if fp is not None:
                    derived_lines.append({"file_path": fp, "line_number": ln})
                else:
                    derived_lines.append(ln)

        return cls(
            challenge_id=challenge_id,
            user_id=user_id,
            session_id=session_id,
            flagged_lines=derived_lines,
            findings=[f.model_dump() for f in review.findings],
            finding_verdicts=[v.model_dump() for v in report.finding_verdicts],
            comments=review.summary_note,
            score=report.score,
            line_precision_score=report.line_precision_score,
            concept_score=report.concept_score,
            false_positive_penalty=report.false_positive_penalty,
            false_positive_lines=[
                item.model_dump() if isinstance(item, FlaggedLineRef) else item
                for item in report.false_positive_lines
            ],
            summary=report.summary,
            feedback=report.critique,
            detected_issues=[issue.model_dump() for issue in report.detected_issues],
            missed_issues=[issue.model_dump() for issue in report.missed_issues],
        )
