"""Authorization matrix tests covering every FastAPI route and actor role."""

import json
from collections.abc import Callable, Iterator
from typing import Any
from unittest.mock import AsyncMock, patch

import httpx
from fastapi.testclient import TestClient
from sqlmodel import Session

from api.index import app
from backend.core.config import settings
from backend.core.security import create_access_token
from backend.models.challenge import Category, Challenge, Difficulty, Language
from backend.models.submission import Submission
from backend.models.user import User


PUBLIC_ROUTES: dict[tuple[str, str], str] = {
    ("GET", "/openapi.json"): "FastAPI OpenAPI schema endpoint",
    ("GET", "/docs"): "FastAPI Swagger UI documentation",
    ("GET", "/docs/oauth2-redirect"): "FastAPI Swagger OAuth2 redirect",
    ("GET", "/redoc"): "FastAPI ReDoc documentation",
    ("GET", "/scalar"): "Scalar API documentation",
    ("GET", "/api/health"): "Public health probe",
    ("POST", "/api/auth/register"): "Public registration endpoint",
    ("POST", "/api/auth/login"): "Public credential login endpoint",
    ("POST", "/api/auth/logout"): "Cookie-clearing logout endpoint",
    (
        "POST",
        "/api/challenges/evaluate-custom",
    ): "Stateless evaluation endpoint with no persisted resources",
}

MATRIX: dict[tuple[str, str], dict[str, dict[str, int]]] = {
    ("GET", "/api/auth/me"): {
        "self": {
            "anonymous": 401,
            "guest_a": 401,
            "guest_b": 401,
            "user_a": 200,
            "user_b": 200,
            "inactive": 401,
        },
    },
    ("GET", "/api/challenges"): {
        "public_catalog": {
            "anonymous": 200,
            "guest_a": 200,
            "guest_b": 200,
            "user_a": 200,
            "user_b": 200,
            "inactive": 200,
        },
    },
    ("POST", "/api/challenges/generate-custom"): {
        "create_owned_custom": {
            "user_a": 200,
            "guest_a": 200,
        },
    },
    ("GET", "/api/challenges/custom"): {
        "own_list": {
            "anonymous": 200,
            "guest_a": 200,
            "guest_b": 200,
            "user_a": 200,
            "user_b": 200,
            "inactive": 200,
        },
    },
    ("DELETE", "/api/challenges/custom/{identifier}"): {
        "user_a_private": {
            "anonymous": 404,
            "guest_a": 404,
            "guest_b": 404,
            "user_a": 200,
            "user_b": 404,
            "inactive": 404,
        },
        "guest_a_private": {
            "anonymous": 404,
            "guest_a": 200,
            "guest_b": 404,
            "user_a": 404,
            "user_b": 404,
            "inactive": 404,
        },
    },
    ("GET", "/api/challenges/{identifier}"): {
        "user_a_private": {
            "anonymous": 404,
            "guest_a": 404,
            "guest_b": 404,
            "user_a": 200,
            "user_b": 404,
            "inactive": 404,
        },
        "guest_a_private": {
            "anonymous": 404,
            "guest_a": 200,
            "guest_b": 404,
            "user_a": 404,
            "user_b": 404,
            "inactive": 404,
        },
        "public": {
            "anonymous": 200,
            "guest_a": 200,
            "guest_b": 200,
            "user_a": 200,
            "user_b": 200,
            "inactive": 200,
        },
    },
    ("GET", "/api/challenges/{identifier}/hints"): {
        "user_a_private": {
            "anonymous": 404,
            "guest_a": 404,
            "guest_b": 404,
            "user_a": 200,
            "user_b": 404,
            "inactive": 404,
        },
        "guest_a_private": {
            "anonymous": 404,
            "guest_a": 200,
            "guest_b": 404,
            "user_a": 404,
            "user_b": 404,
            "inactive": 404,
        },
    },
    ("GET", "/api/challenges/{identifier}/solution"): {
        "user_a_private": {
            "anonymous": 404,
            "guest_a": 404,
            "guest_b": 404,
            "user_a": 200,
            "user_b": 404,
            "inactive": 404,
        },
        "guest_a_private": {
            "anonymous": 404,
            "guest_a": 200,
            "guest_b": 404,
            "user_a": 404,
            "user_b": 404,
            "inactive": 404,
        },
        "public_unrevealed": {
            "anonymous": 403,
            "guest_a": 200,
            "guest_b": 403,
            "user_a": 200,
            "user_b": 403,
            "inactive": 403,
        },
    },
    ("POST", "/api/challenges/{identifier}/review"): {
        "user_a_private": {
            "anonymous": 404,
            "guest_a": 404,
            "guest_b": 404,
            "user_a": 200,
            "user_b": 404,
            "inactive": 404,
        },
        "guest_a_private": {
            "anonymous": 404,
            "guest_a": 200,
            "guest_b": 404,
            "user_a": 404,
            "user_b": 404,
            "inactive": 404,
        },
    },
    ("GET", "/api/challenges/{identifier}/submissions"): {
        "user_a_private": {
            "anonymous": 404,
            "guest_a": 404,
            "guest_b": 404,
            "user_a": 200,
            "user_b": 404,
            "inactive": 404,
        },
        "guest_a_private": {
            "anonymous": 404,
            "guest_a": 200,
            "guest_b": 404,
            "user_a": 404,
            "user_b": 404,
            "inactive": 404,
        },
        "public": {
            "anonymous": 200,
            "guest_a": 200,
            "guest_b": 200,
            "user_a": 200,
            "user_b": 200,
            "inactive": 200,
        },
    },
    ("GET", "/api/user/progress"): {
        "own_progress": {
            "anonymous": 200,
            "guest_a": 200,
            "guest_b": 200,
            "user_a": 200,
            "user_b": 200,
            "inactive": 200,
        },
    },
    ("POST", "/api/user/claim-session"): {
        "claim_guest_a": {
            "anonymous": 401,
            "guest_a": 401,
            "guest_b": 401,
            "user_a": 200,
            "inactive": 401,
        },
    },
}


