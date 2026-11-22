"""Authorization matrix tests covering every FastAPI route and actor role."""

import json
import time
from collections.abc import Callable, Iterator
from typing import Any
from unittest.mock import AsyncMock, patch

import httpx
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from api.index import app
from backend.core.config import settings
from backend.core.guest_session import GuestSession, _encode
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
    ("GET", "/api/auth/providers"): "Public auth provider capability flags",
    (
        "GET",
        "/api/auth/github/login",
    ): "GitHub OAuth initiation endpoint (optional link bound to active cookie)",
    (
        "GET",
        "/api/auth/github/callback",
    ): "GitHub OAuth callback verified via HMAC-signed state cookie",
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
            "guest_forged": 401,
            "guest_tampered": 401,
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
            "guest_forged": 200,
            "guest_tampered": 200,
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
            "guest_forged": 200,
            "guest_tampered": 200,
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
            "guest_forged": 404,
            "guest_tampered": 404,
            "user_a": 200,
            "user_b": 404,
            "inactive": 404,
        },
        "guest_a_private": {
            "anonymous": 404,
            "guest_a": 200,
            "guest_b": 404,
            "guest_forged": 404,
            "guest_tampered": 404,
            "user_a": 404,
            "user_b": 404,
            "inactive": 404,
        },
    },
    ("PATCH", "/api/challenges/custom/{identifier}/share"): {
        "user_a_private": {
            "anonymous": 404,
            "guest_a": 404,
            "guest_b": 404,
            "guest_forged": 404,
            "guest_tampered": 404,
            "user_a": 200,
            "user_b": 404,
            "inactive": 404,
        },
        "guest_a_private": {
            "anonymous": 404,
            "guest_a": 200,
            "guest_b": 404,
            "guest_forged": 404,
            "guest_tampered": 404,
            "user_a": 404,
            "user_b": 404,
            "inactive": 404,
        },
        "public": {
            "anonymous": 403,
            "guest_a": 403,
            "guest_b": 403,
            "guest_forged": 403,
            "guest_tampered": 403,
            "user_a": 403,
            "user_b": 403,
            "inactive": 403,
        },
    },
    ("GET", "/api/challenges/{identifier}"): {
        "user_a_private": {
            "anonymous": 404,
            "guest_a": 404,
            "guest_b": 404,
            "guest_forged": 404,
            "guest_tampered": 404,
            "user_a": 200,
            "user_b": 404,
            "inactive": 404,
        },
        "guest_a_private": {
            "anonymous": 404,
            "guest_a": 200,
            "guest_b": 404,
            "guest_forged": 404,
            "guest_tampered": 404,
            "user_a": 404,
            "user_b": 404,
            "inactive": 404,
        },
        "public": {
            "anonymous": 200,
            "guest_a": 200,
            "guest_b": 200,
            "guest_forged": 200,
            "guest_tampered": 200,
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
            "guest_forged": 404,
            "guest_tampered": 404,
            "user_a": 200,
            "user_b": 404,
            "inactive": 404,
        },
        "guest_a_private": {
            "anonymous": 404,
            "guest_a": 200,
            "guest_b": 404,
            "guest_forged": 404,
            "guest_tampered": 404,
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
            "guest_forged": 404,
            "guest_tampered": 404,
            "user_a": 200,
            "user_b": 404,
            "inactive": 404,
        },
        "guest_a_private": {
            "anonymous": 404,
            "guest_a": 200,
            "guest_b": 404,
            "guest_forged": 404,
            "guest_tampered": 404,
            "user_a": 404,
            "user_b": 404,
            "inactive": 404,
        },
        "public_unrevealed": {
            "anonymous": 403,
            "guest_a": 200,
            "guest_b": 403,
            "guest_forged": 403,
            "guest_tampered": 403,
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
            "guest_forged": 404,
            "guest_tampered": 404,
            "user_a": 200,
            "user_b": 404,
            "inactive": 404,
        },
        "guest_a_private": {
            "anonymous": 404,
            "guest_a": 200,
            "guest_b": 404,
            "guest_forged": 404,
            "guest_tampered": 404,
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
            "guest_forged": 404,
            "guest_tampered": 404,
            "user_a": 200,
            "user_b": 404,
            "inactive": 404,
        },
        "guest_a_private": {
            "anonymous": 404,
            "guest_a": 200,
            "guest_b": 404,
            "guest_forged": 404,
            "guest_tampered": 404,
            "user_a": 404,
            "user_b": 404,
            "inactive": 404,
        },
        "public": {
            "anonymous": 200,
            "guest_a": 200,
            "guest_b": 200,
            "guest_forged": 200,
            "guest_tampered": 200,
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
            "guest_forged": 200,
            "guest_tampered": 200,
            "user_a": 200,
            "user_b": 200,
            "inactive": 200,
        },
    },
    ("GET", "/api/user/analytics"): {
        "own_analytics": {
            "anonymous": 200,
            "guest_a": 200,
            "guest_b": 200,
            "guest_forged": 200,
            "guest_tampered": 200,
            "user_a": 200,
            "user_b": 200,
            "inactive": 200,
        },
    },
    ("GET", "/api/challenges/next"): {
        "public_drill_recommendation": {
            "anonymous": 200,
            "guest_a": 200,
            "guest_b": 200,
            "guest_forged": 200,
            "guest_tampered": 200,
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
            "guest_forged": 401,
            "guest_tampered": 401,
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


def test_no_route_accepts_raw_guest_session_input():
    """OpenAPI schema must never declare unsigned X-Diffly-Session-Id/session_id."""
    schema = app.openapi()

    for path, methods in schema.get("paths", {}).items():
        for method, op in methods.items():
            if not isinstance(op, dict):
                continue
            for param in op.get("parameters", []):
                param_name = str(param.get("name", ""))
                assert param_name.lower() != "x-diffly-session-id", (
                    f"{method.upper()} {path} still accepts X-Diffly-Session-Id header"
                )
                assert param_name.lower() != "session_id", (
                    f"{method.upper()} {path} still accepts session_id parameter"
                )

            req_body = op.get("requestBody", {})
            for media in req_body.get("content", {}).values():
                body_schema = media.get("schema", {})
                ref = body_schema.get("$ref")
                if ref and ref.startswith("#/components/schemas/"):
                    comp_name = ref.split("/")[-1]
                    comp = (
                        schema.get("components", {})
                        .get("schemas", {})
                        .get(comp_name, {})
                    )
                    props = comp.get("properties", {})
                else:
                    props = body_schema.get("properties", {})
                assert "session_id" not in props, (
                    f"{method.upper()} {path} request body still accepts session_id"
                )


def _make_actors(
    session: Session,
    client_factory: Callable[[], TestClient],
    register_user: Callable[..., dict[str, Any]],
    login_as: Callable[..., TestClient],
    as_guest: Callable[[TestClient, str | None], str],
) -> tuple[dict[str, tuple[TestClient, dict[str, str]]], dict[str, Any]]:
    user_a = register_user("matrix_user_a")
    user_b = register_user("matrix_user_b")
    inactive_data = register_user("matrix_inactive")

    client_a = login_as("matrix_user_a")
    client_b = login_as("matrix_user_b")

    guest_a_client = client_factory()
    guest_a_sid = as_guest(guest_a_client, "matrix-guest-a")

    guest_b_client = client_factory()
    guest_b_sid = as_guest(guest_b_client, "matrix-guest-b")

    guest_forged_client = client_factory()

    guest_tampered_client = client_factory()
    guest_tampered_client.cookies.set(
        settings.GUEST_COOKIE_NAME,
        f"v1.{guest_a_sid}.{int(time.time())}.tampered_signature",
        domain="testserver.local",
    )

    inactive_client = client_factory()
    inactive_token = create_access_token(
        {
            "sub": str(inactive_data["id"]),
            "username": inactive_data["username"],
            "email": inactive_data["email"],
        }
    )
    inactive_client.cookies.set(
        settings.AUTH_COOKIE_NAME, inactive_token, domain="testserver.local"
    )
    db_inactive = session.get(User, inactive_data["id"])
    assert db_inactive is not None
    db_inactive.is_active = False
    session.add(db_inactive)
    session.commit()

    actors: dict[str, tuple[TestClient, dict[str, str]]] = {
        "anonymous": (client_factory(), {}),
        "guest_a": (guest_a_client, {}),
        "guest_b": (guest_b_client, {}),
        "guest_forged": (guest_forged_client, {"X-Diffly-Session-Id": guest_a_sid}),
        "guest_tampered": (guest_tampered_client, {}),
        "user_a": (client_a, {}),
        "user_b": (client_b, {}),
        "inactive": (inactive_client, {}),
    }
    meta = {
        "user_a": user_a,
        "user_b": user_b,
        "inactive": inactive_data,
        "guest_a_sid": guest_a_sid,
        "guest_b_sid": guest_b_sid,
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
    as_guest: Callable[[TestClient, str | None], str],
):
    """Verify allow/deny/404 isolation across all actors and protected resources."""
    actors, meta = _make_actors(
        session, client_factory, register_user, login_as, as_guest
    )
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

    # 9. GET /api/user/progress & GET /api/user/analytics & GET /api/challenges/next
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
            assert data["custom_attempted"] == 1
            assert data["custom_solved"] == 1
        elif actor_name == "guest_a":
            assert data["total_attempted"] == 1
            assert data["average_score"] == 82.0
            assert data["custom_attempted"] == 1
            assert data["custom_solved"] == 1
        else:
            assert data["total_attempted"] == 0
            assert data["total_solved"] == 0
            assert data["custom_attempted"] == 0
            assert data["custom_solved"] == 0

    for actor_name, expected in MATRIX[("GET", "/api/user/analytics")][
        "own_analytics"
    ].items():
        ac, headers = actors[actor_name]
        res = ac.get("/api/user/analytics?days=30", headers=headers)
        assert res.status_code == expected, actor_name
        analytics = res.json()
        if actor_name in ("user_a", "guest_a"):
            assert analytics["total_submissions"] == 3
            assert analytics["custom"]["attempted"] == 1
            assert analytics["custom"]["solved"] == 1
            assert analytics["custom"]["submissions"] == 2
        else:
            assert analytics["total_submissions"] == 0
            assert analytics["custom"] == {
                "attempted": 0,
                "solved": 0,
                "submissions": 0,
            }
            assert analytics["trends"] == []

    for actor_name, expected in MATRIX[("GET", "/api/challenges/next")][
        "public_drill_recommendation"
    ].items():
        ac, headers = actors[actor_name]
        res = ac.get("/api/challenges/next", headers=headers)
        assert res.status_code == expected, actor_name
        next_payload = res.json()
        assert next_payload["challenge"]["slug"] == public_ch.slug
        if actor_name == "user_a":
            assert next_payload["category_mastery"] == 90.0
        elif actor_name == "guest_a":
            assert next_payload["category_mastery"] == 82.0
        else:
            assert next_payload["category_mastery"] == 0.0

    # 10. PATCH /api/challenges/custom/{identifier}/share (owner-only toggle)
    for target_key in ("user_a_private", "guest_a_private", "public"):
        slug = targets[target_key]
        for actor_name, expected in MATRIX[
            ("PATCH", "/api/challenges/custom/{identifier}/share")
        ][target_key].items():
            ac, headers = actors[actor_name]
            res = ac.patch(
                f"/api/challenges/custom/{slug}/share",
                json={"enabled": True},
                headers=headers,
            )
            assert res.status_code == expected, f"{target_key} share <- {actor_name}"
            if expected == 200:
                assert res.json()["is_shared"] is True
                assert res.json()["share_token"]
                # Disable after verification so subsequent matrix checks stay private
                off_res = ac.patch(
                    f"/api/challenges/custom/{slug}/share",
                    json={"enabled": False},
                    headers=headers,
                )
                assert off_res.status_code == 200
                assert off_res.json()["share_token"] is None

    # 11. DELETE /api/challenges/custom/{identifier} (non-owners rejected first)
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
        res = ac.post("/api/user/claim-session", headers=headers)
        assert res.status_code == expected, f"claim <- {actor_name}"

    saved_guest_a_cookie = actors["guest_a"][0].cookies.get(settings.GUEST_COOKIE_NAME)
    assert saved_guest_a_cookie is not None
    actors["user_a"][0].cookies.set(
        settings.GUEST_COOKIE_NAME, saved_guest_a_cookie, domain="testserver.local"
    )

    claim_res = actors["user_a"][0].post("/api/user/claim-session")
    assert claim_res.status_code == 200
    assert claim_res.json()["claimed_challenges_count"] == 1
    assert actors["user_a"][0].cookies.get(settings.GUEST_COOKIE_NAME) is None

    # Re-apply pre-claim Guest A cookie to ensure claimed rows cannot be accessed
    for snooper_name in ("anonymous", "guest_a", "user_b", "inactive"):
        ac, _ = actors[snooper_name]
        ac.cookies.set(
            settings.GUEST_COOKIE_NAME, saved_guest_a_cookie, domain="testserver.local"
        )

        assert ac.get("/api/challenges/custom").json()["items"] == []
        assert ac.get(f"/api/challenges/{guest_a_private.slug}").status_code == 404
        assert (
            ac.get(f"/api/challenges/{guest_a_private.slug}/hints").status_code == 404
        )
        assert (
            ac.get(
                f"/api/challenges/{guest_a_private.slug}/solution?reveal=true"
            ).status_code
            == 404
        )
        assert (
            ac.get(f"/api/challenges/{guest_a_private.slug}/submissions").status_code
            == 404
        )
        assert (
            ac.delete(f"/api/challenges/custom/{guest_a_private.slug}").status_code
            == 404
        )
        assert ac.get(f"/api/challenges/{public_ch.slug}/submissions").json() == []
        assert ac.get("/api/user/progress").json()["total_attempted"] == 0
        assert ac.get("/api/user/analytics").json()["total_submissions"] == 0

    # User A now owns both private challenges and can delete them
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
    as_guest: Callable[[TestClient, str | None], str],
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

    actors, _ = _make_actors(session, client_factory, register_user, login_as, as_guest)

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


def test_authenticated_actor_ignores_unclaimed_guest_session_cookie_and_header(
    session: Session,
    client_factory: Callable[[], TestClient],
    register_user: Callable[..., dict[str, Any]],
    login_as: Callable[..., TestClient],
    as_guest: Callable[[TestClient, str | None], str],
):
    """Authenticated users win over guest cookies and ignore raw session headers."""
    actors, meta = _make_actors(
        session, client_factory, register_user, login_as, as_guest
    )
    _, _, guest_a_private = _seed_matrix_resources(
        session, meta["user_a"]["id"], meta["guest_a_sid"]
    )
    guest_private_slug = guest_a_private.slug
    guest_headers = {"X-Diffly-Session-Id": meta["guest_a_sid"]}

    user_b_client, _ = actors["user_b"]
    user_b_client.cookies.set(
        settings.GUEST_COOKIE_NAME,
        _encode(GuestSession(id=meta["guest_a_sid"], issued_at=int(time.time()))),
        domain="testserver.local",
    )
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


def test_raw_guest_session_hijack_rejected_on_claim(
    session: Session,
    client_factory: Callable[[], TestClient],
    register_user: Callable[..., dict[str, Any]],
    login_as: Callable[..., TestClient],
):
    """Attacker cannot claim a guest's records using a raw unsigned session_id."""
    victim_sid = "victim-raw-hijack-sid"
    victim_challenge = Challenge(
        slug="victim-private-hijack",
        title="Victim Private Challenge",
        difficulty=Difficulty.MEDIUM,
        category=Category.SECURITY,
        language=Language.PYTHON,
        description="Private",
        code_snippet="secret = 1",
        is_public=False,
        user_id=None,
        session_id=victim_sid,
    )
    session.add(victim_challenge)
    session.commit()
    session.refresh(victim_challenge)

    register_user("hijack_attacker")
    attacker_client = login_as("hijack_attacker")

    claim_res = attacker_client.post(
        "/api/user/claim-session",
        headers={"X-Diffly-Session-Id": victim_sid},
        json={"session_id": victim_sid},
    )
    assert claim_res.status_code == 403

    tampered_client = login_as("hijack_attacker")
    tampered_client.cookies.set(
        settings.GUEST_COOKIE_NAME,
        f"v1.{victim_sid}.{int(time.time())}.invalid_sig",
        domain="testserver.local",
    )
    tampered_res = tampered_client.post("/api/user/claim-session")
    assert tampered_res.status_code == 403

    session.refresh(victim_challenge)
    assert victim_challenge.user_id is None
    assert victim_challenge.session_id == victim_sid


def test_claimed_rows_have_null_session_id(
    session: Session,
    client_factory: Callable[[], TestClient],
    register_user: Callable[..., dict[str, Any]],
    login_as: Callable[..., TestClient],
    as_guest: Callable[[TestClient, str | None], str],
):
    """Claiming guest challenges and submissions sets user_id and clears session_id."""
    guest_sid = "g_null_session_id_verify"
    pub = Challenge(
        slug="null-sid-pub",
        title="Null SID Pub",
        difficulty=Difficulty.EASY,
        category=Category.SECURITY,
        language=Language.PYTHON,
        description="Public",
        code_snippet="x = 1",
        is_public=True,
    )
    priv = Challenge(
        slug="null-sid-priv",
        title="Null SID Priv",
        difficulty=Difficulty.EASY,
        category=Category.SECURITY,
        language=Language.PYTHON,
        description="Private",
        code_snippet="x = 1",
        is_public=False,
        user_id=None,
        session_id=guest_sid,
    )
    session.add_all([pub, priv])
    session.commit()
    session.refresh(pub)
    session.refresh(priv)

    sub = Submission(
        challenge_id=pub.id,
        user_id=None,
        session_id=guest_sid,
        flagged_lines=[1],
        comments="Guest review",
        score=85,
    )
    session.add(sub)
    session.commit()

    user = register_user("null_sid_owner")
    auth_client = login_as("null_sid_owner")
    as_guest(auth_client, guest_sid)

    res = auth_client.post("/api/user/claim-session")
    assert res.status_code == 200
    assert res.json()["claimed_count"] == 2

    claimed_ch = session.exec(select(Challenge).where(Challenge.id == priv.id)).one()
    claimed_sub = session.exec(select(Submission).where(Submission.id == sub.id)).one()
    assert claimed_ch.user_id == user["id"]
    assert claimed_ch.session_id is None
    assert claimed_sub.user_id == user["id"]
    assert claimed_sub.session_id is None


def test_share_token_read_only_boundary_and_isolation(
    session: Session,
    client_factory: Callable[[], TestClient],
    register_user: Callable[..., dict[str, Any]],
    login_as: Callable[..., TestClient],
    as_guest: Callable[[TestClient, str | None], str],
):
    """Share tokens grant read-only access to one challenge without escalation."""
    actors, meta = _make_actors(
        session, client_factory, register_user, login_as, as_guest
    )
    _, user_a_private, guest_a_private = _seed_matrix_resources(
        session, meta["user_a"]["id"], meta["guest_a_sid"]
    )
    user_a_unshared = Challenge(
        slug="matrix-user-a-unshared-secret",
        title="User A Unshared Secret Draft",
        difficulty=Difficulty.HARD,
        category=Category.SECURITY,
        language=Language.PYTHON,
        description="Strictly private draft",
        code_snippet="secret_key = 'do-not-leak'\n",
        is_public=False,
        user_id=meta["user_a"]["id"],
    )
    session.add(user_a_unshared)
    session.commit()
    session.refresh(user_a_unshared)

    user_a_client, _ = actors["user_a"]
    share_res = user_a_client.patch(
        f"/api/challenges/custom/{user_a_private.slug}/share",
        json={"enabled": True},
    )
    assert share_res.status_code == 200
    token = share_res.json()["share_token"]
    assert isinstance(token, str) and len(token) >= 24

    for actor_name, (ac, headers) in actors.items():
        if actor_name == "user_a":
            continue

        # Valid token grants read access only to the shared challenge
        detail_res = ac.get(
            f"/api/challenges/{user_a_private.slug}?share_token={token}",
            headers=headers,
        )
        assert detail_res.status_code == 200, actor_name
        assert detail_res.json()["is_owner"] is False
        assert detail_res.json()["share_token"] is None

        hints_res = ac.get(
            f"/api/challenges/{user_a_private.slug}/hints?share_token={token}",
            headers=headers,
        )
        assert hints_res.status_code == 200, actor_name

        # Owner's private submission notes are never leaked via share_token
        subs_res = ac.get(
            f"/api/challenges/{user_a_private.slug}/submissions?share_token={token}",
            headers=headers,
        )
        assert subs_res.status_code == 200, actor_name
        assert all(
            "User A private submission" not in item["comments"]
            for item in subs_res.json()
        )

        # Shared challenge stays excluded from public catalog and others' custom list
        pub_res = ac.get("/api/challenges", headers=headers)
        pub_slugs = {item["slug"] for item in pub_res.json()}
        assert user_a_private.slug not in pub_slugs
        custom_slugs = {
            item["slug"]
            for item in ac.get(
                f"/api/challenges/custom?share_token={token}", headers=headers
            ).json()["items"]
        }
        assert user_a_private.slug not in custom_slugs

        # Share token cannot escalate to share-toggle or delete even when supplied
        assert (
            ac.patch(
                f"/api/challenges/custom/{user_a_private.slug}/share?share_token={token}",
                json={"enabled": False},
                headers=headers,
            ).status_code
            == 404
        ), actor_name
        assert (
            ac.delete(
                f"/api/challenges/custom/{user_a_private.slug}?share_token={token}",
                headers=headers,
            ).status_code
            == 404
        ), actor_name

        # Cross-challenge token reuse against owner's other private drafts is blocked
        assert (
            ac.get(
                f"/api/challenges/{user_a_unshared.slug}?share_token={token}",
                headers=headers,
            ).status_code
            == 404
        ), actor_name
        assert (
            ac.get(
                f"/api/challenges/{user_a_unshared.id}?share_token={token}",
                headers=headers,
            ).status_code
            == 404
        ), actor_name

        # Canonical solution remains gated without reveal=true even with share_token
        if actor_name != "anonymous":
            assert (
                ac.get(
                    f"/api/challenges/{user_a_private.slug}/solution?share_token={token}",
                    headers=headers,
                ).status_code
                == 403
            ), actor_name

        # Empty, wrong, or non-ASCII tokens return 404 without oracle 500s
        for bad_token in ("", "wrong-token", "tok_\u00fc"):
            assert (
                ac.get(
                    f"/api/challenges/{user_a_private.slug}?share_token={bad_token}",
                    headers=headers,
                ).status_code
                == 404
            ), actor_name
            assert (
                ac.get(
                    f"/api/challenges/{user_a_unshared.slug}?share_token={bad_token}",
                    headers=headers,
                ).status_code
                == 404
            ), actor_name
            if actor_name != "guest_a":
                assert (
                    ac.get(
                        f"/api/challenges/{guest_a_private.slug}"
                        f"?share_token={bad_token}",
                        headers=headers,
                    ).status_code
                    == 404
                ), actor_name

    # Recipient review submission works via share_token without leaking to owner
    user_b_client, _ = actors["user_b"]
    recipient_review = user_b_client.post(
        f"/api/challenges/{user_a_private.slug}/review?share_token={token}",
        json={
            "flagged_lines": [1],
            "comments": "Recipient B isolated review note",
        },
    )
    assert recipient_review.status_code == 200
    owner_subs = user_a_client.get(f"/api/challenges/{user_a_private.slug}/submissions")
    assert owner_subs.status_code == 200
    assert all(
        "Recipient B isolated review note" not in item["comments"]
        for item in owner_subs.json()
    )

    # Rejected POST /review with invalid share_token must not mint a guest cookie
    anon_client, _ = actors["anonymous"]
    bad_review_res = anon_client.post(
        f"/api/challenges/{user_a_private.slug}/review?share_token=wrong-token",
        json={"flagged_lines": [1], "comments": "Should not mint cookie"},
    )
    assert bad_review_res.status_code == 404
    assert settings.GUEST_COOKIE_NAME not in bad_review_res.cookies

    # Claiming Guest A's shared custom challenge preserves share_token for User A
    # while revoking old guest cookie owner mutations
    guest_a_client, _ = actors["guest_a"]
    guest_share_res = guest_a_client.patch(
        f"/api/challenges/custom/{guest_a_private.slug}/share",
        json={"enabled": True},
    )
    assert guest_share_res.status_code == 200
    guest_token = guest_share_res.json()["share_token"]
    saved_guest_cookie = guest_a_client.cookies.get(settings.GUEST_COOKIE_NAME)
    assert saved_guest_cookie is not None

    user_a_client.cookies.set(
        settings.GUEST_COOKIE_NAME, saved_guest_cookie, domain="testserver.local"
    )
    assert user_a_client.post("/api/user/claim-session").status_code == 200

    # Shared link still works after claim, while old guest cookie cannot toggle sharing
    anon_client, _ = actors["anonymous"]
    assert (
        anon_client.get(
            f"/api/challenges/{guest_a_private.slug}?share_token={guest_token}"
        ).status_code
        == 200
    )
    anon_client.cookies.set(
        settings.GUEST_COOKIE_NAME, saved_guest_cookie, domain="testserver.local"
    )
    assert (
        anon_client.patch(
            f"/api/challenges/custom/{guest_a_private.slug}/share",
            json={"enabled": False},
        ).status_code
        == 404
    )
    anon_client.cookies.clear()

    # User A (new owner) can revoke sharing
    assert (
        user_a_client.patch(
            f"/api/challenges/custom/{guest_a_private.slug}/share",
            json={"enabled": False},
        ).status_code
        == 200
    )
    assert (
        anon_client.get(
            f"/api/challenges/{guest_a_private.slug}?share_token={guest_token}"
        ).status_code
        == 404
    )


def test_github_oauth_cross_actor_state_and_inactive_isolation(
    session: Session,
    client_factory: Callable[[], TestClient],
    register_user: Callable[..., dict[str, Any]],
    login_as: Callable[..., TestClient],
    as_guest: Callable[[TestClient, str | None], str],
    monkeypatch,
):
    """GitHub OAuth prevents cross-actor state linking and inactive sign-in."""
    monkeypatch.setattr(settings, "GITHUB_CLIENT_ID", "gh-matrix-client")
    monkeypatch.setattr(settings, "GITHUB_CLIENT_SECRET", "gh-matrix-secret")

    actors, meta = _make_actors(
        session, client_factory, register_user, login_as, as_guest
    )

    # Inactive user starting OAuth login cannot bind link_user_id
    from backend.services.github_oauth import verify_oauth_state

    inactive_client, _ = actors["inactive"]
    init_inactive = inactive_client.get(
        "/api/auth/github/login?next=/settings", follow_redirects=False
    )
    assert init_inactive.status_code == 302
    state_cookie = init_inactive.cookies.get(settings.OAUTH_STATE_COOKIE_NAME)
    assert state_cookie is not None
    verified_inactive = verify_oauth_state(state_cookie, state_cookie)
    assert verified_inactive is not None
    assert verified_inactive.link_user_id is None

    # User A initiates linking flow; User B cannot replay User A's state cookie
    user_a_client, _ = actors["user_a"]
    init_a = user_a_client.get(
        "/api/auth/github/login?next=/settings", follow_redirects=False
    )
    assert init_a.status_code == 302
    user_a_state = init_a.cookies.get(settings.OAUTH_STATE_COOKIE_NAME)
    assert user_a_state is not None

    user_b_client, _ = actors["user_b"]
    user_b_client.cookies.set(
        settings.OAUTH_STATE_COOKIE_NAME, user_a_state, domain="testserver.local"
    )
    hijack_res = user_b_client.get(
        f"/api/auth/github/callback?code=fake&state={user_a_state}",
        follow_redirects=False,
    )
    assert hijack_res.status_code == 302
    assert "auth_error=github_state" in hijack_res.headers["location"]

    # Inactive GitHub user is denied login and gets no auth cookie
    inactive_db_user = session.get(User, meta["inactive"]["id"])
    assert inactive_db_user is not None
    inactive_db_user.github_id = "gh-inactive-999"
    session.add(inactive_db_user)
    session.commit()

    anon_client, _ = actors["anonymous"]
    init_anon = anon_client.get(
        "/api/auth/github/login?next=/challenges", follow_redirects=False
    )
    anon_state = init_anon.cookies.get(settings.OAUTH_STATE_COOKIE_NAME)
    assert anon_state is not None

    from backend.services.github_oauth import GitHubProfile

    with patch(
        "api.routes.auth.exchange_github_code",
        new=AsyncMock(
            return_value=GitHubProfile(
                github_id="gh-inactive-999",
                github_login="inactive_gh",
                email=meta["inactive"]["email"],
                avatar_url=None,
            )
        ),
    ):
        cb_inactive = anon_client.get(
            f"/api/auth/github/callback?code=valid&state={anon_state}",
            follow_redirects=False,
        )
    assert cb_inactive.status_code == 302
    assert "auth_error=account_inactive" in cb_inactive.headers["location"]
    assert settings.AUTH_COOKIE_NAME not in cb_inactive.cookies


@patch("backend.services.grading.judge.service.HttpxGeminiClient.generate_json")
def test_semantic_judge_review_and_submissions_authorization_matrix(
    mock_generate: AsyncMock,
    session: Session,
    client_factory: Callable[[], TestClient],
    register_user: Callable[..., dict[str, Any]],
    login_as: Callable[..., TestClient],
    as_guest: Callable[[TestClient, str | None], str],
):
    """Semantic judge POST /review and GET /submissions isolate across all roles."""
    actors, meta = _make_actors(
        session, client_factory, register_user, login_as, as_guest
    )
    public_ch, user_a_private, guest_a_private = _seed_matrix_resources(
        session, meta["user_a"]["id"], meta["guest_a_sid"]
    )
    byok_key = "AIzaSyMatrixJudgeIsolationKey"
    mock_generate.return_value = {
        "verdicts": [
            {
                "defect_id": "pub-eval",
                "concept_credit": 1.0,
                "rubric": {"root_cause": True, "impact": True, "fix": True},
                "feedback": "Private judge feedback.",
            }
        ]
    }

    # Private challenges reject non-owners with 404 before calling Gemini.
    for target_key, ch_obj, owner_name, defect_id in (
        ("user_a_private", user_a_private, "user_a", "ua-idor"),
        ("guest_a_private", guest_a_private, "guest_a", "ga-sqli"),
    ):
        mock_generate.reset_mock()
        mock_generate.return_value = {
            "verdicts": [
                {
                    "defect_id": defect_id,
                    "concept_credit": 1.0,
                    "rubric": {"root_cause": True, "impact": True, "fix": True},
                    "feedback": f"Owner {owner_name} judge feedback.",
                }
            ]
        }
        for actor_name, expected in MATRIX[
            ("POST", "/api/challenges/{identifier}/review")
        ][target_key].items():
            if actor_name == owner_name:
                continue
            ac, headers = actors[actor_name]
            res = ac.post(
                f"/api/challenges/{ch_obj.slug}/review",
                json={
                    "findings": [
                        {
                            "id": "f1",
                            "start_line": 1,
                            "end_line": 1,
                            "body": "Unauthorized review attempt with semantic judge.",
                        }
                    ],
                    "semantic_judge": True,
                },
                headers={**headers, "X-Gemini-Key": byok_key},
            )
            assert res.status_code == expected, f"{target_key} judge <- {actor_name}"
            if actor_name == "anonymous":
                assert settings.GUEST_COOKIE_NAME not in res.cookies

        assert mock_generate.call_count == 0

        owner_client, owner_headers = actors[owner_name]
        owner_res = owner_client.post(
            f"/api/challenges/{ch_obj.slug}/review",
            json={
                "findings": [
                    {
                        "id": "f1",
                        "start_line": 1,
                        "end_line": 1,
                        "body": "Suspicious unsafe call on line one.",
                    }
                ],
                "semantic_judge": True,
            },
            headers={**owner_headers, "X-Gemini-Key": byok_key},
        )
        assert owner_res.status_code == 200
        assert byok_key not in owner_res.text
        assert owner_res.json()["judge"]["status"] == "applied"
        assert mock_generate.call_count == 1

        for actor_name, expected in MATRIX[
            ("GET", "/api/challenges/{identifier}/submissions")
        ][target_key].items():
            ac, headers = actors[actor_name]
            sub_res = ac.get(
                f"/api/challenges/{ch_obj.slug}/submissions",
                headers=headers,
            )
            assert sub_res.status_code == expected, f"{target_key} subs <- {actor_name}"
            if expected == 200:
                judges = [item["judge"] for item in sub_res.json() if item["judge"]]
                assert len(judges) == 1
                assert judges[0]["status"] == "applied"

    # Public challenge isolates each actor's judge_outcome on GET /submissions.
    mock_generate.reset_mock()
    mock_generate.return_value = {
        "verdicts": [
            {
                "defect_id": "pub-eval",
                "concept_credit": 1.0,
                "rubric": {"root_cause": True, "impact": True, "fix": True},
                "feedback": "Public judge feedback.",
            }
        ]
    }
    for actor_name in ("user_a", "guest_a", "user_b"):
        ac, headers = actors[actor_name]
        res = ac.post(
            f"/api/challenges/{public_ch.slug}/review",
            json={
                "findings": [
                    {
                        "id": "f1",
                        "start_line": 1,
                        "end_line": 1,
                        "body": f"{actor_name} found arbitrary execution risk.",
                    }
                ],
                "semantic_judge": True,
            },
            headers={**headers, "X-Gemini-Key": byok_key},
        )
        assert res.status_code == 200
        assert byok_key not in res.text
        assert res.json()["judge"]["status"] == "applied"

    for actor_name in MATRIX[("GET", "/api/challenges/{identifier}/submissions")][
        "public"
    ]:
        ac, headers = actors[actor_name]
        hist_res = ac.get(
            f"/api/challenges/{public_ch.slug}/submissions",
            headers=headers,
        )
        assert hist_res.status_code == 200
        items = hist_res.json()
        if actor_name in ("user_a", "guest_a"):
            assert len(items) == 2
            assert items[0]["comments"] == ""
            assert items[0]["findings"][0]["body"].startswith(actor_name)
            assert items[0]["judge"]["status"] == "applied"
            assert items[1]["judge"] is None
        elif actor_name == "user_b":
            assert len(items) == 1
            assert items[0]["findings"][0]["body"].startswith("user_b")
            assert items[0]["judge"]["status"] == "applied"
        else:
            assert items == []

    # Anonymous caller can submit to public challenge and gets isolated guest cookie.
    anon_client, _ = actors["anonymous"]
    anon_res = anon_client.post(
        f"/api/challenges/{public_ch.slug}/review",
        json={
            "findings": [
                {
                    "id": "f1",
                    "start_line": 1,
                    "end_line": 1,
                    "body": "Anonymous caller spotted unsafe code.",
                }
            ],
            "semantic_judge": True,
        },
        headers={"X-Gemini-Key": byok_key},
    )
    assert anon_res.status_code == 200
    assert settings.GUEST_COOKIE_NAME in anon_res.cookies
    assert anon_res.json()["judge"]["status"] == "applied"
    anon_subs = anon_client.get(f"/api/challenges/{public_ch.slug}/submissions")
    user_b_subs = actors["user_b"][0].get(
        f"/api/challenges/{public_ch.slug}/submissions"
    )
    assert len(anon_subs.json()) == 1
    assert len(user_b_subs.json()) == 1
