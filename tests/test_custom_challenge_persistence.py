"""Unit and integration tests for POST /api/challenges/custom persistence."""

from collections.abc import Callable
from typing import Any
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from backend.core.config import settings
from backend.core.guest_session import _decode
from backend.models.challenge import Challenge
from backend.services.ownership import CUSTOM_CHALLENGE_QUOTA


def _valid_custom_payload(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "topic": "Next.js Server Action IDOR",
        "language": "python",
        "difficulty": "Medium",
        "slug": "nextjs-server-action-idor",
        "title": "Server Action Tenant Bypass",
        "category": "Security",
        "description": "Review the server handler for tenant isolation flaws.",
        "threat_model": "Authenticated user reads or mutates another tenant's project.",
        "defect_target": "Identify 1 high-severity authorization bypass",
        "code_snippet": (
            "def load_project(db, project_id: int, actor_id: int):\n"
            "    project = db.get(Project, project_id)\n"
            "    if project is None:\n"
            "        raise ValueError('Not found')\n"
            "    return project\n"
        ),
        "expected_issues": [
            {
                "id": "idor-1",
                "title": "Missing tenant ownership check",
                "severity": "high",
                "anchor_lines": ["project = db.get(Project, project_id)"],
                "matched_lines": [2],
                "matched_keywords": ["idor", "ownership", "authorization"],
                "explanation": (
                    "Project is loaded by primary key without checking actor_id."
                ),
            }
        ],
        "hints": [
            {
                "tier": 1,
                "label": "Contextual clue",
                "text": "Trace how actor_id is used.",
            },
            {"tier": 2, "label": "Vulnerability class", "text": "Check for IDOR."},
            {"tier": 3, "label": "Line pointer", "text": "Look closely at line 2."},
        ],
        "canonical_review": "Verify project.owner_id == actor_id before returning.",
        "recommended_fix_diff": (
            "@@ -1,5 +1,5 @@\n"
            " def load_project(db, project_id: int, actor_id: int):\n"
            "     project = db.get(Project, project_id)\n"
            "-    if project is None:\n"
            "+    if project is None or project.owner_id != actor_id:\n"
            "         raise ValueError('Not found')\n"
            "     return project"
        ),
    }
    base.update(overrides)
    return base


@patch("backend.services.gemini_generator.httpx.AsyncClient.post")
def test_create_custom_challenge_persists_private_without_llm_http_call(
    mock_post: AsyncMock,
    session: Session,
    register_user: Callable[..., dict[str, Any]],
    login_as: Callable[..., TestClient],
):
    """POST /api/challenges/custom sanitizes and persists challenge without LLM I/O."""
    user = register_user("custom_persist_owner")
    auth_client = login_as("custom_persist_owner")

    res = auth_client.post("/api/challenges/custom", json=_valid_custom_payload())
    assert res.status_code == 200, res.text
    mock_post.assert_not_called()

    data = res.json()
    assert data["slug"] == "nextjs-server-action-idor"
    assert data["title"] == "Server Action Tenant Bypass"
    assert data["difficulty"] == "Medium"
    assert data["category"] == "Security"
    assert data["language"] == "python"
    assert data["is_custom"] is True
    assert data["line_count"] == 5
    assert data["total_hints"] == 3
    assert data["expected_issues"][0]["matched_lines"] == [2]

    db_row = session.exec(select(Challenge).where(Challenge.slug == data["slug"])).one()
    assert db_row.is_public is False
    assert db_row.user_id == user["id"]
    assert db_row.session_id is None


