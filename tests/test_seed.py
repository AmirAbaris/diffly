"""Tests for challenge dataset and idempotent seed scripts."""

from sqlmodel import Session, select

from backend.models.challenge import Category, Challenge, Difficulty, Language
from backend.seed.challenges import CHALLENGES_DATA
from backend.seed.seed_data import seed_challenges, seed_challenges_if_empty


def test_seed_dataset_contains_all_curated_challenges():
    """Verify that CHALLENGES_DATA has at least 25 challenges with MVP slugs."""
    assert len(CHALLENGES_DATA) >= 25

    slugs = {ch["slug"] for ch in CHALLENGES_DATA}
    expected_slugs = {
        "agent-unsanitized-exec",
        "fastapi-raw-sql-injection",
        "nextjs-race-condition-useeffect",
        "agent-prompt-injection-leak",
        "asyncio-unhandled-task-gather",
    }
    assert expected_slugs.issubset(slugs)


def test_seed_challenges_schema_and_domain_fields():
    """Verify every challenge contains all required domain fields with correct types."""
    required_fields = [
        "slug",
        "title",
        "difficulty",
        "category",
        "language",
        "estimated_minutes",
        "description",
        "threat_model",
        "defect_target",
        "code_snippet",
        "expected_issues",
        "hints",
        "canonical_review",
        "recommended_fix_diff",
    ]

    for item in CHALLENGES_DATA:
        for field in required_fields:
            assert field in item, f"Challenge {item.get('slug')} missing {field}"

        # Difficulty & Category enums
        assert isinstance(item["difficulty"], Difficulty)
        assert isinstance(item["category"], Category)
        assert isinstance(item["language"], Language)

        # Expected issues check
        assert isinstance(item["expected_issues"], list)
        assert len(item["expected_issues"]) >= 1
        for issue in item["expected_issues"]:
            assert "id" in issue and issue["id"]
            assert "title" in issue and issue["title"]
            assert "severity" in issue and issue["severity"] in [
                "low",
                "medium",
                "high",
                "critical",
            ]
            assert "lines" in issue and isinstance(issue["lines"], list)
            assert "keywords" in issue and isinstance(issue["keywords"], list)
            assert "explanation" in issue and issue["explanation"]

        # Hints progressive tier checks
        assert isinstance(item["hints"], list)
        assert len(item["hints"]) == 3
        tiers = [h["tier"] for h in item["hints"]]
        assert tiers == [1, 2, 3]
        for hint in item["hints"]:
            assert "hint" in hint and len(hint["hint"]) > 0

        # Diff format
        assert "@@" in item["recommended_fix_diff"]


def test_seed_challenges_specific_metadata():
    """Verify category, difficulty, and language for each specific challenge."""
    by_slug = {ch["slug"]: ch for ch in CHALLENGES_DATA}

    # 1. agent-unsanitized-exec
    ch1 = by_slug["agent-unsanitized-exec"]
    assert ch1["category"] == Category.AGENT_ANTIPATHS
    assert ch1["difficulty"] == Difficulty.EASY
    assert ch1["language"] == Language.PYTHON
    assert "eval(" in ch1["code_snippet"]

    # 2. fastapi-raw-sql-injection
    ch2 = by_slug["fastapi-raw-sql-injection"]
    assert ch2["category"] == Category.SECURITY
    assert ch2["difficulty"] == Difficulty.EASY
    assert ch2["language"] == Language.PYTHON
    assert 'f"SELECT' in ch2["code_snippet"]

    # 3. nextjs-race-condition-useeffect
    ch3 = by_slug["nextjs-race-condition-useeffect"]
    assert ch3["category"] == Category.CONCURRENCY
    assert ch3["difficulty"] == Difficulty.MEDIUM
    assert ch3["language"] == Language.TYPESCRIPT
    assert "useEffect" in ch3["code_snippet"]

    # 4. agent-prompt-injection-leak
    ch4 = by_slug["agent-prompt-injection-leak"]
    assert ch4["category"] == Category.SECURITY
    assert ch4["difficulty"] == Difficulty.HARD
    assert ch4["language"] == Language.PYTHON
    assert "tools" in ch4["code_snippet"]

    # 5. asyncio-unhandled-task-gather
    ch5 = by_slug["asyncio-unhandled-task-gather"]
    assert ch5["category"] == Category.CONCURRENCY
    assert ch5["difficulty"] == Difficulty.MEDIUM
    assert ch5["language"] == Language.PYTHON
    assert "asyncio.gather" in ch5["code_snippet"]

    # 6-10. Curated Java challenges
    java_expectations = [
        (
            "java-unclosed-jdbc-resource-leak",
            Category.PERFORMANCE,
            Difficulty.EASY,
            "PreparedStatement",
        ),
        (
            "java-xxe-document-builder",
            Category.SECURITY,
            Difficulty.MEDIUM,
            "DocumentBuilderFactory",
        ),
        (
            "java-concurrenthashmap-check-then-act",
            Category.CONCURRENCY,
            Difficulty.MEDIUM,
            "ConcurrentHashMap",
        ),
        (
            "java-boxed-id-reference-equality",
            Category.LOGIC_FLAWS,
            Difficulty.MEDIUM,
            "Long docOwnerId",
        ),
        (
            "java-agent-unsafe-deserialization",
            Category.AGENT_ANTIPATHS,
            Difficulty.HARD,
            "ObjectInputStream",
        ),
    ]
    for slug, expected_category, expected_difficulty, marker in java_expectations:
        assert slug in by_slug, f"Missing Java challenge {slug}"
        ch = by_slug[slug]
        assert ch["category"] == expected_category
        assert ch["difficulty"] == expected_difficulty
        assert ch["language"] == Language.JAVA
        assert marker in ch["code_snippet"]


