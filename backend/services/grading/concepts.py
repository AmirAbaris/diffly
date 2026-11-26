"""Evidence binding and polarity-aware concept matching for v2 review grading."""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum
from functools import lru_cache
from typing import TYPE_CHECKING

from backend.models.challenge import DefectCriterion
from backend.services.grading.text.lexicon import (
    EQUIVALENT_CONCEPT_TOKENS,
    TERM_POLARITY,
    Polarity,
)
from backend.services.grading.text.normalize import (
    NormalizedText,
    Sentence,
    _lemmatize_token,
    normalize_phrase,
    normalize_text,
)


if TYPE_CHECKING:
    from backend.services.grading.review import Finding
    from backend.services.grading.scoring import GradingPolicy


# Keywords with syntax punctuation outside word separators (e.g. `text()`, `$tx`)
# skip bare token matching so syntax tokens do not falsely match plain English words.
_SYNTAX_PUNCT_RE = re.compile(r"[^A-Za-z0-9_\s-]")
_CONSEQUENCE_CONNECTORS = frozenset(
    _lemmatize_token(word)
    for word in (
        "for",
        "against",
        "allowing",
        "allow",
        "allows",
        "enabling",
        "enable",
        "enables",
        "causing",
        "cause",
        "causes",
        "exposing",
        "expose",
        "exposes",
        "leading",
        "lead",
        "leads",
        "resulting",
        "result",
        "results",
        "triggering",
        "trigger",
        "triggers",
    )
)


class EvidenceSource(StrEnum):
    """Provenance of text evidence evaluated against a defect's concepts."""

    INLINE = "inline"
    SUMMARY_BOUND = "summary_bound"
    SUMMARY_SHARED = "summary_shared"


@dataclass(frozen=True, slots=True)
class Evidence:
    """Span of normalized review sentences with provenance and concept weight."""

    sentences: tuple[Sentence, ...]
    source: EvidenceSource
    weight: float


@dataclass(frozen=True, slots=True)
class ConceptMatch:
    """Result of matching a defect's keywords across bound evidence."""

    matched: tuple[str, ...]
    missing: tuple[str, ...]
    denied: tuple[str, ...]
    sources: frozenset[EvidenceSource]
    score: float


@lru_cache(maxsize=1024)
def _compile_word_pattern(kw: str) -> re.Pattern[str]:
    return re.compile(rf"\b{re.escape(kw)}\b", re.IGNORECASE)


@lru_cache(maxsize=1024)
def _compile_compound_pattern(kw: str) -> re.Pattern[str]:
    return re.compile(rf"(?:\b|^){re.escape(kw)}(?:\b|$)", re.IGNORECASE)


def _raw_keyword_in_text(keyword: str, text: str) -> bool:
    kw = keyword.strip()
    if not kw or not text:
        return False
    if re.fullmatch(r"[\w]+", kw):
        return bool(_compile_word_pattern(kw).search(text))
    if _compile_compound_pattern(kw).search(text):
        return True
    return kw.lower() in text.lower()


def _mentions_finding_id(raw: str, finding_id: str) -> bool:
    if not finding_id:
        return False
    pattern = (
        rf"(?:(?<![A-Za-z0-9_-])#|\bfinding\s+){re.escape(finding_id)}"
        rf"(?![A-Za-z0-9_-])"
    )
    return bool(re.search(pattern, raw, re.IGNORECASE))


def _path_matches_target(ref_path: str, target_path: str) -> bool:
    target_lower = target_path.lower()
    if ref_path == target_lower:
        return True
    if "/" not in ref_path:
        return ref_path == target_lower.rsplit("/", 1)[-1]
    return False


def _matches_sentence_location(
    sent: Sentence,
    anchor_lines: frozenset[int],
    finding_file_path: str | None,
) -> bool:
    if not (sent.line_refs & anchor_lines):
        return False
    if finding_file_path is None or not sent.file_line_refs:
        return True
    if any(
        ln in anchor_lines and _path_matches_target(fp, finding_file_path)
        for fp, ln in sent.file_line_refs
    ):
        return True
    file_bound_lines = {ln for _, ln in sent.file_line_refs}
    bare_lines = sent.line_refs - file_bound_lines
    return bool(bare_lines & anchor_lines) and all(
        _path_matches_target(fp, finding_file_path) for fp, _ in sent.file_line_refs
    )


