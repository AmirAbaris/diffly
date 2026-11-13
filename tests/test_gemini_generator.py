"""Tests for Bring Your Own Key (BYOK) challenge generation and evaluation."""

import json
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from backend.models.challenge import (
    Challenge,
    CustomChallengeResponse,
    DefectCriterion,
    Difficulty,
    GenerateCustomChallengeRequest,
    Language,
)
from backend.models.submission import Submission
from backend.services.gemini_generator import (
    GeminiAPIError,
    GeminiAuthError,
    GeminiRateLimitError,
    GeminiSchemaError,
    clean_markdown_json,
    generate_custom_challenge,
    sanitize_generated_challenge,
)


SAMPLE_GEMINI_OUTPUT = {
    "slug": "nextjs-server-actions-idor",
    "title": "Insecure Direct Object Reference in Server Action",
    "difficulty": "Medium",
    "category": "Security",
    "language": "typescript",
    "description": "Inspect Server Action mutation for tenant isolation defects.",
    "threat_model": (
        "An attacker can pass another tenant's document_id and mutate records."
    ),
    "defect_target": "Identify 1 High-Severity IDOR vulnerability in Server Action",
    "code_snippet": (
        '"use server";\n'
        'import { db } from "@/lib/db";\n'
        'import { auth } from "@/lib/auth";\n'
        "\n"
        "export async function updateDocument(documentId: string, content: string) {\n"
        "  const session = await auth();\n"
        '  if (!session?.user) throw new Error("Unauthorized");\n'
        "  // Vulnerability: Missing tenant_id ownership check\n"
        "  return await db.document.update({\n"
        "    where: { id: documentId },\n"
        "    data: { content },\n"
        "  });\n"
        "}\n"
    ),
    "expected_issues": [
        {
            "id": "defect-idor-1",
            "title": "Missing Tenant Authorization Check (IDOR)",
            "severity": "high",
            "matched_lines": [9, 10, 11],
            "matched_keywords": ["idor", "tenant", "authorization", "ownership"],
            "explanation": (
                "The update mutation queries document by primary ID only without "
                "verifying that the document belongs to session.user.tenantId."
            ),
        }
    ],
    "hints": [
        {
            "tier": 1,
            "label": "Contextual clue",
            "text": "Check how the document associates with the authenticated user.",
        },
        {
            "tier": 2,
            "label": "Vulnerability class",
            "text": "This is an Insecure Direct Object Reference (IDOR) flaw.",
        },
        {
            "tier": 3,
            "label": "Line pointer",
            "text": "Inspect the where clause in db.document.update (lines 9-11).",
        },
    ],
    "canonical_review": (
        "The updateDocument action verifies authentication but fails authorization. "
        "Filter by both document ID and tenant_id to prevent cross-tenant mutations."
    ),
    "recommended_fix_diff": (
        "@@ -9,3 +9,4 @@\n"
        "-    where: { id: documentId },\n"
        "+    where: { id: documentId, tenantId: session.user.tenantId },\n"
    ),
}


def make_mock_gemini_response(
    status_code: int = 200,
    json_data: dict | None = None,
    raw_text: str | None = None,
) -> httpx.Response:
    """Helper to build a mocked httpx.Response from Gemini."""
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        "gemini-1.5-flash:generateContent"
    )
    request = httpx.Request("POST", url)
    if json_data is not None:
        return httpx.Response(status_code=status_code, json=json_data, request=request)
    return httpx.Response(
        status_code=status_code,
        text=raw_text or "",
        request=request,
    )


# ==============================================================================
# 1. Generation Endpoint Unit & Integration Tests (POST /api/challenges/generate-custom)
# ==============================================================================


def test_generate_custom_challenge_missing_api_key_header(client: TestClient):
    """Returns HTTP 401 when X-Gemini-Key header is omitted."""
    response = client.post(
        "/api/challenges/generate-custom",
        json={
            "topic": "Python LangChain tool injection",
            "language": "python",
            "difficulty": "medium",
        },
    )
    assert response.status_code == 401
    assert "Missing or invalid Gemini API key" in response.json()["detail"]


