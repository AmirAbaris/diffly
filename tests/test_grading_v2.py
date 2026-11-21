"""Tests for v2 inline review grading, contract fixtures, and API persistence."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlmodel import Session

from backend.models.submission import Submission
from backend.seed.seed_data import seed_challenges
from backend.services.evaluation_service import evaluate_review
from backend.services.grading import (
    MAX_ANCHOR_SPAN,
    MIN_REVIEW_TEXT_CHARS,
    Anchor,
    Finding,
    GradingPolicy,
    ReviewSubmission,
    grade_review,
    validate_review_bounds,
    validate_review_text,
)


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "review-contract-cases.json"


def test_review_contract_cases_fixture():
    """Shared contract fixture matches ReviewSubmission and text validation."""
    fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    assert fixture["constants"]["max_anchor_span"] == MAX_ANCHOR_SPAN
    assert fixture["constants"]["min_review_text_chars"] == MIN_REVIEW_TEXT_CHARS

    for case in fixture["validation_cases"]:
        try:
            review = ReviewSubmission.model_validate(
                {
                    "findings": case["findings"],
                    "summary_note": case["summary_note"],
                }
            )
            validate_review_text(review, require_findings=True)
            is_valid = True
        except (ValidationError, ValueError):
            is_valid = False
        assert is_valid is case["valid"], f"Mismatch for case {case['name']}"


def test_anchor_and_review_invariants():
    """Anchor span limits, unique finding IDs, and disjoint anchors are enforced."""
    ok = Anchor(start_line=1, end_line=MAX_ANCHOR_SPAN)
    assert list(ok.lines()) == list(range(1, MAX_ANCHOR_SPAN + 1))

    with pytest.raises(ValidationError):
        Anchor(start_line=1, end_line=MAX_ANCHOR_SPAN + 1)

    with pytest.raises(ValidationError):
        Anchor(start_line=5, end_line=4)

    with pytest.raises(ValidationError):
        ReviewSubmission.model_validate(
            {
                "findings": [
                    {"id": "dup", "start_line": 1, "end_line": 1, "body": "first"},
                    {"id": "dup", "start_line": 3, "end_line": 3, "body": "second"},
                ]
            }
        )

    with pytest.raises(ValidationError):
        ReviewSubmission.model_validate(
            {
                "findings": [
                    {"id": "f1", "start_line": 2, "end_line": 5, "body": "range"},
                    {"id": "f2", "start_line": 5, "end_line": 6, "body": "overlap"},
                ]
            }
        )


def test_validate_review_bounds_snippet_and_multifile():
    """validate_review_bounds enforces file scoping and line ranges."""
    snippet_challenge = {"code_snippet": "line1\nline2\nline3\n", "files": []}
    with pytest.raises(ValueError, match="File-scoped"):
        validate_review_bounds(
            ReviewSubmission(
                findings=[
                    Finding(
                        id="f1",
                        anchor=Anchor(file_path="a.py", start_line=1, end_line=1),
                        body="bad scope",
                    )
                ]
            ),
            snippet_challenge,
        )
    with pytest.raises(ValueError, match="between 1 and 3"):
        validate_review_bounds(
            ReviewSubmission(
                findings=[
                    Finding(
                        id="f1",
                        anchor=Anchor(start_line=2, end_line=4),
                        body="out of bounds",
                    )
                ]
            ),
            snippet_challenge,
        )

    multifile_challenge = {
        "code_snippet": "",
        "files": [
            {"path": "a.py", "content": "a1\na2\na3\n"},
            {"path": "b.py", "content": "b1\nb2\n"},
        ],
    }
    with pytest.raises(ValueError, match="Multi-file challenges require file_path"):
        validate_review_bounds(
            ReviewSubmission(
                findings=[
                    Finding(
                        id="f1",
                        anchor=Anchor(start_line=1, end_line=1),
                        body="missing path",
                    )
                ]
            ),
            multifile_challenge,
        )
    with pytest.raises(ValueError, match="Unknown file path"):
        validate_review_bounds(
            ReviewSubmission(
                findings=[
                    Finding(
                        id="f1",
                        anchor=Anchor(file_path="c.py", start_line=1, end_line=1),
                        body="unknown path",
                    )
                ]
            ),
            multifile_challenge,
        )


def test_v1_parity_invariant_across_cases():
    """grade_review produces identical scores and issues to evaluate_review for v1."""
    cases = [
        (
            {
                "expected_issues": [
                    {
                        "id": "d1",
                        "title": "SQLi",
                        "severity": "critical",
                        "lines": [5, 6],
                        "keywords": ["sql", "parameterized"],
                        "explanation": "Use parameterized queries.",
                    }
                ]
            },
            [5, 20],
            "sql injection needs parameterized query",
        ),
        (
            {
                "expected_issues": [
                    {
                        "id": "d1",
                        "title": "Eval",
                        "severity": "high",
                        "lines": [10],
                        "keywords": ["eval", "rce"],
                        "explanation": "Avoid eval.",
                    }
                ]
            },
            [9],
            "eval rce",
        ),
        (
            {
                "files": [
                    {"path": "a.py", "content": "1\n2\n3\n4\n5\n"},
                    {"path": "b.py", "content": "1\n2\n3\n4\n5\n"},
                ],
                "expected_issues": [
                    {
                        "id": "d1",
                        "title": "Bug A",
                        "severity": "medium",
                        "file_path": "a.py",
                        "lines": [2],
                        "keywords": ["bug"],
                        "explanation": "Fix a.py.",
                    },
                    {
                        "id": "d2",
                        "title": "Bug B",
                        "severity": "low",
                        "file_path": "b.py",
                        "lines": [4],
                        "keywords": ["leak"],
                        "explanation": "Fix b.py.",
                    },
                ],
            },
            [
                {"file_path": "a.py", "line_number": 2},
                {"file_path": "b.py", "line_number": 1},
            ],
            "bug in a",
        ),
    ]

    for challenge, flagged, comments in cases:
        v1 = evaluate_review(challenge, flagged_lines=flagged, user_comments=comments)
        review = ReviewSubmission.model_validate(
            {"flagged_lines": flagged, "comments": comments}
        )
        v2 = grade_review(challenge, review, GradingPolicy())

        assert v2.score == v1.score
        assert v2.line_precision_score == v1.line_precision_score
        assert v2.concept_score == v1.concept_score
        assert v2.false_positive_penalty == v1.false_positive_penalty
        assert v2.false_positive_lines == v1.false_positive_lines
        assert [i.id for i in v2.detected_issues] == [i.id for i in v1.detected_issues]
        assert [i.id for i in v2.missed_issues] == [i.id for i in v1.missed_issues]
        assert v2.summary == v1.summary
        assert v2.critique == v1.critique


def test_tightness_factor_penalizes_overbroad_range():
    """A 10-line finding covering a 1-line defect scales line_score by tightness."""
    challenge = {
        "expected_issues": [
            {
                "id": "d1",
                "title": "Single Line Bug",
                "severity": "high",
                "lines": [5],
                "keywords": ["overflow", "bounds"],
                "explanation": "Check bounds.",
            }
        ]
    }
    review = ReviewSubmission.model_validate(
        {
            "findings": [
                {
                    "id": "f1",
                    "start_line": 1,
                    "end_line": 10,
                    "body": "overflow bounds error",
                    "severity": "high",
                }
            ]
        }
    )
    report = grade_review(challenge, review, GradingPolicy())
    assert report.detected_issues[0].line_score == pytest.approx(0.3)
    assert report.line_precision_score == pytest.approx(30.0)
    assert report.concept_score == pytest.approx(100.0)
    assert report.score == 65
    assert report.finding_verdicts[0].severity_agrees is True


def test_per_finding_concept_isolation_prevents_keyword_bleed():
    """Keywords in finding A's body do not credit defect B matched by finding B."""
    challenge = {
        "expected_issues": [
            {
                "id": "d1",
                "title": "SQL Injection",
                "severity": "critical",
                "lines": [5],
                "keywords": ["sql", "parameterized"],
                "explanation": "Use parameterized queries.",
            },
            {
                "id": "d2",
                "title": "Missing Auth",
                "severity": "high",
                "lines": [20],
                "keywords": ["auth", "token"],
                "explanation": "Require auth token.",
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
                    "body": "missing auth token here",
                    "severity": "low",
                },
                {
                    "id": "f2",
                    "start_line": 20,
                    "end_line": 20,
                    "body": "sql parameterized issue",
                    "severity": "high",
                },
            ],
            "summary_note": "",
        }
    )
    report = grade_review(challenge, review, GradingPolicy())
    assert report.line_precision_score == 100.0
    assert report.concept_score == 0.0
    assert report.score == 50
    verdicts = {v.finding_id: v for v in report.finding_verdicts}
    assert verdicts["f1"].severity_agrees is False
    assert verdicts["f2"].severity_agrees is True


