"""Unit and integration tests for semantic judge orchestration and API routes."""

import asyncio
import json
import logging
from typing import Any
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlmodel import Session

from backend.core.config import Settings, settings
from backend.models.challenge import Category, Challenge, Difficulty, Language
from backend.models.submission import Submission
from backend.services.gemini_client import (
    GeminiAPIError,
    GeminiAuthError,
    GeminiRateLimitError,
    GeminiSchemaError,
    HttpxGeminiClient,
)
from backend.services.grading import (
    Anchor,
    Finding,
    GradeReport,
    GradingPolicy,
    JudgeRequest,
    ReviewSubmission,
    grade_review,
    refine_with_judge,
)


SECRET_BYOK_KEY = "AIzaSySecretJudgeUnitTestKey998877"


class FakeGeminiClient:
    """In-memory GeminiJsonClient test double returning preset payload or error."""

    def __init__(
        self,
        *,
        payload: dict[str, Any] | None = None,
        error: Exception | None = None,
        delay_s: float = 0.0,
    ) -> None:
        self.payload = payload
        self.error = error
        self.delay_s = delay_s
        self.calls: list[dict[str, Any]] = []

    async def generate_json(
        self,
        *,
        prompt: str,
        response_schema: dict[str, Any],
        api_key: str,
        model: str = "gemini-3.1-flash-lite",
        temperature: float = 0.2,
        fallback_models: tuple[str, ...] = (),
    ) -> dict[str, Any]:
        self.calls.append(
            {
                "prompt": prompt,
                "response_schema": response_schema,
                "api_key": api_key,
                "model": model,
                "temperature": temperature,
                "fallback_models": tuple(fallback_models),
            }
        )
        if self.delay_s > 0:
            await asyncio.sleep(self.delay_s)
        if self.error is not None:
            raise self.error
        assert self.payload is not None
        return self.payload


def _borderline_challenge_dict() -> dict[str, Any]:
    return {
        "canonical_review": (
            "User input is concatenated directly into SQL; use parameterized queries."
        ),
        "code_snippet": (
            "def get_user(db, user_id):\n"
            "    q = f'SELECT * FROM users WHERE id = {user_id}'\n"
            "    return db.execute(q)\n"
        ),
        "expected_issues": [
            {
                "id": "sqli-1",
                "title": "SQL Injection",
                "severity": "critical",
                "lines": [2],
                "keywords": ["sql injection", "parameterized"],
                "explanation": "F-string interpolation enables SQL injection.",
            }
        ],
    }


def _seed_judge_challenge(
    session: Session,
    *,
    slug: str = "judge-sqli-drill",
    two_defects: bool = False,
) -> Challenge:
    issues: list[dict[str, Any]] = [
        {
            "id": "sqli-1",
            "title": "SQL Injection",
            "severity": "critical",
            "lines": [2],
            "keywords": ["sql injection", "parameterized"],
            "explanation": "F-string interpolation enables SQL injection.",
        }
    ]
    code = (
        "def get_user(db, user_id):\n"
        "    q = f'SELECT * FROM users WHERE id = {user_id}'\n"
        "    return db.execute(q)\n"
    )
    if two_defects:
        issues.append(
            {
                "id": "auth-2",
                "title": "Missing Ownership Check",
                "severity": "high",
                "lines": [3],
                "keywords": ["authorization", "ownership"],
                "explanation": "Verify current actor owns requested record.",
            }
        )
    ch = Challenge(
        slug=slug,
        title="Judge SQLi Drill",
        difficulty=Difficulty.MEDIUM,
        category=Category.SECURITY,
        language=Language.PYTHON,
        description="Inspect query construction.",
        threat_model="Injection",
        defect_target="Find SQLi",
        code_snippet=code,
        expected_issues=json.dumps(issues),
        hints=json.dumps([{"tier": 1, "hint": "Inspect line 2"}]),
        canonical_review=(
            "User input is interpolated into SQL; bind parameters instead."
        ),
        recommended_fix_diff="- f'SELECT'\n+ select()",
        is_public=True,
    )
    session.add(ch)
    session.commit()
    session.refresh(ch)
    return ch


