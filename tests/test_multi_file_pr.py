"""Tests for multi-file PR diff schema, loader, evaluator, and API routes."""

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlmodel import Session

from backend.models.challenge import (
    Category,
    Challenge,
    ChallengeFile,
    DefectCriterion,
    Difficulty,
    FlaggedLineRef,
    Language,
)
from backend.models.submission import Submission
from backend.seed.loader import (
    compute_challenge_content_hash,
    load_challenge_bundle,
)
from backend.seed.seed_data import seed_challenges, seed_missing_challenges
from backend.services.evaluation_service import evaluate_review


SAMPLE_PATCH_AUTH = """--- a/api/auth.py
+++ b/api/auth.py
@@ -10,6 +10,8 @@ def verify(token: str):
     if not token:
         return None
+    if token.startswith("dev-"):
+        return {"sub": "dev"}
     return decode_jwt(token)
"""

SAMPLE_PATCH_SQL = """--- a/db/users.py
+++ b/db/users.py
@@ -20,5 +20,6 @@ def get_user(db, email: str):
-    return db.execute("SELECT * FROM users WHERE email = :e", {"e": email})
+    # raw lookup
+    return db.execute(f"SELECT * FROM users WHERE email = '{email}'")
"""

SAMPLE_CONTENT_CFG = """TIMEOUT_SECONDS = 30
MAX_RETRIES = 3
"""


def _create_multi_file_challenge(
    session: Session, slug: str = "pr-test-slug"
) -> Challenge:
    ch = Challenge(
        slug=slug,
        title="PR: Auth Backdoor and SQLi",
        difficulty=Difficulty.MEDIUM,
        category=Category.SECURITY,
        language=Language.PYTHON,
        description="Multi-file PR review test challenge.",
        threat_model="Bypass auth and inject SQL.",
        defect_target="Find 2 vulnerabilities across api/auth.py and db/users.py.",
        files=[
            {"path": "api/auth.py", "language": "python", "patch": SAMPLE_PATCH_AUTH},
            {"path": "db/users.py", "language": "python", "patch": SAMPLE_PATCH_SQL},
            {"path": "config.py", "language": "python", "content": SAMPLE_CONTENT_CFG},
        ],
        expected_issues=[
            {
                "id": "auth-backdoor",
                "title": "Hardcoded Dev Token Auth Bypass",
                "severity": "critical",
                "matched_lines": [
                    {"file_path": "api/auth.py", "line_number": 12},
                    {"file_path": "api/auth.py", "line_number": 13},
                ],
                "matched_keywords": ["backdoor", "bypass", "token"],
                "explanation": "Dev prefix bypasses JWT signature validation.",
            },
            {
                "id": "sql-injection",
                "title": "SQL Injection via f-string",
                "severity": "critical",
                "file_path": "db/users.py",
                "lines": [21],
                "keywords": ["sql injection", "f-string", "parameterized"],
                "explanation": "Interpolated email allows SQL injection.",
            },
        ],
        hints=[
            {"tier": 1, "hint": "Check auth and db files."},
            {"tier": 2, "hint": "Auth bypass and SQL injection."},
            {"tier": 3, "hint": "api/auth.py:12 and db/users.py:21."},
        ],
        canonical_review="Remove dev token bypass and restore parameterized SQL.",
        recommended_fix_diff=(
            "--- a/api/auth.py\n+++ b/api/auth.py\n@@ -12,2 +11,0 @@\n"
            '-    if token.startswith("dev-"):\n-        return {"sub": "dev"}\n'
            "--- a/db/users.py\n+++ b/db/users.py\n@@ -21 +21 @@\n"
            "-    return db.execute(f\"SELECT * FROM users WHERE email = '{email}'\")\n"
            '+    return db.execute("SELECT * FROM users WHERE email = :e",\n'
            '+                      {"e": email})\n'
        ),
        is_public=True,
    )
    session.add(ch)
    session.commit()
    session.refresh(ch)
    return ch


def test_challenge_file_model_and_line_extraction():
    file_patch = ChallengeFile(path="src/routes/users.ts", patch=SAMPLE_PATCH_AUTH)
    assert file_patch.language == "typescript"
    valid_lines = file_patch.valid_line_numbers()
    assert valid_lines == {10, 11, 12, 13, 14}
    assert file_patch.line_count() == 5

    # Deleted SQL comment starting with '--' inside hunk must not break hunk parsing
    sql_patch = (
        "@@ -4,3 +4,3 @@\n"
        " SELECT id\n"
        "--- old sql comment\n"
        "+-- new sql comment\n"
        " FROM users\n"
    )
    sql_file = ChallengeFile(path="queries.sql", patch=sql_patch)
    assert sql_file.valid_line_numbers() == {4, 5, 6}

    with pytest.raises(ValidationError):
        ChallengeFile(path="", content="x = 1")

    with pytest.raises(ValidationError):
        ChallengeFile(path="a.py")