def test_generate_custom_challenge_blank_api_key_header(client: TestClient):
    """Returns HTTP 401 when X-Gemini-Key header contains only whitespace."""
    response = client.post(
        "/api/challenges/generate-custom",
        json={
            "topic": "FastAPI IDOR vulnerability",
            "language": "python",
            "difficulty": "hard",
        },
        headers={"X-Gemini-Key": "    "},
    )
    assert response.status_code == 401
    assert "Missing or invalid Gemini API key" in response.json()["detail"]


@patch("backend.services.gemini_generator.httpx.AsyncClient.post")
def test_generate_custom_challenge_invalid_key_rejected_by_gemini(
    mock_post: AsyncMock,
    client: TestClient,
):
    """Returns HTTP 401 when Google Gemini returns 400 API_KEY_INVALID."""
    error_body = json.dumps(
        {
            "error": {
                "code": 400,
                "message": "API key not valid. Please pass a valid API key.",
                "status": "INVALID_ARGUMENT",
                "details": [{"reason": "API_KEY_INVALID"}],
            }
        }
    )
    mock_post.return_value = make_mock_gemini_response(
        status_code=400,
        raw_text=error_body,
    )

    response = client.post(
        "/api/challenges/generate-custom",
        json={
            "topic": "Go mutex deadlock",
            "language": "go",
            "difficulty": "medium",
        },
        headers={"X-Gemini-Key": "AIzaSyFakeInvalidKey"},
    )
    assert response.status_code == 401
    assert "Invalid Gemini API key" in response.json()["detail"]


@patch("backend.services.gemini_generator.httpx.AsyncClient.post")
def test_generate_custom_challenge_403_forbidden_key(
    mock_post: AsyncMock,
    client: TestClient,
):
    """Returns HTTP 401 when Gemini returns 403 Forbidden."""
    mock_post.return_value = make_mock_gemini_response(
        status_code=403,
        raw_text="The caller does not have permission",
    )

    response = client.post(
        "/api/challenges/generate-custom",
        json={"topic": "Rust unsafe block", "language": "rust", "difficulty": "hard"},
        headers={"X-Gemini-Key": "AIzaSyDeniedKey"},
    )
    assert response.status_code == 401
    assert "Invalid Gemini API key" in response.json()["detail"]


@patch("backend.services.gemini_generator.httpx.AsyncClient.post")
def test_generate_custom_challenge_rate_limited_429(
    mock_post: AsyncMock,
    client: TestClient,
):
    """Returns HTTP 429 when Gemini API rate limit is exceeded."""
    mock_post.return_value = make_mock_gemini_response(
        status_code=429,
        raw_text="Resource has been exhausted (e.g. check quota).",
    )

    response = client.post(
        "/api/challenges/generate-custom",
        json={"topic": "Concurrency race", "language": "python"},
        headers={"X-Gemini-Key": "AIzaSyValidKeyOverQuota"},
    )
    assert response.status_code == 429
    assert "rate limit exceeded" in response.json()["detail"].lower()


@patch("backend.services.gemini_generator.httpx.AsyncClient.post")
def test_generate_custom_challenge_gemini_server_error_502(
    mock_post: AsyncMock,
    client: TestClient,
):
    """Returns HTTP 502 when Gemini API encounters a server or network failure."""
    mock_post.return_value = make_mock_gemini_response(
        status_code=500,
        raw_text="Internal Server Error",
    )

    response = client.post(
        "/api/challenges/generate-custom",
        json={"topic": "Memory leak", "language": "typescript"},
        headers={"X-Gemini-Key": "AIzaSyValidKey"},
    )
    assert response.status_code == 502
    assert "Gemini API request failed" in response.json()["detail"]


@patch("backend.services.gemini_generator.httpx.AsyncClient.post")
def test_generate_custom_challenge_network_exception_502(
    mock_post: AsyncMock,
    client: TestClient,
):
    """Returns HTTP 502 when httpx raises a RequestError."""
    mock_post.side_effect = httpx.ConnectError("Connection refused")

    response = client.post(
        "/api/challenges/generate-custom",
        json={"topic": "Memory leak", "language": "typescript"},
        headers={"X-Gemini-Key": "AIzaSyValidKey"},
    )
    assert response.status_code == 502
    assert "Failed to communicate with Gemini API" in response.json()["detail"]


