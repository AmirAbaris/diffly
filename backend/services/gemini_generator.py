"""Gemini Challenge Generator Service.

Zero-cost, Bring Your Own Key (BYOK) challenge generation powered by Google Gemini.
User API keys are used strictly in-memory and are never stored or logged.
"""

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
from backend.services.gemini_client import (
    DEFAULT_GEMINI_MODEL as DEFAULT_GEMINI_MODEL,
)
from backend.services.gemini_client import (
    FALLBACK_GEMINI_MODELS as FALLBACK_GEMINI_MODELS,
)
from backend.services.gemini_client import (
    GEMINI_API_BASE_URL as GEMINI_API_BASE_URL,
)
from backend.services.gemini_client import (
    GeminiAPIError as GeminiAPIError,
)
from backend.services.gemini_client import (
    GeminiAuthError as GeminiAuthError,
)
from backend.services.gemini_client import (
    GeminiError as GeminiError,
)
from backend.services.gemini_client import (
    GeminiRateLimitError as GeminiRateLimitError,
)
from backend.services.gemini_client import (
    GeminiSchemaError as GeminiSchemaError,
)
from backend.services.gemini_client import (
    HttpxGeminiClient,
)
from backend.services.gemini_client import (
    clean_markdown_json as clean_markdown_json,
)


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
   - anchor_lines: Array of exact verbatim non-empty, non-comment vulnerable code lines
     copied directly from code_snippet (used to deterministically ground line numbers
     rather than counting lines blindly).
   - matched_lines: Array of 1-indexed line numbers for the defect location
     corresponding to anchor_lines.
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
                        "anchor_lines": {
                            "type": "ARRAY",
                            "items": {"type": "STRING"},
                        },
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
                        "anchor_lines",
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
_RESERVED_CHALLENGE_SLUGS = frozenset(
    {"custom", "evaluate-custom", "generate-custom", "next"}
)


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


_LINE_REF_RE = re.compile(
    r"(?i:\blines?\b)\s+\d+(?:\s*(?:[-–]|(?i:\bto\b))\s*\d+)?"
    r"(?:\s*(?:,\s*(?:(?i:\band\b)\s+|&\s+)?|\s+(?i:\band\b)\s+|\s*&\s*)"
    r"\s*\d+(?:\s*(?:[-–]|(?i:\bto\b))\s*\d+)?)*"
    r"|\bL\d+(?:\s*[-–]\s*L?\d+)?\b"
)
_LINE_RANGE_RE = re.compile(r"(\d+)\s*(?:[-–]|to)\s*L?(\d+)", re.IGNORECASE)
_HUNK_HEADER_RE = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$")


def _is_non_trivial_code_line(line: str) -> bool:
    """Return True if a code line is non-empty and not a pure comment or docstring."""
    stripped = line.strip()
    if not stripped:
        return False
    if stripped in {'"""', "'''"}:
        return False
    if (stripped.startswith('"""') and stripped.endswith('"""')) or (
        stripped.startswith("'''") and stripped.endswith("'''")
    ):
        return False
    if stripped.startswith("//"):
        return False
    if stripped.startswith("#") and not stripped.startswith(("#[", "#![")):
        return False
    if stripped.startswith("/*") and (stripped.endswith("*/") or "*/" not in stripped):
        return False
    if stripped.endswith("*/") and "/*" not in stripped:
        return False
    return stripped != "*" and not stripped.startswith("* ")


def _pick_closest_line(candidates: list[int], hint_lines: list[int]) -> int:
    """Pick the candidate line closest to hint_lines, breaking ties by line number."""
    if not hint_lines:
        return candidates[0]
    return min(
        candidates,
        key=lambda ln: (min(abs(ln - h) for h in hint_lines), ln),
    )


