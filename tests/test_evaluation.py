"""Comprehensive unit tests for the code review evaluation engine."""

import time

import pytest

from backend.models.challenge import Challenge
from backend.seed.challenges import CHALLENGES_DATA
from backend.services.evaluation_service import (
    EvaluationInput,
    EvaluationResult,
    evaluate_review,
    find_contiguous_blocks,
    get_tolerated_lines,
    is_keyword_matched,
    normalize_flagged_lines,
)


@pytest.fixture
def sample_rce_challenge() -> dict:
    """Fixture returning a sample challenge with a multi-line RCE defect."""
    return {
        "slug": "agent-unsanitized-exec",
        "title": "Unsanitized Autonomous Calculator Tool Execution",
        "expected_issues": [
            {
                "id": "crit-rce-eval",
                "title": "Arbitrary Code Execution via Unsanitized eval()",
                "severity": "critical",
                "lines": [27, 28, 29, 30, 31],
                "keywords": [
                    "eval",
                    "exec",
                    "rce",
                    "remote code execution",
                    "builtins",
                    "ast",
                    "arbitrary code",
                ],
                "explanation": (
                    "Using python's built-in eval() on unvalidated input permits "
                    "Remote Code Execution."
                ),
            }
        ],
    }


@pytest.fixture
def multi_defect_challenge() -> dict:
    """Fixture returning a challenge with multiple distinct defects."""
    return {
        "slug": "multi-defect-challenge",
        "title": "Multi-Defect Vulnerable Endpoint",
        "expected_issues": [
            {
                "id": "defect-auth-bypass",
                "title": "Broken Authentication Logic",
                "severity": "critical",
                "lines": [10, 11, 12],
                "keywords": ["auth", "token", "bypass", "signature"],
                "explanation": "Missing JWT signature verification.",
            },
            {
                "id": "defect-sql-injection",
                "title": "SQL Injection in User Lookup",
                "severity": "high",
                "lines": [35, 36],
                "keywords": ["sql injection", "parameterized", "raw query"],
                "explanation": "Unescaped string formatting in SQL statement.",
            },
        ],
    }


# ==============================================================================
# 1. 100% Score Test
# ==============================================================================


def test_evaluate_review_perfect_score(sample_rce_challenge: dict):
    """Test 100% score when correct lines are flagged and defect concepts explained."""
    flagged_lines = [27, 28, 29, 30, 31]
    comments = (
        "Direct invocation of eval allows remote code execution (RCE). "
        "We should use ast.literal_eval or sanitize the input."
    )

    result = evaluate_review(
        challenge=sample_rce_challenge,
        flagged_lines=flagged_lines,
        user_comments=comments,
    )

    assert isinstance(result, EvaluationResult)
    assert result.score == 100
    assert result.line_precision_score == 100.0
    assert result.concept_score == 100.0
    assert result.false_positive_penalty == 0.0
    assert result.false_positive_lines == []
    assert len(result.detected_issues) == 1
    assert len(result.missed_issues) == 0

    detected = result.detected_issues[0]
    assert detected.id == "crit-rce-eval"
    assert detected.line_score == 1.0
    assert detected.concept_score == 1.0
    assert "eval" in detected.matched_keywords
    assert (
        "rce" in detected.matched_keywords
        or "remote code execution" in detected.matched_keywords
    )

    assert "Outstanding review" in result.summary
    assert "✓ Arbitrary Code Execution" in result.critique


def test_evaluate_review_perfect_score_with_subset_of_block(
    sample_rce_challenge: dict,
):
    """Flagging the core line (e.g. line 28) of a multi-line block achieves 100%."""
    result = evaluate_review(
        challenge=sample_rce_challenge,
        flagged_lines=[28],
        user_comments="Insecure eval creates an RCE vulnerability on the server.",
    )

    assert result.score == 100
    assert result.line_precision_score == 100.0
    assert result.concept_score == 100.0
    assert len(result.detected_issues) == 1
    assert result.detected_issues[0].matched_lines == [28]


# ==============================================================================
# 2. Partial Score Tests
# ==============================================================================


