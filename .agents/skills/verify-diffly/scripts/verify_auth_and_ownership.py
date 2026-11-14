#!/usr/bin/env python3
"""Live HTTP verification for Diffly auth, session isolation, and custom challenges."""

from __future__ import annotations

import argparse
import json
import os
import socket
import subprocess
import sys
import time
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

import httpx
from sqlmodel import Session, create_engine, select


REPO_ROOT = Path(__file__).resolve().parents[4]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from backend.models.challenge import (  # noqa: E402
    Category,
    Challenge,
    Difficulty,
    Language,
)
from backend.models.user import User  # noqa: E402


class VerificationRunner:
    """Executes HTTP assertions against the launched server and records evidence."""

    def __init__(self, feature: str, base_url: str, db_url: str) -> None:
        self.feature = feature
        self.base_url = base_url.rstrip("/")
        self.db_url = db_url
        self.steps: list[dict[str, Any]] = []
        self.failures: list[str] = []
        self.metadata: dict[str, Any] = {}

    def record(
        self,
        step: str,
        actor: str,
        method: str,
        path: str,
        expected_status: int,
        actual_status: int,
        passed: bool,
        assertion: str,
        detail: Any = None,
    ) -> None:
        entry: dict[str, Any] = {
            "step": step,
            "actor": actor,
            "request": {"method": method, "path": path},
            "expected_status": expected_status,
            "actual_status": actual_status,
            "verdict": "PASS" if passed else "FAIL",
            "assertion": assertion,
        }
        if detail is not None:
            entry["detail"] = detail
        self.steps.append(entry)
        if not passed:
            msg = (
                f"[{step}] FAILED: {assertion} "
                f"(expected HTTP {expected_status}, got {actual_status}; "
                f"detail={detail})"
            )
            self.failures.append(msg)
            print(msg, file=sys.stderr)
        else:
            print(f"[{step}] PASS: {assertion} (HTTP {actual_status})")

    def check_response(
        self,
        step: str,
        actor: str,
        response: httpx.Response,
        expected_status: int,
        assertion: str,
        predicate: Any = None,
        detail: Any = None,
    ) -> Any:
        payload: Any = None
        try:
            payload = response.json()
        except Exception:
            payload = response.text

        status_ok = response.status_code == expected_status
        pred_ok = True
        pred_detail = detail
        if status_ok and predicate is not None:
            try:
                pred_ok = bool(predicate(payload, response))
            except Exception as exc:
                pred_ok = False
                pred_detail = f"predicate error: {exc}"

        passed = status_ok and pred_ok
        if not passed and pred_detail is None:
            pred_detail = payload
        self.record(
            step=step,
            actor=actor,
            method=response.request.method,
            path=response.request.url.raw_path.decode("utf-8"),
            expected_status=expected_status,
            actual_status=response.status_code,
            passed=passed,
            assertion=assertion,
            detail=pred_detail,
        )
        return payload

    def build_report(self) -> dict[str, Any]:
        failed = sum(1 for item in self.steps if item["verdict"] == "FAIL")
        passed = sum(1 for item in self.steps if item["verdict"] == "PASS")
        return {
            "feature": self.feature,
            "timestamp": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "base_url": self.base_url,
            "metadata": self.metadata,
            "verdict": "PASSED" if failed == 0 else "FAILED",
            "total_steps": len(self.steps),
            "passed_steps": passed,
            "failed_steps": failed,
            "steps": self.steps,
        }


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def resolve_uvicorn_bin() -> str:
    candidates = [
        REPO_ROOT / ".venv" / "bin" / "uvicorn",
        Path("/Users/amirabaris/Documents/diffly/.venv/bin/uvicorn"),
    ]
    for candidate in candidates:
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return str(candidate)
    return "uvicorn"


@contextmanager
def temporary_production_server(db_url: str):
    port = find_free_port()
    env = os.environ.copy()
    env["ENVIRONMENT"] = "production"
    env["DATABASE_URL"] = db_url
    env["PYTHONPATH"] = str(REPO_ROOT)

    proc = subprocess.Popen(
        [
            resolve_uvicorn_bin(),
            "api.index:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
        ],
        cwd=str(REPO_ROOT),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )
    prod_url = f"http://127.0.0.1:{port}"
    try:
        ready = False
        for _ in range(30):
            if proc.poll() is not None:
                break
            try:
                res = httpx.get(f"{prod_url}/api/health", timeout=1.0)
                if res.status_code == 200:
                    ready = True
                    break
            except httpx.HTTPError:
                pass
            time.sleep(0.25)
        if not ready:
            stderr_out = (
                proc.stderr.read().decode("utf-8", errors="replace")
                if proc.stderr
                else ""
            )
            raise RuntimeError(
                f"Ephemeral production server failed on port {port}: {stderr_out}"
            )
        yield prod_url
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)


