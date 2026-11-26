"""Async orchestration for the opt-in Gemini semantic judge pass."""

import asyncio
import logging
from typing import Any, Literal

import httpx
from pydantic import ValidationError

from backend.models.challenge import Challenge
from backend.services.gemini_client import (
    GeminiAPIError,
    GeminiAuthError,
    GeminiError,
    GeminiJsonClient,
    GeminiRateLimitError,
    GeminiSchemaError,
    HttpxGeminiClient,
)
from backend.services.grading.judge.apply import apply_verdicts
from backend.services.grading.judge.models import (
    JudgeDefectVerdict,
    JudgeOutcome,
    JudgeRequest,
)
from backend.services.grading.judge.prompt import (
    JUDGE_RESPONSE_SCHEMA,
    build_judge_prompt,
    collect_borderline_evidence,
)
from backend.services.grading.review import ReviewSubmission, extract_challenge_files
from backend.services.grading.scoring import (
    GradeReport,
    GradingPolicy,
    extract_expected_issues,
)


logger = logging.getLogger(__name__)


def _with_judge_outcome(
    report: GradeReport,
    *,
    status: Literal["unavailable", "skipped_decisive", "skipped_no_text"],
    reason: str,
    key_source: Literal["byok", "server"],
) -> GradeReport:
    return report.model_copy(
        update={
            "judge": JudgeOutcome(
                status=status,
                reason=reason,
                key_source=key_source,
            )
        }
    )


def _parse_verdicts(raw_payload: Any) -> list[JudgeDefectVerdict]:
    if not isinstance(raw_payload, dict):
        raise GeminiSchemaError("Judge response must be a JSON object")
    raw_verdicts = raw_payload.get("verdicts")
    if not isinstance(raw_verdicts, list):
        raise GeminiSchemaError("Judge response missing 'verdicts' list")
    try:
        return [JudgeDefectVerdict.model_validate(item) for item in raw_verdicts]
    except ValidationError as exc:
        raise GeminiSchemaError(f"Invalid judge verdict item: {exc}") from exc


async def refine_with_judge(
    challenge: Challenge | dict[str, Any] | Any,
    review: ReviewSubmission,
    report: GradeReport,
    request: JudgeRequest,
    policy: GradingPolicy,
    *,
    client: GeminiJsonClient | None = None,
    redact_judge_feedback: bool = True,
) -> GradeReport:
    """Optionally refine borderline defect concepts using a single Gemini judge call."""
    if not report.borderline_defect_ids:
        return _with_judge_outcome(
            report,
            status="skipped_decisive",
            reason="not_borderline",
            key_source=request.key_source,
        )

    defects = extract_expected_issues(challenge)
    challenge_files = extract_challenge_files(challenge)
    default_file_path = challenge_files[0].path if len(challenge_files) == 1 else None
    borderline_evidence = collect_borderline_evidence(
        challenge,
        review,
        report,
        defects=defects,
        policy=policy,
    )
    if not any(item.has_text for item in borderline_evidence):
        return _with_judge_outcome(
            report,
            status="skipped_no_text",
            reason="no_review_text",
            key_source=request.key_source,
        )

    prompt = build_judge_prompt(
        challenge,
        review,
        report,
        defects=defects,
        policy=policy,
        borderline_evidence=borderline_evidence,
    )
    active_client = client or HttpxGeminiClient(timeout=request.timeout_s)

    try:
        raw_payload = await asyncio.wait_for(
            active_client.generate_json(
                prompt=prompt,
                response_schema=JUDGE_RESPONSE_SCHEMA,
                api_key=request.api_key.get_secret_value(),
                model=request.model,
                temperature=0.0,
                fallback_models=(),
            ),
            timeout=request.timeout_s,
        )
        verdicts = _parse_verdicts(raw_payload)
    except GeminiAuthError:
        logger.warning(
            "Semantic judge unavailable: reason=auth_error key_source=%s",
            request.key_source,
        )
        return _with_judge_outcome(
            report,
            status="unavailable",
            reason="auth_error",
            key_source=request.key_source,
        )
    except GeminiRateLimitError:
        logger.warning(
            "Semantic judge unavailable: reason=rate_limited key_source=%s",
            request.key_source,
        )
        return _with_judge_outcome(
            report,
            status="unavailable",
            reason="rate_limited",
            key_source=request.key_source,
        )
    except GeminiSchemaError:
        logger.warning(
            "Semantic judge unavailable: reason=schema key_source=%s",
            request.key_source,
        )
        return _with_judge_outcome(
            report,
            status="unavailable",
            reason="schema",
            key_source=request.key_source,
        )
    except (TimeoutError, httpx.TimeoutException):
        logger.warning(
            "Semantic judge unavailable: reason=timeout key_source=%s",
            request.key_source,
        )
        return _with_judge_outcome(
            report,
            status="unavailable",
            reason="timeout",
            key_source=request.key_source,
        )
    except GeminiAPIError as exc:
        reason = (
            "timeout"
            if isinstance(exc.__cause__, (TimeoutError, httpx.TimeoutException))
            else "api_error"
        )
        logger.warning(
            "Semantic judge unavailable: reason=%s key_source=%s",
            reason,
            request.key_source,
        )
        return _with_judge_outcome(
            report,
            status="unavailable",
            reason=reason,
            key_source=request.key_source,
        )
    except (GeminiError, httpx.HTTPError):
        logger.warning(
            "Semantic judge unavailable: reason=api_error key_source=%s",
            request.key_source,
        )
        return _with_judge_outcome(
            report,
            status="unavailable",
            reason="api_error",
            key_source=request.key_source,
        )

    return apply_verdicts(
        report,
        verdicts,
        defects,
        policy,
        review,
        key_source=request.key_source,
        default_file_path=default_file_path,
        borderline_evidence=borderline_evidence,
        redact_judge_feedback=redact_judge_feedback,
    )


__all__ = ["refine_with_judge"]