def test_evaluate_review_partial_score_correct_lines_no_comments(
    sample_rce_challenge: dict,
):
    """Flagging correct lines with no comments earns 50% (line precision only)."""
    result = evaluate_review(
        challenge=sample_rce_challenge,
        flagged_lines=[28, 29],
        user_comments="",
    )

    assert result.score == 50
    assert result.line_precision_score == 100.0
    assert result.concept_score == 0.0
    assert result.false_positive_penalty == 0.0
    assert len(result.detected_issues) == 1
    assert len(result.missed_issues) == 0
    assert "Satisfactory review" in result.summary


def test_evaluate_review_partial_score_single_keyword_match(
    sample_rce_challenge: dict,
):
    """Matching 1 of required keywords gives partial concept score (75% total)."""
    result = evaluate_review(
        challenge=sample_rce_challenge,
        flagged_lines=[28],
        user_comments="This line uses eval.",
    )

    # Line precision = 100 (50 pts), concept = 50% (25 pts) -> 75% total
    assert result.score == 75
    assert result.line_precision_score == 100.0
    assert result.concept_score == 50.0
    assert result.detected_issues[0].matched_keywords == ["eval"]


def test_evaluate_review_partial_score_multi_defect(
    multi_defect_challenge: dict,
):
    """Detecting only 1 of 2 expected defects earns a proportional partial score."""
    # Only detect the auth bypass at lines 10-12
    result = evaluate_review(
        challenge=multi_defect_challenge,
        flagged_lines=[10, 11],
        user_comments="Token signature bypass allows broken authentication.",
    )

    # 1 of 2 defects found with full line & concept -> 50% total
    assert result.score == 50
    assert result.line_precision_score == 50.0
    assert result.concept_score == 50.0
    assert len(result.detected_issues) == 1
    assert result.detected_issues[0].id == "defect-auth-bypass"
    assert len(result.missed_issues) == 1
    assert result.missed_issues[0].id == "defect-sql-injection"
    assert "Missed Defects:" in result.critique


# ==============================================================================
# 3. Wrong Line Tests
# ==============================================================================


def test_evaluate_review_wrong_line(sample_rce_challenge: dict):
    """Flagging clean lines far from defect misses the defect and adds penalties."""
    result = evaluate_review(
        challenge=sample_rce_challenge,
        flagged_lines=[5, 6],
        user_comments="I think line 5 is bad.",
    )

    assert result.score == 0
    assert result.line_precision_score == 0.0
    assert len(result.detected_issues) == 0
    assert len(result.missed_issues) == 1
    assert result.missed_issues[0].id == "crit-rce-eval"
    assert result.false_positive_lines == [5, 6]
    assert result.false_positive_penalty == 30.0
    assert "No defects identified" in result.summary


def test_evaluate_review_wrong_line_with_relevant_comment(
    sample_rce_challenge: dict,
):
    """Correct explanation but completely wrong lines flagged penalizes score."""
    result = evaluate_review(
        challenge=sample_rce_challenge,
        flagged_lines=[5],
        user_comments="eval allows arbitrary code execution (RCE).",
    )

    # Line precision = 0, concept = 100 (50 pts), penalty for line 5 (-15 pts) -> 35
    assert result.score == 35
    assert result.line_precision_score == 0.0
    assert result.concept_score == 100.0
    assert result.false_positive_penalty == 15.0
    assert result.false_positive_lines == [5]
    assert len(result.detected_issues) == 0
    assert len(result.missed_issues) == 1


# ==============================================================================
# 4. Line Tolerance Tests (+/- 1 line tolerance for multi-line blocks)
# ==============================================================================


def test_evaluate_review_multi_line_tolerance_bounds(sample_rce_challenge: dict):
    """Multi-line blocks [27..31] accept lines 26 (-1) and 32 (+1) without penalty."""
    # Line 26 is 1 line before block start (27)
    res_before = evaluate_review(
        challenge=sample_rce_challenge,
        flagged_lines=[26],
        user_comments="eval allows RCE execution.",
    )
    assert res_before.score == 100
    assert res_before.false_positive_lines == []
    assert len(res_before.detected_issues) == 1

    # Line 32 is 1 line after block end (31)
    res_after = evaluate_review(
        challenge=sample_rce_challenge,
        flagged_lines=[32],
        user_comments="eval allows RCE execution.",
    )
    assert res_after.score == 100
    assert res_after.false_positive_lines == []
    assert len(res_after.detected_issues) == 1