def test_idempotent_seeding(session: Session):
    """Verify that running seed_challenges multiple times does not create duplicates."""
    expected_count = len(CHALLENGES_DATA)

    seeded1 = seed_challenges(session)
    assert len(seeded1) == expected_count

    count1 = len(session.exec(select(Challenge)).all())
    assert count1 == expected_count

    seeded2 = seed_challenges(session)
    assert len(seeded2) == expected_count

    count2 = len(session.exec(select(Challenge)).all())
    assert count2 == expected_count


def test_seed_updates_existing_records(session: Session):
    """Verify that seed_challenges updates changed fields when a slug exists."""
    # Seed initially
    seed_challenges(session)

    # Manually tamper with an existing challenge
    ch = session.exec(
        select(Challenge).where(Challenge.slug == "agent-unsanitized-exec")
    ).first()
    assert ch is not None
    original_title = ch.title
    ch.title = "Old Tampered Title"
    session.add(ch)
    session.commit()

    # Re-run seed
    seed_challenges(session)

    # Verify title was restored by the upsert
    session.refresh(ch)
    assert ch.title == original_title


def test_seed_challenges_if_empty(session: Session):
    """Verify seed_challenges_if_empty only runs when table has 0 records."""
    expected_count = len(CHALLENGES_DATA)
    assert len(session.exec(select(Challenge)).all()) == 0

    results = seed_challenges_if_empty(session)
    assert len(results) == expected_count
    assert len(session.exec(select(Challenge)).all()) == expected_count

    ch = session.exec(select(Challenge)).first()
    assert ch is not None
    ch.title = "Do Not Overwrite"
    session.add(ch)
    session.commit()

    results2 = seed_challenges_if_empty(session)
    assert len(results2) == expected_count
    ch_reloaded = session.exec(select(Challenge).where(Challenge.id == ch.id)).first()
    assert ch_reloaded is not None
    assert ch_reloaded.title == "Do Not Overwrite"


def test_cli_seed_command(tmp_path):
    """Verify executing python -m backend.seed.seed_data succeeds."""
    import os
    import subprocess
    import sys

    db_path = tmp_path / "seed_cli.db"
    env = os.environ.copy()
    env["DATABASE_URL"] = f"sqlite:///{db_path}"

    result = subprocess.run(
        [sys.executable, "-m", "backend.seed.seed_data"],
        capture_output=True,
        text=True,
        check=True,
        env=env,
    )
    assert result.returncode == 0
    assert f"Successfully seeded {len(CHALLENGES_DATA)} challenges" in result.stdout
    assert "agent-unsanitized-exec" in result.stdout


