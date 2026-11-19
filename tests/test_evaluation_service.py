"""Regression tests for evaluation exploits, scoring smoothing, and edge cases."""

from backend.models.challenge import Category, Challenge, Difficulty, Language
from backend.services.evaluation_service import evaluate_review


def _make_challenge_dict(expected_issues: list[dict]) -> dict:
    return {
        "slug": "eval-exploit-test",
        "title": "Evaluation Exploit Test Challenge",
        "expected_issues": expected_issues,
    }


def test_missed_issues_gated_on_first_failed_attempt():
    """Attempt 1 below passing threshold redacts spoiler fields and critique lines."""
    challenge = _make_challenge_dict(
        [
            {
                "id": "sqli-1",
                "title": "SQL Injection",
                "severity": "critical",
                "lines": [12, 13],
                "keywords": ["sql", "parameterized", "interpolation"],
                "explanation": "Unsanitized user input concatenated into SQL query.",
            }
        ]
    )

    result = evaluate_review(
        challenge=challenge,
        flagged_lines=[],
        user_comments="dummy",
        attempt_number=1,
    )

    assert result.score == 0
    assert len(result.missed_issues) == 1
    missed = result.missed_issues[0]
    assert missed.id == "sqli-1"
    assert missed.title == "SQL Injection"
    assert missed.severity == "critical"
    assert missed.expected_lines == []
    assert missed.missing_keywords == []
    assert missed.explanation == ""
    assert "Expected line" not in result.critique
    assert "Root Cause:" not in result.critique
    assert "12" not in result.critique


def test_missed_issues_revealed_when_threshold_passed():
    """Submission scoring >= pass_threshold reveals missed issue details."""
    challenge = _make_challenge_dict(
        [
            {
                "id": "d1",
                "title": "Eval RCE",
                "severity": "critical",
                "lines": [10, 11],
                "keywords": ["eval", "rce"],
                "explanation": "eval executes arbitrary code.",
            },
            {
                "id": "d2",
                "title": "Missing Auth",
                "severity": "high",
                "lines": [20, 21],
                "keywords": ["auth", "token"],
                "explanation": "Endpoint lacks authentication.",
            },
        ]
    )

    # 1 of 2 defects earns 50/100 (< 80), so pass_threshold=50 tests unlock.
    result = evaluate_review(
        challenge=challenge,
        flagged_lines=[10],
        user_comments="eval causes rce",
        attempt_number=1,
        pass_threshold=50,
    )

    assert result.score == 50
    assert len(result.missed_issues) == 1
    missed = result.missed_issues[0]
    assert missed.expected_lines == [20, 21]
    assert missed.missing_keywords == ["auth", "token"]
    assert missed.explanation == "Endpoint lacks authentication."
    assert "Expected line(s): 20, 21" in result.critique


def test_missed_issues_revealed_when_attempts_exhausted_or_explicit_reveal():
    """Exhausting max_attempts or passing reveal_solution=True unlocks details."""
    challenge = _make_challenge_dict(
        [
            {
                "id": "d1",
                "title": "Path Traversal",
                "severity": "high",
                "lines": [8, 9],
                "keywords": ["traversal", "realpath"],
                "explanation": "User path is joined without normalization.",
            }
        ]
    )

    res_exhausted = evaluate_review(
        challenge=challenge,
        flagged_lines=[],
        user_comments="wrong guess",
        attempt_number=3,
        max_attempts=3,
    )
    assert res_exhausted.missed_issues[0].expected_lines == [8, 9]
    assert res_exhausted.missed_issues[0].missing_keywords == ["traversal", "realpath"]
    assert (
        res_exhausted.missed_issues[0].explanation
        == "User path is joined without normalization."
    )

    res_revealed = evaluate_review(
        challenge=challenge,
        flagged_lines=[],
        user_comments="wrong guess",
        attempt_number=1,
        reveal_solution=True,
    )
    assert res_revealed.missed_issues[0].expected_lines == [8, 9]
    assert res_revealed.missed_issues[0].missing_keywords == ["traversal", "realpath"]