def test_evaluate_review_outside_tolerance_is_false_positive(
    sample_rce_challenge: dict,
):
    """Line 25 (2 lines before block start 27) is outside tolerance."""
    res_outside = evaluate_review(
        challenge=sample_rce_challenge,
        flagged_lines=[25],
        user_comments="eval allows RCE execution.",
    )
    # Outside tolerance -> missed defect, line 25 is false positive
    assert res_outside.line_precision_score == 0.0
    assert res_outside.false_positive_lines == [25]
    assert len(res_outside.detected_issues) == 0


def test_single_line_defect_requires_exact_match():
    """Single line defects require exact line matching by default."""
    challenge = {
        "expected_issues": [
            {
                "id": "single-line-defect",
                "title": "Single Line Flaw",
                "severity": "medium",
                "lines": [15],
                "keywords": ["flaw"],
            }
        ]
    }
    # Exact line matches
    res_exact = evaluate_review(challenge, flagged_lines=[15], user_comments="flaw")
    assert res_exact.score == 100
    assert len(res_exact.detected_issues) == 1

    # Adjacent line (14) is not tolerated for single-line defects
    res_adjacent = evaluate_review(challenge, flagged_lines=[14], user_comments="flaw")
    assert res_adjacent.line_precision_score == 0.0
    assert res_adjacent.false_positive_lines == [14]


# ==============================================================================
# 5. False Positive Penalty Tests
# ==============================================================================


def test_evaluate_review_false_positive_penalties(sample_rce_challenge: dict):
    """Flagging clean lines alongside correct lines applies 15 pt penalty per line."""
    result = evaluate_review(
        challenge=sample_rce_challenge,
        flagged_lines=[28, 3, 7],  # 28 is valid; 3 and 7 are clean lines
        user_comments="eval allows RCE on host environment.",
    )

    # Base score = 100. Penalty = 2 clean lines * 15 = 30 points. Final = 70.
    assert result.score == 70
    assert result.line_precision_score == 100.0
    assert result.concept_score == 100.0
    assert result.false_positive_penalty == 30.0
    assert result.false_positive_lines == [3, 7]
    assert len(result.detected_issues) == 1
    assert "Penalty Applied: Flagged 2 clean/unrelated line(s)" in result.critique


def test_evaluate_review_mass_false_positives_clamp_to_zero(
    sample_rce_challenge: dict,
):
    """Extreme false positives cannot reduce score below 0 (normalization)."""
    # 10 clean lines flagged = 150 points penalty
    clean_lines = list(range(1, 11))
    result = evaluate_review(
        challenge=sample_rce_challenge,
        flagged_lines=[28, *clean_lines],
        user_comments="eval allows RCE.",
    )

    assert result.score == 0
    assert result.false_positive_penalty == 150.0


# ==============================================================================
# 6. Empty and Edge Case Inputs
# ==============================================================================


def test_evaluate_review_empty_inputs(sample_rce_challenge: dict):
    """Empty flagged lines and comments yield score 0 without exceptions."""
    result = evaluate_review(
        challenge=sample_rce_challenge,
        flagged_lines=[],
        user_comments="",
    )

    assert result.score == 0
    assert result.line_precision_score == 0.0
    assert result.concept_score == 0.0
    assert result.false_positive_penalty == 0.0
    assert result.false_positive_lines == []
    assert len(result.detected_issues) == 0
    assert len(result.missed_issues) == 1
    assert "No defects identified" in result.summary


def test_evaluate_review_none_inputs(sample_rce_challenge: dict):
    """None flagged lines and comments are treated gracefully as empty."""
    result = evaluate_review(
        challenge=sample_rce_challenge,
        flagged_lines=None,
        user_comments=None,
    )

    assert result.score == 0
    assert len(result.missed_issues) == 1


