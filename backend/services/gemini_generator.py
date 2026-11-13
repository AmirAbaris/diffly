"""Gemini Challenge Generator Service.

Zero-cost, Bring Your Own Key (BYOK) challenge generation powered by Google Gemini.
User API keys are used strictly in-memory and are never stored or logged.
"""

import json
import re
from typing import Any

import httpx

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
   - DO NOT include comments like "# BUG HERE" or "TODO: fix vulnerability".
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
            "category": {"type": "STRING"},
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


def sanitize_generated_challenge(
    raw_data: dict[str, Any],
    request: GenerateCustomChallengeRequest,
) -> CustomChallengeResponse:
    """Validate, normalize, and clamp line numbers for generated challenge."""
    code_snippet = str(raw_data.get("code_snippet") or "").strip()
    if not code_snippet:
        raise GeminiSchemaError("Generated code_snippet is empty")

    code_lines = code_snippet.splitlines()
    line_count = max(len(code_lines), 1)

    # Slug validation & fallback
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

    # Category normalization
    category_val = raw_data.get("category")
    category = Category(category_val) if category_val else Category.SECURITY
    if category is None:
        category = Category.SECURITY

    # Process and clamp expected issues
    raw_expected = raw_data.get("expected_issues") or []
    if not isinstance(raw_expected, list) or len(raw_expected) == 0:
        raise GeminiSchemaError("Generated challenge missing expected_issues")

    expected_issues: list[DefectCriterion] = []
    for idx, item in enumerate(raw_expected, start=1):
        if not isinstance(item, dict):
            continue

        raw_lines = item.get("matched_lines") or item.get("lines") or []
        valid_lines = [
            int(ln)
            for ln in raw_lines
            if isinstance(ln, (int, str))
            and str(ln).isdigit()
            and 1 <= int(ln) <= line_count
        ]

        # If Gemini gave out-of-range lines, try to find a keyword line or fallback
        if not valid_lines:
            keywords = item.get("matched_keywords") or item.get("keywords") or []
            for ln_idx, line_str in enumerate(code_lines, start=1):
                if any(
                    kw.lower() in line_str.lower()
                    for kw in keywords
                    if isinstance(kw, str) and len(kw) > 2
                ):
                    valid_lines.append(ln_idx)
                    break
        if not valid_lines:
            valid_lines = [min(line_count, max(1, idx * 5))]

        keywords = [
            str(kw)
            for kw in (item.get("matched_keywords") or item.get("keywords") or [])
            if str(kw).strip()
        ]
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

    if not expected_issues:
        raise GeminiSchemaError("Failed to parse valid defect criteria")

    # Process hints: ensure 3 tiers
    raw_hints = raw_data.get("hints") or []
    hints_by_tier: dict[int, HintResponse] = {}
    if isinstance(raw_hints, list):
        for h in raw_hints:
            if isinstance(h, dict):
                tier = int(h.get("tier", 1))
                if 1 <= tier <= 3 and tier not in hints_by_tier:
                    text = str(h.get("text") or h.get("hint") or "").strip()
                    label = str(
                        h.get("label") or DEFAULT_TIER_LABELS.get(tier, f"Tier {tier}")
                    )
                    if text:
                        hints_by_tier[tier] = HintResponse(
                            tier=tier,
                            label=label,
                            text=text,
                        )

    # Fill in any missing progressive hints
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
    url = f"{GEMINI_API_BASE_URL}/{model}:generateContent"
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

    owns_client = client is None
    http_client = client or httpx.AsyncClient(timeout=30.0)

    try:
        response = await http_client.post(url, json=payload, headers=headers)
    except httpx.RequestError as exc:
        raise GeminiAPIError(
            f"Failed to communicate with Gemini API: {exc.__class__.__name__}"
        ) from exc
    finally:
        if owns_client:
            await http_client.aclose()

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
        if not candidates:
            raise GeminiSchemaError("Gemini returned empty candidate response")

        first_part = candidates[0].get("content", {}).get("parts", [{}])[0]
        raw_text = first_part.get("text", "")
        clean_text = clean_markdown_json(raw_text)
        parsed_data = json.loads(clean_text)
    except (json.JSONDecodeError, KeyError, IndexError) as exc:
        raise GeminiSchemaError(f"Failed to parse Gemini output: {exc}") from exc

    return sanitize_generated_challenge(parsed_data, request)