def test_redundant_vs_false_positive_verdicts():
    """Second finding on same defect is redundant (no penalty); unrelated is FP."""
    challenge = {
        "expected_issues": [
            {
                "id": "d1",
                "title": "Eval RCE",
                "severity": "critical",
                "lines": [10, 11],
                "keywords": ["eval", "rce"],
                "explanation": "Unsafe eval.",
            }
        ]
    }
    review = ReviewSubmission.model_validate(
        {
            "findings": [
                {"id": "f1", "start_line": 10, "end_line": 10, "body": "eval rce"},
                {"id": "f2", "start_line": 11, "end_line": 11, "body": "also bad"},
                {"id": "f3", "start_line": 30, "end_line": 31, "body": "clean lines"},
            ]
        }
    )
    report = grade_review(challenge, review, GradingPolicy())
    verdicts = {v.finding_id: v for v in report.finding_verdicts}
    assert verdicts["f1"].verdict == "matched"
    assert verdicts["f2"].verdict == "redundant"
    assert verdicts["f3"].verdict == "false_positive"
    assert report.false_positive_penalty == 15.0
    assert report.false_positive_lines == [30, 31]
    assert report.score == 85


def test_submit_and_history_v2_findings_persistence(
    client: TestClient, session: Session
):
    """POST /review and GET /submissions persist and return v2 findings and verdicts."""
    challenges = seed_challenges(session)
    ch = challenges[0]
    first_issue = ch.get_expected_issues()[0]
    target_lines = first_issue.lines or [1]
    target_line = int(target_lines[0])
    target_file = first_issue.file_path
    keywords = first_issue.keywords or []
    body_text = " ".join(keywords[:2]) or "Security defect detected on this line"

    payload = {
        "findings": [
            {
                "id": "f-eval",
                "file_path": target_file,
                "start_line": target_line,
                "end_line": target_line,
                "body": body_text,
                "severity": first_issue.severity or "critical",
            }
        ],
        "comments": "",
    }
    res = client.post(f"/api/challenges/{ch.slug}/review", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert len(data["findings"]) == 1
    assert data["findings"][0]["id"] == "f-eval"
    assert len(data["finding_verdicts"]) == 1
    assert data["finding_verdicts"][0]["verdict"] == "matched"
    expected_flagged = (
        [{"file_path": target_file, "line_number": target_line}]
        if target_file
        else [target_line]
    )
    assert data["flagged_lines"] == expected_flagged

    saved = session.get(Submission, data["submission_id"])
    assert saved is not None
    assert len(saved.get_findings()) == 1
    assert len(saved.get_finding_verdicts()) == 1

    history_res = client.get(f"/api/challenges/{ch.slug}/submissions")
    assert history_res.status_code == 200
    history = history_res.json()
    assert len(history) == 1
    assert history[0]["findings"][0]["id"] == "f-eval"
    assert history[0]["finding_verdicts"][0]["verdict"] == "matched"


def test_evaluate_custom_supports_v2_findings(client: TestClient):
    """POST /api/challenges/evaluate-custom grades v2 findings payloads."""
    payload = {
        "code_snippet": "x = 1\ny = eval(x)\nz = 3\n",
        "expected_issues": [
            {
                "id": "d1",
                "title": "Unsafe eval",
                "severity": "critical",
                "lines": [2],
                "keywords": ["eval", "code execution"],
                "explanation": "Avoid eval.",
            }
        ],
        "findings": [
            {
                "id": "f1",
                "start_line": 2,
                "end_line": 2,
                "body": "eval allows code execution",
                "severity": "critical",
            }
        ],
        "comments": "",
    }
    res = client.post("/api/challenges/evaluate-custom", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["score"] == 100
    assert data["finding_verdicts"][0]["verdict"] == "matched"
    assert data["finding_verdicts"][0]["severity_agrees"] is True