def _judge_request(*, timeout_s: float = 8.0) -> JudgeRequest:
    return JudgeRequest.from_headers(
        byok_key=SECRET_BYOK_KEY,
        opt_in=True,
        settings=type(
            "JudgeSettings",
            (),
            {
                "GEMINI_JUDGE_MODEL": "gemini-3.1-flash-lite",
                "GEMINI_JUDGE_TIMEOUT_S": timeout_s,
                "GEMINI_JUDGE_API_KEY": None,
            },
        )(),
    )  # type: ignore[return-value]


@pytest.mark.anyio
async def test_refine_with_judge_applied_and_skipped_states():
    """Service applies borderline verdicts and skips decisive or textless reports."""
    challenge = _borderline_challenge_dict()
    policy = GradingPolicy(attempt_number=1)

    borderline_review = ReviewSubmission(
        findings=[
            Finding(
                id="f1",
                anchor=Anchor(start_line=2, end_line=2),
                body="User input is pasted right into the database query string.",
            )
        ]
    )
    borderline_report = grade_review(challenge, borderline_review, policy)
    assert borderline_report.borderline_defect_ids == ["sqli-1"]
    assert borderline_report.score == 50

    client = FakeGeminiClient(
        payload={
            "verdicts": [
                {
                    "defect_id": "sqli-1",
                    "concept_credit": 1.0,
                    "rubric": {
                        "root_cause": True,
                        "impact": True,
                        "fix": False,
                    },
                    "feedback": "Identified query interpolation root cause.",
                }
            ]
        }
    )
    refined = await refine_with_judge(
        challenge,
        borderline_review,
        borderline_report,
        _judge_request(),
        policy,
        client=client,
    )
    assert len(client.calls) == 1
    assert client.calls[0]["temperature"] == 0.0
    assert client.calls[0]["fallback_models"] == ()
    assert refined.score == 100
    assert refined.detected_issues[0].concept_source == "judge"
    assert refined.judge is not None
    assert refined.judge.status == "applied"
    assert refined.judge.score_delta == 50
    assert refined.judge.key_source == "byok"

    decisive_review = ReviewSubmission(
        findings=[
            Finding(
                id="f1",
                anchor=Anchor(start_line=2, end_line=2),
                body="SQL injection; use parameterized query.",
            )
        ]
    )
    decisive_report = grade_review(challenge, decisive_review, policy)
    assert decisive_report.borderline_defect_ids == []

    no_call_client = FakeGeminiClient(payload={"verdicts": []})
    skipped_decisive = await refine_with_judge(
        challenge,
        decisive_review,
        decisive_report,
        _judge_request(),
        policy,
        client=no_call_client,
    )
    assert no_call_client.calls == []
    assert skipped_decisive.judge is not None
    assert skipped_decisive.judge.status == "skipped_decisive"
    assert skipped_decisive.judge.reason == "not_borderline"

    textless_review = ReviewSubmission(
        findings=[Finding(id="f1", anchor=Anchor(start_line=2, end_line=2), body="")],
        summary_note="",
    )
    synthetic_borderline = GradeReport(
        score=50,
        line_precision_score=100.0,
        concept_score=0.0,
        borderline_defect_ids=["sqli-1"],
    )
    skipped_no_text = await refine_with_judge(
        challenge,
        textless_review,
        synthetic_borderline,
        _judge_request(),
        policy,
        client=no_call_client,
    )
    assert no_call_client.calls == []
    assert skipped_no_text.judge is not None
    assert skipped_no_text.judge.status == "skipped_no_text"
    assert skipped_no_text.judge.reason == "no_review_text"


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("error", "delay_s", "payload", "expected_reason"),
    [
        (None, 0.05, {"verdicts": []}, "timeout"),
        (httpx.ReadTimeout("timed out"), 0.0, None, "timeout"),
        (GeminiAuthError("bad key"), 0.0, None, "auth_error"),
        (GeminiRateLimitError("429"), 0.0, None, "rate_limited"),
        (GeminiSchemaError("bad schema"), 0.0, None, "schema"),
        (
            None,
            0.0,
            {
                "verdicts": [
                    {
                        "defect_id": "sqli-1",
                        "concept_credit": True,
                        "rubric": {"root_cause": True, "impact": True, "fix": True},
                        "feedback": "bool credit should fail schema validation",
                    }
                ]
            },
            "schema",
        ),
        (GeminiAPIError("502"), 0.0, None, "api_error"),
    ],
)
async def test_refine_with_judge_unavailable_reasons_and_no_key_leak_in_logs(
    caplog: pytest.LogCaptureFixture,
    error: Exception | None,
    delay_s: float,
    payload: dict[str, Any] | None,
    expected_reason: str,
):
    """Judge failures fall back gracefully without leaking BYOK keys into logs."""
    challenge = _borderline_challenge_dict()
    policy = GradingPolicy(attempt_number=1)
    review = ReviewSubmission(
        findings=[
            Finding(
                id="f1",
                anchor=Anchor(start_line=2, end_line=2),
                body="User input goes directly into query string.",
            )
        ]
    )
    base_report = grade_review(challenge, review, policy)
    client = FakeGeminiClient(payload=payload, error=error, delay_s=delay_s)

    with caplog.at_level(logging.WARNING):
        result = await refine_with_judge(
            challenge,
            review,
            base_report,
            _judge_request(timeout_s=0.01 if delay_s > 0 else 8.0),
            policy,
            client=client,
        )

    assert result.score == base_report.score
    assert result.judge is not None
    assert result.judge.status == "unavailable"
    assert result.judge.reason == expected_reason
    assert result.judge.key_source == "byok"
    assert SECRET_BYOK_KEY not in caplog.text