def test_content_as_code_bundle_structure():
    """Verify that all challenge bundles in content/challenges have required files."""
    from pathlib import Path

    import yaml

    challenges_dir = Path("content/challenges")
    assert challenges_dir.is_dir(), "content/challenges/ directory must exist"

    slugs = [d.name for d in challenges_dir.iterdir() if d.is_dir()]
    assert len(slugs) >= 25

    for slug in slugs:
        bundle_path = challenges_dir / slug
        meta_file = bundle_path / "meta.yaml"
        desc_file = bundle_path / "description.md"
        assert meta_file.is_file(), f"Missing meta.yaml in {slug}"
        assert desc_file.is_file(), f"Missing description.md in {slug}"

        with open(meta_file, encoding="utf-8") as f:
            meta = yaml.safe_load(f)
        assert isinstance(meta, dict)
        assert meta["slug"] == slug
        assert "difficulty" in meta
        assert "category" in meta
        assert "language" in meta
        assert "expected_issues" in meta

        Difficulty(meta["difficulty"])
        Category(meta["category"])
        Language(meta["language"])

        raw_files = meta.get("files")
        if raw_files:
            from backend.models.challenge import ChallengeFile

            assert isinstance(raw_files, list) and len(raw_files) >= 1
            parsed_files = [ChallengeFile.model_validate(item) for item in raw_files]
            valid_by_path = {f.path: f.valid_line_numbers() for f in parsed_files}
            snippet_lines = []
        else:
            snippets = [
                f
                for f in bundle_path.iterdir()
                if f.name.startswith("snippet.")
                and f.suffix in [".py", ".ts", ".go", ".rs", ".java"]
            ]
            assert len(snippets) == 1, f"Expected 1 native snippet file in {slug}"
            snippet_lines = snippets[0].read_text(encoding="utf-8").splitlines()
            assert len(snippet_lines) > 0, f"Empty snippet file in {slug}"
            valid_by_path = {}

        expected_issues = meta["expected_issues"]
        assert isinstance(expected_issues, list) and len(expected_issues) >= 1
        for issue in expected_issues:
            lines = (
                issue["matched_lines"]
                if "matched_lines" in issue
                else issue.get("lines", [])
            )
            assert isinstance(lines, list) and len(lines) >= 1, (
                f"Expected non-empty lines in {slug} issue {issue.get('id')}"
            )
            issue_file_path = issue.get("file_path")
            for line_entry in lines:
                if isinstance(line_entry, dict):
                    fp = line_entry.get("file_path") or line_entry.get("path")
                    ln = line_entry.get("line_number") or line_entry.get("line")
                    assert isinstance(fp, str) and fp in valid_by_path, (
                        f"Unknown file_path {fp!r} in {slug}"
                    )
                    assert (
                        isinstance(ln, int)
                        and not isinstance(ln, bool)
                        and ln in valid_by_path[fp]
                    ), f"Line {ln} out of bounds for {fp} in {slug}"
                elif valid_by_path:
                    assert (
                        isinstance(issue_file_path, str)
                        and issue_file_path in valid_by_path
                    ), f"Multi-file issue missing valid file_path in {slug}"
                    assert (
                        isinstance(line_entry, int)
                        and not isinstance(line_entry, bool)
                        and line_entry in valid_by_path[issue_file_path]
                    ), (
                        f"Line {line_entry} out of bounds for "
                        f"{issue_file_path} in {slug}"
                    )
                else:
                    assert (
                        isinstance(line_entry, int)
                        and not isinstance(line_entry, bool)
                        and 1 <= line_entry <= len(snippet_lines)
                    ), (
                        f"Line {line_entry} out of bounds "
                        f"(1..{len(snippet_lines)}) in {slug}"
                    )

        hints = meta.get("hints", [])
        assert isinstance(hints, list)
        assert [h.get("tier") for h in hints] == [1, 2, 3], (
            f"Expected hint tiers [1, 2, 3] in {slug}"
        )

        recommended_fix_diff = meta.get("recommended_fix_diff", "")
        assert isinstance(recommended_fix_diff, str) and "@@" in recommended_fix_diff, (
            f"Expected unified diff hunk '@@' in {slug}"
        )


def test_snippets_are_clean_native_code_files():
    """Verify code snippets are stored as native source files."""
    from pathlib import Path

    challenges_dir = Path("content/challenges")
    for bundle in challenges_dir.iterdir():
        if not bundle.is_dir():
            continue
        for snippet_file in bundle.glob("snippet.*"):
            content = snippet_file.read_text(encoding="utf-8")
            # Must be native multiline source code, not a python string wrapper
            lines = content.splitlines()
            assert len(lines) > 5, f"Snippet {snippet_file} should have multiple lines"
            assert not (content.startswith('"""') or content.startswith("'''"))
            assert not (content.startswith('("') or content.startswith("('"))

            # File should be syntactically valid for python snippets
            if snippet_file.suffix == ".py":
                import ast

                ast.parse(content)


