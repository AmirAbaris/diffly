"""Tests for Bring Your Own Key (BYOK) challenge generation and evaluation."""

import json
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from backend.models.challenge import (
    Category,
    Challenge,
    CustomChallengeResponse,
    Difficulty,
    GenerateCustomChallengeRequest,
    Language,
)
from backend.services.gemini_generator import (
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
        "gemini-3.1-flash-lite:generateContent"
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
def test_generate_custom_challenge_success_and_persisted_to_db(
    mock_post: AsyncMock,
    client: TestClient,
    session: Session,
):
    """Generates challenge, saves to PostgreSQL, excludes from public catalog."""
    gemini_payload = {
        "candidates": [
            {"content": {"parts": [{"text": json.dumps(SAMPLE_GEMINI_OUTPUT)}]}}
        ]
    }
    mock_post.return_value = make_mock_gemini_response(
        status_code=200,
        json_data=gemini_payload,
    )

    session_id = "test-guest-session-byok"
    response = client.post(
        "/api/challenges/generate-custom",
        json={
            "topic": "Next.js 15 Server Actions IDOR",
            "language": "typescript",
            "difficulty": "medium",
        },
        headers={
            "X-Gemini-Key": "AIzaSyValidKeyWorking",
            "X-Diffly-Session-Id": session_id,
        },
    )

    assert response.status_code == 200
    data = response.json()

    # Verify conforming fields
    assert data["id"] > 0
    assert data["slug"] == "nextjs-server-actions-idor"
    assert data["title"] == "Insecure Direct Object Reference in Server Action"
    assert data["difficulty"] == "Medium"
    assert data["language"] == "typescript"
    assert data["is_custom"] is True
    assert "updateDocument" in data["code_snippet"]
    assert data["line_count"] > 0
    assert len(data["threat_model"]) > 0

    # Verify database persistence
    db_challenge = session.exec(
        select(Challenge).where(Challenge.slug == "nextjs-server-actions-idor")
    ).first()
    assert db_challenge is not None
    assert db_challenge.is_public is False
    assert db_challenge.session_id == session_id

    # Verify excluded from public catalog
    public_catalog = client.get("/api/challenges").json()
    assert all(c["id"] != db_challenge.id for c in public_catalog)


# ==============================================================================
# 2. Quota Enforcement & Management Tests (Max 5 Custom Challenges)
# ==============================================================================


@patch("backend.services.gemini_generator.httpx.AsyncClient.post")
def test_strict_5_challenge_quota_enforcement(
    mock_post: AsyncMock,
    client: TestClient,
    session: Session,
):
    """Users can create up to 5 custom challenges; 6th attempt is rejected with 400."""
    gemini_payload = {
        "candidates": [
            {"content": {"parts": [{"text": json.dumps(SAMPLE_GEMINI_OUTPUT)}]}}
        ]
    }
    mock_post.return_value = make_mock_gemini_response(
        status_code=200,
        json_data=gemini_payload,
    )

    session_id = "quota-test-session"
    headers = {
        "X-Gemini-Key": "AIzaSyKey123",
        "X-Diffly-Session-Id": session_id,
    }

    # Generate 5 custom challenges
    for i in range(5):
        res = client.post(
            "/api/challenges/generate-custom",
            json={"topic": f"Custom scenario {i + 1}", "language": "python"},
            headers=headers,
        )
        assert res.status_code == 200, res.text

    # Verify quota list endpoint reports 5 total, 0 remaining
    list_res = client.get("/api/challenges/custom", headers=headers)
    assert list_res.status_code == 200
    list_data = list_res.json()
    assert list_data["total"] == 5
    assert list_data["quota_limit"] == 5
    assert list_data["quota_remaining"] == 0
    assert len(list_data["items"]) == 5

    # 6th attempt should be rejected with 400
    sixth_res = client.post(
        "/api/challenges/generate-custom",
        json={"topic": "Sixth custom scenario", "language": "python"},
        headers=headers,
    )
    assert sixth_res.status_code == 400
    assert "quota limit reached" in sixth_res.json()["detail"].lower()

    # Delete 1 challenge to free quota
    to_delete = list_data["items"][0]["slug"]
    del_res = client.delete(f"/api/challenges/custom/{to_delete}", headers=headers)
    assert del_res.status_code == 200
    assert del_res.json()["slug"] == to_delete

    # Verify quota list endpoint now reports 4 total, 1 remaining
    list_after = client.get("/api/challenges/custom", headers=headers).json()
    assert list_after["total"] == 4
    assert list_after["quota_remaining"] == 1

    # 6th challenge can now be generated successfully!
    retry_res = client.post(
        "/api/challenges/generate-custom",
        json={"topic": "Sixth custom scenario", "language": "python"},
        headers=headers,
    )
    assert retry_res.status_code == 200


def test_cannot_delete_public_challenge(client: TestClient, session: Session):
    """Attempting to delete a public challenge returns 403 Forbidden."""
    public_ch = Challenge(
        slug="public-official-scenario",
        title="Public Challenge",
        difficulty=Difficulty.EASY,
        category=Category.SECURITY,
        language=Language.PYTHON,
        description="Public test",
        code_snippet="x = 1",
        is_public=True,
    )
    session.add(public_ch)
    session.commit()

    res = client.delete(
        f"/api/challenges/custom/{public_ch.slug}",
        headers={"X-Diffly-Session-Id": "any-session"},
    )
    assert res.status_code == 403
    assert "cannot delete public" in res.json()["detail"].lower()


def test_cannot_delete_another_users_custom_challenge(
    client: TestClient,
    session: Session,
):
    """Attempting to delete another user's private challenge returns 403."""
    other_ch = Challenge(
        slug="other-user-private-ch",
        title="Other Private",
        difficulty=Difficulty.MEDIUM,
        category=Category.SECURITY,
        language=Language.PYTHON,
        description="Other test",
        code_snippet="x = 2",
        is_public=False,
        session_id="owner-session",
    )
    session.add(other_ch)
    session.commit()

    # Different user tries to delete
    res = client.delete(
        f"/api/challenges/custom/{other_ch.slug}",
        headers={"X-Diffly-Session-Id": "attacker-session"},
    )
    assert res.status_code == 403
    assert "permission" in res.json()["detail"].lower()


def test_unauthorized_user_cannot_view_private_challenge(
    client: TestClient,
    session: Session,
):
    """Private challenge returns 404 to users other than the owner."""
    private_ch = Challenge(
        slug="secret-private-challenge",
        title="Secret Private",
        difficulty=Difficulty.HARD,
        category=Category.SECURITY,
        language=Language.PYTHON,
        description="Private",
        code_snippet="secret = True",
        is_public=False,
        session_id="legit-owner-session",
    )
    session.add(private_ch)
    session.commit()

    # Unauthorized guest
    res_stranger = client.get(
        f"/api/challenges/{private_ch.slug}",
        headers={"X-Diffly-Session-Id": "stranger-session"},
    )
    assert res_stranger.status_code == 404

    # Legitimate owner can view
    res_owner = client.get(
        f"/api/challenges/{private_ch.slug}",
        headers={"X-Diffly-Session-Id": "legit-owner-session"},
    )
    assert res_owner.status_code == 200
    assert res_owner.json()["slug"] == "secret-private-challenge"


# ==============================================================================
# 3. Direct Review & Hints on Private Challenges
# ==============================================================================


def test_owner_can_review_and_view_hints_on_private_challenge(
    client: TestClient,
    session: Session,
):
    """Owner can interact with their private challenge in the Arena seamlessly."""
    session_id = "arena-owner-session"
    challenge = Challenge(
        slug="private-review-arena-test",
        title="Private Review Arena Test",
        difficulty=Difficulty.MEDIUM,
        category=Category.SECURITY,
        language=Language.PYTHON,
        description="Find flaw",
        threat_model="Data corruption",
        defect_target="Find 1 defect",
        code_snippet="x = eval(input())\n",
        expected_issues=json.dumps(
            [
                {
                    "id": "crit-eval",
                    "title": "Unsanitized Eval",
                    "severity": "critical",
                    "lines": [1],
                    "keywords": ["eval", "rce"],
                    "explanation": "Dangerous eval",
                }
            ]
        ),
        hints=json.dumps([{"tier": 1, "hint": "Check line 1 eval call."}]),
        is_public=False,
        session_id=session_id,
    )
    session.add(challenge)
    session.commit()

    headers = {"X-Diffly-Session-Id": session_id}

    # 1. Fetch hints
    hints_res = client.get(f"/api/challenges/{challenge.slug}/hints", headers=headers)
    assert hints_res.status_code == 200
    assert len(hints_res.json()) == 1

    # 2. Submit review
    sub_res = client.post(
        f"/api/challenges/{challenge.slug}/review",
        json={
            "flagged_lines": [1],
            "comments": "eval allows dangerous rce execution.",
        },
        headers=headers,
    )
    assert sub_res.status_code == 200
    assert sub_res.json()["score"] == 100

    # 3. Fetch submissions history
    history_res = client.get(
        f"/api/challenges/{challenge.slug}/submissions",
        headers=headers,
    )
    assert history_res.status_code == 200
    assert len(history_res.json()) == 1


# ==============================================================================
# 4. Stateless Evaluation Support Tests (POST /api/challenges/evaluate-custom)
# ==============================================================================


def test_stateless_evaluation_perfect_score(client: TestClient):
    """Stateless evaluation yields 100% score for direct evaluation requests."""
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
    assert len(result["detected_issues"]) == 1


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

    assert result["score"] == 50
    assert result["line_precision_score"] == 100.0
    assert result["concept_score"] == 0.0
    assert len(result["detected_issues"]) == 1


# ==============================================================================
# 5. Service-Level Unit Tests (Exceptions, Clamping, Sanitization)
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
    assert result.expected_issues[0].lines == [1]


def test_clean_markdown_json_helper():
    """Test clean_markdown_json strips varied fence patterns."""
    assert clean_markdown_json('{"key": "value"}') == '{"key": "value"}'
    assert clean_markdown_json('```json\n{"a": 1}\n```') == '{"a": 1}'
    assert clean_markdown_json('```\n{"b": 2}\n```') == '{"b": 2}'
