"""Gemini Challenge Generator Service.

Zero-cost, Bring Your Own Key (BYOK) challenge generation powered by Google Gemini.
User API keys are used strictly in-memory and are never stored or logged.
"""

import json
import re
from typing import Any

import httpx
from pydantic import ValidationError

from backend.models.challenge import (
    DEFAULT_TIER_LABELS,
    Category,
    CustomChallengeResponse,
    DefectCriterion,
    Difficulty,
    GenerateCustomChallengeRequest,
    HintResponse,
    Language,
)


DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite"
FALLBACK_GEMINI_MODELS = (
    "gemini-3.1-flash-lite",
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-flash-latest",
)
GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models"


class GeminiError(Exception):
    """Base exception for Gemini generation service."""


class GeminiAuthError(GeminiError):
    """Raised when Gemini API key is missing or invalid (HTTP 401)."""


class GeminiRateLimitError(GeminiError):
    """Raised when Gemini API rate limit is exceeded (HTTP 429)."""


class GeminiAPIError(GeminiError):
    """Raised when Gemini API encounters server or network errors (HTTP 502)."""


class GeminiSchemaError(GeminiError):
    """Raised when Gemini output fails schema validation (HTTP 502)."""


def build_generation_prompt(
    topic: str,
    language: Language,
    difficulty: Difficulty,
) -> str:
    """Construct prompt for Gemini challenge generation."""
    return f"""You are an elite software architect creating a code review task.

Goal: Create a realistic, self-contained code review scenario for Diffly.

Scenario Requirements:
- Topic: {topic}
- Language: {language.value}
- Difficulty: {difficulty.value}

Constraints:
1. code_snippet:
   - Provide 30 to 60 lines of realistic, production-grade {language.value} code.
   - Embed exactly 1 to 2 subtle, realistic defects (e.g. IDOR, race condition,
     auth bypass, injection, resource leak, or logic error).
   - NEVER include comments that hint at, name, or reveal the defect or missing guard
     (for example "# Defect:", "// Vulnerability:", "// Bug:", "// Missing ... check",
     "# BUG HERE", or "TODO: fix vulnerability"). Comments must read like neutral
     production code comments only.
   - The code must be well-formatted and idiomatic.

2. expected_issues:
   - Exactly 1 or 2 DefectCriterion items describing each defect accurately.
   - matched_lines: Array of 1-indexed line numbers for the defect location.
   - matched_keywords: 3-5 technical keywords/concepts reviewers should mention
     (e.g. ["idor", "authorization", "ownership"]).
   - severity: "low", "medium", "high", or "critical".
   - explanation: Clear description of root cause and why it is dangerous.

3. hints:
   - Exactly 3 progressive hints:
     * Tier 1 (Contextual clue): General invariant or area to scrutinize.
     * Tier 2 (Vulnerability class): Conceptual flaw or attack pattern.
     * Tier 3 (Line pointer): Direct pointer to the defect lines.

4. threat_model:
   - Concrete explanation of exploit impact and real-world consequences.

5. defect_target:
   - Brief instruction (e.g. "Identify 1 High-Severity authorization bypass").

6. canonical_review:
   - Exemplary senior staff engineer code review critique explaining the issue.

7. recommended_fix_diff:
   - Unified diff showing the precise minimal fix for the defect(s).

8. slug:
   - A lowercase kebab-case slug identifying the challenge.

9. category:
   - Category: "Security", "Concurrency", "Performance", or "Logic Flaws".
"""


def get_response_schema() -> dict[str, Any]:
    """Return JSON schema for Gemini structured output."""
    return {
        "type": "OBJECT",
        "properties": {
            "slug": {"type": "STRING"},
            "title": {"type": "STRING"},
            "difficulty": {
                "type": "STRING",
                "enum": ["Easy", "Medium", "Hard"],
            },
            "category": {
                "type": "STRING",
                "enum": [member.value for member in Category],
            },
            "language": {"type": "STRING"},
            "description": {"type": "STRING"},
            "threat_model": {"type": "STRING"},
            "defect_target": {"type": "STRING"},
            "code_snippet": {"type": "STRING"},
            "expected_issues": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "id": {"type": "STRING"},
                        "title": {"type": "STRING"},
                        "severity": {"type": "STRING"},
                        "matched_lines": {
                            "type": "ARRAY",
                            "items": {"type": "INTEGER"},
                        },
                        "matched_keywords": {
                            "type": "ARRAY",
                            "items": {"type": "STRING"},
                        },
                        "explanation": {"type": "STRING"},
                    },
                    "required": [
                        "title",
                        "severity",
                        "matched_lines",
                        "matched_keywords",
                        "explanation",
                    ],
                },
            },
            "hints": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "tier": {"type": "INTEGER"},
                        "label": {"type": "STRING"},
                        "text": {"type": "STRING"},
                    },
                    "required": ["tier", "text"],
                },
            },
            "canonical_review": {"type": "STRING"},
            "recommended_fix_diff": {"type": "STRING"},
        },
        "required": [
            "slug",
            "title",
            "description",
            "code_snippet",
            "expected_issues",
        ],
    }