def test_parse_description_md_variations():
    """Verify parse_description_md splits context and threat model across formats."""
    from backend.seed.loader import parse_description_md

    # Format 1: Title, Description, Threat Model
    md1 = """# Challenge Title

## Description
This is the description context.

## Threat Model
This is the threat model explanation.
"""
    desc1, threat1 = parse_description_md(md1)
    assert desc1 == "This is the description context."
    assert threat1 == "This is the threat model explanation."

    # Format 2: No subtitle, just text before Threat Model
    md2 = """# Challenge Title

Arbitrary context paragraph without header.

## Threat Model
Vulnerability payload can be injected.
"""
    desc2, threat2 = parse_description_md(md2)
    assert desc2 == "Arbitrary context paragraph without header."
    assert threat2 == "Vulnerability payload can be injected."

    # Format 3: No threat model header
    md3 = "Simple description without threat model."
    desc3, threat3 = parse_description_md(md3)
    assert desc3 == "Simple description without threat model."
    assert threat3 == ""


def test_loader_custom_bundle_directory(tmp_path):
    """Verify loader correctly parses a dynamically created challenge bundle."""
    from backend.seed.loader import load_challenge_bundle, load_challenges_from_dir

    custom_slug = "custom-test-challenge"
    bundle_dir = tmp_path / custom_slug
    bundle_dir.mkdir()

    (bundle_dir / "meta.yaml").write_text(
        """
slug: custom-test-challenge
title: Custom Test Challenge
difficulty: hard
category: logic_flaws
language: go
estimated_minutes: 15
defect_target: Find logic flaw
expected_issues:
  - id: custom-1
    title: Unchecked error return
    severity: high
    matched_lines: [12, 13]
    matched_keywords: ["err", "nil"]
    explanation: Ignored error return causes panic.
""",
        encoding="utf-8",
    )
    (bundle_dir / "description.md").write_text(
        """# Custom Test Challenge

## Description
A Go service ignores error return.

## Threat Model
Nil pointer dereference when database fails.
""",
        encoding="utf-8",
    )
    (bundle_dir / "snippet.go").write_text(
        "package main\n\nfunc Run() error {\n    return nil\n}\n",
        encoding="utf-8",
    )

    bundle = load_challenge_bundle(bundle_dir)
    assert bundle["slug"] == custom_slug
    assert bundle["category"] == Category.LOGIC_FLAWS
    assert bundle["difficulty"] == Difficulty.HARD
    assert bundle["language"] == Language.GO
    assert bundle["description"] == "A Go service ignores error return."
    expected_code = "package main\n\nfunc Run() error {\n    return nil\n}\n"
    assert bundle["code_snippet"] == expected_code
    assert bundle["expected_issues"][0]["lines"] == [12, 13]
    assert bundle["expected_issues"][0]["keywords"] == ["err", "nil"]

    # Test load_challenges_from_dir with tmp_path
    loaded = load_challenges_from_dir(tmp_path)
    assert len(loaded) == 1
    assert loaded[0]["slug"] == custom_slug


