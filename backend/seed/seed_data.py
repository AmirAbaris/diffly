"""Database seeding utility for Diffly challenges.

Provides idempotent seeding and content-hash upsert capability for curated code
review challenges loaded dynamically from `content/challenges/` bundles.
Can be executed as a CLI script via `python -m backend.seed.seed_data` or called
programmatically on application startup.
"""

import logging
from collections.abc import Generator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from backend.core.db import engine, init_db
from backend.models.challenge import Challenge
from backend.seed.loader import (
    compute_challenge_content_hash,
    load_challenges_from_dir,
)


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


def _build_candidate(challenge_dict: dict[str, Any]) -> tuple[Challenge, str]:
    payload = dict(challenge_dict)
    bundle_hash = payload.get("content_hash") or compute_challenge_content_hash(payload)
    payload["content_hash"] = bundle_hash
    return Challenge(**payload), bundle_hash


def _apply_challenge_fields(target: Challenge, source: Challenge) -> None:
    """Copy curated challenge attributes from candidate source onto target row."""
    target.title = source.title
    target.difficulty = source.difficulty
    target.category = source.category
    target.language = source.language
    target.description = source.description
    target.threat_model = source.threat_model
    target.defect_target = source.defect_target
    target.code_snippet = source.code_snippet
    target.files = source.files
    target.expected_issues = source.expected_issues
    target.hints = source.hints
    target.canonical_review = source.canonical_review
    target.recommended_fix_diff = source.recommended_fix_diff
    target.estimated_minutes = source.estimated_minutes
    target.content_hash = source.content_hash
    target.is_public = True


def _disambiguate_private_collision(
    db: Session, existing: Challenge, slug: str
) -> None:
    existing.slug = f"{slug}-custom-{existing.id or '1'}"
    db.add(existing)
    db.flush()


def seed_challenges(
    session: Session | None = None,
    content_dir: Path | str | None = None,
) -> list[Challenge]:
    """Seed or update challenges idempotently (upsert by slug).

    Traverses content/challenges/ bundles dynamically.
    If a challenge with the given slug already exists, its attributes are updated.
    Otherwise, a new challenge is created.
    """
    challenges_data = load_challenges_from_dir(content_dir)
    seeded_challenges: list[Challenge] = []

    with get_managed_session(session) as db:
        for challenge_dict in challenges_data:
            slug = challenge_dict["slug"]
            existing = db.exec(select(Challenge).where(Challenge.slug == slug)).first()
            candidate, _ = _build_candidate(challenge_dict)

            if existing is not None and not existing.is_public:
                # Preserve user's private custom challenge under a disambiguated slug
                _disambiguate_private_collision(db, existing, slug)
                existing = None

            if existing is not None:
                _apply_challenge_fields(existing, candidate)
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


def seed_challenges_if_empty(
    session: Session | None = None,
    content_dir: Path | str | None = None,
) -> list[Challenge]:
    """Seed challenges only if the challenges table contains no public records."""
    with get_managed_session(session) as db:
        first_record = db.exec(
            select(Challenge).where(Challenge.is_public.is_(True))
        ).first()
        if first_record is None:
            logger.info("Challenges table is empty. Running initial seeding...")
            return seed_challenges(db, content_dir=content_dir)
        logger.info("Challenges table already seeded. Skipping initial seed.")
        return list(
            db.exec(select(Challenge).where(Challenge.is_public.is_(True))).all()
        )


def seed_missing_challenges(
    session: Session | None = None,
    content_dir: Path | str | None = None,
) -> list[Challenge]:
    """Sync curated bundles: insert missing slugs and upsert changed hashes."""
    challenges_data = load_challenges_from_dir(content_dir)

    with get_managed_session(session) as db:
        existing_public = {
            ch.slug: ch
            for ch in db.exec(
                select(Challenge).where(Challenge.is_public.is_(True))
            ).all()
        }

        bundles_to_sync: list[tuple[dict[str, Any], str]] = []
        for challenge_dict in challenges_data:
            bundle_hash = challenge_dict.get(
                "content_hash"
            ) or compute_challenge_content_hash(challenge_dict)
            existing_pub = existing_public.get(challenge_dict["slug"])
            if existing_pub is None or existing_pub.content_hash != bundle_hash:
                bundles_to_sync.append((challenge_dict, bundle_hash))

        if not bundles_to_sync:
            logger.info("All curated challenge bundles are up to date.")
            return list(existing_public.values())

        for challenge_dict, bundle_hash in bundles_to_sync:
            slug = challenge_dict["slug"]
            payload = dict(challenge_dict)
            payload["content_hash"] = bundle_hash
            candidate = Challenge(**payload)

            existing = db.exec(select(Challenge).where(Challenge.slug == slug)).first()

            if existing is not None and not existing.is_public:
                _disambiguate_private_collision(db, existing, slug)
                existing = None

            if existing is not None:
                _apply_challenge_fields(existing, candidate)
                db.add(existing)
                logger.info("Updated changed curated challenge: %s", slug)
                continue

            try:
                with db.begin_nested():
                    db.add(candidate)
                    db.flush()
                logger.info("Seeded missing curated challenge: %s", slug)
            except IntegrityError:
                logger.info(
                    "Challenge %s inserted concurrently; skipping",
                    slug,
                )

        db.commit()
        return list(
            db.exec(select(Challenge).where(Challenge.is_public.is_(True))).all()
        )


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