def bind_evidence(
    finding: Finding,
    summary: NormalizedText,
    anchor_lines: frozenset[int],
    policy: GradingPolicy,
    *,
    all_bodies_empty: bool | None = None,
    other_finding_ids: frozenset[str] = frozenset(),
) -> tuple[Evidence, ...]:
    """Bind a finding's body and relevant summary sentences into weighted evidence."""
    items: list[Evidence] = []
    body_stripped = finding.body.strip()
    if body_stripped:
        body_norm = normalize_text(body_stripped)
        if body_norm.sentences:
            items.append(
                Evidence(
                    sentences=body_norm.sentences,
                    source=EvidenceSource.INLINE,
                    weight=1.0,
                )
            )

    bound_sentences: list[Sentence] = []
    shared_sentences: list[Sentence] = []
    finding_file_path = finding.anchor.file_path

    for sent in summary.sentences:
        if sent.line_refs:
            if _matches_sentence_location(sent, anchor_lines, finding_file_path):
                bound_sentences.append(sent)
        elif _mentions_finding_id(sent.raw, finding.id):
            bound_sentences.append(sent)
        elif not any(
            _mentions_finding_id(sent.raw, other_id) for other_id in other_finding_ids
        ):
            shared_sentences.append(sent)

    if bound_sentences:
        items.append(
            Evidence(
                sentences=tuple(bound_sentences),
                source=EvidenceSource.SUMMARY_BOUND,
                weight=1.0,
            )
        )
    if shared_sentences:
        use_full_shared = (
            not body_stripped if all_bodies_empty is None else all_bodies_empty
        )
        shared_weight = 1.0 if use_full_shared else policy.shared_summary_weight
        items.append(
            Evidence(
                sentences=tuple(shared_sentences),
                source=EvidenceSource.SUMMARY_SHARED,
                weight=shared_weight,
            )
        )

    return tuple(items)


def _resolve_tokens_polarity(canon: tuple[str, ...]) -> Polarity:
    if not canon:
        return Polarity.HAZARD
    if canon in TERM_POLARITY:
        return TERM_POLARITY[canon]

    # When a multi-word keyword is not listed verbatim, compound hazards like
    # "authentication bypass" stay HAZARD while modified safeguards like
    # "input validation" inherit SAFEGUARD.
    saw_safeguard = False
    n = len(canon)
    for span_len in range(n, 0, -1):
        for start in range(n - span_len + 1):
            sub = canon[start : start + span_len]
            pol = TERM_POLARITY.get(sub)
            if pol == Polarity.HAZARD:
                return Polarity.HAZARD
            if pol == Polarity.SAFEGUARD:
                saw_safeguard = True
    return Polarity.SAFEGUARD if saw_safeguard else Polarity.HAZARD


def _resolve_polarity(keyword: str, defect: DefectCriterion) -> tuple[Polarity, bool]:
    overrides = getattr(defect, "keyword_polarity", None) or {}
    if overrides:
        if keyword in overrides:
            return Polarity(overrides[keyword]), True
        kw_lower = keyword.strip().lower()
        for ov_key, ov_val in overrides.items():
            if ov_key.strip().lower() == kw_lower:
                return Polarity(ov_val), True

    return _resolve_tokens_polarity(normalize_phrase(keyword)), False


def _tokens_equivalent(sent_tok: str, kw_tok: str) -> bool:
    if sent_tok == kw_tok:
        return True
    return kw_tok in EQUIVALENT_CONCEPT_TOKENS.get(sent_tok, ())


def _is_safeguard_consequence(sent: Sentence, match_start: int) -> bool:
    """Return True when a denied span named a safeguard before a causal connector."""
    tokens = sent.tokens
    if match_start <= 1 or not tokens[match_start].denied:
        return False

    cue_floor = match_start
    while cue_floor > 0 and tokens[cue_floor - 1].denied:
        cue_floor -= 1

    has_connector = False
    for j in range(match_start - 1, cue_floor - 1, -1):
        if tokens[j].canon in _CONSEQUENCE_CONNECTORS:
            has_connector = True
            connector_idx = j
            break
    if not has_connector:
        return False

    for a in range(cue_floor, connector_idx):
        for b in range(a + 1, connector_idx + 1):
            sub = tuple(tokens[k].canon for k in range(a, b))
            if TERM_POLARITY.get(sub) == Polarity.SAFEGUARD:
                return True
    return False


def _mask_denied_raw(sent: Sentence, *, mask_denied: bool, mask_dismissed: bool) -> str:
    if not sent.tokens or (not mask_denied and not mask_dismissed):
        return sent.raw
    chars = list(sent.raw)
    raw_len = len(chars)
    base = sent.offset
    for idx, tok in enumerate(sent.tokens):
        should_mask = (mask_dismissed and tok.dismissed) or (
            mask_denied and tok.denied and not _is_safeguard_consequence(sent, idx)
        )
        if not should_mask:
            continue
        rel_start = max(0, tok.start - base)
        rel_end = min(raw_len, tok.end - base)
        for pos in range(rel_start, rel_end):
            chars[pos] = " "
    return "".join(chars)