def test_defect_criterion_supports_scoped_line_variants():
    d1 = DefectCriterion.model_validate(
        {
            "id": "d1",
            "title": "Scoped list",
            "matched_lines": [{"file_path": "a.py", "line_number": 5}],
        }
    )
    assert d1.get_scoped_lines() == [("a.py", 5)]

    d2 = DefectCriterion.model_validate(
        {
            "id": "d2",
            "title": "Issue-level file_path",
            "file_path": "b.py",
            "lines": [10, 11],
        }
    )
    assert d2.get_scoped_lines() == [("b.py", 10), ("b.py", 11)]

    d3 = DefectCriterion.model_validate(
        {
            "id": "d3",
            "title": "Tuple format",
            "lines": [("c.py", 7)],
        }
    )
    assert d3.get_scoped_lines() == [("c.py", 7)]

    with pytest.raises(ValidationError):
        DefectCriterion.model_validate(
            {"lines": [{"file_path": "a.py", "line_number": 0}]}
        )


def test_loader_multi_file_bundle_and_traversal_guard(tmp_path, session: Session):
    bundle_dir = tmp_path / "pr-bundle"
    bundle_dir.mkdir()
    (bundle_dir / "files").mkdir()
    (bundle_dir / "files" / "helper.py").write_text("x = 1\ny = 2\n", encoding="utf-8")
    (bundle_dir / "auth.patch").write_text(SAMPLE_PATCH_AUTH, encoding="utf-8")
    (bundle_dir / "description.md").write_text(
        "# PR Title\n\n## Description\nMulti-file PR.\n\n## Threat Model\nAuth risk.\n",
        encoding="utf-8",
    )
    (bundle_dir / "meta.yaml").write_text(
        """
slug: pr-bundle
title: PR Bundle
difficulty: medium
category: security
files:
  - path: api/auth.py
    patch_file: auth.patch
  - path: helper.py
expected_issues:
  - id: pr-1
    title: Backdoor
    severity: critical
    matched_lines:
      - file_path: api/auth.py
        line_number: 12
    matched_keywords: ["bypass", "token"]
    explanation: Bypasses token check.
""",
        encoding="utf-8",
    )

    loaded = load_challenge_bundle(bundle_dir)
    assert loaded["language"] == Language.PYTHON
    assert len(loaded["files"]) == 2
    assert loaded["files"][0]["patch"] == SAMPLE_PATCH_AUTH
    assert loaded["files"][1]["content"] == "x = 1\ny = 2\n"

    h1 = compute_challenge_content_hash(loaded)
    synced = seed_missing_challenges(session, content_dir=tmp_path)
    assert len(synced) == 1
    assert synced[0].content_hash == h1
    assert len(synced[0].get_files()) == 2
    assert synced[0].to_summary().file_count == 2
    assert synced[0].to_detail().files[0].path == "api/auth.py"

    # Mutating a file's patch changes hash and updates via seed_missing_challenges
    (bundle_dir / "auth.patch").write_text(
        SAMPLE_PATCH_AUTH + "+    # extra\n", encoding="utf-8"
    )
    synced2 = seed_missing_challenges(session, content_dir=tmp_path)
    assert synced2[0].content_hash != h1

    # Path traversal in patch_file must raise ValueError
    (bundle_dir / "meta.yaml").write_text(
        """
slug: pr-bundle
title: PR Bundle
difficulty: medium
category: security
language: python
files:
  - path: api/auth.py
    patch_file: ../../etc/passwd
expected_issues:
  - id: pr-1
    lines: [1]
""",
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="escapes bundle directory"):
        load_challenge_bundle(bundle_dir)