def _iter_app_routes(routes: list[Any]) -> Iterator[tuple[str, str]]:
    for route in routes:
        if hasattr(route, "effective_candidates"):
            yield from _iter_app_routes(list(route.effective_candidates()))
        elif hasattr(route, "path") and getattr(route, "methods", None):
            for method in sorted(route.methods):
                if method != "HEAD":
                    yield (method, route.path)


def test_all_app_routes_covered_by_matrix_or_public_allowlist():
    """Fail if any route in app.routes is missing from MATRIX or PUBLIC_ROUTES."""
    discovered = set(_iter_app_routes(list(app.routes)))
    documented = set(MATRIX) | set(PUBLIC_ROUTES)

    unlisted = sorted(discovered - documented)
    assert not unlisted, (
        "Unlisted route(s) found in app.routes. Add every new route to MATRIX or "
        "PUBLIC_ROUTES (with reason) in tests/test_authorization_matrix.py: "
        f"{unlisted}"
    )

    overlap = sorted(set(MATRIX) & set(PUBLIC_ROUTES))
    assert not overlap, f"Routes listed in both MATRIX and PUBLIC_ROUTES: {overlap}"

    stale = sorted(documented - discovered)
    assert not stale, f"Stale route(s) not found in app.routes: {stale}"

    for route_key, reason in PUBLIC_ROUTES.items():
        assert reason.strip(), f"PUBLIC_ROUTES entry {route_key} must have a reason"