def test_keyword_stuffing_with_no_flagged_lines_scores_zero():
    """Submitting buzzwords with flagged_lines=[] cannot earn 50/100."""
    challenge = _make_challenge_dict(
        [
            {
                "id": "rce",
                "title": "RCE",
                "severity": "critical",
                "lines": [15, 16],
                "keywords": ["eval", "rce", "arbitrary code"],
                "explanation": "Unsafe eval.",
            }
        ]
    )

    result = evaluate_review(
        challenge=challenge,
        flagged_lines=[],
        user_comments="eval rce arbitrary code sql injection auth bypass xss ssrf",
    )

    assert result.score == 0
    assert result.line_precision_score == 0.0
    assert result.concept_score == 0.0
    assert len(result.detected_issues) == 0


def test_keyword_stuffing_on_missed_defect_in_multi_defect_challenge():
    """Matching defect B keywords without flagging near B earns no credit for B."""
    challenge = _make_challenge_dict(
        [
            {
                "id": "d1",
                "title": "Auth Bypass",
                "severity": "critical",
                "lines": [5, 6],
                "keywords": ["auth", "bypass"],
                "explanation": "Missing auth check.",
            },
            {
                "id": "d2",
                "title": "SQL Injection",
                "severity": "high",
                "lines": [40, 41],
                "keywords": ["sql", "injection"],
                "explanation": "Raw SQL interpolation.",
            },
        ]
    )

    result = evaluate_review(
        challenge=challenge,
        flagged_lines=[5],
        user_comments="auth bypass sql injection",
    )

    assert result.score == 50
    assert result.line_precision_score == 50.0
    assert result.concept_score == 50.0
    assert [issue.id for issue in result.detected_issues] == ["d1"]
    assert [issue.id for issue in result.missed_issues] == ["d2"]


def test_single_line_off_by_one_gets_partial_credit_without_fp_penalty():
    """Flagging L+/-1 on single-line defect gets 0.5 line_score without FP penalty."""
    challenge = _make_challenge_dict(
        [
            {
                "id": "single-1",
                "title": "Hardcoded Secret",
                "severity": "high",
                "lines": [20],
                "keywords": ["secret", "hardcoded"],
                "explanation": "API secret hardcoded in source.",
            }
        ]
    )

    res_before = evaluate_review(
        challenge=challenge,
        flagged_lines=[19],
        user_comments="hardcoded secret in config",
    )
    assert res_before.false_positive_lines == []
    assert res_before.false_positive_penalty == 0.0
    assert res_before.line_precision_score == 50.0
    assert res_before.concept_score == 100.0
    assert res_before.score == 75
    assert len(res_before.detected_issues) == 1
    assert res_before.detected_issues[0].line_score == 0.5

    res_after = evaluate_review(
        challenge=challenge,
        flagged_lines=[21],
        user_comments="hardcoded secret in config",
    )
    assert res_after.score == 75
    assert res_after.false_positive_lines == []

    # Two lines away is still a full miss + FP penalty
    res_far = evaluate_review(
        challenge=challenge,
        flagged_lines=[18],
        user_comments="hardcoded secret in config",
    )
    assert res_far.score == 0
    assert res_far.false_positive_lines == [18]
    assert res_far.false_positive_penalty == 15.0


def test_overlapping_defects_enforces_one_to_one_matching():
    """One flagged line cannot credit two overlapping defects."""
    challenge = _make_challenge_dict(
        [
            {
                "id": "d1",
                "title": "Auth Check Missing",
                "severity": "high",
                "lines": [10, 11],
                "keywords": ["auth", "session"],
                "explanation": "Auth missing.",
            },
            {
                "id": "d2",
                "title": "SQL Injection",
                "severity": "critical",
                "lines": [12, 13],
                "keywords": ["sql", "query"],
                "explanation": "SQLi on line 12.",
            },
        ]
    )

    # Line 11 is in d1 exact and d2 tolerated (12 - 1), must only match ONE defect.
    res_single = evaluate_review(
        challenge=challenge,
        flagged_lines=[11],
        user_comments="auth session sql query",
    )
    assert len(res_single.detected_issues) == 1
    assert len(res_single.missed_issues) == 1
    assert res_single.line_precision_score == 50.0
    assert res_single.concept_score == 50.0
    assert res_single.score == 50
    assert res_single.false_positive_lines == []

    # Flagging [10, 12] matches both defects 1-to-1 even though 12 is in d1's tolerance.
    res_both = evaluate_review(
        challenge=challenge,
        flagged_lines=[10, 12],
        user_comments="auth session and sql query injection",
    )
    assert len(res_both.detected_issues) == 2
    assert len(res_both.missed_issues) == 0
    assert res_both.score == 100


