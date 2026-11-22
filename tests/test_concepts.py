"""Tests for polarity-aware negation, evidence binding, and defect isolation."""

from backend.models.challenge import DefectCriterion
from backend.services.grading import (
    Anchor,
    EvidenceSource,
    Finding,
    GradingPolicy,
    ReviewSubmission,
    bind_evidence,
    grade_review,
    is_keyword_matched,
    match_concepts,
    normalize_text,
)


def test_polarity_aware_negation_hazards_vs_safeguards():
    """Denied hazards get 0 credit; denied safeguards keep credit unless dismissed."""
    assert not is_keyword_matched("sql injection", "There is NO sql injection")
    assert not is_keyword_matched("sqli", "There is NO sql injection")
    assert not is_keyword_matched("race condition", "No data race exists here")

    assert is_keyword_matched("validate", "no input validation")
    assert is_keyword_matched("input validation", "no input validation")
    assert is_keyword_matched("sanitize", "without sanitizing user input")
    assert is_keyword_matched("parameterized", "query is not parameterized")
    assert is_keyword_matched("authorization", "missing authz check")

    defect = DefectCriterion(
        id="sqli-1",
        severity="critical",
        lines=[10],
        keywords=["sanitize", "sql injection"],
    )
    ev = bind_evidence(
        Finding(
            id="f1",
            anchor=Anchor(start_line=10, end_line=10),
            body="not sanitized, so sql injection",
        ),
        normalize_text(""),
        frozenset({10}),
        GradingPolicy(),
    )
    match = match_concepts(defect, ev, has_lines=True, target=2)
    assert match.matched == ("sanitize", "sql injection")
    assert match.denied == ()
    assert match.score == 1.0


def test_dismissal_cues_and_keyword_polarity_override():
    """Dismissal cues suppress both hazards and safeguards; defect override wins."""
    assert not is_keyword_matched("sql injection", "This is a false positive for sqli")
    assert not is_keyword_matched("sql injection", "Not vulnerable to sql injection")
    assert not is_keyword_matched("validate", "False positive: no input validation")
    assert not is_keyword_matched("sanitize", "Not a bug, without sanitizing is fine")

    overridden = DefectCriterion(
        id="custom-1",
        lines=[5],
        keywords=["custom_guard"],
        keyword_polarity={"custom_guard": "safeguard"},
    )
    norm = normalize_text("missing custom_guard")
    ev = bind_evidence(
        Finding(id="f1", anchor=Anchor(start_line=5, end_line=5), body=norm.raw),
        normalize_text(""),
        frozenset({5}),
        GradingPolicy(),
    )
    res = match_concepts(overridden, ev, has_lines=True, target=1)
    assert res.matched == ("custom_guard",)
    assert res.score == 1.0


def test_multi_occurrence_recovery_and_syntax_punctuation():
    """One non-denied occurrence rescues credit; syntax terms stay protected."""
    text = "At first I thought there is no sql injection. Actually line 10 has SQLi."
    assert is_keyword_matched("sql injection", text)

    assert is_keyword_matched("text()", "Use sqlalchemy text() carefully")
    assert not is_keyword_matched("text()", "Read the text below")
    assert not is_keyword_matched("text()", "There is no text() vulnerability")
    assert is_keyword_matched("f-string", "Interpolated via f-string")
    assert is_keyword_matched("cwe-89", "Matches CWE-89 pattern")


def test_summary_note_binding_and_stuffed_summary_leak_regression():
    """Summary sentences bind by line ref or id and cap shared summary credit."""
    challenge = {
        "expected_issues": [
            {
                "id": "d1",
                "title": "Auth Bypass",
                "severity": "critical",
                "lines": [5],
                "keywords": ["authorization", "token"],
                "explanation": "Missing authz.",
            },
            {
                "id": "d2",
                "title": "SQL Injection",
                "severity": "critical",
                "lines": [20],
                "keywords": ["sql injection", "parameterized"],
                "explanation": "Raw query.",
            },
        ]
    }

    stuffed = ReviewSubmission.model_validate(
        {
            "findings": [
                {"id": "f1", "start_line": 5, "end_line": 5, "body": "bug here"},
                {"id": "f2", "start_line": 20, "end_line": 20, "body": "bad code"},
            ],
            "summary_note": (
                "Line 20 has sql injection with prepared statement. "
                "Generic note about authorization and token."
            ),
        }
    )
    report = grade_review(challenge, stuffed, GradingPolicy())
    by_id = {d.id: d for d in report.detected_issues}

    # d2 gets full 1.0 credit via SUMMARY_BOUND ("Line 20 ...")
    assert by_id["d2"].concept_score == 1.0
    assert EvidenceSource.SUMMARY_BOUND in by_id["d2"].evidence

    # d1 cannot steal line 20's sentence and gets only shared_summary_weight (0.5)
    assert by_id["d1"].concept_score == 0.5
    assert EvidenceSource.SUMMARY_SHARED in by_id["d1"].evidence
    assert "sql injection" not in by_id["d1"].matched_keywords