def test_snippets_contain_no_spoiler_comments():
    """Verify curated snippets do not leak defects via spoiler comments."""
    import re
    from pathlib import Path

    import yaml

    spoiler_patterns = [
        r"\bdefect\s*:",
        r"\bbug\s*:",
        r"\bdanger\s*:",
        r"\bbug\s+here\b",
        r"\bvulnerable\b",
        r"\boutside atomic boundary\b",
        r"\bnon-atomic\b",
        r"\bwithout verifying\b",
        r"\bwithout enforcing\b",
        r"\bwithout backpressure\b",
        r"\bwithout checked multiplication\b",
        r"\bwithout compound unique\b",
        r"\bwhile already holding\b",
        r"\brace window\b",
        r"\bstale response\b",
        r"\blocks node\.js event loop\b",
        r"\bf-string interpolation\b",
        r"\bieee 754 float\b",
        r"\btyped nil pointer\b",
        r"\bconcrete pointer initialized to nil\b",
        r"\bis not nil\b",
        r"\bevaluates to true even\b",
        r"\bn\+1 query\b",
        r"\bquery n:",
        r"\bunbuffered channel\b",
        r"\bcaller-provided destination url\b",
        r"\bsystem configuration and runtime context\b",
        r"\bexecutes arbitrary code\b",
        r"\busing float multiplication\b",
        r"\bbetween stat and create\b",
    ]
    combined = re.compile("|".join(spoiler_patterns), re.IGNORECASE)

    challenges_dir = Path("content/challenges")
    violations: list[str] = []
    for bundle in sorted(challenges_dir.iterdir()):
        if not bundle.is_dir():
            continue
        for snippet_file in bundle.glob("snippet.*"):
            for line_num, line in enumerate(
                snippet_file.read_text(encoding="utf-8").splitlines(), start=1
            ):
                stripped = line.strip()
                is_comment = (
                    stripped.startswith("#")
                    or stripped.startswith("//")
                    or " #" in line
                    or " //" in line
                )
                if is_comment and combined.search(line):
                    violations.append(
                        f"{bundle.name}/{snippet_file.name}:{line_num}: {stripped}"
                    )

        meta_file = bundle / "meta.yaml"
        meta = yaml.safe_load(meta_file.read_text(encoding="utf-8"))
        diff_text = meta.get("recommended_fix_diff", "")
        for diff_line in diff_text.splitlines():
            if diff_line.startswith(("+", "---", "+++", "@@")):
                continue
            if combined.search(diff_line):
                violations.append(f"{bundle.name}/meta.yaml diff: {diff_line.strip()}")

    assert violations == [], "Spoiler comments found:\n" + "\n".join(violations)


def test_lifespan_seeds_missing_curated_bundles_on_non_empty_db(
    engine, session: Session
):
    """Verify app lifespan seeds missing curated bundles when public rows exist."""
    from collections.abc import Generator
    from unittest.mock import patch

    from fastapi.testclient import TestClient

    from api.index import app
    from backend.core.db import get_session

    non_java_challenges = [
        ch for ch in CHALLENGES_DATA if ch["language"] != Language.JAVA
    ]
    java_slugs = {
        ch["slug"] for ch in CHALLENGES_DATA if ch["language"] == Language.JAVA
    }
    assert len(java_slugs) == 5

    for ch_dict in non_java_challenges:
        session.add(Challenge(**ch_dict))
    session.flush()

    tampered_slug = non_java_challenges[0]["slug"]
    tampered = session.exec(
        select(Challenge).where(Challenge.slug == tampered_slug)
    ).first()
    assert tampered is not None
    tampered.title = "Do Not Overwrite"
    session.add(tampered)
    session.commit()

    def override_get_session() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[get_session] = override_get_session
    try:
        with (
            patch("api.index.init_db"),
            patch("backend.seed.seed_data.engine", engine),
            TestClient(app) as tc,
        ):
            res = tc.get("/api/challenges?language=java")
            assert res.status_code == 200
            returned_slugs = {item["slug"] for item in res.json()}
            assert returned_slugs == java_slugs
    finally:
        app.dependency_overrides.clear()

    session.expire_all()
    persisted = session.exec(
        select(Challenge).where(Challenge.slug == tampered_slug)
    ).first()
    assert persisted is not None
    assert persisted.title == "Do Not Overwrite"


def test_seed_missing_curated_bundles_preserves_private_slug_collision(
    session: Session,
):
    """Verify seed_missing_challenges syncs bundles and keeps private collisions."""
    from backend.seed.seed_data import seed_missing_challenges

    non_java_challenges = [
        ch for ch in CHALLENGES_DATA if ch["language"] != Language.JAVA
    ]
    java_challenges = [ch for ch in CHALLENGES_DATA if ch["language"] == Language.JAVA]
    assert len(java_challenges) == 5

    for ch_dict in non_java_challenges:
        session.add(Challenge(**ch_dict))

    tampered_slug = non_java_challenges[0]["slug"]
    session.flush()
    tampered = session.exec(
        select(Challenge).where(Challenge.slug == tampered_slug)
    ).first()
    assert tampered is not None
    tampered.title = "Do Not Overwrite"
    session.add(tampered)

    colliding_slug = java_challenges[0]["slug"]
    private_custom = Challenge(
        slug=colliding_slug,
        title="Private Custom Collision",
        difficulty=Difficulty.EASY,
        category=Category.SECURITY,
        language=Language.JAVA,
        description="User generated challenge",
        code_snippet="class Custom {}",
        is_public=False,
        session_id="g_collision_owner",
    )
    session.add(private_custom)
    session.commit()
    session.refresh(private_custom)
    private_id = private_custom.id

    results = seed_missing_challenges(session)
    assert len(results) == len(CHALLENGES_DATA)
    assert {ch.slug for ch in results} == {ch["slug"] for ch in CHALLENGES_DATA}

    public_curated = session.exec(
        select(Challenge).where(
            Challenge.slug == colliding_slug,
            Challenge.is_public.is_(True),
        )
    ).first()
    assert public_curated is not None
    assert public_curated.title == java_challenges[0]["title"]

    preserved_private = session.get(Challenge, private_id)
    assert preserved_private is not None
    assert preserved_private.is_public is False
    assert preserved_private.title == "Private Custom Collision"
    assert preserved_private.slug.startswith(f"{colliding_slug}-custom-")
    assert preserved_private.slug != colliding_slug

    session.refresh(tampered)
    assert tampered.title == "Do Not Overwrite"

    second_results = seed_missing_challenges(session)
    assert len(second_results) == len(CHALLENGES_DATA)
    session.refresh(tampered)
    assert tampered.title == "Do Not Overwrite"


