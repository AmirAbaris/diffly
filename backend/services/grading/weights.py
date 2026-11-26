"""Severity definitions and defect weight normalization."""

from collections.abc import Mapping, Sequence
from types import MappingProxyType
from typing import Any, Final

from backend.models.challenge import Severity as Severity
from backend.models.challenge import coerce_severity as coerce_severity


SEVERITY_WEIGHTS: Final[Mapping[Severity, float]] = MappingProxyType(
    {
        "critical": 4.0,
        "high": 3.0,
        "medium": 2.0,
        "low": 1.0,
    }
)

_DEFAULT_WEIGHT = 2.0


def defect_weights(
    defects: Sequence[Any],
    severity_weights: Mapping[str, float] | None = None,
) -> tuple[float, ...]:
    """Return normalized defect weights summing to 1.0, or () when empty."""
    if not defects:
        return ()

    table: Mapping[Any, float] = (
        SEVERITY_WEIGHTS if severity_weights is None else severity_weights
    )
    raw_weights: list[float] = []
    for defect in defects:
        raw_sev = (
            defect.get("severity")
            if isinstance(defect, Mapping)
            else getattr(defect, "severity", None)
        )
        raw_key = raw_sev.strip().lower() if isinstance(raw_sev, str) else ""
        if raw_key and raw_key in table:
            weight = float(table[raw_key])
        else:
            weight = float(table.get(coerce_severity(raw_sev), _DEFAULT_WEIGHT))
        raw_weights.append(max(0.0, weight))

    total = sum(raw_weights)
    if total <= 0.0:
        uniform = 1.0 / len(defects)
        return tuple(uniform for _ in defects)
    return tuple(weight / total for weight in raw_weights)


__all__ = [
    "SEVERITY_WEIGHTS",
    "Severity",
    "coerce_severity",
    "defect_weights",
]