def clean_markdown_json(raw_text: str) -> str:
    """Strip markdown code fence blocks if returned by the LLM."""
    trimmed = raw_text.strip()
    if trimmed.startswith("```"):
        match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", trimmed)
        if match:
            return match.group(1).strip()
    return trimmed


_TIER_PATTERN = re.compile(r"(?:tier[\s_-]*)?([1-3])", re.IGNORECASE)
_CATEGORY_KEYWORDS: tuple[tuple[str, Category], ...] = (
    ("concurren", Category.CONCURRENCY),
    ("race", Category.CONCURRENCY),
    ("deadlock", Category.CONCURRENCY),
    ("perf", Category.PERFORMANCE),
    ("logic", Category.LOGIC_FLAWS),
    ("agent", Category.AGENT_ANTIPATHS),
    ("secur", Category.SECURITY),
)
_MAX_SCHEMA_ATTEMPTS = 2


def _normalize_category(category_val: Any) -> Category:
    """Normalize arbitrary Gemini category strings to a valid Category."""
    if isinstance(category_val, Category):
        return category_val
    if isinstance(category_val, str) and category_val.strip():
        try:
            return Category(category_val)
        except ValueError:
            lowered = category_val.lower()
            for keyword, cat in _CATEGORY_KEYWORDS:
                if keyword in lowered:
                    return cat
    return Category.SECURITY


def _parse_hint_tier(raw_tier: Any, used_tiers: set[int]) -> int | None:
    """Parse Gemini hint tier values ('Tier 1', 1, null) safely into 1..3."""
    if raw_tier is None:
        for candidate in (1, 2, 3):
            if candidate not in used_tiers:
                return candidate
        return None
    if isinstance(raw_tier, bool):
        return None
    if isinstance(raw_tier, int):
        return raw_tier if 1 <= raw_tier <= 3 else None
    if isinstance(raw_tier, float):
        if raw_tier.is_integer() and 1 <= int(raw_tier) <= 3:
            return int(raw_tier)
        return None
    if isinstance(raw_tier, str):
        match = _TIER_PATTERN.fullmatch(raw_tier.strip())
        if match:
            return int(match.group(1))
    return None


def _resolve_valid_lines(
    item: dict[str, Any],
    code_lines: list[str],
    line_count: int,
    defect_index: int,
) -> list[int]:
    """Resolve 1-indexed defect lines from Gemini output or keyword match."""
    raw_lines = item.get("matched_lines") or item.get("lines") or []
    if not isinstance(raw_lines, list):
        raw_lines = [raw_lines] if isinstance(raw_lines, (int, str)) else []

    valid_lines = list(
        dict.fromkeys(
            int(str(ln).strip())
            for ln in raw_lines
            if not isinstance(ln, bool)
            and isinstance(ln, (int, str))
            and str(ln).strip().isdigit()
            and 1 <= int(str(ln).strip()) <= line_count
        )
    )

    if not valid_lines:
        keywords = item.get("matched_keywords") or item.get("keywords") or []
        if isinstance(keywords, list):
            for ln_idx, line_str in enumerate(code_lines, start=1):
                if any(
                    kw.strip().lower() in line_str.lower()
                    for kw in keywords
                    if isinstance(kw, str) and len(kw.strip()) > 2
                ):
                    valid_lines.append(ln_idx)
                    break

    if not valid_lines:
        raise GeminiSchemaError(
            f"Defect {defect_index} has unresolvable line numbers "
            f"outside 1..{line_count}"
        )

    return valid_lines