def test_content_hash_stored_on_seeded_challenges(session: Session):
    """Verify seeded curated challenges store deterministic SHA-256 content hashes."""
    from backend.seed.loader import compute_challenge_content_hash

    seeded = seed_challenges(session)
    expected_by_slug = {
        ch["slug"]: compute_challenge_content_hash(ch) for ch in CHALLENGES_DATA
    }
    for ch in seeded:
        assert ch.content_hash is not None
        assert len(ch.content_hash) == 64
        assert ch.content_hash == expected_by_slug[ch.slug]


def test_seed_missing_challenges_upserts_changed_bundle_and_null_hash(
    session: Session, tmp_path
):
    """Verify startup sync upserts bundles when content_hash changes or is NULL."""
    from backend.seed.seed_data import seed_missing_challenges

    bundle_dir = tmp_path / "sync-test-bundle"
    bundle_dir.mkdir()
    (bundle_dir / "meta.yaml").write_text(
        """
slug: sync-test-bundle
title: Initial Bundle Title
difficulty: easy
category: security
language: python
estimated_minutes: 5
defect_target: Find defect
expected_issues:
  - id: sync-1
    title: Hardcoded secret
    severity: high
    lines: [1]
    keywords: ["SECRET"]
    explanation: Secret hardcoded in source.
hints:
  - tier: 1
    hint: Clue 1
  - tier: 2
    hint: Clue 2
  - tier: 3
    hint: Clue 3
recommended_fix_diff: |
  @@ -1 +1 @@
  -SECRET = "abc"
  +SECRET = os.environ["SECRET"]
""",
        encoding="utf-8",
    )
    (bundle_dir / "description.md").write_text("Initial description.", encoding="utf-8")
    (bundle_dir / "snippet.py").write_text('SECRET = "abc"\n', encoding="utf-8")

    # 1. Initial sync inserts bundle with content_hash
    initial = seed_missing_challenges(session, content_dir=tmp_path)
    assert len(initial) == 1
    first_hash = initial[0].content_hash
    assert first_hash is not None
    assert initial[0].title == "Initial Bundle Title"

    # 2. Mutating bundle on disk changes hash -> startup sync upserts automatically
    (bundle_dir / "meta.yaml").write_text(
        (bundle_dir / "meta.yaml")
        .read_text(encoding="utf-8")
        .replace("Initial Bundle Title", "Updated Bundle Title"),
        encoding="utf-8",
    )
    (bundle_dir / "snippet.py").write_text('SECRET = "xyz"\n', encoding="utf-8")

    updated = seed_missing_challenges(session, content_dir=tmp_path)
    assert len(updated) == 1
    assert updated[0].title == "Updated Bundle Title"
    assert updated[0].code_snippet == 'SECRET = "xyz"\n'
    assert updated[0].content_hash != first_hash

    # 3. Pre-hash row (content_hash=None) is backfilled and updated on sync
    row = updated[0]
    row.title = "Legacy Stale Title"
    row.content_hash = None
    session.add(row)
    session.commit()

    backfilled = seed_missing_challenges(session, content_dir=tmp_path)
    assert len(backfilled) == 1
    assert backfilled[0].title == "Updated Bundle Title"
    assert backfilled[0].content_hash is not None