def test_evaluate_review_json_string_flagged_lines(sample_rce_challenge: dict):
    """Flagged lines passed as a JSON string are successfully decoded."""
    result = evaluate_review(
        challenge=sample_rce_challenge,
        flagged_lines='["28", "29", "30"]',
        user_comments="Dangerous eval causes RCE.",
    )

    assert result.score == 100
    assert result.detected_issues[0].matched_lines == [28, 29, 30]


def test_evaluate_review_with_evaluation_input_model(sample_rce_challenge: dict):
    """EvaluationInput model can be supplied as input_data."""
    input_data = EvaluationInput(
        challenge_slug="agent-unsanitized-exec",
        flagged_lines=[28],
        user_comments="eval causes RCE.",
    )

    result = evaluate_review(
        challenge=sample_rce_challenge,
        input_data=input_data,
    )

    assert result.score == 100
    assert len(result.detected_issues) == 1


# ==============================================================================
# 7. Latency Requirement (< 50ms per evaluation)
# ==============================================================================


def test_evaluate_review_latency_under_50ms(sample_rce_challenge: dict):
    """Evaluation execution latency must strictly be < 50ms per evaluation."""
    flagged_lines = [28, 29]
    comments = "eval produces arbitrary code execution (RCE)."

    latencies: list[float] = []
    for _ in range(50):
        t0 = time.perf_counter()
        res = evaluate_review(
            sample_rce_challenge,
            flagged_lines=flagged_lines,
            user_comments=comments,
        )
        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        latencies.append(elapsed_ms)
        assert res.execution_time_ms < 50.0

    avg_latency = sum(latencies) / len(latencies)
    max_latency = max(latencies)

    # Typically in-memory python evaluation executes in under 1ms
    assert max_latency < 50.0
    assert avg_latency < 10.0


# ==============================================================================
# 8. Real Seed Challenges Verification
# ==============================================================================


def test_evaluate_against_all_seed_challenges():
    """Verify evaluation works seamlessly against all seeded MVP challenges."""
    assert len(CHALLENGES_DATA) >= 5

    for item in CHALLENGES_DATA:
        challenge = Challenge(**item)
        expected = challenge.get_expected_issues()
        assert len(expected) >= 1

        first_defect = expected[0]
        # Simulate perfect submission for this challenge
        flagged = (
            first_defect.lines[:2]
            if len(first_defect.lines) >= 2
            else first_defect.lines
        )
        comments = f"Found defect: {' '.join(first_defect.keywords[:3])}"

        result = evaluate_review(
            challenge=challenge,
            flagged_lines=flagged,
            user_comments=comments,
        )

        assert result.score >= 80
        assert len(result.detected_issues) >= 1
        assert result.execution_time_ms < 50.0


# ==============================================================================
# 9. Helper Function Tests
# ==============================================================================


def test_find_contiguous_blocks():
    """Verify contiguous block extraction."""
    assert find_contiguous_blocks([]) == []
    assert find_contiguous_blocks([5]) == [(5, 5)]
    assert find_contiguous_blocks([1, 2, 3, 5, 6, 9]) == [(1, 3), (5, 6), (9, 9)]


def test_get_tolerated_lines():
    """Verify +/- 1 line tolerance expansion."""
    # Multi-line block: 10..12 expands to 9..13
    assert get_tolerated_lines([10, 11, 12]) == {9, 10, 11, 12, 13}
    # Single-line: 5 stays {5}
    assert get_tolerated_lines([5]) == {5}
    # Multiple blocks: [1..2, 5] -> {0, 1, 2, 3} (without 0), {5}
    assert get_tolerated_lines([1, 2, 5]) == {1, 2, 3, 5}


def test_is_keyword_matched():
    """Verify keyword matching semantics and edge cases."""
    assert is_keyword_matched("eval", "Uses eval(expr)")
    assert is_keyword_matched("rce", "This is an RCE flaw.")
    # Word boundary prevents partial false match
    assert not is_keyword_matched("ast", "faster compute")
    assert is_keyword_matched("ast", "use ast.parse")
    # Punctuated terms
    assert is_keyword_matched("text()", "Wrapped with text() call")
    assert is_keyword_matched("f-string", "f-string formatting")
    assert is_keyword_matched("cwe-89", "Refer to CWE-89 vulnerability")
    # Empty inputs
    assert not is_keyword_matched("", "Some comment")
    assert not is_keyword_matched("test", "")