@patch("backend.services.grading.judge.service.HttpxGeminiClient.generate_json")
def test_submit_review_with_semantic_judge_and_byok_secrecy(
    mock_generate: AsyncMock,
    client: TestClient,
    session: Session,
    caplog: pytest.LogCaptureFixture,
):
    """POST /review runs judge with BYOK header, persists outcome, and hides key."""
    ch = _seed_judge_challenge(session)
    mock_generate.return_value = {
        "verdicts": [
            {
                "defect_id": "sqli-1",
                "concept_credit": 1.0,
                "rubric": {"root_cause": True, "impact": True, "fix": True},
                "feedback": "Explained untrusted interpolation and bound params.",
            }
        ]
    }

    with caplog.at_level(logging.DEBUG):
        res = client.post(
            f"/api/challenges/{ch.slug}/review",
            json={
                "findings": [
                    {
                        "id": "f1",
                        "start_line": 2,
                        "end_line": 2,
                        "body": "Untrusted user id is interpolated straight into SQL.",
                        "severity": "critical",
                    }
                ],
                "comments": "",
                "semantic_judge": True,
            },
            headers={"X-Gemini-Key": SECRET_BYOK_KEY},
        )

    assert res.status_code == 200
    assert SECRET_BYOK_KEY not in res.text
    assert SECRET_BYOK_KEY not in caplog.text

    data = res.json()
    assert data["score"] == 100
    assert data["detected_issues"][0]["concept_source"] == "judge"
    assert data["judge"]["status"] == "applied"
    assert data["judge"]["key_source"] == "byok"
    assert data["judge"]["score_delta"] == 50
    assert (
        data["judge"]["verdicts"][0]["feedback"]
        == "Explained untrusted interpolation and bound params."
    )

    saved = session.get(Submission, data["submission_id"])
    assert saved is not None
    assert SECRET_BYOK_KEY not in (saved.judge_outcome or "")
    assert SECRET_BYOK_KEY not in saved.feedback
    assert saved.get_judge_outcome() == data["judge"]


@patch("backend.services.grading.judge.service.HttpxGeminiClient.generate_json")
def test_submit_review_judge_error_never_fails_request_or_leaks_key(
    mock_generate: AsyncMock,
    client: TestClient,
    session: Session,
    caplog: pytest.LogCaptureFixture,
):
    """Gemini failure on POST /review falls back to deterministic score safely."""
    ch = _seed_judge_challenge(session, slug="judge-fallback-drill")
    mock_generate.side_effect = GeminiAuthError(f"Invalid key {SECRET_BYOK_KEY}")

    with caplog.at_level(logging.WARNING):
        res = client.post(
            f"/api/challenges/{ch.slug}/review",
            json={
                "findings": [
                    {
                        "id": "f1",
                        "start_line": 2,
                        "end_line": 2,
                        "body": "User input is concatenated right into query text.",
                    }
                ],
                "semantic_judge": True,
            },
            headers={"X-Gemini-Key": SECRET_BYOK_KEY},
        )

    assert res.status_code == 200
    assert SECRET_BYOK_KEY not in res.text
    assert SECRET_BYOK_KEY not in caplog.text
    data = res.json()
    assert data["score"] == 50
    assert data["judge"]["status"] == "unavailable"
    assert data["judge"]["reason"] == "auth_error"
    assert data["judge"]["key_source"] == "byok"


