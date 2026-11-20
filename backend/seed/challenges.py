"""Curated challenge dataset for Diffly code review challenges.

Loads challenge bundles on demand from `content/challenges/`.
"""

from typing import Any

from backend.seed.loader import load_challenges_from_dir


def get_challenges_data() -> list[dict[str, Any]]:
    """Load curated challenge bundles from disk on demand."""
    return load_challenges_from_dir()


def __getattr__(name: str) -> Any:
    if name == "CHALLENGES_DATA":
        return get_challenges_data()
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