def provision_guest_custom_challenge(
    runner: VerificationRunner,
    client: httpx.Client,
    guest_session_id: str,
    run_id: str,
) -> tuple[str, str]:
    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if gemini_key:
        res = client.post(
            "/api/challenges/generate-custom",
            headers={
                "X-Diffly-Session-Id": guest_session_id,
                "X-Gemini-Key": gemini_key,
            },
            json={
                "topic": f"SQLite query ownership check {run_id}",
                "language": "python",
                "difficulty": "Easy",
            },
            timeout=35.0,
        )
        data = runner.check_response(
            step="guest_a_create_custom_challenge",
            actor="guest_a",
            response=res,
            expected_status=200,
            assertion="Guest A creates a private custom challenge via Gemini API",
            predicate=lambda d, _: isinstance(d, dict) and bool(d.get("slug")),
        )
        slug = data.get("slug", "") if isinstance(data, dict) else ""
        return slug, "live_gemini_api"

    slug = f"verify-custom-{run_id}"
    engine = create_engine(runner.db_url, connect_args={"check_same_thread": False})
    with Session(engine) as db:
        challenge = Challenge(
            slug=slug,
            title=f"Verify Isolation Challenge {run_id}",
            difficulty=Difficulty.EASY,
            category=Category.SECURITY,
            language=Language.PYTHON,
            description="Private custom challenge for live ownership verification.",
            threat_model="Unauthorized user reads or deletes private custom challenge.",
            defect_target="Identify missing ownership check on line 2.",
            code_snippet=(
                "def read_item(repo, item_id):\n"
                "    return repo.fetch_without_owner_check(item_id)\n"
            ),
            expected_issues=[
                {
                    "id": "idor-1",
                    "title": "Missing ownership verification",
                    "severity": "high",
                    "lines": [2],
                    "keywords": ["ownership", "authorization", "idor"],
                    "explanation": "Fetches item without verifying caller ownership.",
                }
            ],
            hints=[
                {
                    "tier": 1,
                    "label": "Contextual clue",
                    "text": "Check access control.",
                },
                {"tier": 2, "label": "Vulnerability class", "text": "IDOR pattern."},
                {"tier": 3, "label": "Line pointer", "text": "Inspect line 2."},
            ],
            canonical_review="Enforce owner_id == current_user.id before returning.",
            recommended_fix_diff="- return repo.fetch_without_owner_check(item_id)",
            estimated_minutes=5,
            is_public=False,
            user_id=None,
            session_id=guest_session_id,
        )
        db.add(challenge)
        db.commit()
    return slug, "seeded_in_isolated_db"


def deactivate_user_in_db(db_url: str, username: str) -> None:
    engine = create_engine(db_url, connect_args={"check_same_thread": False})
    with Session(engine) as db:
        user = db.exec(select(User).where(User.username == username)).first()
        if user is None:
            raise RuntimeError(f"Expected user {username} in isolated DB")
        user.is_active = False
        db.add(user)
        db.commit()


