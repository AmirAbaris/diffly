"""Tests for severity coercion, normalized defect weights, and tie-breaking."""

import pytest
from pydantic import ValidationError

from backend.models.challenge import DefectCriterion
from backend.services.grading import (
    SEVERITY_WEIGHTS,
    GradingPolicy,
    ReviewSubmission,
    coerce_severity,
    defect_weights,
    grade_review,
)


def test_coerce_severity_normalizes_valid_and_falls_back_to_medium():
    assert coerce_severity("critical") == "critical"
    assert coerce_severity("HIGH") == "high"
    assert coerce_severity("  Medium ") == "medium"
    assert coerce_severity("low") == "low"
    assert coerce_severity("urgent") == "medium"
    assert coerce_severity("") == "medium"
    assert coerce_severity(None) == "medium"
    assert coerce_severity(42) == "medium"


def test_defect_criterion_coerces_severity_and_accepts_keyword_polarity():
    coerced = DefectCriterion.model_validate(
        {
            "id": "d1",
            "title": "Auth bypass",
            "severity": " CRITICAL ",
            "lines": [5],
            "keywords": ["auth", "sanitize"],
            "keyword_polarity": {"auth": "hazard", "sanitize": "safeguard"},
        }
    )
    assert coerced.severity == "critical"
    assert coerced.keyword_polarity == {"auth": "hazard", "sanitize": "safeguard"}

    fallback = DefectCriterion.model_validate({"id": "d2", "severity": "blocker"})
    assert fallback.severity == "medium"
    assert fallback.keyword_polarity == {}

    with pytest.raises(ValidationError):
        DefectCriterion.model_validate(
            {"id": "d3", "keyword_polarity": {"sql": "unknown"}}
        )


def test_defect_weights_normalization_and_custom_overrides():
    assert defect_weights([]) == ()
    assert dict(SEVERITY_WEIGHTS) == {
        "critical": 4.0,
        "high": 3.0,
        "medium": 2.0,
        "low": 1.0,
    }

    mixed = [
        {"severity": "critical"},
        DefectCriterion(id="d2", severity="high"),
        {"severity": "medium"},
        {"severity": "low"},
    ]
    weights = defect_weights(mixed)
    assert weights == pytest.approx((0.4, 0.3, 0.2, 0.1))
    assert sum(weights) == pytest.approx(1.0)

    uniform = defect_weights([{"severity": "high"}, {"severity": "high"}])
    assert uniform == pytest.approx((0.5, 0.5))

    custom_equal = defect_weights(
        mixed,
        severity_weights={"critical": 1.0, "high": 1.0, "medium": 1.0, "low": 1.0},
    )
    assert custom_equal == pytest.approx((0.25, 0.25, 0.25, 0.25))

    zero_fallback = defect_weights(
        [{"severity": "critical"}, {"severity": "low"}],
        severity_weights={"critical": 0.0, "low": 0.0},
    )
    assert zero_fallback == pytest.approx((0.5, 0.5))


def test_uniform_severity_parity_and_policy_override():
    challenge = {
        "expected_issues": [
            {
                "id": "d1",
                "title": "Critical SQLi",
                "severity": "critical",
                "lines": [5],
                "keywords": ["sql", "parameterized"],
            },
            {
                "id": "d2",
                "title": "Critical RCE",
                "severity": "critical",
                "lines": [20],
                "keywords": ["eval", "rce"],
            },
        ]
    }
    review = ReviewSubmission.model_validate(
        {
            "findings": [
                {
                    "id": "f1",
                    "start_line": 5,
                    "end_line": 5,
                    "body": "sql injection needs parameterized query",
                }
            ]
        }
    )
    report = grade_review(challenge, review, GradingPolicy())
    assert report.score == 50
    assert report.line_precision_score == 50.0
    assert report.concept_score == 50.0
    assert report.detected_issues[0].weight == 0.5
    assert report.missed_issues[0].weight == 0.5


def test_mixed_severity_weighting_ordering_and_redaction_preserves_weight():
    def _challenge_for(first_sev: str, second_sev: str) -> dict:
        return {
            "expected_issues": [
                {
                    "id": "d1",
                    "title": "First",
                    "severity": first_sev,
                    "lines": [10],
                    "keywords": ["sql", "query"],
                    "explanation": "Secret explanation 1.",
                },
                {
                    "id": "d2",
                    "title": "Second",
                    "severity": second_sev,
                    "lines": [25],
                    "keywords": ["log", "pii"],
                    "explanation": "Secret explanation 2.",
                },
            ]
        }

    review_first_only = ReviewSubmission.model_validate(
        {
            "findings": [
                {
                    "id": "f1",
                    "start_line": 10,
                    "end_line": 10,
                    "body": "sql query defect",
                }
            ]
        }
    )

    report_crit_caught = grade_review(
        _challenge_for("critical", "low"), review_first_only, GradingPolicy()
    )
    report_high_caught = grade_review(
        _challenge_for("high", "low"), review_first_only, GradingPolicy()
    )
    report_med_caught = grade_review(
        _challenge_for("medium", "low"), review_first_only, GradingPolicy()
    )
    report_low_caught = grade_review(
        _challenge_for("low", "critical"), review_first_only, GradingPolicy()
    )

    assert (
        report_crit_caught.score
        > report_high_caught.score
        > report_med_caught.score
        > report_low_caught.score
    )
    assert report_crit_caught.score == 80
    assert report_low_caught.score == 20
    assert report_low_caught.detected_issues[0].weight == 0.2
    assert report_low_caught.missed_issues[0].weight == 0.8
    assert report_low_caught.missed_issues[0].explanation == ""

    equal_policy = GradingPolicy(
        severity_weights={"critical": 1.0, "high": 1.0, "medium": 1.0, "low": 1.0}
    )
    report_equal = grade_review(
        _challenge_for("critical", "low"), review_first_only, equal_policy
    )
    assert report_equal.score == 50
    assert report_equal.detected_issues[0].weight == 0.5
    assert report_equal.missed_issues[0].weight == 0.5


@pytest.mark.parametrize(
    ("first_sev", "second_sev", "expected_winner"),
    [
        ("low", "critical", "d2"),
        ("critical", "low", "d1"),
        ("medium", "high", "d2"),
    ],
)
def test_tie_breaking_prefers_higher_severity_defect(
    first_sev: str,
    second_sev: str,
    expected_winner: str,
):
    challenge = {
        "expected_issues": [
            {
                "id": "d1",
                "title": "Issue One",
                "severity": first_sev,
                "lines": [15],
                "keywords": ["token"],
            },
            {
                "id": "d2",
                "title": "Issue Two",
                "severity": second_sev,
                "lines": [15],
                "keywords": ["token"],
            },
        ]
    }
    review = ReviewSubmission.model_validate(
        {
            "findings": [
                {
                    "id": "f1",
                    "start_line": 15,
                    "end_line": 15,
                    "body": "token issue here",
                }
            ]
        }
    )
    report = grade_review(challenge, review, GradingPolicy())
    assert [issue.id for issue in report.detected_issues] == [expected_winner]
    assert report.finding_verdicts[0].defect_id == expected_winner
