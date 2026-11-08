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
