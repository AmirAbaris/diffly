"""Cross-stack language registry loaded from backend/models/languages.json."""

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Final


@dataclass(frozen=True, slots=True)
class LanguageSpec:
    """Immutable metadata for a supported or auxiliary code language."""

    id: str
    label: str
    runtime: str | None
    default_file_name: str
    prism_language: str
    extensions: tuple[str, ...]
    aliases: tuple[str, ...]
    challenge_supported: bool


def _parse_spec(entry: dict[str, Any], *, challenge_supported: bool) -> LanguageSpec:
    return LanguageSpec(
        id=str(entry["id"]).strip().lower(),
        label=str(entry["label"]).strip(),
        runtime=str(entry["runtime"]).strip() if entry.get("runtime") else None,
        default_file_name=str(entry["defaultFileName"]).strip(),
        prism_language=str(entry["prismLanguage"]).strip().lower(),
        extensions=tuple(str(ext).strip().lower() for ext in entry["extensions"]),
        aliases=tuple(str(alias).strip().lower() for alias in entry["aliases"]),
        challenge_supported=challenge_supported,
    )


def _load_manifest() -> tuple[tuple[LanguageSpec, ...], tuple[LanguageSpec, ...]]:
    """Load languages.json and validate IDs, extensions, and aliases are unique."""
    manifest_path = Path(__file__).with_name("languages.json")
    raw = json.loads(manifest_path.read_text(encoding="utf-8"))

    challenge_specs = tuple(
        _parse_spec(entry, challenge_supported=True)
        for entry in raw["challengeLanguages"]
    )
    auxiliary_specs = tuple(
        _parse_spec(entry, challenge_supported=False)
        for entry in raw["auxiliaryLanguages"]
    )
    all_specs = challenge_specs + auxiliary_specs

    seen_ids: set[str] = set()
    seen_extensions: set[str] = set()
    seen_aliases: set[str] = set()

    for spec in all_specs:
        if not spec.id:
            raise RuntimeError("languages.json contains an entry with an empty id")
        if spec.id in seen_ids:
            raise RuntimeError(f"Duplicate language id in languages.json: {spec.id!r}")
        if spec.id in seen_aliases:
            raise RuntimeError(
                f"Language id collides with an alias in languages.json: {spec.id!r}"
            )
        seen_ids.add(spec.id)

        for ext in spec.extensions:
            if ext in seen_extensions:
                raise RuntimeError(f"Duplicate extension in languages.json: {ext!r}")
            seen_extensions.add(ext)

        for alias in spec.aliases:
            if alias in seen_ids or alias in seen_aliases:
                raise RuntimeError(
                    f"Duplicate language alias in languages.json: {alias!r}"
                )
            seen_aliases.add(alias)

    return challenge_specs, all_specs


CHALLENGE_LANGUAGE_SPECS: Final[tuple[LanguageSpec, ...]]
ALL_LANGUAGE_SPECS: Final[tuple[LanguageSpec, ...]]
CHALLENGE_LANGUAGE_SPECS, ALL_LANGUAGE_SPECS = _load_manifest()

EXTENSION_LANGUAGE_MAP: Final[dict[str, str]] = {
    ext: spec.prism_language for spec in ALL_LANGUAGE_SPECS for ext in spec.extensions
}

LANGUAGE_ALIAS_MAP: Final[dict[str, str]] = {
    token: spec.id
    for spec in CHALLENGE_LANGUAGE_SPECS
    for token in (spec.id, *spec.aliases)
}

SUPPORTED_CHALLENGE_EXTENSIONS: Final[frozenset[str]] = frozenset(
    ext for spec in CHALLENGE_LANGUAGE_SPECS for ext in spec.extensions
)


def resolve_language_alias(raw: object) -> str | None:
    """Normalize a raw language token or alias to a canonical challenge language ID."""
    if not isinstance(raw, str):
        return None
    normalized = raw.strip().lower()
    if not normalized:
        return None
    if normalized in LANGUAGE_ALIAS_MAP:
        return LANGUAGE_ALIAS_MAP[normalized]
    if normalized.startswith("."):
        dotless = normalized[1:]
        if dotless in LANGUAGE_ALIAS_MAP:
            return LANGUAGE_ALIAS_MAP[dotless]
    return None


def assert_language_enum_parity(enum_values: set[str]) -> None:
    """Fail fast at import if Language(StrEnum) drifts from languages.json."""
    manifest_ids = {spec.id for spec in CHALLENGE_LANGUAGE_SPECS}
    if enum_values != manifest_ids:
        raise RuntimeError(
            "Language enum drift detected against languages.json: "
            f"enum={sorted(enum_values)}, manifest={sorted(manifest_ids)}"
        )