def _match_anchor_in_code(
    anchor: str,
    code_lines: list[str],
    hint_lines: list[int],
) -> int | None:
    """Match a non-trivial anchor string to a 1-indexed non-trivial code line."""
    anchor_stripped = anchor.strip()
    if not anchor_stripped or not _is_non_trivial_code_line(anchor_stripped):
        return None

    non_trivial = [
        (ln, line)
        for ln, line in enumerate(code_lines, start=1)
        if _is_non_trivial_code_line(line)
    ]
    if not non_trivial:
        return None

    exact_matches = [ln for ln, line in non_trivial if line.strip() == anchor_stripped]
    if exact_matches:
        return _pick_closest_line(exact_matches, hint_lines)

    norm_anchor = " ".join(anchor_stripped.split())
    norm_matches = [
        ln for ln, line in non_trivial if " ".join(line.split()) == norm_anchor
    ]
    if norm_matches:
        return _pick_closest_line(norm_matches, hint_lines)

    if len(anchor_stripped) >= 8 or len(norm_anchor) >= 8:
        substr_matches = [
            ln
            for ln, line in non_trivial
            if anchor_stripped in line.strip()
            or norm_anchor in " ".join(line.split())
            or (len(line.strip()) >= 8 and line.strip() in anchor_stripped)
        ]
        if substr_matches:
            return _pick_closest_line(substr_matches, hint_lines)

    return None


def _resolve_lines_from_anchors(
    anchors: list[str],
    code_lines: list[str],
    hint_lines: list[int],
) -> list[int]:
    """Resolve sorted unique 1-indexed line numbers from anchor strings."""
    resolved: list[int] = []
    for entry in anchors:
        for sub_line in str(entry).splitlines():
            matched = _match_anchor_in_code(sub_line, code_lines, hint_lines)
            if matched is not None and matched not in resolved:
                resolved.append(matched)
    return sorted(resolved)


def _extract_diff_removed_lines(diff_text: str) -> list[str]:
    """Extract non-trivial removed lines from a unified diff."""
    if not diff_text:
        return []
    removed: list[str] = []
    for line in diff_text.splitlines():
        if line.startswith("-") and not line.startswith("---"):
            content = line[1:]
            if _is_non_trivial_code_line(content):
                removed.append(content)
    return removed


def _extract_hint_line_numbers(raw_lines: list[Any]) -> list[int]:
    """Extract positive integer line hints from raw matched_lines without clamping."""
    hints: list[int] = []
    for ln in raw_lines:
        if not isinstance(ln, bool) and isinstance(ln, (int, str)):
            token = str(ln).strip()
            if token.isdigit():
                val = int(token)
                if val >= 1:
                    hints.append(val)
    return hints


def _filter_diff_matches_for_defect(
    diff_matches: list[int],
    code_lines: list[str],
    keywords: list[str],
    hint_lines: list[int],
) -> list[int]:
    """Filter multi-defect diff matches to those belonging to a single defect."""
    clean_kws = [
        kw.strip().lower()
        for kw in keywords
        if isinstance(kw, str) and len(kw.strip()) > 2
    ]
    if clean_kws:
        kw_matches = [
            ln
            for ln in diff_matches
            if any(kw in code_lines[ln - 1].lower() for kw in clean_kws)
        ]
        if kw_matches:
            return kw_matches

    if hint_lines:
        min_dist = min(min(abs(ln - h) for h in hint_lines) for ln in diff_matches)
        return [
            ln
            for ln in diff_matches
            if min(abs(ln - h) for h in hint_lines) == min_dist
        ]

    return []


def _resolve_valid_lines(
    item: dict[str, Any],
    code_lines: list[str],
    line_count: int,
    defect_index: int,
    diff_removed_lines: list[str] | None = None,
    total_defects: int = 1,
) -> list[int]:
    """Resolve 1-indexed defect lines using anchors, diff lines, or keywords."""
    raw_lines = item.get("matched_lines") or item.get("lines") or []
    if not isinstance(raw_lines, list):
        raw_lines = [raw_lines] if isinstance(raw_lines, (int, str)) else []
    hint_lines = _extract_hint_line_numbers(raw_lines)

    raw_anchors = (
        item.get("anchor_lines")
        or item.get("target_lines")
        or item.get("code_anchors")
        or []
    )
    if isinstance(raw_anchors, str):
        raw_anchors = [raw_anchors]
    elif not isinstance(raw_anchors, list):
        raw_anchors = []

    if raw_anchors:
        anchor_matches = _resolve_lines_from_anchors(
            [str(a) for a in raw_anchors if a is not None],
            code_lines,
            hint_lines,
        )
        if anchor_matches:
            return anchor_matches

    valid_lines = list(
        dict.fromkeys(
            ln
            for ln in hint_lines
            if 1 <= ln <= line_count and _is_non_trivial_code_line(code_lines[ln - 1])
        )
    )

    keywords = item.get("matched_keywords") or item.get("keywords") or []
    if not isinstance(keywords, list):
        keywords = []

    if not valid_lines and diff_removed_lines:
        diff_matches = _resolve_lines_from_anchors(
            diff_removed_lines, code_lines, hint_lines
        )
        if diff_matches:
            if total_defects == 1:
                valid_lines = diff_matches
            else:
                valid_lines = _filter_diff_matches_for_defect(
                    diff_matches, code_lines, keywords, hint_lines
                )

    if not valid_lines and keywords:
        for ln_idx, line_str in enumerate(code_lines, start=1):
            if not _is_non_trivial_code_line(line_str):
                continue
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