def test_normalize_flagged_lines():
    """Verify robust line parsing from varied types and formats."""
    assert normalize_flagged_lines(None) == []
    assert normalize_flagged_lines("") == []
    assert normalize_flagged_lines("[]") == []
    assert normalize_flagged_lines([3, 1, 2, 2]) == [1, 2, 3]
    assert normalize_flagged_lines(["bad", None, 4]) == [4]
    assert normalize_flagged_lines("[10, 20, 30]") == [10, 20, 30]
    assert normalize_flagged_lines("line 15, 16 and 17") == [15, 16, 17]
    assert normalize_flagged_lines({5, 4, 3}) == [3, 4, 5]
    assert normalize_flagged_lines(123) == []


def test_get_tolerated_lines_empty_and_single_tolerance():
    """Verify empty lines and allow_single_line_tolerance."""
    assert get_tolerated_lines([]) == set()
    assert get_tolerated_lines([1], allow_single_line_tolerance=True) == {1, 2}
    assert get_tolerated_lines([5], allow_single_line_tolerance=True) == {4, 5, 6}


def test_is_keyword_matched_whitespace_only():
    """Verify whitespace-only keyword returns False."""
    assert not is_keyword_matched("   ", "Some comment")


def test_evaluate_review_list_comments_and_score_80_critique(
    sample_rce_challenge: dict,
):
    """User comments as list of strings and score 80-99 critique generation."""
    # Lines [27, 28] (50 pts) + 2 keywords (50 pts) - 1 clean line (15 pts) = 85 pts
    result = evaluate_review(
        challenge=sample_rce_challenge,
        flagged_lines=[27, 28, 5],
        user_comments=["eval is dangerous", "leads to rce"],
    )
    assert result.score == 85
    assert "Great review!" in result.summary


def test_evaluate_review_no_expected_defects():
    """Evaluate challenge with empty expected defects list."""
    empty_challenge = {"expected_issues": []}
    res_clean = evaluate_review(
        empty_challenge, flagged_lines=[], user_comments="Code looks fine"
    )
    assert res_clean.score == 100
    assert "No expected defects configured" in res_clean.summary

    res_with_lines = evaluate_review(empty_challenge, flagged_lines=[5, 6])
    assert res_with_lines.score == 70  # 100 - (2 * 15)


def test_extract_expected_issues_fallbacks():
    """Verify extract_expected_issues handles various object shapes and JSON strings."""
    from backend.services.evaluation_service import extract_expected_issues

    # Dict with JSON string expected_issues
    issues_json = (
        '[{"id": "issue-1", "title": "Test", "lines": [1], "keywords": ["k"]}]'
    )
    assert len(extract_expected_issues({"expected_issues": issues_json})) == 1
    assert len(extract_expected_issues({"expected_issues": "invalid-json"})) == 0
    assert len(extract_expected_issues({"expected_issues": None})) == 0

    # Custom object with expected_issues attribute
    class CustomObj:
        expected_issues = issues_json

    assert len(extract_expected_issues(CustomObj())) == 1

    class CustomObjList:
        expected_issues = [{"id": "issue-2", "lines": [2]}]

    assert len(extract_expected_issues(CustomObjList())) == 1

    class CustomObjInvalidJson:
        expected_issues = "{not json}"

    assert len(extract_expected_issues(CustomObjInvalidJson())) == 0


def test_defect_without_keywords():
    """Verify defect criterion with empty keywords list."""
    challenge = {
        "expected_issues": [
            {
                "id": "syntax-error",
                "title": "Syntax Bug",
                "lines": [5],
                "keywords": [],
            }
        ]
    }
    # Comment provided -> 100% concept score
    res = evaluate_review(challenge, flagged_lines=[5], user_comments="Found bug")
    assert res.score == 100
    assert res.concept_score == 100.0

    # No comment provided -> 0% concept score
    res_no_comment = evaluate_review(challenge, flagged_lines=[5], user_comments="")
    assert res_no_comment.score == 50
    assert res_no_comment.concept_score == 0.0