def test_seed_functions_surface_errors_instead_of_swallowing(tmp_path):
    """Verify seeding functions raise DB/bundle errors rather than returning []."""
    import pytest
    from sqlalchemy.exc import OperationalError
    from sqlmodel import create_engine

    from backend.seed.seed_data import seed_challenges_if_empty, seed_missing_challenges

    # Unmigrated empty DB -> OperationalError must surface, not return []
    empty_engine = create_engine("sqlite:///:memory:")
    try:
        with Session(empty_engine) as unmigrated_session:
            with pytest.raises(OperationalError):
                seed_challenges_if_empty(unmigrated_session)
            with pytest.raises(OperationalError):
                seed_missing_challenges(unmigrated_session)
    finally:
        empty_engine.dispose()

    # Invalid bundle -> ValueError must surface from seed_missing_challenges
    bad_bundle = tmp_path / "broken-bundle"
    bad_bundle.mkdir()
    (bad_bundle / "meta.yaml").write_text("- not-a-mapping\n", encoding="utf-8")
    empty_migrated = create_engine("sqlite:///:memory:")
    try:
        from sqlmodel import SQLModel

        SQLModel.metadata.create_all(empty_migrated)
        with Session(empty_migrated) as db:
            with pytest.raises(ValueError, match="must contain a mapping"):
                seed_missing_challenges(db, content_dir=tmp_path)
            with pytest.raises(ValueError, match="must contain a mapping"):
                seed_challenges_if_empty(db, content_dir=tmp_path)
    finally:
        empty_migrated.dispose()


def _validate_unified_diff(diff_text: str, source_text: str) -> list[str]:
    """Validate unified diff hunks and context/'-' lines against source."""
    import re

    hunk_re = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@")
    source_lines = source_text.splitlines()
    diff_lines = diff_text.splitlines()
    errors: list[str] = []
    idx = 0
    hunks = 0

    while idx < len(diff_lines):
        match = hunk_re.match(diff_lines[idx])
        if not match:
            idx += 1
            continue
        hunks += 1
        old_start = int(match.group(1))
        old_count = int(match.group(2)) if match.group(2) is not None else 1
        new_count = int(match.group(4)) if match.group(4) is not None else 1
        idx += 1
        pos = old_start - 1
        seen_old = 0
        seen_new = 0

        while idx < len(diff_lines):
            hline = diff_lines[idx]
            if (
                hline.startswith("@@")
                or hline.startswith("--- ")
                or hline.startswith("+++ ")
            ):
                break
            if hline.startswith("\\ No newline"):
                idx += 1
                continue
            prefix = " " if hline == "" else hline[0]
            text = "" if hline == "" else hline[1:]
            if prefix in (" ", "-"):
                if pos < 0 or pos >= len(source_lines):
                    errors.append(
                        f"hunk {hunks}: line {pos + 1} out of range "
                        f"(len={len(source_lines)})"
                    )
                elif source_lines[pos] != text:
                    errors.append(
                        f"hunk {hunks}: line {pos + 1} mismatch: "
                        f"diff={text!r} vs snippet={source_lines[pos]!r}"
                    )
                pos += 1
                seen_old += 1
            if prefix in (" ", "+"):
                seen_new += 1
            idx += 1

        if seen_old != old_count:
            errors.append(f"hunk {hunks}: old_count={old_count} != seen_old={seen_old}")
        if seen_new != new_count:
            errors.append(f"hunk {hunks}: new_count={new_count} != seen_new={seen_new}")

    if hunks == 0:
        errors.append("no unified diff hunks found")
    return errors


def test_curated_recommended_fix_diffs_match_snippets():
    """Verify recommended_fix_diff hunks match snippet.* lines for verified bundles."""
    verified_slugs = {
        "agent-unsanitized-exec",
        "fastapi-raw-sql-injection",
        "nextjs-race-condition-useeffect",
        "agent-prompt-injection-leak",
        "asyncio-unhandled-task-gather",
        "go-nil-error-interface-dereference",
        "java-unclosed-jdbc-resource-leak",
        "java-xxe-document-builder",
        "java-concurrenthashmap-check-then-act",
        "java-boxed-id-reference-equality",
    }
    by_slug = {ch["slug"]: ch for ch in CHALLENGES_DATA}
    assert verified_slugs.issubset(by_slug.keys())

    for slug in sorted(verified_slugs):
        ch = by_slug[slug]
        errors = _validate_unified_diff(ch["recommended_fix_diff"], ch["code_snippet"])
        assert not errors, f"{slug} diff mismatch: {errors}"