def _make_actors(
    session: Session,
    client_factory: Callable[[], TestClient],
    register_user: Callable[..., dict[str, Any]],
    login_as: Callable[..., TestClient],
) -> tuple[dict[str, tuple[TestClient, dict[str, str]]], dict[str, Any]]:
    user_a = register_user("matrix_user_a")
    user_b = register_user("matrix_user_b")
    inactive_data = register_user("matrix_inactive")

    client_a = login_as("matrix_user_a")
    client_b = login_as("matrix_user_b")

    inactive_client = client_factory()
    inactive_token = create_access_token(
        {
            "sub": str(inactive_data["id"]),
            "username": inactive_data["username"],
            "email": inactive_data["email"],
        }
    )
    inactive_client.cookies.set(settings.AUTH_COOKIE_NAME, inactive_token)
    db_inactive = session.get(User, inactive_data["id"])
    assert db_inactive is not None
    db_inactive.is_active = False
    session.add(db_inactive)
    session.commit()

    actors: dict[str, tuple[TestClient, dict[str, str]]] = {
        "anonymous": (client_factory(), {}),
        "guest_a": (client_factory(), {"X-Diffly-Session-Id": "matrix-guest-a"}),
        "guest_b": (client_factory(), {"X-Diffly-Session-Id": "matrix-guest-b"}),
        "user_a": (client_a, {}),
        "user_b": (client_b, {}),
        "inactive": (inactive_client, {}),
    }
    meta = {
        "user_a": user_a,
        "user_b": user_b,
        "inactive": inactive_data,
        "guest_a_sid": "matrix-guest-a",
        "guest_b_sid": "matrix-guest-b",
    }
    return actors, meta


def _seed_matrix_resources(session: Session, user_a_id: int, guest_a_sid: str):
    public_ch = Challenge(
        slug="matrix-public-challenge",
        title="Matrix Public Challenge",
        difficulty=Difficulty.EASY,
        category=Category.SECURITY,
        language=Language.PYTHON,
        description="Public matrix test challenge",
        threat_model="Injection",
        defect_target="Find eval",
        code_snippet="x = eval(user_input)\n",
        expected_issues=json.dumps(
            [
                {
                    "id": "pub-eval",
                    "title": "Unsafe eval",
                    "severity": "critical",
                    "lines": [1],
                    "keywords": ["eval"],
                    "explanation": "eval executes arbitrary code",
                }
            ]
        ),
        hints=json.dumps([{"tier": 1, "hint": "Look at line 1"}]),
        canonical_review="Avoid eval",
        recommended_fix_diff="- eval\n+ ast.literal_eval",
        is_public=True,
    )
    user_a_private = Challenge(
        slug="matrix-user-a-private",
        title="User A Private Challenge",
        difficulty=Difficulty.MEDIUM,
        category=Category.SECURITY,
        language=Language.PYTHON,
        description="User A private challenge",
        threat_model="IDOR",
        defect_target="Find IDOR",
        code_snippet="def get_doc(id): return db.get(id)\n",
        expected_issues=json.dumps(
            [
                {
                    "id": "ua-idor",
                    "title": "Missing auth check",
                    "severity": "high",
                    "lines": [1],
                    "keywords": ["auth", "ownership"],
                    "explanation": "No ownership check",
                }
            ]
        ),
        hints=json.dumps([{"tier": 1, "hint": "Check line 1 ownership"}]),
        canonical_review="Enforce owner check",
        recommended_fix_diff="- db.get(id)\n+ db.get_owned(id, actor)",
        is_public=False,
        user_id=user_a_id,
    )
    guest_a_private = Challenge(
        slug="matrix-guest-a-private",
        title="Guest A Private Challenge",
        difficulty=Difficulty.MEDIUM,
        category=Category.SECURITY,
        language=Language.PYTHON,
        description="Guest A private challenge",
        threat_model="SQLi",
        defect_target="Find SQLi",
        code_snippet="query = f'SELECT * FROM t WHERE id={x}'\n",
        expected_issues=json.dumps(
            [
                {
                    "id": "ga-sqli",
                    "title": "SQL Injection",
                    "severity": "high",
                    "lines": [1],
                    "keywords": ["sql", "injection"],
                    "explanation": "String interpolation in SQL",
                }
            ]
        ),
        hints=json.dumps([{"tier": 1, "hint": "Check SQL formatting"}]),
        canonical_review="Use parameterized query",
        recommended_fix_diff="- f'SELECT'\n+ select().where()",
        is_public=False,
        user_id=None,
        session_id=guest_a_sid,
    )
    session.add_all([public_ch, user_a_private, guest_a_private])
    session.commit()
    session.refresh(public_ch)
    session.refresh(user_a_private)
    session.refresh(guest_a_private)

    sub_user_pub = Submission(
        challenge_id=public_ch.id,
        user_id=user_a_id,
        flagged_lines=[1],
        comments="User A public submission secret note",
        score=90,
    )
    sub_guest_pub = Submission(
        challenge_id=public_ch.id,
        user_id=None,
        session_id=guest_a_sid,
        flagged_lines=[1],
        comments="Guest A public submission secret note",
        score=82,
    )
    sub_user_priv = Submission(
        challenge_id=user_a_private.id,
        user_id=user_a_id,
        flagged_lines=[1],
        comments="User A private submission secret note",
        score=95,
    )
    sub_guest_priv = Submission(
        challenge_id=guest_a_private.id,
        user_id=None,
        session_id=guest_a_sid,
        flagged_lines=[1],
        comments="Guest A private submission secret note",
        score=88,
    )
    session.add_all([sub_user_pub, sub_guest_pub, sub_user_priv, sub_guest_priv])
    session.commit()
    return public_ch, user_a_private, guest_a_private