def run_auth_isolation(runner: VerificationRunner) -> None:
    run_id = uuid4().hex[:8]
    guest_a_sid = f"guest-a-{run_id}"
    guest_b_sid = f"guest-b-{run_id}"
    user_a_creds = {
        "email": f"user_a_{run_id}@example.com",
        "username": f"user_a_{run_id}",
        "password": f"DifflyPassA!{run_id}",
    }
    user_b_creds = {
        "email": f"user_b_{run_id}@example.com",
        "username": f"user_b_{run_id}",
        "password": f"DifflyPassB!{run_id}",
    }
    inactive_creds = {
        "email": f"inactive_{run_id}@example.com",
        "username": f"inactive_{run_id}",
        "password": f"DifflyPassI!{run_id}",
    }

    with (
        httpx.Client(base_url=runner.base_url, timeout=15.0) as anon,
        httpx.Client(base_url=runner.base_url, timeout=15.0) as client_a,
        httpx.Client(base_url=runner.base_url, timeout=15.0) as client_b,
        httpx.Client(base_url=runner.base_url, timeout=15.0) as client_inactive,
    ):
        ch_res = anon.get("/api/challenges")
        ch_data = runner.check_response(
            step="list_public_challenges",
            actor="anonymous",
            response=ch_res,
            expected_status=200,
            assertion="Public challenge catalog is available",
            predicate=lambda d, _: isinstance(d, list) and len(d) > 0,
        )
        public_slug = ch_data[0]["slug"]

        sub_res = anon.post(
            f"/api/challenges/{public_slug}/review",
            headers={"X-Diffly-Session-Id": guest_a_sid},
            json={
                "flagged_lines": [1],
                "comments": (
                    "Security review flagging potential vulnerability on line 1."
                ),
            },
        )
        runner.check_response(
            step="guest_a_submit_review",
            actor="guest_a",
            response=sub_res,
            expected_status=200,
            assertion="Guest A submits review using X-Diffly-Session-Id",
            predicate=lambda d, _: (
                isinstance(d, dict)
                and d.get("submission_id", 0) > 0
                and d.get("session_id") == guest_a_sid
            ),
        )

        custom_slug, setup_mode = provision_guest_custom_challenge(
            runner, anon, guest_a_sid, run_id
        )
        runner.metadata["custom_challenge_setup"] = setup_mode
        runner.metadata["custom_challenge_slug"] = custom_slug

        ga_custom_res = anon.get(
            "/api/challenges/custom",
            headers={"X-Diffly-Session-Id": guest_a_sid},
        )
        runner.check_response(
            step="guest_a_reads_own_custom_challenges",
            actor="guest_a",
            response=ga_custom_res,
            expected_status=200,
            assertion="Guest A sees own private custom challenge before registration",
            predicate=lambda d, _: any(
                item.get("slug") == custom_slug for item in d.get("items", [])
            ),
        )

        ga_hist_res = anon.get(
            f"/api/challenges/{public_slug}/submissions",
            headers={"X-Diffly-Session-Id": guest_a_sid},
        )
        runner.check_response(
            step="guest_a_reads_own_history",
            actor="guest_a",
            response=ga_hist_res,
            expected_status=200,
            assertion="Guest A reads own submission history",
            predicate=lambda d, _: isinstance(d, list) and len(d) == 1,
        )

        ga_prog_res = anon.get(
            "/api/user/progress",
            headers={"X-Diffly-Session-Id": guest_a_sid},
        )
        runner.check_response(
            step="guest_a_reads_own_progress",
            actor="guest_a",
            response=ga_prog_res,
            expected_status=200,
            assertion="Guest A progress reflects 1 attempted challenge",
            predicate=lambda d, _: d.get("total_attempted") == 1,
        )

        gb_hist_res = anon.get(
            f"/api/challenges/{public_slug}/submissions",
            headers={"X-Diffly-Session-Id": guest_b_sid},
        )
        runner.check_response(
            step="guest_b_isolated_from_guest_a_history",
            actor="guest_b",
            response=gb_hist_res,
            expected_status=200,
            assertion="Guest B cannot read Guest A submission history",
            predicate=lambda d, _: isinstance(d, list) and len(d) == 0,
        )

        gb_prog_res = anon.get(
            "/api/user/progress",
            headers={"X-Diffly-Session-Id": guest_b_sid},
        )
        runner.check_response(
            step="guest_b_isolated_from_guest_a_progress",
            actor="guest_b",
            response=gb_prog_res,
            expected_status=200,
            assertion="Guest B cannot read Guest A progress metrics",
            predicate=lambda d, _: d.get("total_attempted") == 0,
        )

        gb_custom_res = anon.get(
            "/api/challenges/custom",
            headers={"X-Diffly-Session-Id": guest_b_sid},
        )
        runner.check_response(
            step="guest_b_isolated_from_guest_a_custom_challenges",
            actor="guest_b",
            response=gb_custom_res,
            expected_status=200,
            assertion="Guest B cannot read Guest A custom challenges",
            predicate=lambda d, _: d.get("total") == 0 and d.get("items") == [],
        )

        reg_a_res = client_a.post(
            "/api/auth/register",
            headers={"X-Diffly-Session-Id": guest_a_sid},
            json={**user_a_creds, "session_id": guest_a_sid},
        )
        reg_a_data = runner.check_response(
            step="user_a_register_and_claim",
            actor="user_a",
            response=reg_a_res,
            expected_status=200,
            assertion=(
                "User A registers, claims Guest A session, and receives auth cookie"
            ),
            predicate=lambda d, r: (
                d.get("username") == user_a_creds["username"]
                and "diffly_access_token" in r.cookies
            ),
        )
        user_a_id = reg_a_data["id"]

        me_a_res = client_a.get("/api/auth/me")
        runner.check_response(
            step="user_a_me_cookie_auth",
            actor="user_a",
            response=me_a_res,
            expected_status=200,
            assertion="User A authenticates to /api/auth/me via HttpOnly cookie",
            predicate=lambda d, _: d.get("id") == user_a_id,
        )

        ua_hist_res = client_a.get(f"/api/challenges/{public_slug}/submissions")
        runner.check_response(
            step="user_a_sees_claimed_history",
            actor="user_a",
            response=ua_hist_res,
            expected_status=200,
            assertion="User A sees claimed Guest A submission via cookie auth",
            predicate=lambda d, _: isinstance(d, list) and len(d) == 1,
        )

        ua_prog_res = client_a.get("/api/user/progress")
        runner.check_response(
            step="user_a_sees_claimed_progress",
            actor="user_a",
            response=ua_prog_res,
            expected_status=200,
            assertion="User A sees claimed Guest A progress via cookie auth",
            predicate=lambda d, _: d.get("total_attempted") == 1,
        )

        ua_custom_res = client_a.get("/api/challenges/custom")
        runner.check_response(
            step="user_a_sees_claimed_custom_challenge",
            actor="user_a",
            response=ua_custom_res,
            expected_status=200,
            assertion="User A sees claimed Guest A custom challenge via cookie auth",
            predicate=lambda d, _: any(
                item.get("slug") == custom_slug for item in d.get("items", [])
            ),
        )

        old_hist_res = anon.get(
            f"/api/challenges/{public_slug}/submissions",
            headers={"X-Diffly-Session-Id": guest_a_sid},
        )
        runner.check_response(
            step="old_session_exposes_no_claimed_history",
            actor="third_party_with_old_session",
            response=old_hist_res,
            expected_status=200,
            assertion=(
                "Old Guest A session ID exposes no submission history after claim"
            ),
            predicate=lambda d, _: isinstance(d, list) and len(d) == 0,
        )

        old_prog_res = anon.get(
            "/api/user/progress",
            headers={"X-Diffly-Session-Id": guest_a_sid},
        )
        runner.check_response(
            step="old_session_exposes_no_claimed_progress",
            actor="third_party_with_old_session",
            response=old_prog_res,
            expected_status=200,
            assertion="Old Guest A session ID exposes no progress after claim",
            predicate=lambda d, _: d.get("total_attempted") == 0,
        )

        old_custom_res = anon.get(
            "/api/challenges/custom",
            headers={"X-Diffly-Session-Id": guest_a_sid},
        )
        runner.check_response(
            step="old_session_exposes_no_claimed_custom_challenges",
            actor="third_party_with_old_session",
            response=old_custom_res,
            expected_status=200,
            assertion="Old Guest A session ID exposes no custom challenges after claim",
            predicate=lambda d, _: d.get("total") == 0 and d.get("items") == [],
        )

        reg_b_res = client_b.post(
            "/api/auth/register",
            headers={"X-Diffly-Session-Id": guest_b_sid},
            json={**user_b_creds, "session_id": guest_b_sid},
        )
        runner.check_response(
            step="user_b_register",
            actor="user_b",
            response=reg_b_res,
            expected_status=200,
            assertion="User B registers cleanly with own cookie",
            predicate=lambda d, r: (
                d.get("username") == user_b_creds["username"]
                and "diffly_access_token" in r.cookies
            ),
        )

        hijack_res = client_b.post(
            "/api/user/claim-session",
            headers={"X-Diffly-Session-Id": guest_a_sid},
            json={"session_id": guest_a_sid},
        )
        runner.check_response(
            step="user_b_cannot_reclaim_old_guest_a_session",
            actor="user_b",
            response=hijack_res,
            expected_status=200,
            assertion=(
                "User B claim-session on already-claimed Guest A session claims 0 items"
            ),
            predicate=lambda d, _: (
                d.get("claimed_count") == 0 and d.get("claimed_challenges_count") == 0
            ),
        )

        ub_hist_res = client_b.get(
            f"/api/challenges/{public_slug}/submissions",
            headers={"X-Diffly-Session-Id": guest_a_sid},
        )
        runner.check_response(
            step="user_b_cannot_see_user_a_history_even_with_old_sid",
            actor="user_b",
            response=ub_hist_res,
            expected_status=200,
            assertion=(
                "User B cannot see User A submissions even with old Guest A session ID"
            ),
            predicate=lambda d, _: isinstance(d, list) and len(d) == 0,
        )

        ub_prog_res = client_b.get(
            "/api/user/progress",
            headers={"X-Diffly-Session-Id": guest_a_sid},
        )
        runner.check_response(
            step="user_b_cannot_see_user_a_progress_even_with_old_sid",
            actor="user_b",
            response=ub_prog_res,
            expected_status=200,
            assertion=(
                "User B cannot see User A progress even with old Guest A session ID"
            ),
            predicate=lambda d, _: d.get("total_attempted") == 0,
        )

        logout_res = client_a.post("/api/auth/logout")
        runner.check_response(
            step="user_a_logout",
            actor="user_a",
            response=logout_res,
            expected_status=200,
            assertion="User A logs out and clears auth cookie",
        )

        me_after_logout = client_a.get("/api/auth/me")
        runner.check_response(
            step="user_a_me_after_logout_denied",
            actor="user_a_logged_out",
            response=me_after_logout,
            expected_status=401,
            assertion="Logged-out User A receives 401 on /api/auth/me",
        )

        prog_after_logout = client_a.get("/api/user/progress")
        runner.check_response(
            step="user_a_progress_cleared_after_logout",
            actor="user_a_logged_out",
            response=prog_after_logout,
            expected_status=200,
            assertion="Logged-out User A sees 0 attempted progress",
            predicate=lambda d, _: d.get("total_attempted") == 0,
        )

        login_a_res = client_a.post(
            "/api/auth/login",
            json={
                "identifier": user_a_creds["username"],
                "password": user_a_creds["password"],
            },
        )
        runner.check_response(
            step="user_a_login_restores_access",
            actor="user_a",
            response=login_a_res,
            expected_status=200,
            assertion="User A logs back in and receives fresh auth cookie",
            predicate=lambda d, r: (
                d.get("id") == user_a_id and "diffly_access_token" in r.cookies
            ),
        )

        prog_after_login = client_a.get("/api/user/progress")
        runner.check_response(
            step="user_a_progress_restored_after_login",
            actor="user_a",
            response=prog_after_login,
            expected_status=200,
            assertion="Re-authenticated User A sees claimed progress again",
            predicate=lambda d, _: d.get("total_attempted") == 1,
        )

        forged_cookie_res = anon.get(
            "/api/auth/me",
            cookies={"diffly_access_token": "forged.invalid.jwt"},
        )
        runner.check_response(
            step="forged_cookie_rejected",
            actor="forged_cookie",
            response=forged_cookie_res,
            expected_status=401,
            assertion="Garbage auth cookie is rejected with 401 on /api/auth/me",
        )

        forged_prog_res = anon.get(
            "/api/user/progress",
            cookies={"diffly_access_token": "forged.invalid.jwt"},
        )
        runner.check_response(
            step="forged_cookie_yields_no_progress",
            actor="forged_cookie",
            response=forged_prog_res,
            expected_status=200,
            assertion="Garbage auth cookie grants no progress access",
            predicate=lambda d, _: d.get("total_attempted") == 0,
        )

        reg_inact = client_inactive.post("/api/auth/register", json=inactive_creds)
        runner.check_response(
            step="register_user_to_deactivate",
            actor="inactive_user",
            response=reg_inact,
            expected_status=200,
            assertion="Register user before deactivating in isolated DB",
        )
        deactivate_user_in_db(runner.db_url, inactive_creds["username"])

        inact_me_res = client_inactive.get("/api/auth/me")
        runner.check_response(
            step="inactive_user_cookie_rejected",
            actor="inactive_user",
            response=inact_me_res,
            expected_status=401,
            assertion="Deactivated user auth cookie is rejected with 401",
        )

        inact_login_res = anon.post(
            "/api/auth/login",
            json={
                "identifier": inactive_creds["username"],
                "password": inactive_creds["password"],
            },
        )
        runner.check_response(
            step="inactive_user_login_rejected",
            actor="inactive_user",
            response=inact_login_res,
            expected_status=403,
            assertion="Deactivated user login attempt is rejected with 403",
        )

        with (
            temporary_production_server(runner.db_url) as prod_url,
            httpx.Client(base_url=prod_url, timeout=15.0) as prod_client,
        ):
            prod_me_res = prod_client.get(
                "/api/auth/me",
                headers={"x-user-id": str(user_a_id)},
            )
            runner.check_response(
                step="prod_x_user_id_header_rejected_on_me",
                actor="forged_x_user_id_prod",
                response=prod_me_res,
                expected_status=401,
                assertion=(
                    "Forged x-user-id header returns 401 when ENVIRONMENT=production"
                ),
            )

            prod_prog_res = prod_client.get(
                "/api/user/progress",
                headers={"x-user-id": str(user_a_id)},
            )
            runner.check_response(
                step="prod_x_user_id_header_exposes_no_progress",
                actor="forged_x_user_id_prod",
                response=prod_prog_res,
                expected_status=200,
                assertion=(
                    "Forged x-user-id header exposes no User A progress in production"
                ),
                predicate=lambda d, _: d.get("total_attempted") == 0,
            )

            prod_hist_res = prod_client.get(
                f"/api/challenges/{public_slug}/submissions",
                headers={"x-user-id": str(user_a_id)},
            )
            runner.check_response(
                step="prod_x_user_id_header_exposes_no_history",
                actor="forged_x_user_id_prod",
                response=prod_hist_res,
                expected_status=200,
                assertion=(
                    "Forged x-user-id header exposes no User A history in production"
                ),
                predicate=lambda d, _: isinstance(d, list) and len(d) == 0,
            )


