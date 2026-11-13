"""Curated challenge dataset for Diffly code review challenges.

Loads challenge bundles dynamically from `content/challenges/`.
"""

from typing import Any

from backend.seed.loader import load_challenges_from_dir


CHALLENGES_DATA: list[dict[str, Any]] = load_challenges_from_dir()
