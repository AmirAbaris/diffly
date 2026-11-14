import json
from datetime import UTC, datetime

import pytest
from pydantic import ValidationError
from sqlmodel import Session, SQLModel, create_engine, select

from backend.models import (
    Category,
    Challenge,
    DefectCriterion,
    Difficulty,
    HintItem,
    Language,
    Submission,
    User,
    UserCreate,
    UserRead,
)


def test_user_model_instantiation():
    user = User(
        email="developer@diffly.dev",
        username="devreviewer",
        hashed_password="secure_password_hash",
        avatar_url="https://diffly.dev/avatar.png",
    )
    assert user.email == "developer@diffly.dev"
    assert user.username == "devreviewer"
    assert user.is_active is True
    assert user.avatar_url == "https://diffly.dev/avatar.png"
    assert isinstance(user.created_at, datetime)
    assert user.created_at.tzinfo == UTC
    assert isinstance(user.updated_at, datetime)
    assert user.updated_at.tzinfo == UTC


def test_user_read_and_create_schemas():
    user_create = UserCreate(
        email="newuser@diffly.dev",
        username="newuser",
        password="secretpassword",
        session_id="guest-1",
    )
    assert user_create.email == "newuser@diffly.dev"
    assert user_create.username == "newuser"
    assert user_create.session_id == "guest-1"

    now = datetime.now(UTC)
    user_read = UserRead(
        id=1,
        email="newuser@diffly.dev",
        username="newuser",
        avatar_url=None,
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    assert user_read.id == 1
    assert not hasattr(user_read, "hashed_password")


def test_challenge_model_instantiation_and_helpers():
    defect = DefectCriterion(
        id="crit-1",
        title="Unbounded loop execution",
        severity="critical",
        lines=[10, 11],
        keywords=["while", "loop"],
        explanation="The agent loops infinitely if no stop token is encountered.",
    )
    hint1 = HintItem(
        tier=1,
        hint="Look closely at the loop invariant.",
        title="Loop check",
    )
    hint2 = HintItem(tier=2, hint="Notice the break condition is unreachable.")
    hint3 = HintItem(tier=3, hint="Add a max_iterations guardrail.")

    challenge = Challenge(
        slug="unbounded-agent-loop",
        title="Unbounded Agent Loop",
        difficulty=Difficulty.MEDIUM,
        category=Category.AGENT_ANTIPATHS,
        language=Language.PYTHON,
        description="Fix the agent while loop vulnerability.",
        threat_model="Malicious input can freeze worker threads indefinitely.",
        defect_target="Find 1 Critical Vulnerability in tool execution",
        code_snippet="while True:\n    agent.run()\n",
        expected_issues=[defect],
        hints=[hint1, hint2, hint3],
        canonical_review=(
            "The reviewer should note the missing termination guardrail."
        ),
        recommended_fix_diff=(
            "@@ -1,2 +1,3 @@\n+for _ in range(MAX_STEPS):\n"
            "-while True:\n     agent.run()"
        ),
        estimated_minutes=8,
    )

    assert challenge.slug == "unbounded-agent-loop"
    assert challenge.difficulty == Difficulty.MEDIUM
    assert challenge.category == Category.AGENT_ANTIPATHS
    assert challenge.language == Language.PYTHON
    assert challenge.estimated_minutes == 8
    assert (
        challenge.threat_model
        == "Malicious input can freeze worker threads indefinitely."
    )
    assert challenge.defect_target == "Find 1 Critical Vulnerability in tool execution"

    # Verify JSON deserialization helpers
    parsed_issues = challenge.get_expected_issues()
    assert len(parsed_issues) == 1
    assert parsed_issues[0].id == "crit-1"
    assert parsed_issues[0].lines == [10, 11]

    parsed_hints = challenge.get_hints()
    assert len(parsed_hints) == 3
    assert parsed_hints[0].tier == 1
    assert parsed_hints[0].title == "Loop check"
    assert parsed_hints[2].hint == "Add a max_iterations guardrail."


def test_challenge_enums_case_insensitivity():
    # StrEnum flexible resolution
    assert Difficulty("medium") == Difficulty.MEDIUM
    assert Difficulty("Easy") == Difficulty.EASY
    assert Difficulty("hard") == Difficulty.HARD
    assert Category("agent-antipaths") == Category.AGENT_ANTIPATHS
    assert Category("security") == Category.SECURITY
    assert Language("python") == Language.PYTHON
    assert Language("TYPESCRIPT") == Language.TYPESCRIPT


def test_submission_model_and_validation():
    sub = Submission(
        challenge_id=1,
        user_id=1,
        flagged_lines=[10, 11],
        comments="Critical unbounded execution loop found.",
        score=95,
        feedback="Excellent observation of worker thread freezing.",
        detected_issues=["Unbounded loop execution"],
        missed_issues=[],
    )
    assert sub.get_flagged_lines() == [10, 11]
    assert sub.score == 95
    assert sub.get_detected_issues() == ["Unbounded loop execution"]
    assert sub.get_missed_issues() == []

    # Score boundary validation
    with pytest.raises(ValidationError):
        Submission(challenge_id=1, score=105)

    with pytest.raises(ValidationError):
        Submission(challenge_id=1, score=-5)


def test_models_database_persistence_and_relationships():
    engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        # Create user
        user = User(
            email="engineer@diffly.dev",
            username="engpro",
            hashed_password="hashed_pw_test",
        )
        session.add(user)
        session.commit()
        session.refresh(user)

        # Create challenge owned by user
        challenge = Challenge(
            slug="concurrency-race-condition",
            title="Shared State Race Condition",
            difficulty=Difficulty.HARD,
            category=Category.CONCURRENCY,
            language=Language.PYTHON,
            description="Identify data race on shared dict.",
            threat_model="Concurrent requests mutate dict without lock.",
            defect_target="Identify race condition leading to data corruption",
            code_snippet="cache[key] = value",
            user_id=user.id,
            expected_issues=json.dumps(
                [
                    {
                        "id": "c1",
                        "title": "Unsynchronized dict access",
                        "severity": "high",
                        "lines": [1],
                        "keywords": ["dict", "lock"],
                        "explanation": (
                            "Dict mutations across asyncio tasks require locking."
                        ),
                    }
                ]
            ),
            hints=json.dumps([{"tier": 1, "hint": "Consider concurrent coroutines."}]),
        )
        session.add(challenge)
        session.commit()
        session.refresh(challenge)

        # Create authenticated user submission
        auth_submission = Submission(
            challenge_id=challenge.id,
            user_id=user.id,
            flagged_lines=[1],
            comments="Needs asyncio.Lock around cache writes.",
            score=100,
            feedback="Spot on! Cache writes need mutex lock.",
            detected_issues=["Unsynchronized dict access"],
            missed_issues=[],
        )
        session.add(auth_submission)

        # Create guest submission
        guest_submission = Submission(
            challenge_id=challenge.id,
            user_id=None,
            session_id="anon-guest-session-42",
            flagged_lines=[1],
            comments="Looks like a race condition.",
            score=80,
            feedback="Good catch.",
        )
        session.add(guest_submission)
        session.commit()

        # Reload user and check relationships
        reloaded_user = session.exec(select(User).where(User.id == user.id)).one()
        assert len(reloaded_user.submissions) == 1
        assert reloaded_user.submissions[0].id == auth_submission.id
        assert reloaded_user.submissions[0].user is reloaded_user
        assert len(reloaded_user.challenges) == 1
        assert reloaded_user.challenges[0].id == challenge.id
        assert reloaded_user.challenges[0].user is reloaded_user

        # Reload challenge and check relationship
        reloaded_challenge = session.exec(
            select(Challenge).where(Challenge.id == challenge.id)
        ).one()
        assert len(reloaded_challenge.submissions) == 2
        assert {s.id for s in reloaded_challenge.submissions} == {
            auth_submission.id,
            guest_submission.id,
        }

        # Check guest submission attributes
        session.refresh(guest_submission)
        assert guest_submission.user_id is None
        assert guest_submission.session_id == "anon-guest-session-42"
        assert guest_submission.challenge.id == challenge.id