def test_summary_binds_by_finding_id_without_line_ref():
    """Summary sentence mentioning finding id receives full SUMMARY_BOUND credit."""
    summary = normalize_text("Finding f1 misses bound parameters.")
    finding = Finding(id="f1", anchor=Anchor(start_line=12, end_line=12), body="bug")
    ev = bind_evidence(finding, summary, frozenset({12}), GradingPolicy())
    assert len(ev) == 2
    bound = [item for item in ev if item.source == EvidenceSource.SUMMARY_BOUND]
    assert len(bound) == 1
    assert bound[0].weight == 1.0


def test_redundant_finding_aggregation_and_missed_lined_defect_isolation():
    """Redundant findings pool concepts; missed lined defects stay isolated."""
    challenge = {
        "expected_issues": [
            {
                "id": "d1",
                "title": "SQL Injection",
                "severity": "critical",
                "lines": [10, 11],
                "keywords": ["sql injection", "parameterized"],
                "explanation": "Use bindparams.",
            },
            {
                "id": "d2",
                "title": "SSRF",
                "severity": "high",
                "lines": [40],
                "keywords": ["ssrf", "allowlist"],
                "explanation": "Restrict internal hosts.",
            },
        ]
    }
    review = ReviewSubmission.model_validate(
        {
            "findings": [
                {"id": "f1", "start_line": 10, "end_line": 10, "body": "sqli flaw"},
                {
                    "id": "f2",
                    "start_line": 11,
                    "end_line": 11,
                    "body": "must use prepared statement",
                },
                {
                    "id": "f3",
                    "start_line": 30,
                    "end_line": 30,
                    "body": "ungrounded ssrf and allowlist buzzwords",
                },
            ],
            "summary_note": "",
        }
    )

    report = grade_review(challenge, review, GradingPolicy(reveal=True))
    assert len(report.detected_issues) == 1
    det = report.detected_issues[0]
    assert det.id == "d1"
    assert det.concept_score == 1.0
    assert det.matched_keywords == ["sql injection", "parameterized"]
    assert det.finding_ids == ["f1", "f2"]
    assert det.evidence == [EvidenceSource.INLINE]

    assert len(report.missed_issues) == 1
    missed = report.missed_issues[0]
    assert missed.id == "d2"
    assert missed.missing_keywords == ["ssrf", "allowlist"]
    assert missed.denied_keywords == []


def test_denied_keyword_tracking_borderline_and_redaction():
    """Denied keywords populate reports, redact when hidden, and mark borderline ids."""
    challenge = {
        "expected_issues": [
            {
                "id": "d1",
                "title": "SQL Injection",
                "severity": "critical",
                "lines": [10],
                "keywords": ["sql injection", "parameterized"],
                "explanation": "Unsafe query.",
            },
            {
                "id": "d2",
                "title": "Lineless Leak",
                "severity": "medium",
                "lines": [],
                "keywords": ["memory leak", "cleanup"],
                "explanation": "Leaks memory.",
            },
        ]
    }
    review = ReviewSubmission.model_validate(
        {
            "findings": [
                {
                    "id": "f1",
                    "start_line": 10,
                    "end_line": 10,
                    "body": "There is NO sql injection here, but cleanup is missing",
                }
            ]
        }
    )
    report = grade_review(challenge, review, GradingPolicy(attempt_number=1))
    det = {d.id: d for d in report.detected_issues}
    assert det["d1"].denied_keywords == ["sql injection"]
    assert det["d1"].concept_score == 0.0
    assert det["d2"].concept_score == 0.5
    assert "d1" in report.borderline_defect_ids
    assert "d2" in report.borderline_defect_ids

    lineless_denied_review = ReviewSubmission.model_validate(
        {"findings": [], "summary_note": "There is NO memory leak anywhere"}
    )
    hidden = grade_review(
        challenge,
        lineless_denied_review,
        GradingPolicy(attempt_number=1),
    )
    for m in hidden.missed_issues:
        assert m.missing_keywords == []
        assert m.denied_keywords == []

    revealed = grade_review(
        challenge,
        lineless_denied_review,
        GradingPolicy(reveal=True),
    )
    d2_missed = next(m for m in revealed.missed_issues if m.id == "d2")
    assert d2_missed.denied_keywords == ["memory leak"]