def test_evaluate_review_scoped_by_file_path_and_blocks_cross_file_collision(
    session: Session,
):
    ch = _create_multi_file_challenge(session, slug="pr-eval-test")

    # Correct lines in both files + keywords -> 100/100
    res_perfect = evaluate_review(
        challenge=ch,
        flagged_lines=[
            FlaggedLineRef(file_path="api/auth.py", line_number=12),
            FlaggedLineRef(file_path="db/users.py", line_number=21),
        ],
        user_comments=(
            "api/auth.py introduces a dev token bypass backdoor, and db/users.py "
            "uses an f-string for SQL injection instead of parameterized queries."
        ),
    )
    assert res_perfect.score == 100
    assert res_perfect.false_positive_lines == []
    assert len(res_perfect.detected_issues) == 2
    assert all(
        isinstance(ln, FlaggedLineRef)
        for issue in res_perfect.detected_issues
        for ln in issue.matched_lines
    )
    assert "api/auth.py:12" in res_perfect.critique
    assert "db/users.py:21" in res_perfect.critique

    # Wrong file with matching line numbers must NOT match and incurs FP penalties
    res_wrong_file = evaluate_review(
        challenge=ch,
        flagged_lines=[
            {"file_path": "db/users.py", "line_number": 12},
            {"file_path": "api/auth.py", "line_number": 21},
        ],
        user_comments="token bypass sql injection f-string",
        attempt_number=1,
    )
    assert res_wrong_file.score == 0
    assert len(res_wrong_file.detected_issues) == 0
    assert len(res_wrong_file.missed_issues) == 2
    assert len(res_wrong_file.false_positive_lines) == 2
    assert res_wrong_file.false_positive_penalty == 30.0
    # Spoiler gating still redacts missed expected_lines on attempt 1
    assert res_wrong_file.missed_issues[0].expected_lines == []

    # Off-by-one proximity on single-line defect applies within same file only
    res_single_prox = evaluate_review(
        challenge=ch,
        flagged_lines=[
            {"file_path": "api/auth.py", "line_number": 12},
            {"file_path": "db/users.py", "line_number": 20},
        ],
        user_comments="token bypass and sql injection via f-string",
    )
    assert res_single_prox.false_positive_lines == []
    assert res_single_prox.line_precision_score == 75.0
    assert res_single_prox.concept_score == 100.0
    assert res_single_prox.score == 88


def test_submission_api_multi_file_persistence_and_bounds_validation(
    client: TestClient, session: Session
):
    ch = _create_multi_file_challenge(session, slug="pr-api-test")

    # Summary omits files payload, includes file_count
    list_res = client.get("/api/challenges")
    assert list_res.status_code == 200
    summary = next(item for item in list_res.json() if item["slug"] == ch.slug)
    assert summary["file_count"] == 3
    assert summary["line_count"] > 0
    assert "files" not in summary

    # Detail includes files list
    detail_res = client.get(f"/api/challenges/{ch.slug}")
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["file_count"] == 3
    assert [f["path"] for f in detail["files"]] == [
        "api/auth.py",
        "db/users.py",
        "config.py",
    ]

    # Reject plain integer lines on >1 file challenge
    res_unscoped = client.post(
        f"/api/challenges/{ch.slug}/review",
        json={"flagged_lines": [12], "comments": "Unscoped line integer"},
    )
    assert res_unscoped.status_code == 422

    # Reject unknown file_path
    res_unknown_file = client.post(
        f"/api/challenges/{ch.slug}/review",
        json={
            "flagged_lines": [{"file_path": "nonexistent.py", "line_number": 1}],
            "comments": "Unknown file target",
        },
    )
    assert res_unknown_file.status_code == 422

    # Reject out-of-bounds line_number for patch/content file
    res_oob_patch = client.post(
        f"/api/challenges/{ch.slug}/review",
        json={
            "flagged_lines": [{"file_path": "api/auth.py", "line_number": 99}],
            "comments": "Out of hunk range",
        },
    )
    assert res_oob_patch.status_code == 422

    res_oob_content = client.post(
        f"/api/challenges/{ch.slug}/review",
        json={
            "flagged_lines": [{"file_path": "config.py", "line_number": 5}],
            "comments": "Past config.py length",
        },
    )
    assert res_oob_content.status_code == 422

    # Valid scoped submission persists and loads cleanly in history
    res_ok = client.post(
        f"/api/challenges/{ch.slug}/review",
        json={
            "flagged_lines": [
                {"file_path": "api/auth.py", "line_number": 12},
                {"file_path": "db/users.py", "line_number": 21},
            ],
            "comments": (
                "api/auth.py adds a hardcoded dev token backdoor bypass, and "
                "db/users.py uses f-string SQL injection instead of "
                "parameterized queries."
            ),
        },
    )
    assert res_ok.status_code == 200
    body = res_ok.json()
    assert body["score"] == 100
    assert body["flagged_lines"] == [
        {"file_path": "api/auth.py", "line_number": 12},
        {"file_path": "db/users.py", "line_number": 21},
    ]

    saved = session.get(Submission, body["submission_id"])
    assert saved is not None
    assert saved.get_flagged_lines() == body["flagged_lines"]

    hist_res = client.get(f"/api/challenges/{ch.slug}/submissions")
    assert hist_res.status_code == 200
    assert hist_res.json()[0]["flagged_lines"] == body["flagged_lines"]


def test_curated_multi_file_pr_challenge_seeded_and_solvable(
    client: TestClient, session: Session
):
    seed_challenges(session)
    res = client.get("/api/challenges/pr-oauth-session-csrf-bypass")
    assert res.status_code == 200
    detail = res.json()
    assert detail["file_count"] == 3
    assert len(detail["files"]) == 3

    review_res = client.post(
        "/api/challenges/pr-oauth-session-csrf-bypass/review",
        json={
            "flagged_lines": [
                {"file_path": "api/routes/oauth.py", "line_number": 19},
                {"file_path": "backend/core/cookies.py", "line_number": 14},
            ],
            "comments": (
                "OAuth callback lacks state binding allowing login CSRF and "
                "should use hmac.compare_digest. Cookie flags disable httponly, "
                "secure, and use samesite=none exposing the session to XSS."
            ),
        },
    )
    assert review_res.status_code == 200
    assert review_res.json()["score"] == 100