def test_create_custom_challenge_grounds_lines_and_realigns_diff_and_hints(
    client: TestClient,
):
    """Sanitizer grounds anchor_lines, diff hunks, and Tier 3 hint line pointers."""
    snippet = (
        "import os\n"
        "\n"
        "def run_report(user_filter: str) -> str:\n"
        "    cmd = f'grep {user_filter} /var/log/app.log'\n"
        "    return os.popen(cmd).read()\n"
    )
    payload = _valid_custom_payload(
        slug="command-injection-grounding",
        code_snippet=snippet,
        expected_issues=[
            {
                "id": "cmdi-1",
                "title": "Shell command injection",
                "severity": "critical",
                "anchor_lines": ["return os.popen(cmd).read()"],
                "matched_lines": [99],
                "matched_keywords": ["injection", "shell", "subprocess"],
                "explanation": "Untrusted filter is interpolated into a shell command.",
            }
        ],
        hints=[
            {"tier": 1, "label": "Clue", "text": "Check how external commands run."},
            {"tier": 2, "label": "Class", "text": "Look for shell injection."},
            {"tier": 3, "label": "Pointer", "text": "Inspect line 99 for the sink."},
        ],
        recommended_fix_diff=(
            "@@ -20,2 +20,2 @@\n"
            "     cmd = f'grep {user_filter} /var/log/app.log'\n"
            "-    return os.popen(cmd).read()\n"
            "+    return subprocess.run(['grep', user_filter], check=True).stdout"
        ),
    )

    res = client.post("/api/challenges/custom", json=payload)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["expected_issues"][0]["matched_lines"] == [5]
    tier3 = next(h for h in body["hints"] if h["tier"] == 3)
    assert "line 5" in tier3["text"]
    assert "line 99" not in tier3["text"]
    assert body["recommended_fix_diff"].startswith("@@ -4,2 +4,2 @@")


def test_create_custom_challenge_rejects_ungrounded_or_invalid_payload_with_422(
    client: TestClient,
):
    """Ungrounded defect lines and schema violations return HTTP 422."""
    ungrounded = _valid_custom_payload(
        code_snippet="def add(a: int, b: int) -> int:\n    return a + b\n",
        expected_issues=[
            {
                "id": "bad-1",
                "title": "Nonexistent defect",
                "severity": "high",
                "anchor_lines": ["cursor.execute(raw_sql_query)"],
                "matched_lines": [50],
                "matched_keywords": ["zzzz_nonmatching_keyword"],
                "explanation": "Anchor and line number do not exist in snippet.",
            }
        ],
        recommended_fix_diff="",
    )
    res = client.post("/api/challenges/custom", json=ungrounded)
    assert res.status_code == 422
    assert "unresolvable line numbers" in res.json()["detail"]

    empty_issues = _valid_custom_payload(expected_issues=[])
    assert client.post("/api/challenges/custom", json=empty_issues).status_code == 422

    whitespace_code = _valid_custom_payload(code_snippet="   \n  ")
    assert (
        client.post("/api/challenges/custom", json=whitespace_code).status_code == 422
    )


def test_create_custom_challenge_enforces_quota_and_delete_frees_slot(
    register_user: Callable[..., dict[str, Any]],
    login_as: Callable[..., TestClient],
):
    """Actor cannot exceed 5 custom challenges; deleting one frees a slot."""
    register_user("quota_custom_user")
    auth_client = login_as("quota_custom_user")

    created_slugs: list[str] = []
    for idx in range(CUSTOM_CHALLENGE_QUOTA):
        res = auth_client.post(
            "/api/challenges/custom",
            json=_valid_custom_payload(slug=f"quota-custom-{idx}"),
        )
        assert res.status_code == 200, res.text
        created_slugs.append(res.json()["slug"])

    over_res = auth_client.post(
        "/api/challenges/custom",
        json=_valid_custom_payload(slug="quota-custom-overflow"),
    )
    assert over_res.status_code == 400
    assert "Quota limit reached" in over_res.json()["detail"]

    del_res = auth_client.delete(f"/api/challenges/custom/{created_slugs[0]}")
    assert del_res.status_code == 200

    freed_res = auth_client.post(
        "/api/challenges/custom",
        json=_valid_custom_payload(slug="quota-custom-after-delete"),
    )
    assert freed_res.status_code == 200
    assert freed_res.json()["slug"] == "quota-custom-after-delete"