@patch("backend.services.gemini_generator.httpx.AsyncClient.post")
def test_generate_custom_challenge_success(
    mock_post: AsyncMock,
    client: TestClient,
    session: Session,
):
    """Generate-custom returns conforming Challenge without DB persistence."""
    gemini_payload = {
        "candidates": [
            {"content": {"parts": [{"text": json.dumps(SAMPLE_GEMINI_OUTPUT)}]}}
        ]
    }
    mock_post.return_value = make_mock_gemini_response(
        status_code=200,
        json_data=gemini_payload,
    )

    response = client.post(
        "/api/challenges/generate-custom",
        json={
            "topic": "Next.js 15 Server Actions IDOR",
            "language": "typescript",
            "difficulty": "medium",
        },
        headers={"X-Gemini-Key": "AIzaSyValidKeyWorking"},
    )

    assert response.status_code == 200
    data = response.json()

    # Verify conforming fields
    assert data["slug"] == "nextjs-server-actions-idor"
    assert data["title"] == "Insecure Direct Object Reference in Server Action"
    assert data["difficulty"] == "Medium"
    assert data["language"] == "typescript"
    assert data["is_custom"] is True
    assert "updateDocument" in data["code_snippet"]
    assert data["line_count"] > 0
    assert len(data["threat_model"]) > 0
    assert len(data["defect_target"]) > 0
    assert len(data["canonical_review"]) > 0
    assert len(data["recommended_fix_diff"]) > 0

    # Verify expected_issues
    assert len(data["expected_issues"]) == 1
    issue = data["expected_issues"][0]
    assert issue["id"] == "defect-idor-1"
    assert issue["title"] == "Missing Tenant Authorization Check (IDOR)"
    assert issue["severity"] == "high"
    assert issue["matched_lines"] == [9, 10, 11]
    assert issue["lines"] == [9, 10, 11]
    assert "idor" in issue["matched_keywords"]
    assert len(issue["explanation"]) > 0

    # Verify progressive hints
    assert len(data["hints"]) == 3
    assert [h["tier"] for h in data["hints"]] == [1, 2, 3]

    # Verify zero server persistence: DB remains untouched
    db_challenges = session.exec(select(Challenge)).all()
    assert len(db_challenges) == 0


@patch("backend.services.gemini_generator.httpx.AsyncClient.post")
def test_generate_custom_challenge_markdown_fenced_json(
    mock_post: AsyncMock,
    client: TestClient,
):
    """Parser gracefully unwraps markdown ```json ... ``` code fence blocks."""
    fenced_text = f"```json\n{json.dumps(SAMPLE_GEMINI_OUTPUT)}\n```"
    gemini_payload = {"candidates": [{"content": {"parts": [{"text": fenced_text}]}}]}
    mock_post.return_value = make_mock_gemini_response(
        status_code=200,
        json_data=gemini_payload,
    )

    response = client.post(
        "/api/challenges/generate-custom",
        json={"topic": "Server Actions IDOR", "language": "typescript"},
        headers={"X-Gemini-Key": "AIzaSyValidKey"},
    )
    assert response.status_code == 200
    assert response.json()["slug"] == "nextjs-server-actions-idor"


# ==============================================================================
# 2. Service-Level Unit Tests (Exceptions, Clamping, Sanitization)
# ==============================================================================


@pytest.mark.anyio
async def test_generate_custom_challenge_service_auth_error():
    """Service raises GeminiAuthError when API key is missing."""
    req = GenerateCustomChallengeRequest(topic="Testing")
    with pytest.raises(GeminiAuthError, match="Missing or invalid Gemini API key"):
        await generate_custom_challenge(req, "")