def _format_line_reference(lines: list[int]) -> str:
    """Format resolved 1-indexed line numbers as 'line N' or 'lines A, B'."""
    sorted_lines = sorted(set(lines))
    if len(sorted_lines) == 1:
        return f"line {sorted_lines[0]}"
    return f"lines {', '.join(str(ln) for ln in sorted_lines)}"


def _extract_referenced_line_numbers(ref_text: str) -> set[int]:
    """Expand a line reference substring (including ranges) into a set of ints."""
    nums: set[int] = set()
    remainder = ref_text

    def _collect_range(match: re.Match[str]) -> str:
        start = int(match.group(1))
        end = int(match.group(2))
        if start <= end and end - start <= 1000:
            nums.update(range(start, end + 1))
        else:
            nums.update((start, end))
        return " "

    remainder = _LINE_RANGE_RE.sub(_collect_range, remainder)
    for token in re.findall(r"\d+", remainder):
        nums.add(int(token))
    return nums


def _align_tier3_hint(text: str, all_resolved_lines: list[int]) -> str:
    """Replace stale explicit line references in Tier 3 hints with resolved lines."""
    if not text or not all_resolved_lines:
        return text

    matches = list(_LINE_REF_RE.finditer(text))
    if not matches:
        return text

    resolved_set = set(all_resolved_lines)
    match_sets = [_extract_referenced_line_numbers(m.group(0)) for m in matches]
    all_referenced = set().union(*match_sets)
    if all_referenced == resolved_set:
        return text

    formatted = _format_line_reference(all_resolved_lines)
    replace_flags = [
        len(matches) == 1 or not ref_set.issubset(resolved_set)
        for ref_set in match_sets
    ]
    if not any(replace_flags):
        replace_flags = [True] * len(matches)

    parts: list[str] = []
    cursor = 0
    for match, should_replace in zip(matches, replace_flags, strict=True):
        parts.append(text[cursor : match.start()])
        if should_replace:
            replacement = (
                formatted[0].upper() + formatted[1:]
                if match.group(0)[:1].isupper()
                else formatted
            )
            parts.append(replacement)
        else:
            parts.append(match.group(0))
        cursor = match.end()
    parts.append(text[cursor:])
    return "".join(parts)


def _find_sequence_in_code(
    needle: list[str],
    code_lines: list[str],
    old_start: int,
) -> int | None:
    """Find 1-indexed start line where needle lines match contiguously in code_lines."""
    if not needle or len(needle) > len(code_lines):
        return None

    span = len(needle)
    limit = len(code_lines) - span + 1

    exact_hits = [
        idx + 1
        for idx in range(limit)
        if all(
            code_lines[idx + offset].strip() == needle[offset].strip()
            for offset in range(span)
        )
    ]
    if exact_hits:
        return _pick_closest_line(exact_hits, [old_start])

    norm_needle = [" ".join(line.split()) for line in needle]
    norm_hits = [
        idx + 1
        for idx in range(limit)
        if all(
            " ".join(code_lines[idx + offset].split()) == norm_needle[offset]
            for offset in range(span)
        )
    ]
    if norm_hits:
        return _pick_closest_line(norm_hits, [old_start])

    return None


def _find_hunk_match_start(
    old_lines: list[str],
    removed_lines: list[str],
    code_lines: list[str],
    old_start: int,
) -> int | None:
    """Locate actual 1-indexed start line for a diff hunk in code_lines."""
    seq_match = _find_sequence_in_code(old_lines, code_lines, old_start)
    if seq_match is not None:
        return seq_match

    if not removed_lines:
        return None

    rem_seq_match = _find_sequence_in_code(removed_lines, code_lines, old_start)
    if rem_seq_match is not None:
        return rem_seq_match

    matched_positions = [
        pos
        for rem in removed_lines
        if (pos := _match_anchor_in_code(rem, code_lines, [old_start])) is not None
    ]
    if matched_positions:
        return min(matched_positions)

    return None