@patch("backend.services.grading.judge.service.HttpxGeminiClient.generate_json")
def test_evaluate_custom_endpoint_with_semantic_judge_and_canonical_review(
    mock_generate: AsyncMock,
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
):
    """POST /evaluate-custom supports semantic_judge, canonical_review, and BYOK."""
    mock_generate.return_value = {
        "verdicts": [
            {
                "defect_id": "sqli-1",
                "concept_credit": 1.0,
                "rubric": {"root_cause": True, "impact": True, "fix": True},
                "feedback": "Matches canonical review.",
            }
        ]
    }
    canonical_text = "Canonical: avoid f-strings in SQL, bind parameters."
    base_payload = {
        "code_snippet": (
            "def get_user(db, user_id):\n"
            "    q = f'SELECT * FROM users WHERE id = {user_id}'\n"
            "    return db.execute(q)\n"
        ),
        "expected_issues": [
            {
                "id": "sqli-1",
                "title": "SQL Injection",
                "severity": "critical",
                "lines": [2],
                "keywords": ["sql injection", "parameterized"],
                "explanation": "String interpolation enables SQLi.",
            }
        ],
        "findings": [
            {
                "id": "f1",
                "start_line": 2,
                "end_line": 2,
                "body": "User id flows directly into the database query.",
            }
        ],
        "canonical_review": canonical_text,
        "semantic_judge": True,
    }

    res_v2 = client.post(
        "/api/challenges/evaluate-custom",
        json=base_payload,
        headers={"X-Gemini-Key": SECRET_BYOK_KEY},
    )
    assert res_v2.status_code == 200
    assert SECRET_BYOK_KEY not in res_v2.text
    data_v2 = res_v2.json()
    assert data_v2["score"] == 100
    assert data_v2["judge"]["status"] == "applied"
    assert data_v2["judge"]["key_source"] == "byok"
    assert canonical_text in mock_generate.call_args.kwargs["prompt"]

    mock_generate.reset_mock()
    monkeypatch.setattr(
        settings, "GEMINI_JUDGE_API_KEY", SecretStr("server-judge-key-test")
    )
    res_server_blocked = client.post(
        "/api/challenges/evaluate-custom",
        json={
            "code_snippet": base_payload["code_snippet"],
            "expected_issues": base_payload["expected_issues"],
            "flagged_lines": [2],
            "comments": "User id flows directly into the database query.",
            "canonical_review": canonical_text,
            "semantic_judge": True,
        },
    )
    assert res_server_blocked.status_code == 200
    assert res_server_blocked.json()["score"] == 50
    assert res_server_blocked.json()["judge"] is None
    mock_generate.assert_not_called()

    res_legacy_byok = client.post(
        "/api/challenges/evaluate-custom",
        json={
            "code_snippet": base_payload["code_snippet"],
            "expected_issues": base_payload["expected_issues"],
            "flagged_lines": [2],
            "comments": "User id flows directly into the database query.",
            "canonical_review": canonical_text,
            "semantic_judge": True,
        },
        headers={"X-Gemini-Key": SECRET_BYOK_KEY},
    )
    assert res_legacy_byok.status_code == 200
    data_legacy = res_legacy_byok.json()
    assert data_legacy["score"] == 100
    assert data_legacy["judge"]["status"] == "applied"
    assert data_legacy["judge"]["key_source"] == "byok"
    assert data_legacy["findings"] == []

    mock_generate.reset_mock()
    res_opt_out = client.post(
        "/api/challenges/evaluate-custom",
        json={**base_payload, "semantic_judge": False},
        headers={"X-Gemini-Key": SECRET_BYOK_KEY},
    )
    assert res_opt_out.status_code == 200
    assert res_opt_out.json()["score"] == 50
    assert res_opt_out.json()["judge"] is None
    mock_generate.assert_not_called()


def test_evaluate_custom_over_200_flagged_lines_returns_422(client: TestClient):
    """POST /evaluate-custom with >200 unique flagged_lines returns 422, not 500."""
    res = client.post(
        "/api/challenges/evaluate-custom",
        json={
            "code_snippet": "\n".join(f"line_{i} = {i}" for i in range(1, 220)),
            "expected_issues": [
                {
                    "id": "i1",
                    "title": "Test",
                    "severity": "medium",
                    "lines": [1],
                    "keywords": ["test"],
                }
            ],
            "flagged_lines": list(range(1, 206)),
            "comments": "Many lines flagged.",
        },
    )
    assert res.status_code == 422


