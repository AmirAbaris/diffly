"""Database seeding utility for Diffly challenges.

Provides idempotent seeding and upsert capability for curated code review challenges.
Can be executed as a CLI script via `python -m backend.seed.seed_data` or called
programmatically on application startup.
"""

import logging
from collections.abc import Generator
from contextlib import contextmanager

from sqlmodel import Session, select

from backend.core.db import engine, init_db
from backend.models.challenge import Challenge
from backend.seed.challenges import CHALLENGES_DATA


logger = logging.getLogger("diffly.seed")


@contextmanager
def get_managed_session(
    session: Session | None = None,
) -> Generator[Session, None, None]:
    """Provide a database session, reusing an existing one or opening a new one."""
    if session is not None:
        yield session
    else:
        with Session(engine) as new_session:
            yield new_session


def seed_challenges(session: Session | None = None) -> list[Challenge]:
    """Seed or update challenges idempotently (upsert by slug).

    If a challenge with the given slug already exists, its attributes are updated.
    Otherwise, a new challenge is created.
    """
    seeded_challenges: list[Challenge] = []

    with get_managed_session(session) as db:
        for challenge_dict in CHALLENGES_DATA:
            slug = challenge_dict["slug"]
            existing = db.exec(select(Challenge).where(Challenge.slug == slug)).first()

            # Create candidate challenge to validate fields & serialize JSON fields
            candidate = Challenge(**challenge_dict)

            if existing is not None:
                # Update existing record
                existing.title = candidate.title
                existing.difficulty = candidate.difficulty
                existing.category = candidate.category
                existing.language = candidate.language
                existing.description = candidate.description
                existing.threat_model = candidate.threat_model
                existing.defect_target = candidate.defect_target
                existing.code_snippet = candidate.code_snippet
                existing.expected_issues = candidate.expected_issues
                existing.hints = candidate.hints
                existing.canonical_review = candidate.canonical_review
                existing.recommended_fix_diff = candidate.recommended_fix_diff
                existing.estimated_minutes = candidate.estimated_minutes
                db.add(existing)
                seeded_challenges.append(existing)
                logger.info("Updated existing challenge: %s", slug)
            else:
                db.add(candidate)
                seeded_challenges.append(candidate)
                logger.info("Created new challenge: %s", slug)

        db.commit()
        for ch in seeded_challenges:
            db.refresh(ch)

    return seeded_challenges


def seed_challenges_if_empty(session: Session | None = None) -> list[Challenge]:
    """Seed challenges only if the challenges table currently contains no records."""
    try:
        with get_managed_session(session) as db:
            first_record = db.exec(select(Challenge)).first()
            if first_record is None:
                logger.info("Challenges table is empty. Running initial seeding...")
                return seed_challenges(db)
            logger.info("Challenges table already seeded. Skipping initial seed.")
            return list(db.exec(select(Challenge)).all())
    except Exception as exc:
        logger.warning(
            "Notice during seed_challenges_if_empty (concurrent worker): %s", exc
        )
        return []


def main() -> None:
    """CLI entry point for seeding challenges."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    init_db()
    results = seed_challenges()
    print(f"Successfully seeded {len(results)} challenges into the database:")
    for ch in results:
        print(f"  [{ch.id}] {ch.slug} ({ch.difficulty.value} - {ch.category.value})")


if __name__ == "__main__":
    main()