def test_authorization_matrix_enforcement(
    client: TestClient,
    session: Session,
    client_factory: Callable[[], TestClient],
    register_user: Callable[..., dict[str, Any]],
    login_as: Callable[..., TestClient],
):
    """Verify allow/deny/404 isolation across all actors and protected resources."""
    actors, meta = _make_actors(session, client_factory, register_user, login_as)
    public_ch, user_a_private, guest_a_private = _seed_matrix_resources(
        session, meta["user_a"]["id"], meta["guest_a_sid"]
    )

    # 1. GET /api/auth/me
    for actor_name, expected in MATRIX[("GET", "/api/auth/me")]["self"].items():
        ac, headers = actors[actor_name]
        res = ac.get("/api/auth/me", headers=headers)
        assert res.status_code == expected, actor_name
        if expected == 200:
            assert res.json()["id"] == meta[actor_name]["id"]

    # 2. GET /api/challenges (public catalog + actor-scoped scores only)
    for actor_name, expected in MATRIX[("GET", "/api/challenges")][
        "public_catalog"
    ].items():
        ac, headers = actors[actor_name]
        res = ac.get("/api/challenges", headers=headers)
        assert res.status_code == expected, actor_name
        items = res.json()
        slugs = {item["slug"] for item in items}
        assert public_ch.slug in slugs
        assert user_a_private.slug not in slugs
        assert guest_a_private.slug not in slugs
        pub_item = next(item for item in items if item["slug"] == public_ch.slug)
        if actor_name == "user_a":
            assert pub_item["best_score"] == 90
            assert pub_item["is_solved"] is True
        elif actor_name == "guest_a":
            assert pub_item["best_score"] == 82
            assert pub_item["is_solved"] is True
        else:
            assert pub_item["best_score"] is None
            assert pub_item["is_solved"] is False

    # 3. GET /api/challenges/custom
    for actor_name, expected in MATRIX[("GET", "/api/challenges/custom")][
        "own_list"
    ].items():
        ac, headers = actors[actor_name]
        res = ac.get("/api/challenges/custom", headers=headers)
        assert res.status_code == expected, actor_name
        slugs = {item["slug"] for item in res.json()["items"]}
        if actor_name == "user_a":
            assert slugs == {user_a_private.slug}
        elif actor_name == "guest_a":
            assert slugs == {guest_a_private.slug}
        else:
            assert slugs == set()

    # 4. GET /api/challenges/{identifier}
    targets = {
        "user_a_private": user_a_private.slug,
        "guest_a_private": guest_a_private.slug,
        "public": public_ch.slug,
    }
    for target_key, slug in targets.items():
        for actor_name, expected in MATRIX[("GET", "/api/challenges/{identifier}")][
            target_key
        ].items():
            ac, headers = actors[actor_name]
            res = ac.get(f"/api/challenges/{slug}", headers=headers)
            assert res.status_code == expected, f"{target_key} <- {actor_name}"

    # 5. GET /api/challenges/{identifier}/hints
    for target_key in ("user_a_private", "guest_a_private"):
        slug = targets[target_key]
        for actor_name, expected in MATRIX[
            ("GET", "/api/challenges/{identifier}/hints")
        ][target_key].items():
            ac, headers = actors[actor_name]
            res = ac.get(f"/api/challenges/{slug}/hints", headers=headers)
            assert res.status_code == expected, f"{target_key} hints <- {actor_name}"

    # 6. GET /api/challenges/{identifier}/solution (including ?reveal=true on private)
    for target_key in ("user_a_private", "guest_a_private"):
        slug = targets[target_key]
        for actor_name, expected in MATRIX[
            ("GET", "/api/challenges/{identifier}/solution")
        ][target_key].items():
            ac, headers = actors[actor_name]
            res = ac.get(f"/api/challenges/{slug}/solution", headers=headers)
            assert res.status_code == expected, f"{target_key} sol <- {actor_name}"
            res_reveal = ac.get(
                f"/api/challenges/{slug}/solution?reveal=true", headers=headers
            )
            assert res_reveal.status_code == expected, (
                f"{target_key} sol reveal <- {actor_name}"
            )

    for actor_name, expected in MATRIX[
        ("GET", "/api/challenges/{identifier}/solution")
    ]["public_unrevealed"].items():
        ac, headers = actors[actor_name]
        res = ac.get(f"/api/challenges/{public_ch.slug}/solution", headers=headers)
        assert res.status_code == expected, f"public sol <- {actor_name}"

    # 7. POST /api/challenges/{identifier}/review
    for target_key in ("user_a_private", "guest_a_private"):
        slug = targets[target_key]
        for actor_name, expected in MATRIX[
            ("POST", "/api/challenges/{identifier}/review")
        ][target_key].items():
            ac, headers = actors[actor_name]
            res = ac.post(
                f"/api/challenges/{slug}/review",
                json={"flagged_lines": [1], "comments": "Cross-actor review attempt"},
                headers=headers,
            )
            assert res.status_code == expected, f"{target_key} review <- {actor_name}"

    # 8. GET /api/challenges/{identifier}/submissions
    for target_key, slug in targets.items():
        for actor_name, expected in MATRIX[
            ("GET", "/api/challenges/{identifier}/submissions")
        ][target_key].items():
            ac, headers = actors[actor_name]
            res = ac.get(f"/api/challenges/{slug}/submissions", headers=headers)
            assert res.status_code == expected, f"{target_key} subs <- {actor_name}"
            if expected == 200:
                comments = [item["comments"] for item in res.json()]
                if actor_name == "user_a":
                    assert all("Guest A" not in c for c in comments)
                elif actor_name == "guest_a":
                    assert all("User A" not in c for c in comments)
                else:
                    assert comments == []

    # 9. GET /api/user/progress
    for actor_name, expected in MATRIX[("GET", "/api/user/progress")][
        "own_progress"
    ].items():
        ac, headers = actors[actor_name]
        res = ac.get("/api/user/progress", headers=headers)
        assert res.status_code == expected, actor_name
        data = res.json()
        if actor_name == "user_a":
            assert data["total_attempted"] == 1
            assert data["average_score"] == 90.0
        elif actor_name == "guest_a":
            assert data["total_attempted"] == 1
            assert data["average_score"] == 82.0
        else:
            assert data["total_attempted"] == 0
            assert data["total_solved"] == 0

    # 10. DELETE /api/challenges/custom/{identifier} (non-owners rejected first)
    for target_key in ("user_a_private", "guest_a_private"):
        slug = targets[target_key]
        for actor_name, expected in MATRIX[
            ("DELETE", "/api/challenges/custom/{identifier}")
        ][target_key].items():
            if expected == 200:
                continue
            ac, headers = actors[actor_name]
            res = ac.delete(f"/api/challenges/custom/{slug}", headers=headers)
            assert res.status_code == expected, f"{target_key} delete <- {actor_name}"

    # 11. POST /api/user/claim-session and post-claim old-session isolation
    for actor_name, expected in MATRIX[("POST", "/api/user/claim-session")][
        "claim_guest_a"
    ].items():
        if expected == 200:
            continue
        ac, headers = actors[actor_name]
        res = ac.post(
            "/api/user/claim-session",
            json={"session_id": meta["guest_a_sid"]},
            headers=headers,
        )
        assert res.status_code == expected, f"claim <- {actor_name}"

    claim_res = actors["user_a"][0].post(
        "/api/user/claim-session",
        json={"session_id": meta["guest_a_sid"]},
    )
    assert claim_res.status_code == 200
    assert claim_res.json()["claimed_challenges_count"] == 1

    # After claim, old guest_a_sid no longer exposes data to guest_a, anon, or user_b
    for snooper_name in ("anonymous", "guest_a", "user_b", "inactive"):
        ac, _ = actors[snooper_name]
        stale_headers = {"X-Diffly-Session-Id": meta["guest_a_sid"]}

        assert (
            ac.get("/api/challenges/custom", headers=stale_headers).json()["items"]
            == []
        )
        assert (
            ac.get(
                f"/api/challenges/{guest_a_private.slug}", headers=stale_headers
            ).status_code
            == 404
        )
        assert (
            ac.get(
                f"/api/challenges/{guest_a_private.slug}/hints", headers=stale_headers
            ).status_code
            == 404
        )
        assert (
            ac.get(
                f"/api/challenges/{guest_a_private.slug}/solution?reveal=true",
                headers=stale_headers,
            ).status_code
            == 404
        )
        assert (
            ac.get(
                f"/api/challenges/{guest_a_private.slug}/submissions",
                headers=stale_headers,
            ).status_code
            == 404
        )
        assert (
            ac.delete(
                f"/api/challenges/custom/{guest_a_private.slug}",
                headers=stale_headers,
            ).status_code
            == 404
        )
        assert (
            ac.get(
                f"/api/challenges/{public_ch.slug}/submissions",
                headers=stale_headers,
            ).json()
            == []
        )
        assert (
            ac.get("/api/user/progress", headers=stale_headers).json()[
                "total_attempted"
            ]
            == 0
        )

    # User A now owns both private challenges and can delete them; Guest A cannot
    assert (
        actors["user_a"][0]
        .delete(f"/api/challenges/custom/{user_a_private.slug}")
        .status_code
        == 200
    )
    assert (
        actors["user_a"][0]
        .delete(f"/api/challenges/custom/{guest_a_private.slug}")
        .status_code
        == 200
    )


