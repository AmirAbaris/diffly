"""Diffly challenge dataset and seeding utilities."""

from typing import Any

from backend.seed.challenges import CHALLENGES_DATA
from backend.seed.loader import compute_challenge_content_hash


__all__ = [
    "CHALLENGES_DATA",
    "compute_challenge_content_hash",
    "seed_challenges",
    "seed_challenges_if_empty",
    "seed_missing_challenges",
]


def __getattr__(name: str) -> Any:
    if name in (
        "seed_challenges",
        "seed_challenges_if_empty",
        "seed_missing_challenges",
    ):
        from backend.seed import seed_data

        return getattr(seed_data, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
