"""Domain models and request configuration for the optional semantic judge."""

from dataclasses import dataclass
from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator

from backend.services.gemini_client import DEFAULT_GEMINI_MODEL


class RubricCheck(StrEnum):
    """Rubric dimensions evaluated by the semantic judge."""

    ROOT_CAUSE = "root_cause"
    IMPACT = "impact"
    FIX = "fix"


_STRING_CONCEPT_CREDITS: dict[str, float] = {
    "0.0": 0.0,
    "0.5": 0.5,
    "1.0": 1.0,
    "0": 0.0,
    "1": 1.0,
}


class JudgeDefectVerdict(BaseModel):
    """Strict structured verdict emitted by Gemini for a single borderline defect."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    defect_id: str
    concept_credit: Literal[0.0, 0.5, 1.0]
    rubric: dict[RubricCheck, bool]
    feedback: str = Field(default="", max_length=400)

    @field_validator("concept_credit", mode="before")
    @classmethod
    def _coerce_and_reject_bool_credit(cls, value: Any) -> Any:
        # Python bool subclasses int, so True == 1.0 would satisfy Literal[1.0].
        if isinstance(value, bool):
            raise ValueError("concept_credit must be 0.0, 0.5, or 1.0")
        if isinstance(value, str):
            stripped = value.strip()
            if stripped in _STRING_CONCEPT_CREDITS:
                return _STRING_CONCEPT_CREDITS[stripped]
            raise ValueError("concept_credit must be 0.0, 0.5, or 1.0")
        if isinstance(value, int):
            return float(value)
        return value

    @field_validator("feedback", mode="before")
    @classmethod
    def _truncate_feedback(cls, value: Any) -> Any:
        if value is None:
            return ""
        if isinstance(value, str):
            return value[:400]
        return value


class JudgeOutcome(BaseModel):
    """Persisted and API-facing semantic judge result attached to a GradeReport."""

    status: Literal[
        "applied",
        "no_change",
        "unavailable",
        "skipped_decisive",
        "skipped_no_text",
    ]
    reason: str | None = None
    key_source: Literal["byok", "server"] | None = None
    verdicts: list[JudgeDefectVerdict] = Field(default_factory=list)
    score_delta: int = 0


@dataclass(frozen=True, slots=True)
class JudgeRequest:
    """In-memory credentials and budget for a single semantic judge invocation."""

    api_key: SecretStr
    key_source: Literal["byok", "server"]
    model: str
    timeout_s: float = 8.0

    @classmethod
    def from_headers(
        cls,
        *,
        byok_key: str | None,
        opt_in: bool,
        settings: Any,
        allow_server_key: bool = True,
    ) -> "JudgeRequest | None":
        """Resolve an active JudgeRequest from BYOK header or server opt-in config."""
        if not opt_in:
            return None

        raw_model = getattr(settings, "GEMINI_JUDGE_MODEL", DEFAULT_GEMINI_MODEL)
        model = str(raw_model or "").strip() or DEFAULT_GEMINI_MODEL
        raw_timeout = getattr(settings, "GEMINI_JUDGE_TIMEOUT_S", 8.0)
        try:
            timeout_s = float(raw_timeout)
        except (TypeError, ValueError):
            timeout_s = 8.0
        if timeout_s <= 0.0:
            timeout_s = 8.0

        if isinstance(byok_key, str) and byok_key.strip():
            return cls(
                api_key=SecretStr(byok_key.strip()),
                key_source="byok",
                model=model,
                timeout_s=timeout_s,
            )

        if allow_server_key:
            raw_server_key = getattr(settings, "GEMINI_JUDGE_API_KEY", None)
            if isinstance(raw_server_key, SecretStr):
                server_key = raw_server_key.get_secret_value().strip()
            else:
                server_key = str(raw_server_key or "").strip()
            if server_key:
                return cls(
                    api_key=SecretStr(server_key),
                    key_source="server",
                    model=model,
                    timeout_s=timeout_s,
                )

        return None


__all__ = [
    "JudgeDefectVerdict",
    "JudgeOutcome",
    "JudgeRequest",
    "RubricCheck",
]
