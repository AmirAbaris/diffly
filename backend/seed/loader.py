"""Dynamic Challenge Loader for Content-as-Code architecture.

Traverses `content/challenges/<slug>/` bundles containing:
  - meta.yaml: Challenge metadata, schema, hints, solutions, expected defects
  - description.md: Rich problem description & threat model
  - snippet.<ext>: Native clean code snippet (.py, .ts, .go, .rs, .java, etc.)
"""

import hashlib
import json
import logging
import re
from collections.abc import Mapping
from enum import StrEnum
from pathlib import Path
from typing import Any

import yaml

from backend.models.challenge import Category, ChallengeFile, Difficulty, Language


logger = logging.getLogger("diffly.loader")

DEFAULT_CONTENT_DIR = (
    Path(__file__).resolve().parent.parent.parent / "content" / "challenges"
)


def _normalize_hash_value(value: Any) -> Any:
    if isinstance(value, StrEnum):
        return value.value
    if isinstance(value, dict):
        return {str(k): _normalize_hash_value(v) for k, v in sorted(value.items())}
    if isinstance(value, list):
        return [_normalize_hash_value(item) for item in value]
    return value


def _normalize_json_list_field(value: Any) -> Any:
    if isinstance(value, str):
        try:
            return _normalize_hash_value(json.loads(value or "[]"))
        except json.JSONDecodeError:
            return value
    return _normalize_hash_value(value if value is not None else [])