@patch("backend.services.gemini_generator.httpx.AsyncClient.post")
def test_generate_custom_challenge_owner_isolation(
    mock_post: AsyncMock,
    session: Session,
    client_factory: Callable[[], TestClient],
    register_user: Callable[..., dict[str, Any]],
    login_as: Callable[..., TestClient],
):
    """Custom challenges created via generate-custom are scoped to their creator."""
    sample_output = {
        "slug": "matrix-generated-idor",
        "title": "Generated IDOR",
        "difficulty": "Medium",
        "category": "Security",
        "language": "python",
        "description": "Inspect ownership check",
        "threat_model": "Cross-tenant read",
        "defect_target": "Find missing owner filter",
        "code_snippet": "def read_item(item_id): return store[item_id]\n",
        "expected_issues": [
            {
                "id": "gen-1",
                "title": "IDOR",
                "severity": "high",
                "matched_lines": [1],
                "matched_keywords": ["owner"],
                "explanation": "Missing owner verification",
            }
        ],
        "hints": [{"tier": 1, "label": "Clue", "text": "Check line 1"}],
        "canonical_review": "Filter by owner",
        "recommended_fix_diff": "- store[item_id]\n+ get_owned(item_id, actor)",
    }
    gemini_payload = {
        "candidates": [{"content": {"parts": [{"text": json.dumps(sample_output)}]}}]
    }
    request = httpx.Request(
        "POST",
        "https://generativelanguage.googleapis.com/v1beta/models/test:generateContent",
    )
    mock_post.return_value = httpx.Response(
        status_code=200, json=gemini_payload, request=request
    )

    actors, _ = _make_actors(session, client_factory, register_user, login_as)

    for creator_name in ("user_a", "guest_a"):
        creator_client, creator_headers = actors[creator_name]
        gen_headers = {**creator_headers, "X-Gemini-Key": "AIzaSyMatrixTestKey"}
        res = creator_client.post(
            "/api/challenges/generate-custom",
            json={
                "topic": "FastAPI IDOR",
                "language": "python",
                "difficulty": "Medium",
            },
            headers=gen_headers,
        )
        assert (
            res.status_code
            == MATRIX[("POST", "/api/challenges/generate-custom")][
                "create_owned_custom"
            ][creator_name]
        )
        created_slug = res.json()["slug"]

        for other_name, (other_client, other_headers) in actors.items():
            if other_name == creator_name:
                continue
            assert (
                other_client.get(
                    f"/api/challenges/{created_slug}", headers=other_headers
                ).status_code
                == 404
            )
            assert (
                other_client.delete(
                    f"/api/challenges/custom/{created_slug}", headers=other_headers
                ).status_code
                == 404
            )