@pytest.mark.anyio
async def test_generate_custom_challenge_service_rate_limit():
    """Service raises GeminiRateLimitError when 429 is returned."""
    req = GenerateCustomChallengeRequest(topic="Rate Limit")
    mock_client = AsyncMock()
    mock_client.post.return_value = make_mock_gemini_response(
        status_code=429, raw_text="Quota exceeded"
    )

    with pytest.raises(GeminiRateLimitError):
        await generate_custom_challenge(req, "test-key", client=mock_client)


@pytest.mark.anyio
async def test_generate_custom_challenge_service_bad_schema():
    """Service raises GeminiSchemaError when Gemini returns invalid JSON."""
    req = GenerateCustomChallengeRequest(topic="Bad Schema")
    mock_client = AsyncMock()
    mock_client.post.return_value = make_mock_gemini_response(
        status_code=200,
        json_data={"candidates": [{"content": {"parts": [{"text": "not-json"}]}}]},
    )

    with pytest.raises(GeminiSchemaError):
        await generate_custom_challenge(req, "test-key", client=mock_client)


@pytest.mark.anyio
async def test_generate_custom_challenge_service_server_error():
    """Service raises GeminiAPIError when status is 500."""
    req = GenerateCustomChallengeRequest(topic="Server error")
    mock_client = AsyncMock()
    mock_client.post.return_value = make_mock_gemini_response(
        status_code=500, raw_text="Internal Error"
    )

    with pytest.raises(GeminiAPIError):
        await generate_custom_challenge(req, "test-key", client=mock_client)


def test_sanitize_clamps_out_of_bounds_lines():
    """Sanitizer clamps out-of-range lines to valid line numbers in code_snippet."""
    raw = {
        "code_snippet": "def safe_func():\n    return 42\n",  # 2 lines
        "expected_issues": [
            {
                "id": "bad-lines",
                "title": "Bug",
                "severity": "medium",
                "matched_lines": [999, -5],
                "matched_keywords": ["safe_func"],
                "explanation": "Out of range lines",
            }
        ],
    }
    req = GenerateCustomChallengeRequest(
        topic="Clamp test",
        language=Language.PYTHON,
        difficulty=Difficulty.EASY,
    )
    result = sanitize_generated_challenge(raw, req)
    assert isinstance(result, CustomChallengeResponse)
    assert result.line_count == 2
    # Keyword search found line 1 ("safe_func")
    assert result.expected_issues[0].lines == [1]


def test_clean_markdown_json_helper():
    """Test clean_markdown_json strips varied fence patterns."""
    assert clean_markdown_json('{"key": "value"}') == '{"key": "value"}'
    assert clean_markdown_json('```json\n{"a": 1}\n```') == '{"a": 1}'
    assert clean_markdown_json('```\n{"b": 2}\n```') == '{"b": 2}'


# ==============================================================================
# 3. Stateless Evaluation Support Tests (POST /api/challenges/evaluate-custom)
# ==============================================================================


def test_stateless_evaluation_perfect_score(client: TestClient, session: Session):
    """Stateless evaluation yields 100% score without persisting any DB row."""
    payload = {
        "expected_issues": SAMPLE_GEMINI_OUTPUT["expected_issues"],
        "code_snippet": SAMPLE_GEMINI_OUTPUT["code_snippet"],
        "flagged_lines": [9, 10, 11],
        "comments": (
            "Missing tenant isolation authorization check causes an IDOR flaw. "
            "Filter by tenant ownership to fix this."
        ),
    }

    response = client.post("/api/challenges/evaluate-custom", json=payload)
    assert response.status_code == 200
    result = response.json()

    assert result["score"] == 100
    assert result["line_precision_score"] == 100.0
    assert result["concept_score"] == 100.0
    assert result["false_positive_penalty"] == 0.0
    assert result["false_positive_lines"] == []
    assert len(result["detected_issues"]) == 1
    assert len(result["missed_issues"]) == 0
    assert "Outstanding review" in result["summary"]
    assert len(result["feedback"]) > 0
    assert result["execution_time_ms"] >= 0.0

    # Ensure no database records were created
    submissions = session.exec(select(Submission)).all()
    assert len(submissions) == 0