def compute_challenge_content_hash(challenge_data: Mapping[str, Any]) -> str:
    """Compute a deterministic SHA-256 hex digest for a curated challenge bundle."""
    payload = {
        "slug": challenge_data.get("slug", ""),
        "title": challenge_data.get("title", ""),
        "difficulty": _normalize_hash_value(challenge_data.get("difficulty", "")),
        "category": _normalize_hash_value(challenge_data.get("category", "")),
        "language": _normalize_hash_value(challenge_data.get("language", "")),
        "description": challenge_data.get("description", ""),
        "threat_model": challenge_data.get("threat_model", ""),
        "defect_target": challenge_data.get("defect_target", ""),
        "code_snippet": challenge_data.get("code_snippet", ""),
        "files": _normalize_json_list_field(challenge_data.get("files", [])),
        "expected_issues": _normalize_json_list_field(
            challenge_data.get("expected_issues", [])
        ),
        "hints": _normalize_json_list_field(challenge_data.get("hints", [])),
        "canonical_review": challenge_data.get("canonical_review", ""),
        "recommended_fix_diff": challenge_data.get("recommended_fix_diff", ""),
        "estimated_minutes": challenge_data.get("estimated_minutes", 5),
    }
    serialized = json.dumps(
        payload, sort_keys=True, ensure_ascii=False, separators=(",", ":")
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


class CleanYamlDumper(yaml.SafeDumper):
    """Custom YAML Dumper to format multiline strings cleanly with | style."""

    pass


def _multiline_str_representer(dumper: yaml.SafeDumper, data: str) -> yaml.Node:
    if "\n" in data:
        return dumper.represent_scalar("tag:yaml.org,2002:str", data, style="|")
    return dumper.represent_scalar("tag:yaml.org,2002:str", data)


CleanYamlDumper.add_representer(str, _multiline_str_representer)


def parse_description_md(content: str) -> tuple[str, str]:
    """Parse description.md content into (description, threat_model).

    Separates the Markdown into problem statement context and threat model
    based on section headings.
    """
    if not content:
        return "", ""

    # Locate Threat Model section
    threat_match = re.search(r"(?im)^#{1,3}\s*threat\s*model\b.*$", content)
    if threat_match:
        threat_start = threat_match.end()
        next_heading = re.search(r"(?im)^#{1,3}\s+", content[threat_start:])
        if next_heading:
            threat_model = content[
                threat_start : threat_start + next_heading.start()
            ].strip()
        else:
            threat_model = content[threat_start:].strip()
        before_threat = content[: threat_match.start()].strip()
    else:
        threat_model = ""
        before_threat = content.strip()

    # In before_threat, check for Description or Problem Statement heading
    desc_match = re.search(
        r"(?im)^#{1,3}\s*(?:description|problem\s*statement|context)\b.*$",
        before_threat,
    )
    if desc_match:
        desc_start = desc_match.end()
        next_sec = re.search(r"(?im)^#{1,3}\s+", before_threat[desc_start:])
        if next_sec:
            description = before_threat[
                desc_start : desc_start + next_sec.start()
            ].strip()
        else:
            description = before_threat[desc_start:].strip()
    else:
        # Strip top-level title `# <Title>` if present
        cleaned = re.sub(r"(?im)^#\s+[^\n]+\n*", "", before_threat).strip()
        description = cleaned if cleaned else before_threat

    return description, threat_model


def _resolve_bundle_subpath(bundle_dir: Path, relative_path: str) -> Path:
    bundle_root = bundle_dir.resolve()
    candidate = (bundle_dir / relative_path).resolve()
    if not candidate.is_relative_to(bundle_root):
        raise ValueError(
            f"Challenge file path escapes bundle directory: {relative_path}"
        )
    return candidate


def _load_bundle_files(path: Path, raw_files: Any) -> list[dict[str, Any]]:
    if raw_files is None:
        return []
    if not isinstance(raw_files, list):
        raise ValueError(f"files in {path} must be a list")

    normalized_files: list[dict[str, Any]] = []
    for entry in raw_files:
        if not isinstance(entry, dict):
            raise ValueError(f"Each entry in files in {path} must be a mapping")
        item = dict(entry)
        if item.get("patch") is None and isinstance(item.get("patch_file"), str):
            patch_path = _resolve_bundle_subpath(path, item["patch_file"])
            if not patch_path.is_file():
                raise FileNotFoundError(f"Missing patch_file: {patch_path}")
            item["patch"] = patch_path.read_text(encoding="utf-8")
        if item.get("content") is None and isinstance(item.get("content_file"), str):
            content_path = _resolve_bundle_subpath(path, item["content_file"])
            if not content_path.is_file():
                raise FileNotFoundError(f"Missing content_file: {content_path}")
            item["content"] = content_path.read_text(encoding="utf-8")
        if (
            item.get("patch") is None
            and item.get("content") is None
            and isinstance(item.get("path"), str)
        ):
            files_root = path / "files"
            if files_root.is_dir():
                disk_candidate = _resolve_bundle_subpath(
                    files_root, item["path"].lstrip("/")
                )
                if disk_candidate.is_file():
                    item["content"] = disk_candidate.read_text(encoding="utf-8")

        item.pop("patch_file", None)
        item.pop("content_file", None)
        validated = ChallengeFile.model_validate(item)
        normalized_files.append(validated.model_dump())

    return normalized_files


def load_challenge_bundle(challenge_dir: Path | str) -> dict[str, Any]:
    """Load a single challenge bundle from a directory.

    Reads meta.yaml, description.md, and either snippet.<ext> or files entries.
    """
    path = Path(challenge_dir)
    if not path.is_dir():
        raise NotADirectoryError(f"Challenge bundle path is not a directory: {path}")

    meta_file = path / "meta.yaml"
    if not meta_file.is_file():
        meta_file = path / "meta.yml"
        if not meta_file.is_file():
            raise FileNotFoundError(f"Missing meta.yaml in {path}")

    with open(meta_file, encoding="utf-8") as f:
        meta: dict[str, Any] = yaml.safe_load(f) or {}

    if not isinstance(meta, dict):
        raise ValueError(f"meta.yaml in {path} must contain a mapping")

    # If slug is not in meta.yaml, default to the folder name
    meta.setdefault("slug", path.name)

    # 1. Parse description.md
    desc_file = path / "description.md"
    if desc_file.is_file():
        desc_text = desc_file.read_text(encoding="utf-8")
        parsed_desc, parsed_threat = parse_description_md(desc_text)
        if parsed_desc:
            meta["description"] = parsed_desc
        if parsed_threat:
            meta["threat_model"] = parsed_threat

    # 2. Read native code snippet and/or multi-file PR entries
    if not meta.get("code_snippet"):
        snippet_candidates = [
            f
            for f in path.iterdir()
            if f.is_file()
            and f.name.startswith("snippet.")
            and f.suffix.lower() not in {".yaml", ".yml", ".md", ".json", ".diff"}
        ]
        if snippet_candidates:
            # Sort for deterministic choice if multiple
            snippet_candidates.sort(key=lambda p: p.name)
            meta["code_snippet"] = snippet_candidates[0].read_text(encoding="utf-8")

    meta["files"] = _load_bundle_files(path, meta.get("files"))
    if not meta.get("language") and meta["files"]:
        meta["language"] = meta["files"][0]["language"]

    # 3. Read canonical_review if stored as a file
    if not meta.get("canonical_review"):
        for rev_name in ("canonical_review.md", "solution.md", "review.md"):
            rev_file = path / rev_name
            if rev_file.is_file():
                meta["canonical_review"] = rev_file.read_text(encoding="utf-8").strip()
                break

    # 4. Read recommended_fix_diff if stored as a file
    if not meta.get("recommended_fix_diff"):
        for diff_name in ("fix.diff", "diff.patch", "recommended_fix.diff"):
            diff_file = path / diff_name
            if diff_file.is_file():
                meta["recommended_fix_diff"] = diff_file.read_text(
                    encoding="utf-8"
                ).strip()
                break

    # 5. Normalize Enum types
    if "difficulty" in meta and not isinstance(meta["difficulty"], Difficulty):
        meta["difficulty"] = Difficulty(meta["difficulty"])
    if "category" in meta and not isinstance(meta["category"], Category):
        meta["category"] = Category(meta["category"])
    if "language" in meta and not isinstance(meta["language"], Language):
        meta["language"] = Language(meta["language"])

    # 6. Normalize expected_issues lines / matched_lines & keywords / matched_keywords
    normalized_issues: list[dict[str, Any]] = []
    for issue in meta.get("expected_issues", []):
        issue_dict = dict(issue)
        if "matched_lines" in issue_dict and "lines" not in issue_dict:
            issue_dict["lines"] = issue_dict["matched_lines"]
        elif "lines" in issue_dict and "matched_lines" not in issue_dict:
            issue_dict["matched_lines"] = issue_dict["lines"]

        if "matched_keywords" in issue_dict and "keywords" not in issue_dict:
            issue_dict["keywords"] = issue_dict["matched_keywords"]
        elif "keywords" in issue_dict and "matched_keywords" not in issue_dict:
            issue_dict["matched_keywords"] = issue_dict["keywords"]

        normalized_issues.append(issue_dict)
    meta["expected_issues"] = normalized_issues

    # 7. Default missing fields expected by SQLModel Challenge
    meta.setdefault("threat_model", "")
    meta.setdefault("defect_target", "")
    meta.setdefault("code_snippet", "")
    meta.setdefault("canonical_review", "")
    meta.setdefault("recommended_fix_diff", "")
    meta.setdefault("hints", [])
    meta.setdefault("estimated_minutes", 5)
    meta["content_hash"] = compute_challenge_content_hash(meta)

    return meta


def load_challenges_from_dir(
    content_dir: Path | str | None = None,
) -> list[dict[str, Any]]:
    """Traverse content_dir and load all challenge bundles.

    Sorts challenges deterministically by (order, slug).
    """
    root_path = Path(content_dir) if content_dir is not None else DEFAULT_CONTENT_DIR
    if not root_path.is_dir():
        logger.warning("Challenges directory not found: %s", root_path)
        return []

    challenges: list[dict[str, Any]] = []

    for item in sorted(root_path.iterdir()):
        if not item.is_dir():
            continue
        # Verify it has meta.yaml or meta.yml
        if not ((item / "meta.yaml").is_file() or (item / "meta.yml").is_file()):
            continue

        try:
            bundle = load_challenge_bundle(item)
            challenges.append(bundle)
        except Exception as exc:
            logger.error("Failed to load challenge bundle from %s: %s", item, exc)
            raise

    # Sort challenges by order (if defined) then slug
    challenges.sort(key=lambda ch: (ch.get("order", 999), ch.get("slug", "")))
    return challenges