def test_authenticated_actor_ignores_unclaimed_guest_session_header(
    session: Session,
    client_factory: Callable[[], TestClient],
    register_user: Callable[..., dict[str, Any]],
    login_as: Callable[..., TestClient],
):
    """Authenticated users must not access unclaimed guest records via header."""
    actors, meta = _make_actors(session, client_factory, register_user, login_as)
    _, _, guest_a_private = _seed_matrix_resources(
        session, meta["user_a"]["id"], meta["guest_a_sid"]
    )
    guest_private_slug = guest_a_private.slug
    guest_headers = {"X-Diffly-Session-Id": meta["guest_a_sid"]}

    user_b_client, _ = actors["user_b"]
    assert (
        user_b_client.get("/api/challenges/custom", headers=guest_headers).json()[
            "items"
        ]
        == []
    )
    assert (
        user_b_client.get(
            f"/api/challenges/{guest_private_slug}", headers=guest_headers
        ).status_code
        == 404
    )
    assert (
        user_b_client.delete(
            f"/api/challenges/custom/{guest_private_slug}", headers=guest_headers
        ).status_code
        == 404
    )


def test_evaluate_custom_rejects_invalid_and_oversized_payloads(client: TestClient):
    """POST /api/challenges/evaluate-custom enforces bounds and line validation."""
    base_issue = [
        {
            "id": "i1",
            "title": "Test",
            "severity": "high",
            "matched_lines": [1],
            "matched_keywords": ["test"],
            "explanation": "test",
        }
    ]
    bad_line_res = client.post(
        "/api/challenges/evaluate-custom",
        json={
            "expected_issues": base_issue,
            "code_snippet": "x = 1",
            "flagged_lines": [0],
            "comments": "Invalid zero line",
        },
    )
    assert bad_line_res.status_code == 422

    oversized_res = client.post(
        "/api/challenges/evaluate-custom",
        json={
            "expected_issues": base_issue,
            "code_snippet": "x" * 50001,
            "flagged_lines": [1],
            "comments": "Too large",
        },
    )
    assert oversized_res.status_code == 422