@patch("backend.services.grading.judge.service.HttpxGeminiClient.generate_json")
def test_submissions_history_gates_judge_feedback_until_unlocked(
    mock_generate: AsyncMock,
    client_factory,
    session: Session,
):
    """GET /submissions blanks judge.verdicts[*].feedback until pass, reveal, or 3rd."""
    ch = _seed_judge_challenge(session, slug="judge-history-spoiler", two_defects=True)
    mock_generate.return_value = {
        "verdicts": [
            {
                "defect_id": "sqli-1",
                "concept_credit": 1.0,
                "rubric": {"root_cause": True, "impact": True, "fix": True},
                "feedback": "Spoiler-sensitive judge feedback on SQLi.",
            }
        ]
    }
    review_payload = {
        "findings": [
            {
                "id": "f1",
                "start_line": 2,
                "end_line": 2,
                "body": "User input is pasted right into the database query.",
            }
        ],
        "semantic_judge": True,
    }
    headers = {"X-Gemini-Key": SECRET_BYOK_KEY}

    c1 = client_factory()
    r1 = c1.post(
        f"/api/challenges/{ch.slug}/review?reveal=true",
        json=review_payload,
        headers=headers,
    )
    assert r1.status_code == 200
    d1 = r1.json()
    assert d1["score"] < 80
    assert (
        d1["judge"]["verdicts"][0]["feedback"]
        == "Spoiler-sensitive judge feedback on SQLi."
    )

    h1_locked = c1.get(f"/api/challenges/{ch.slug}/submissions")
    assert h1_locked.status_code == 200
    assert h1_locked.json()[0]["judge"]["verdicts"][0]["feedback"] == ""

    h1_revealed = c1.get(f"/api/challenges/{ch.slug}/submissions?reveal=true")
    assert h1_revealed.status_code == 200
    assert (
        h1_revealed.json()[0]["judge"]["verdicts"][0]["feedback"]
        == "Spoiler-sensitive judge feedback on SQLi."
    )

    c2 = client_factory()
    for expected_feedback in ("", ""):
        res_attempt = c2.post(
            f"/api/challenges/{ch.slug}/review",
            json=review_payload,
            headers=headers,
        )
        assert res_attempt.status_code == 200
        assert (
            res_attempt.json()["judge"]["verdicts"][0]["feedback"] == expected_feedback
        )
        hist = c2.get(f"/api/challenges/{ch.slug}/submissions")
        assert hist.status_code == 200
        assert hist.json()[0]["judge"]["verdicts"][0]["feedback"] == ""

    res_attempt3 = c2.post(
        f"/api/challenges/{ch.slug}/review",
        json=review_payload,
        headers=headers,
    )
    assert res_attempt3.status_code == 200
    assert (
        res_attempt3.json()["judge"]["verdicts"][0]["feedback"]
        == "Spoiler-sensitive judge feedback on SQLi."
    )
    hist_unlocked = c2.get(f"/api/challenges/{ch.slug}/submissions")
    assert hist_unlocked.status_code == 200
    unlocked_items = hist_unlocked.json()
    assert len(unlocked_items) == 3
    for item in unlocked_items:
        assert (
            item["judge"]["verdicts"][0]["feedback"]
            == "Spoiler-sensitive judge feedback on SQLi."
        )