def test_create_custom_challenge_slug_collision_retry_and_409_exhaustion(
    session: Session,
    register_user: Callable[..., dict[str, Any]],
    login_as: Callable[..., TestClient],
):
    """Duplicate slugs receive a unique suffix; 5 IntegrityErrors raise HTTP 409."""
    register_user("slug_collision_user")
    auth_client = login_as("slug_collision_user")

    first = auth_client.post(
        "/api/challenges/custom",
        json=_valid_custom_payload(slug="duplicate-custom-slug"),
    )
    assert first.status_code == 200
    assert first.json()["slug"] == "duplicate-custom-slug"

    second = auth_client.post(
        "/api/challenges/custom",
        json=_valid_custom_payload(slug="duplicate-custom-slug"),
    )
    assert second.status_code == 200
    second_slug = second.json()["slug"]
    assert second_slug != "duplicate-custom-slug"
    assert second_slug.startswith("duplicate-custom-slug-")

    with patch.object(
        session,
        "commit",
        side_effect=IntegrityError("INSERT", {}, Exception("unique constraint")),
    ):
        conflict_res = auth_client.post(
            "/api/challenges/custom",
            json=_valid_custom_payload(slug="always-colliding-slug"),
        )
    assert conflict_res.status_code == 409
    assert "Failed to allocate a unique challenge slug" in conflict_res.json()["detail"]


def test_create_custom_challenge_anonymous_mints_guest_cookie_and_ignores_extra_fields(
    client_factory: Callable[[], TestClient],
    session: Session,
    register_user: Callable[..., dict[str, Any]],
):
    """Anonymous caller gets a signed guest cookie and cannot inject owner fields."""
    other_user = register_user("other_target_user")
    anon_client = client_factory()

    payload = _valid_custom_payload(
        slug="anon-minted-custom",
        is_public=True,
        user_id=other_user["id"],
        session_id="attacker-chosen-session-id",
        share_token="attacker-share-token",
        id=424242,
    )
    res = anon_client.post("/api/challenges/custom", json=payload)
    assert res.status_code == 200, res.text

    raw_cookie = res.cookies.get(settings.GUEST_COOKIE_NAME)
    assert raw_cookie is not None
    decoded_guest = _decode(raw_cookie)
    assert decoded_guest is not None
    assert decoded_guest.id != "attacker-chosen-session-id"

    body = res.json()
    assert body["id"] != 424242
    assert body["session_id"] == decoded_guest.id

    db_row = session.exec(select(Challenge).where(Challenge.slug == body["slug"])).one()
    assert db_row.is_public is False
    assert db_row.user_id is None
    assert db_row.session_id == decoded_guest.id
    assert db_row.share_token is None

    list_res = anon_client.get("/api/challenges/custom")
    assert list_res.status_code == 200
    assert [item["slug"] for item in list_res.json()["items"]] == [body["slug"]]


def test_create_custom_challenge_normalizes_unsafe_or_reserved_slugs_and_bounds_inputs(
    client_factory: Callable[[], TestClient],
):
    """Sanitizer normalizes arbitrary/reserved slugs and bounds nested inputs."""
    client = client_factory()
    dirty_slug_res = client.post(
        "/api/challenges/custom",
        json=_valid_custom_payload(slug="  My Unsafe/Slug..With Spaces! "),
    )
    assert dirty_slug_res.status_code == 200, dirty_slug_res.text
    assert dirty_slug_res.json()["slug"] == "my-unsafe-slug-with-spaces"

    for reserved in ("custom", "evaluate-custom", "generate-custom", "next", "12345"):
        fresh_client = client_factory()
        res = fresh_client.post(
            "/api/challenges/custom",
            json=_valid_custom_payload(slug=reserved),
        )
        assert res.status_code == 200, res.text
        assert res.json()["slug"].startswith("custom-challenge-python")

    oversized_issue = _valid_custom_payload(
        expected_issues=[
            {
                "id": "idor-1",
                "title": "x" * 301,
                "severity": "high",
                "anchor_lines": ["project = db.get(Project, project_id)"],
                "matched_lines": [2],
                "matched_keywords": ["idor"],
                "explanation": "Oversized title should be rejected by Pydantic bounds.",
            }
        ]
    )
    assert (
        client.post("/api/challenges/custom", json=oversized_issue).status_code == 422
    )

    oversized_hint = _valid_custom_payload(
        hints=[
            {
                "tier": 1,
                "label": "Clue",
                "text": "y" * 2001,
            }
        ]
    )
    assert client.post("/api/challenges/custom", json=oversized_hint).status_code == 422