def sanitize_generated_challenge(
    raw_data: dict[str, Any],
    request: GenerateCustomChallengeRequest,
) -> CustomChallengeResponse:
    """Validate and normalize challenge output without shifting line indices."""
    if not isinstance(raw_data, dict):
        raise GeminiSchemaError("Generated payload must be a JSON object")

    raw_code = raw_data.get("code_snippet")
    if not isinstance(raw_code, str) or not raw_code.strip():
        raise GeminiSchemaError("Generated code_snippet is empty")

    # Preserve leading blank lines and indentation so 1-indexed lines stay aligned.
    code_snippet = raw_code.rstrip()
    code_lines = code_snippet.splitlines()
    line_count = max(len(code_lines), 1)

    slug = str(raw_data.get("slug") or "").strip().lower()
    if not slug:
        title = str(raw_data.get("title") or request.topic).lower()
        slug = re.sub(r"[^a-z0-9]+", "-", title).strip("-")
    if not slug:
        slug = f"custom-challenge-{request.language.value}"

    title = str(raw_data.get("title") or request.topic).strip()
    description = str(
        raw_data.get("description")
        or f"Review the following {request.language.value} code for defects."
    ).strip()
    threat_model = str(raw_data.get("threat_model") or "").strip()
    defect_target = str(raw_data.get("defect_target") or "").strip()
    canonical_review = str(raw_data.get("canonical_review") or "").strip()
    recommended_fix_diff = str(raw_data.get("recommended_fix_diff") or "").strip()
    category = _normalize_category(raw_data.get("category"))

    raw_expected = raw_data.get("expected_issues") or []
    if not isinstance(raw_expected, list) or len(raw_expected) == 0:
        raise GeminiSchemaError("Generated challenge missing expected_issues")

    expected_issues: list[DefectCriterion] = []
    for idx, item in enumerate(raw_expected, start=1):
        if not isinstance(item, dict):
            continue

        valid_lines = _resolve_valid_lines(item, code_lines, line_count, idx)

        raw_keywords = item.get("matched_keywords") or item.get("keywords") or []
        keywords = (
            [
                str(kw).strip()
                for kw in raw_keywords
                if kw is not None and str(kw).strip()
            ]
            if isinstance(raw_keywords, list)
            else []
        )
        if not keywords:
            keywords = [request.topic.lower()]

        defect_title = str(item.get("title") or f"Intentional Defect {idx}").strip()
        severity = str(item.get("severity") or "medium").lower()
        if severity not in {"low", "medium", "high", "critical"}:
            severity = "medium"
        explanation = str(
            item.get("explanation") or f"Defect located at lines {valid_lines}."
        ).strip()
        defect_id = str(item.get("id") or f"defect-{idx}").strip()

        try:
            expected_issues.append(
                DefectCriterion(
                    id=defect_id,
                    title=defect_title,
                    severity=severity,
                    lines=valid_lines,
                    keywords=keywords,
                    explanation=explanation,
                )
            )
        except (ValidationError, ValueError, TypeError) as exc:
            raise GeminiSchemaError(f"Invalid defect criterion {idx}: {exc}") from exc

    if not expected_issues:
        raise GeminiSchemaError("Failed to parse valid defect criteria")

    raw_hints = raw_data.get("hints") or []
    hints_by_tier: dict[int, HintResponse] = {}
    if isinstance(raw_hints, list):
        for h in raw_hints:
            if not isinstance(h, dict):
                continue
            tier = _parse_hint_tier(h.get("tier"), set(hints_by_tier))
            if tier is None or tier in hints_by_tier:
                continue
            text = str(h.get("text") or h.get("hint") or "").strip()
            label = str(h.get("label") or DEFAULT_TIER_LABELS.get(tier, f"Tier {tier}"))
            if text:
                hints_by_tier[tier] = HintResponse(
                    tier=tier,
                    label=label,
                    text=text,
                )

    default_hint_texts = {
        1: (
            f"Inspect how {request.language.value} handles inputs or "
            "state in this snippet."
        ),
        2: f"Examine potential {expected_issues[0].title.lower()} patterns.",
        3: f"Focus on lines {expected_issues[0].lines} for the primary defect.",
    }
    for tier in (1, 2, 3):
        if tier not in hints_by_tier:
            hints_by_tier[tier] = HintResponse(
                tier=tier,
                label=DEFAULT_TIER_LABELS[tier],
                text=default_hint_texts[tier],
            )

    sorted_hints = [hints_by_tier[t] for t in (1, 2, 3)]

    try:
        return CustomChallengeResponse(
            id=0,
            slug=slug,
            title=title,
            difficulty=request.difficulty,
            category=category,
            language=request.language,
            description=description,
            threat_model=threat_model,
            defect_target=defect_target,
            code_snippet=code_snippet,
            expected_issues=expected_issues,
            hints=sorted_hints,
            canonical_review=canonical_review,
            recommended_fix_diff=recommended_fix_diff,
            estimated_minutes=5,
            line_count=line_count,
            total_hints=len(sorted_hints),
            is_custom=True,
        )
    except (ValidationError, ValueError, TypeError) as exc:
        raise GeminiSchemaError(f"Invalid challenge payload: {exc}") from exc