def _match_keyword_in_sentence(
    kw: str,
    canon_phrase: tuple[str, ...],
    use_canon: bool,
    polarity: Polarity,
    has_override: bool,
    sent: Sentence,
) -> tuple[bool, bool]:
    """Return (is_valid_hit, is_denied_or_dismissed_hit) for a single sentence."""
    valid = False
    denied_hit = False

    if use_canon and len(sent.tokens) >= len(canon_phrase):
        phrase_len = len(canon_phrase)
        for idx in range(len(sent.tokens) - phrase_len + 1):
            span = sent.tokens[idx : idx + phrase_len]
            if not all(
                _tokens_equivalent(t.canon, kw_tok)
                for t, kw_tok in zip(span, canon_phrase, strict=True)
            ):
                continue
            effective_polarity = (
                polarity
                if has_override
                else _resolve_tokens_polarity(tuple(t.canon for t in span))
            )
            occ_dismissed = any(t.dismissed for t in span)
            occ_denied = any(t.denied for t in span) and not _is_safeguard_consequence(
                sent, idx
            )
            if occ_dismissed or (effective_polarity == Polarity.HAZARD and occ_denied):
                denied_hit = True
            else:
                valid = True
                break

    if not valid:
        masked_raw = _mask_denied_raw(
            sent,
            mask_denied=(polarity == Polarity.HAZARD),
            mask_dismissed=True,
        )
        if _raw_keyword_in_text(kw, masked_raw):
            valid = True
        elif _raw_keyword_in_text(kw, sent.raw):
            denied_hit = True

    return valid, denied_hit


def match_concepts(
    defect: DefectCriterion,
    evidence: Sequence[Evidence],
    *,
    has_lines: bool,
    target: int,
) -> ConceptMatch:
    """Match defect keywords against weighted evidence with polarity-aware negation."""
    if not defect.keywords:
        non_empty_ev = [
            ev for ev in evidence if any(s.raw.strip() for s in ev.sentences)
        ]
        if has_lines and non_empty_ev:
            best_w = min(1.0, max(ev.weight for ev in non_empty_ev))
            sources = frozenset(ev.source for ev in non_empty_ev)
            return ConceptMatch(
                matched=(),
                missing=(),
                denied=(),
                sources=sources,
                score=best_w,
            )
        return ConceptMatch(
            matched=(),
            missing=(),
            denied=(),
            sources=frozenset(),
            score=0.0,
        )

    matched: list[str] = []
    missing: list[str] = []
    denied: list[str] = []
    matched_weights: list[float] = []
    contributing_sources: set[EvidenceSource] = set()

    for kw in defect.keywords:
        canon_phrase = normalize_phrase(kw)
        use_canon = bool(canon_phrase) and not _SYNTAX_PUNCT_RE.search(kw)
        polarity, has_override = _resolve_polarity(kw, defect)

        best_weight = 0.0
        best_sources: list[EvidenceSource] = []
        saw_denied = False

        for ev in evidence:
            ev_valid = False
            for sent in ev.sentences:
                valid, denied_hit = _match_keyword_in_sentence(
                    kw, canon_phrase, use_canon, polarity, has_override, sent
                )
                if valid:
                    ev_valid = True
                    break
                if denied_hit:
                    saw_denied = True
            if ev_valid and ev.weight > 0.0:
                if ev.weight > best_weight:
                    best_weight = ev.weight
                    best_sources = [ev.source]
                elif ev.weight == best_weight:
                    best_sources.append(ev.source)

        if best_weight > 0.0:
            matched.append(kw)
            matched_weights.append(best_weight)
            contributing_sources.update(best_sources)
        else:
            missing.append(kw)
            if saw_denied:
                denied.append(kw)

    required_target = min(target, len(defect.keywords))
    if required_target <= 0:
        score = 1.0
    else:
        top_weights = sorted(matched_weights, reverse=True)[:required_target]
        score = min(1.0, sum(top_weights) / required_target)

    return ConceptMatch(
        matched=tuple(matched),
        missing=tuple(missing),
        denied=tuple(denied),
        sources=frozenset(contributing_sources),
        score=score,
    )


def is_keyword_matched(keyword: str, text: str) -> bool:
    """Return whether keyword appears non-denied in text (with synonyms)."""
    if not keyword or not text or not keyword.strip():
        return False
    norm = normalize_text(text)
    if not norm.sentences:
        return False
    defect = DefectCriterion.model_construct(keywords=[keyword], keyword_polarity={})
    evidence = (
        Evidence(sentences=norm.sentences, source=EvidenceSource.INLINE, weight=1.0),
    )
    result = match_concepts(defect, evidence, has_lines=False, target=1)
    return bool(result.matched)
