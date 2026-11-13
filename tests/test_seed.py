"""Tests for challenge dataset and idempotent seed scripts."""

from sqlmodel import Session, select

from backend.models.challenge import Category, Challenge, Difficulty, Language
from backend.seed.challenges import CHALLENGES_DATA
from backend.seed.seed_data import seed_challenges, seed_challenges_if_empty


def test_seed_dataset_contains_all_5_mvp_challenges():
    """Verify that CHALLENGES_DATA has exactly the 5 specified MVP challenges."""
    assert len(CHALLENGES_DATA) == 5

    slugs = [ch["slug"] for ch in CHALLENGES_DATA]
    expected_slugs = [
        "agent-unsanitized-exec",
        "fastapi-raw-sql-injection",
        "nextjs-race-condition-useeffect",
        "agent-prompt-injection-leak",
        "asyncio-unhandled-task-gather",
    ]
    assert sorted(slugs) == sorted(expected_slugs)


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


def test_idempotent_seeding(session: Session):
    """Verify that running seed_challenges multiple times does not create duplicates."""
    # First seed run
    seeded1 = seed_challenges(session)
    assert len(seeded1) == 5

    count1 = len(session.exec(select(Challenge)).all())
    assert count1 == 5

    # Second seed run (idempotent upsert)
    seeded2 = seed_challenges(session)
    assert len(seeded2) == 5

    count2 = len(session.exec(select(Challenge)).all())
    assert count2 == 5


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
    assert len(session.exec(select(Challenge)).all()) == 0

    # First call: table is empty, so it seeds
    results = seed_challenges_if_empty(session)
    assert len(results) == 5
    assert len(session.exec(select(Challenge)).all()) == 5

    # Tamper with title
    ch = session.exec(select(Challenge)).first()
    assert ch is not None
    ch.title = "Do Not Overwrite"
    session.add(ch)
    session.commit()

    # Second call: table is NOT empty, so it skips seeding
    results2 = seed_challenges_if_empty(session)
    assert len(results2) == 5
    ch_reloaded = session.exec(select(Challenge).where(Challenge.id == ch.id)).first()
    assert ch_reloaded is not None
    assert ch_reloaded.title == "Do Not Overwrite"


def test_cli_seed_command():
    """Verify executing python -m backend.seed.seed_data succeeds."""
    import subprocess
    import sys

    result = subprocess.run(
        [sys.executable, "-m", "backend.seed.seed_data"],
        capture_output=True,
        text=True,
        check=True,
    )
    assert result.returncode == 0
    assert "Successfully seeded 5 challenges" in result.stdout
    assert "agent-unsanitized-exec" in result.stdout


def test_content_as_code_bundle_structure():
    """Verify that all challenge bundles in content/challenges have required files."""
    from pathlib import Path

    import yaml

    challenges_dir = Path("content/challenges")
    assert challenges_dir.is_dir(), "content/challenges/ directory must exist"

    slugs = [d.name for d in challenges_dir.iterdir() if d.is_dir()]
    assert len(slugs) >= 5

    for slug in slugs:
        bundle_path = challenges_dir / slug
        meta_file = bundle_path / "meta.yaml"
        desc_file = bundle_path / "description.md"
        assert meta_file.is_file(), f"Missing meta.yaml in {slug}"
        assert desc_file.is_file(), f"Missing description.md in {slug}"

        # Find native snippet file
        snippets = [
            f
            for f in bundle_path.iterdir()
            if f.name.startswith("snippet.")
            and f.suffix in [".py", ".ts", ".go", ".rs"]
        ]
        assert len(snippets) == 1, f"Expected 1 native snippet file in {slug}"

        # Validate meta.yaml deserializes to dict
        with open(meta_file, encoding="utf-8") as f:
            meta = yaml.safe_load(f)
        assert isinstance(meta, dict)
        assert meta["slug"] == slug
        assert "difficulty" in meta
        assert "category" in meta
        assert "language" in meta
        assert "expected_issues" in meta


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