async def _request_and_sanitize_once(
    http_client: httpx.AsyncClient,
    models_to_try: list[str],
    payload: dict[str, Any],
    headers: dict[str, str],
    request: GenerateCustomChallengeRequest,
) -> CustomChallengeResponse:
    """Execute one Gemini model-fallback pass and validate the generated challenge."""
    last_response: httpx.Response | None = None
    for current_model in models_to_try:
        url = f"{GEMINI_API_BASE_URL}/{current_model}:generateContent"
        try:
            response = await http_client.post(url, json=payload, headers=headers)
            last_response = response
        except httpx.RequestError as exc:
            if current_model == models_to_try[-1]:
                raise GeminiAPIError(
                    f"Failed to communicate with Gemini API: {exc.__class__.__name__}"
                ) from exc
            continue

        # If model is deprecated (404) or busy (503), try next fallback
        if response.status_code in {404, 503} and current_model != models_to_try[-1]:
            continue
        break

    if last_response is None:
        raise GeminiAPIError("No response received from Gemini API")

    response = last_response

    if response.status_code == 400:
        err_body = response.text
        if (
            "API_KEY_INVALID" in err_body
            or "API key not valid" in err_body
            or "INVALID_ARGUMENT" in err_body
        ):
            raise GeminiAuthError("Invalid Gemini API key or unauthorized request.")
        raise GeminiAPIError(f"Gemini API bad request: {err_body}")

    if response.status_code in {401, 403}:
        raise GeminiAuthError("Invalid Gemini API key or unauthorized request.")

    if response.status_code == 429:
        raise GeminiRateLimitError(
            "Gemini API rate limit exceeded. Please try again later."
        )

    if response.status_code != 200:
        raise GeminiAPIError(
            f"Gemini API request failed with status code {response.status_code}"
        )

    try:
        res_json = response.json()
        candidates = res_json.get("candidates") or []
        if not candidates or not isinstance(candidates, list):
            raise GeminiSchemaError("Gemini returned empty candidate response")

        content = candidates[0].get("content") or {}
        parts = content.get("parts") or [{}]
        first_part = parts[0] if isinstance(parts, list) and parts else {}
        raw_text = first_part.get("text") or ""
        clean_text = clean_markdown_json(raw_text)
        parsed_data = json.loads(clean_text)
    except (
        json.JSONDecodeError,
        KeyError,
        IndexError,
        AttributeError,
        TypeError,
    ) as exc:
        raise GeminiSchemaError(f"Failed to parse Gemini output: {exc}") from exc

    return sanitize_generated_challenge(parsed_data, request)


async def generate_custom_challenge(
    request: GenerateCustomChallengeRequest,
    api_key: str | None,
    *,
    client: httpx.AsyncClient | None = None,
    model: str = DEFAULT_GEMINI_MODEL,
) -> CustomChallengeResponse:
    """Generate a custom challenge using Google Gemini API.

    The API key is strictly in-memory and never stored, logged, or persisted.
    """
    if not api_key or not api_key.strip():
        raise GeminiAuthError(
            "Missing or invalid Gemini API key. "
            "Provide a valid key in the X-Gemini-Key header."
        )

    clean_key = api_key.strip()
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": clean_key,
    }

    prompt = build_generation_prompt(
        topic=request.topic,
        language=request.language,
        difficulty=request.difficulty,
    )

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                ]
            }
        ],
        "generationConfig": {
            "response_mime_type": "application/json",
            "response_schema": get_response_schema(),
            "temperature": 0.2,
        },
    }

    models_to_try = [model]
    for fallback in FALLBACK_GEMINI_MODELS:
        if fallback not in models_to_try:
            models_to_try.append(fallback)

    owns_client = client is None
    http_client = client or httpx.AsyncClient(timeout=30.0)

    try:
        for attempt in range(_MAX_SCHEMA_ATTEMPTS):
            try:
                return await _request_and_sanitize_once(
                    http_client,
                    models_to_try,
                    payload,
                    headers,
                    request,
                )
            except GeminiSchemaError:
                if attempt == _MAX_SCHEMA_ATTEMPTS - 1:
                    raise
    finally:
        if owns_client:
            await http_client.aclose()

    raise GeminiSchemaError("Failed to generate valid challenge schema")