def _realign_diff_hunk_headers(diff_text: str, code_lines: list[str]) -> str:
    """Rewrite drifted @@ hunk headers when old-side lines match elsewhere in code."""
    if not diff_text or not code_lines or "@@" not in diff_text:
        return diff_text

    diff_lines = diff_text.splitlines()
    output_lines: list[str] = []
    idx = 0

    while idx < len(diff_lines):
        line = diff_lines[idx]
        header_match = _HUNK_HEADER_RE.match(line)
        if not header_match:
            output_lines.append(line)
            idx += 1
            continue

        old_start = int(header_match.group(1))
        old_count = int(header_match.group(2) or "1")
        new_start = int(header_match.group(3))
        trailing = header_match.group(5)

        hunk_body: list[str] = []
        idx += 1
        while idx < len(diff_lines) and not _HUNK_HEADER_RE.match(diff_lines[idx]):
            hunk_body.append(diff_lines[idx])
            idx += 1

        old_lines = [ln[1:] for ln in hunk_body if ln.startswith((" ", "-"))]
        removed_lines = [ln[1:] for ln in hunk_body if ln.startswith("-")]
        new_lines = [ln[1:] for ln in hunk_body if ln.startswith((" ", "+"))]

        match_start = _find_hunk_match_start(
            old_lines, removed_lines, code_lines, old_start
        )
        window_end = old_start + max(old_count, 1) - 1
        if match_start is not None and not (old_start <= match_start <= window_end):
            delta = new_start - old_start
            actual_old_start = match_start
            actual_old_count = len(old_lines)
            actual_new_start = max(1, match_start + delta)
            actual_new_count = len(new_lines)
            line = (
                f"@@ -{actual_old_start},{actual_old_count} "
                f"+{actual_new_start},{actual_new_count} @@{trailing}"
            )

        output_lines.append(line)
        output_lines.extend(hunk_body)

    return "\n".join(output_lines)


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

    raw_slug = str(raw_data.get("slug") or "").strip().lower()
    slug = re.sub(r"[^a-z0-9]+", "-", raw_slug).strip("-")[:128].strip("-")
    if not slug:
        title = str(raw_data.get("title") or request.topic).lower()
        slug = re.sub(r"[^a-z0-9]+", "-", title).strip("-")[:128].strip("-")
    if not slug or slug.isdigit() or slug in _RESERVED_CHALLENGE_SLUGS:
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

    diff_removed_lines = _extract_diff_removed_lines(recommended_fix_diff)
    raw_issue_dicts = [item for item in raw_expected if isinstance(item, dict)]
    total_defects = len(raw_issue_dicts)

    expected_issues: list[DefectCriterion] = []
    for idx, item in enumerate(raw_issue_dicts, start=1):
        valid_lines = _resolve_valid_lines(
            item,
            code_lines,
            line_count,
            idx,
            diff_removed_lines=diff_removed_lines,
            total_defects=total_defects,
        )

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

    if recommended_fix_diff:
        recommended_fix_diff = _realign_diff_hunk_headers(
            recommended_fix_diff, code_lines
        )

    all_resolved_lines = sorted({ln for issue in expected_issues for ln in issue.lines})

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
            if tier == 3 and text:
                text = _align_tier3_hint(text, all_resolved_lines)
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
        3: (
            f"Focus on {_format_line_reference(expected_issues[0].lines)} "
            "for the primary defect."
        ),
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

    prompt = build_generation_prompt(
        topic=request.topic,
        language=request.language,
        difficulty=request.difficulty,
    )
    response_schema = get_response_schema()

    owns_client = client is None
    http_client = client or httpx.AsyncClient(timeout=30.0)
    gemini_client = HttpxGeminiClient(http_client=http_client)

    try:
        for attempt in range(_MAX_SCHEMA_ATTEMPTS):
            try:
                parsed_data = await gemini_client.generate_json(
                    prompt=prompt,
                    response_schema=response_schema,
                    api_key=api_key,
                    model=model,
                    temperature=0.2,
                    fallback_models=FALLBACK_GEMINI_MODELS,
                )
                return sanitize_generated_challenge(parsed_data, request)
            except GeminiSchemaError:
                if attempt == _MAX_SCHEMA_ATTEMPTS - 1:
                    raise
    finally:
        if owns_client:
            await http_client.aclose()

    raise GeminiSchemaError("Failed to generate valid challenge schema")