def test_submissions_history_gates_denied_keywords_and_config_rejects_gemini_api_key(
    client_factory,
    session: Session,
    monkeypatch: pytest.MonkeyPatch,
):
    """History gates denied_keywords when locked; Settings ignores GEMINI_API_KEY."""
    monkeypatch.setenv("GEMINI_API_KEY", "general-key-must-not-enable-judge")
    monkeypatch.delenv("GEMINI_JUDGE_API_KEY", raising=False)
    fresh_settings = Settings()
    assert fresh_settings.GEMINI_JUDGE_API_KEY is None
    assert (
        JudgeRequest.from_headers(byok_key=None, opt_in=True, settings=fresh_settings)
        is None
    )

    ch = Challenge(
        slug="denied-keywords-history-gate",
        title="Denied Keywords Gate Drill",
        difficulty=Difficulty.MEDIUM,
        category=Category.SECURITY,
        language=Language.PYTHON,
        description="Inspect query.",
        code_snippet="",
        expected_issues=json.dumps(
            [
                {
                    "id": "lineless-1",
                    "title": "Lineless Leak",
                    "severity": "medium",
                    "lines": [],
                    "keywords": ["memory leak", "cleanup"],
                    "explanation": "Memory is never freed.",
                }
            ]
        ),
        hints=json.dumps([{"tier": 1, "hint": "Look closely."}]),
        is_public=True,
    )
    session.add(ch)
    session.commit()

    c1 = client_factory()
    res = c1.post(
        f"/api/challenges/{ch.slug}/review?reveal=true",
        json={
            "findings": [],
            "comments": "There is no memory leak here at all.",
        },
    )
    assert res.status_code == 200
    assert res.json()["missed_issues"][0]["denied_keywords"] == ["memory leak"]

    locked_hist = c1.get(f"/api/challenges/{ch.slug}/submissions")
    assert locked_hist.status_code == 200
    assert locked_hist.json()[0]["missed_issues"][0]["denied_keywords"] == []
    assert locked_hist.json()[0]["missed_issues"][0]["missing_keywords"] == []
    assert locked_hist.json()[0]["missed_issues"][0]["explanation"] == ""

    revealed_hist = c1.get(f"/api/challenges/{ch.slug}/submissions?reveal=true")
    assert revealed_hist.status_code == 200
    assert revealed_hist.json()[0]["missed_issues"][0]["denied_keywords"] == [
        "memory leak"
    ]


@pytest.mark.anyio
async def test_gemini_client_non_ascii_key_and_400_classification():
    """Non-ASCII/control keys raise GeminiAuthError; generic 400 stays APIError."""
    client = HttpxGeminiClient()
    for bad_key in ("bad🔑key", "bad\u00e9key", "bad\nkey", "bad\rkey", "bad\x00key"):
        with pytest.raises(GeminiAuthError):
            await client.generate_json(
                prompt="hello",
                response_schema={"type": "OBJECT"},
                api_key=bad_key,
            )

    challenge = _borderline_challenge_dict()
    policy = GradingPolicy(attempt_number=1)
    review = ReviewSubmission(
        findings=[
            Finding(
                id="f1",
                anchor=Anchor(start_line=2, end_line=2),
                body="User input goes directly into query string.",
            )
        ]
    )
    base_report = grade_review(challenge, review, policy)
    non_ascii_req = JudgeRequest(
        api_key=SecretStr("bad🔑key"),
        key_source="byok",
        model="gemini-3.1-flash-lite",
        timeout_s=8.0,
    )
    res_non_ascii = await refine_with_judge(
        challenge, review, base_report, non_ascii_req, policy
    )
    assert res_non_ascii.judge is not None
    assert res_non_ascii.judge.status == "unavailable"
    assert res_non_ascii.judge.reason == "auth_error"

    def _handler_generic_400(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            400,
            json={
                "error": {
                    "code": 400,
                    "message": "Invalid JSON payload received.",
                    "status": "INVALID_ARGUMENT",
                }
            },
        )

    transport = httpx.MockTransport(_handler_generic_400)
    async with httpx.AsyncClient(transport=transport) as http_client:
        api_client = HttpxGeminiClient(http_client=http_client)
        with pytest.raises(GeminiAPIError):
            await api_client.generate_json(
                prompt="hello",
                response_schema={"type": "OBJECT"},
                api_key=SECRET_BYOK_KEY,
                fallback_models=(),
            )

    def _handler_bad_key_400(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            400,
            json={
                "error": {
                    "code": 400,
                    "message": "API key not valid. Please pass a valid API key.",
                    "status": "INVALID_ARGUMENT",
                    "details": [{"reason": "API_KEY_INVALID"}],
                }
            },
        )

    transport_auth = httpx.MockTransport(_handler_bad_key_400)
    async with httpx.AsyncClient(transport=transport_auth) as http_client:
        auth_client = HttpxGeminiClient(http_client=http_client)
        with pytest.raises(GeminiAuthError):
            await auth_client.generate_json(
                prompt="hello",
                response_schema={"type": "OBJECT"},
                api_key=SECRET_BYOK_KEY,
                fallback_models=(),
            )