def test_stateless_evaluation_partial_score(client: TestClient):
    """Evaluates partial score when correct lines are flagged with empty critique."""
    payload = {
        "expected_issues": SAMPLE_GEMINI_OUTPUT["expected_issues"],
        "code_snippet": SAMPLE_GEMINI_OUTPUT["code_snippet"],
        "flagged_lines": [9, 10],
        "comments": "",
    }

    response = client.post("/api/challenges/evaluate-custom", json=payload)
    assert response.status_code == 200
    result = response.json()

    # Line precision = 100, Concept = 0 -> 50%
    assert result["score"] == 50
    assert result["line_precision_score"] == 100.0
    assert result["concept_score"] == 0.0
    assert len(result["detected_issues"]) == 1


def test_stateless_evaluation_false_positives(client: TestClient):
    """Applies penalties for flagging clean lines outside defect tolerance."""
    payload = {
        "expected_issues": SAMPLE_GEMINI_OUTPUT["expected_issues"],
        "code_snippet": SAMPLE_GEMINI_OUTPUT["code_snippet"],
        "flagged_lines": [10, 1, 2],  # line 10 is valid; lines 1 and 2 are clean lines
        "comments": "IDOR defect tenant authorization.",
    }

    response = client.post("/api/challenges/evaluate-custom", json=payload)
    assert response.status_code == 200
    result = response.json()

    # Base score 100 - (2 false positives * 15 pts) = 70 pts
    assert result["score"] == 70
    assert result["false_positive_penalty"] == 30.0
    assert result["false_positive_lines"] == [1, 2]


def test_stateless_evaluation_with_defect_criterion_instances(client: TestClient):
    """Accepts expected_issues serialized from DefectCriterion instances."""
    criterion = DefectCriterion(
        id="defect-x",
        title="SQL Injection",
        severity="critical",
        lines=[15],
        keywords=["sql", "injection", "parameterized"],
        explanation="Raw SQL query",
    )

    payload = {
        "expected_issues": [criterion.model_dump()],
        "code_snippet": "query = f'SELECT * FROM users WHERE id = {user_id}'",
        "flagged_lines": [15],
        "comments": "Raw SQL injection vulnerability; use parameterized queries.",
    }

    response = client.post("/api/challenges/evaluate-custom", json=payload)
    assert response.status_code == 200
    assert response.json()["score"] == 100


# ==============================================================================
# 4. End-to-End BYOK Flow (Generate -> Evaluate)
# ==============================================================================


@patch("backend.services.gemini_generator.httpx.AsyncClient.post")
def test_generate_and_evaluate_end_to_end_flow(
    mock_post: AsyncMock,
    client: TestClient,
):
    """Full seamless lifecycle: Generate challenge with Gemini key, then evaluate."""
    mock_post.return_value = make_mock_gemini_response(
        status_code=200,
        json_data={
            "candidates": [
                {"content": {"parts": [{"text": json.dumps(SAMPLE_GEMINI_OUTPUT)}]}}
            ]
        },
    )

    # 1. User generates challenge via BYOK
    gen_res = client.post(
        "/api/challenges/generate-custom",
        json={
            "topic": "Next.js 15 Server Actions IDOR",
            "language": "typescript",
            "difficulty": "medium",
        },
        headers={"X-Gemini-Key": "AIzaSyTestUserKey123"},
    )
    assert gen_res.status_code == 200
    generated = gen_res.json()

    # 2. User solves challenge and client sends evaluation payload
    eval_res = client.post(
        "/api/challenges/evaluate-custom",
        json={
            "expected_issues": generated["expected_issues"],
            "code_snippet": generated["code_snippet"],
            "flagged_lines": [9, 10],
            "comments": "IDOR vulnerability: missing tenant authorization check.",
        },
    )
    assert eval_res.status_code == 200
    eval_data = eval_res.json()

    assert eval_data["score"] == 100
    assert eval_data["line_precision_score"] == 100.0
    assert eval_data["concept_score"] == 100.0
    assert len(eval_data["detected_issues"]) == 1
    assert eval_data["detected_issues"][0]["id"] == "defect-idor-1"