def run_challenge_ownership(runner: VerificationRunner) -> None:
    run_id = uuid4().hex[:8]
    guest_a_sid = f"guest-owner-a-{run_id}"
    guest_b_sid = f"guest-owner-b-{run_id}"
    user_a_creds = {
        "email": f"owner_a_{run_id}@example.com",
        "username": f"owner_a_{run_id}",
        "password": f"DifflyOwnA!{run_id}",
    }
    user_b_creds = {
        "email": f"owner_b_{run_id}@example.com",
        "username": f"owner_b_{run_id}",
        "password": f"DifflyOwnB!{run_id}",
    }

    with (
        httpx.Client(base_url=runner.base_url, timeout=15.0) as anon,
        httpx.Client(base_url=runner.base_url, timeout=15.0) as client_a,
        httpx.Client(base_url=runner.base_url, timeout=15.0) as client_b,
    ):
        missing_key_res = anon.post(
            "/api/challenges/generate-custom",
            headers={"X-Diffly-Session-Id": guest_a_sid},
            json={
                "topic": "Unauthorized generation check",
                "language": "python",
                "difficulty": "Easy",
            },
        )
        runner.check_response(
            step="generate_custom_requires_gemini_key",
            actor="guest_a",
            response=missing_key_res,
            expected_status=401,
            assertion=(
                "POST /api/challenges/generate-custom rejects missing key with 401"
            ),
        )

        custom_slug, setup_mode = provision_guest_custom_challenge(
            runner, anon, guest_a_sid, run_id
        )
        runner.metadata["custom_challenge_setup"] = setup_mode
        runner.metadata["custom_challenge_slug"] = custom_slug

        ga_eval_res = anon.post(
            f"/api/challenges/{custom_slug}/review",
            headers={"X-Diffly-Session-Id": guest_a_sid},
            json={
                "flagged_lines": [2],
                "comments": "Missing ownership authorization check (IDOR) on line 2.",
            },
        )
        runner.check_response(
            step="guest_a_evaluates_own_custom_challenge",
            actor="guest_a",
            response=ga_eval_res,
            expected_status=200,
            assertion="Guest A evaluates own private custom challenge via /review",
            predicate=lambda d, _: d.get("submission_id", 0) > 0,
        )

        pub_res = anon.get("/api/challenges")
        runner.check_response(
            step="private_custom_challenge_not_in_public_catalog",
            actor="anonymous",
            response=pub_res,
            expected_status=200,
            assertion=(
                "Private custom challenge is excluded from public /api/challenges"
            ),
            predicate=lambda d, _: all(item.get("slug") != custom_slug for item in d),
        )

        gb_list_res = anon.get(
            "/api/challenges/custom",
            headers={"X-Diffly-Session-Id": guest_b_sid},
        )
        runner.check_response(
            step="guest_b_cannot_list_guest_a_custom_challenge",
            actor="guest_b",
            response=gb_list_res,
            expected_status=200,
            assertion="Guest B custom challenge list excludes Guest A custom challenge",
            predicate=lambda d, _: all(
                item.get("slug") != custom_slug for item in d.get("items", [])
            ),
        )

        gb_get_res = anon.get(
            f"/api/challenges/{custom_slug}",
            headers={"X-Diffly-Session-Id": guest_b_sid},
        )
        runner.check_response(
            step="guest_b_cannot_read_guest_a_custom_challenge",
            actor="guest_b",
            response=gb_get_res,
            expected_status=404,
            assertion="Guest B gets 404 reading Guest A custom challenge detail",
        )

        gb_eval_res = anon.post(
            f"/api/challenges/{custom_slug}/review",
            headers={"X-Diffly-Session-Id": guest_b_sid},
            json={
                "flagged_lines": [2],
                "comments": "Unauthorized review attempt by Guest B.",
            },
        )
        runner.check_response(
            step="guest_b_cannot_evaluate_guest_a_custom_challenge",
            actor="guest_b",
            response=gb_eval_res,
            expected_status=404,
            assertion="Guest B gets 404 evaluating Guest A custom challenge",
        )

        gb_del_res = anon.delete(
            f"/api/challenges/custom/{custom_slug}",
            headers={"X-Diffly-Session-Id": guest_b_sid},
        )
        runner.check_response(
            step="guest_b_cannot_delete_guest_a_custom_challenge",
            actor="guest_b",
            response=gb_del_res,
            expected_status=403,
            assertion="Guest B gets 403 deleting Guest A custom challenge",
        )

        reg_a_res = client_a.post(
            "/api/auth/register",
            headers={"X-Diffly-Session-Id": guest_a_sid},
            json={**user_a_creds, "session_id": guest_a_sid},
        )
        reg_a_data = runner.check_response(
            step="user_a_registers_and_claims_custom_challenge",
            actor="user_a",
            response=reg_a_res,
            expected_status=200,
            assertion="User A registers and claims Guest A custom challenge",
            predicate=lambda d, r: "diffly_access_token" in r.cookies,
        )
        user_a_id = reg_a_data["id"]

        ua_detail_res = client_a.get(f"/api/challenges/{custom_slug}")
        runner.check_response(
            step="user_a_reads_claimed_custom_challenge",
            actor="user_a",
            response=ua_detail_res,
            expected_status=200,
            assertion="User A reads claimed custom challenge detail via cookie auth",
            predicate=lambda d, _: d.get("slug") == custom_slug,
        )

        ua_subs_res = client_a.get(f"/api/challenges/{custom_slug}/submissions")
        runner.check_response(
            step="user_a_reads_claimed_custom_challenge_submissions",
            actor="user_a",
            response=ua_subs_res,
            expected_status=200,
            assertion="User A sees claimed submission history on custom challenge",
            predicate=lambda d, _: isinstance(d, list) and len(d) == 1,
        )

        old_read_res = anon.get(
            f"/api/challenges/{custom_slug}",
            headers={"X-Diffly-Session-Id": guest_a_sid},
        )
        runner.check_response(
            step="old_session_cannot_read_claimed_custom_challenge",
            actor="third_party_with_old_session",
            response=old_read_res,
            expected_status=404,
            assertion="Old Guest A session ID cannot read claimed custom challenge",
        )

        old_del_res = anon.delete(
            f"/api/challenges/custom/{custom_slug}",
            headers={"X-Diffly-Session-Id": guest_a_sid},
        )
        runner.check_response(
            step="old_session_cannot_delete_claimed_custom_challenge",
            actor="third_party_with_old_session",
            response=old_del_res,
            expected_status=403,
            assertion="Old Guest A session ID cannot delete claimed custom challenge",
        )

        reg_b_res = client_b.post("/api/auth/register", json=user_b_creds)
        runner.check_response(
            step="user_b_registers",
            actor="user_b",
            response=reg_b_res,
            expected_status=200,
            assertion="User B registers for cross-user ownership checks",
        )

        ub_list_res = client_b.get("/api/challenges/custom")
        runner.check_response(
            step="user_b_cannot_list_user_a_custom_challenge",
            actor="user_b",
            response=ub_list_res,
            expected_status=200,
            assertion="User B custom challenge list excludes User A custom challenge",
            predicate=lambda d, _: all(
                item.get("slug") != custom_slug for item in d.get("items", [])
            ),
        )

        ub_read_res = client_b.get(f"/api/challenges/{custom_slug}")
        runner.check_response(
            step="user_b_cannot_read_user_a_custom_challenge",
            actor="user_b",
            response=ub_read_res,
            expected_status=404,
            assertion="User B receives 404 reading User A custom challenge",
        )

        ub_hints_res = client_b.get(f"/api/challenges/{custom_slug}/hints")
        runner.check_response(
            step="user_b_cannot_read_user_a_custom_challenge_hints",
            actor="user_b",
            response=ub_hints_res,
            expected_status=404,
            assertion="User B receives 404 reading User A custom challenge hints",
        )

        ub_sol_res = client_b.get(f"/api/challenges/{custom_slug}/solution?reveal=true")
        runner.check_response(
            step="user_b_cannot_read_user_a_custom_challenge_solution",
            actor="user_b",
            response=ub_sol_res,
            expected_status=404,
            assertion="User B receives 404 reading User A custom challenge solution",
        )

        ub_eval_res = client_b.post(
            f"/api/challenges/{custom_slug}/review",
            json={
                "flagged_lines": [2],
                "comments": "Cross-user review evaluation attempt by User B.",
            },
        )
        runner.check_response(
            step="user_b_cannot_evaluate_user_a_custom_challenge",
            actor="user_b",
            response=ub_eval_res,
            expected_status=404,
            assertion="User B receives 404 evaluating User A custom challenge",
        )

        ub_subs_res = client_b.get(f"/api/challenges/{custom_slug}/submissions")
        runner.check_response(
            step="user_b_cannot_read_user_a_custom_challenge_submissions",
            actor="user_b",
            response=ub_subs_res,
            expected_status=404,
            assertion="User B receives 404 reading User A custom challenge submissions",
        )

        ub_del_res = client_b.delete(f"/api/challenges/custom/{custom_slug}")
        runner.check_response(
            step="user_b_cannot_delete_user_a_custom_challenge",
            actor="user_b",
            response=ub_del_res,
            expected_status=403,
            assertion="User B receives 403 deleting User A custom challenge",
        )

        with (
            temporary_production_server(runner.db_url) as prod_url,
            httpx.Client(base_url=prod_url, timeout=15.0) as prod_client,
        ):
            prod_read = prod_client.get(
                f"/api/challenges/{custom_slug}",
                headers={"x-user-id": str(user_a_id)},
            )
            runner.check_response(
                step="prod_x_user_id_cannot_read_custom_challenge",
                actor="forged_x_user_id_prod",
                response=prod_read,
                expected_status=404,
                assertion=(
                    "Forged x-user-id in production cannot read User A custom challenge"
                ),
            )

            prod_del = prod_client.delete(
                f"/api/challenges/custom/{custom_slug}",
                headers={"x-user-id": str(user_a_id)},
            )
            runner.check_response(
                step="prod_x_user_id_cannot_delete_custom_challenge",
                actor="forged_x_user_id_prod",
                response=prod_del,
                expected_status=403,
                assertion=(
                    "Forged x-user-id in production cannot delete "
                    "User A custom challenge"
                ),
            )

        logout_res = client_a.post("/api/auth/logout")
        runner.check_response(
            step="user_a_logout",
            actor="user_a",
            response=logout_res,
            expected_status=200,
            assertion="User A logs out",
        )

        logged_out_read = client_a.get(f"/api/challenges/{custom_slug}")
        runner.check_response(
            step="logged_out_user_a_cannot_read_custom_challenge",
            actor="user_a_logged_out",
            response=logged_out_read,
            expected_status=404,
            assertion="Logged-out User A cannot read private custom challenge",
        )

        logged_out_del = client_a.delete(f"/api/challenges/custom/{custom_slug}")
        runner.check_response(
            step="logged_out_user_a_cannot_delete_custom_challenge",
            actor="user_a_logged_out",
            response=logged_out_del,
            expected_status=403,
            assertion="Logged-out User A cannot delete private custom challenge",
        )

        login_res = client_a.post(
            "/api/auth/login",
            json={
                "identifier": user_a_creds["username"],
                "password": user_a_creds["password"],
            },
        )
        runner.check_response(
            step="user_a_login",
            actor="user_a",
            response=login_res,
            expected_status=200,
            assertion="User A logs back in",
        )

        owner_del_res = client_a.delete(f"/api/challenges/custom/{custom_slug}")
        runner.check_response(
            step="owner_deletes_custom_challenge",
            actor="user_a",
            response=owner_del_res,
            expected_status=200,
            assertion="Authenticated owner User A deletes own custom challenge",
            predicate=lambda d, _: d.get("slug") == custom_slug,
        )

        after_del_res = client_a.get(f"/api/challenges/{custom_slug}")
        runner.check_response(
            step="deleted_custom_challenge_returns_404",
            actor="user_a",
            response=after_del_res,
            expected_status=404,
            assertion="Deleted custom challenge returns 404 after deletion",
        )

        pub_del_res = client_a.delete("/api/challenges/custom/agent-unsanitized-exec")
        runner.check_response(
            step="public_challenge_delete_forbidden",
            actor="user_a",
            response=pub_del_res,
            expected_status=403,
            assertion="Deleting a public catalog challenge is forbidden with 403",
        )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Verify Diffly auth isolation and custom challenge ownership live."
    )
    parser.add_argument(
        "--feature",
        required=True,
        choices=["auth-isolation", "challenge-ownership"],
    )
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--evidence-out", required=True)
    parser.add_argument("--db-url", default="")
    args = parser.parse_args()

    db_url = args.db_url.strip()
    if not db_url:
        db_file = (
            REPO_ROOT
            / ".agents"
            / "skills"
            / "verify-diffly"
            / ".pids"
            / "backend.db_url"
        )
        if db_file.is_file():
            db_url = db_file.read_text(encoding="utf-8").strip()
        else:
            db_url = os.environ.get("DATABASE_URL", "").strip()

    if not db_url:
        print(
            "ERROR: Isolated DATABASE_URL not found. Launch backend via launch.sh.",
            file=sys.stderr,
        )
        return 1

    runner = VerificationRunner(
        feature=args.feature,
        base_url=args.base_url,
        db_url=db_url,
    )

    try:
        if args.feature == "auth-isolation":
            run_auth_isolation(runner)
        else:
            run_challenge_ownership(runner)
    except Exception as exc:
        runner.failures.append(f"Unhandled verification exception: {exc}")
        print(f"ERROR: {exc}", file=sys.stderr)

    report = runner.build_report()
    out_path = Path(args.evidence_out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Evidence recorded to {out_path}")

    if runner.failures or report["failed_steps"] > 0:
        print(
            f"VERIFICATION FAILED ({report['failed_steps']}/"
            f"{report['total_steps']} steps failed).",
            file=sys.stderr,
        )
        return 1

    print(
        f"VERIFICATION PASSED ({report['passed_steps']}/"
        f"{report['total_steps']} steps passed)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