def test_identical_line_defects_cannot_double_count_single_flag():
    """Two defects sharing the same line cannot both match one flagged line."""
    challenge = _make_challenge_dict(
        [
            {
                "id": "d1",
                "title": "XSS",
                "severity": "high",
                "lines": [15],
                "keywords": ["xss"],
                "explanation": "Reflected XSS.",
            },
            {
                "id": "d2",
                "title": "CSRF",
                "severity": "medium",
                "lines": [15],
                "keywords": ["csrf"],
                "explanation": "Missing CSRF token.",
            },
        ]
    )

    res = evaluate_review(
        challenge=challenge,
        flagged_lines=[15],
        user_comments="xss and csrf",
    )
    assert len(res.detected_issues) == 1
    assert len(res.missed_issues) == 1
    assert res.score == 50


def test_empty_expected_issues_returns_zero():
    """Challenge with expected_issues=[] must return score 0 rather than 100."""
    challenge = _make_challenge_dict([])

    res_empty = evaluate_review(challenge, flagged_lines=[], user_comments="lgtm")
    assert res_empty.score == 0
    assert res_empty.line_precision_score == 0.0
    assert res_empty.concept_score == 0.0

    res_flagged = evaluate_review(challenge, flagged_lines=[1], user_comments="bug")
    assert res_flagged.score == 0


def test_defect_with_empty_lines_does_not_cap_score_below_100():
    """Defects without configured lines score via keywords without capping < 100."""
    challenge = _make_challenge_dict(
        [
            {
                "id": "lined",
                "title": "Command Injection",
                "severity": "critical",
                "lines": [10, 11],
                "keywords": ["subprocess", "shell"],
                "explanation": "shell=True enables command injection.",
            },
            {
                "id": "lineless",
                "title": "Missing Rate Limit",
                "severity": "medium",
                "lines": [],
                "keywords": ["rate limit", "brute force"],
                "explanation": "Endpoint lacks rate limiting.",
            },
        ]
    )

    res_perfect = evaluate_review(
        challenge=challenge,
        flagged_lines=[10],
        user_comments=(
            "subprocess with shell=True and missing rate limit for brute force"
        ),
    )
    assert res_perfect.score == 100
    assert len(res_perfect.detected_issues) == 2
    assert len(res_perfect.missed_issues) == 0

    # Vacuous defect with lines=[] and keywords=[] cannot award free credit.
    vacuous = _make_challenge_dict(
        [
            {
                "id": "vacuous",
                "title": "Empty Defect",
                "severity": "low",
                "lines": [],
                "keywords": [],
                "explanation": "",
            }
        ]
    )
    res_vacuous = evaluate_review(vacuous, flagged_lines=[], user_comments="anything")
    assert res_vacuous.score == 0


def test_challenge_cached_getters_return_defensive_copies():
    """Mutating get_expected_issues() or get_hints() must not corrupt cached state."""
    challenge = Challenge(
        slug="defensive-copy-test",
        title="Defensive Copy Test",
        difficulty=Difficulty.EASY,
        category=Category.SECURITY,
        language=Language.PYTHON,
        description="Test challenge",
        code_snippet="x = eval(input())",
        expected_issues=[
            {
                "id": "eval-1",
                "title": "Unsafe eval",
                "severity": "critical",
                "lines": [1],
                "keywords": ["eval"],
                "explanation": "Unsafe eval call",
            }
        ],
        hints=[{"tier": 1, "label": "Clue", "text": "Check line 1"}],
    )

    issues_first = challenge.get_expected_issues()
    issues_first[0].title = "MUTATED"
    issues_first[0].lines.append(999)
    issues_first.clear()

    issues_second = challenge.get_expected_issues()
    assert len(issues_second) == 1
    assert issues_second[0].title == "Unsafe eval"
    assert issues_second[0].lines == [1]

    hints_first = challenge.get_hints()
    hints_first[0].text = "MUTATED HINT"
    hints_first.clear()

    hints_second = challenge.get_hints()
    assert len(hints_second) == 1
    assert hints_second[0].text == "Check line 1"