def test_evaluate_custom_endpoint_supports_multi_file_bounds(client: TestClient):
    res_valid = client.post(
        "/api/challenges/evaluate-custom",
        json={
            "files": [
                {"path": "a.py", "patch": SAMPLE_PATCH_AUTH},
                {"path": "b.py", "content": "x = 1\ny = 2\n"},
            ],
            "expected_issues": [
                {
                    "id": "i1",
                    "title": "Dev token",
                    "severity": "high",
                    "matched_lines": [{"file_path": "a.py", "line_number": 12}],
                    "matched_keywords": ["token", "bypass"],
                    "explanation": "Dev token bypass.",
                }
            ],
            "flagged_lines": [{"file_path": "a.py", "line_number": 12}],
            "comments": "Token bypass in a.py",
        },
    )
    assert res_valid.status_code == 200
    assert res_valid.json()["score"] == 100

    res_oob = client.post(
        "/api/challenges/evaluate-custom",
        json={
            "files": [
                {"path": "a.py", "patch": SAMPLE_PATCH_AUTH},
                {"path": "b.py", "content": "x = 1\ny = 2\n"},
            ],
            "expected_issues": [
                {"id": "i1", "lines": [{"file_path": "b.py", "line_number": 1}]}
            ],
            "flagged_lines": [{"file_path": "b.py", "line_number": 99}],
            "comments": "Out of bounds",
        },
    )
    assert res_oob.status_code == 422


def test_security_bounds_and_single_file_ref_rejection(
    tmp_path, client: TestClient, session: Session
):
    from pydantic import ValidationError

    from backend.models.challenge import (
        Challenge,
        ChallengeFile,
        Difficulty,
        FlaggedLineRef,
        Language,
        validate_flagged_line_bounds,
    )

    # ChallengeFile ignores extra keys, rejects unsafe relative paths, enforces limits
    f = ChallengeFile.model_validate(
        {
            "path": "api/auth.py",
            "content": "x = 1\n",
            "patch_file": "secret.patch",
        }
    )
    assert "patch_file" not in f.model_dump()

    for bad_path in ["../meta.yaml", "/etc/passwd", "dir\\file.py", "a/../b.py"]:
        with pytest.raises(ValidationError):
            ChallengeFile.model_validate({"path": bad_path, "content": "x = 1\n"})

    with pytest.raises(ValidationError):
        ChallengeFile.model_validate({"path": "huge.py", "content": "a" * 50001})

    # Duplicate file paths rejected by Challenge.validate_files
    with pytest.raises((ValidationError, ValueError), match="Duplicate file path"):
        Challenge.validate_files(
            [
                {"path": "a.py", "content": "x = 1\n"},
                {"path": "a.py", "content": "x = 2\n"},
            ]
        )

    # Bundle fallback under files/ cannot escape into bundle root meta.yaml
    bundle = tmp_path / "escape-bundle"
    bundle.mkdir()
    (bundle / "description.md").write_text(
        "# T\n\n## Description\nD\n", encoding="utf-8"
    )
    (bundle / "meta.yaml").write_text(
        """
slug: escape-bundle
title: Escape Bundle
difficulty: easy
category: security
files:
  - path: ../meta.yaml
expected_issues:
  - id: i1
    lines: [{file_path: "a.py", line_number: 1}]
""",
        encoding="utf-8",
    )
    with pytest.raises(ValidationError, match="safe relative path"):
        load_challenge_bundle(bundle)

    # Single-file snippet challenge rejects FlaggedLineRef in bounds validation and API
    with pytest.raises(ValueError, match="only supported for multi-file"):
        validate_flagged_line_bounds(
            [FlaggedLineRef(file_path="solution.py", line_number=1)],
            code_snippet="x = 1\ny = 2\n",
        )

    single = Challenge(
        slug="single-reject-ref",
        title="Single Reject Ref",
        difficulty=Difficulty.EASY,
        language=Language.PYTHON,
        category="security",
        description="Single file",
        code_snippet="x = 1\ny = 2\n",
        expected_issues=[{"id": "s1", "title": "Bug", "severity": "low", "lines": [1]}],
    )
    session.add(single)
    session.commit()
    resp = client.post(
        f"/api/challenges/{single.slug}/review",
        json={
            "flagged_lines": [{"file_path": "solution.py", "line_number": 1}],
            "comments": "Scoped line on single-file snippet",
        },
    )
    assert resp.status_code == 422
