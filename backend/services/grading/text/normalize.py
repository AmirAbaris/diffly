"""Text normalization, clause splitting, line-ref extraction, and denial scoping."""

import re
from dataclasses import dataclass, field
from functools import lru_cache

from backend.services.grading.text.lexicon import (
    CONTRASTIVE_PIVOTS,
    DENIAL_CUES,
    DISMISSAL_CUES,
    LEMMA_EXCEPTIONS,
    PHRASE_REWRITES,
)


_NEGATION_SCOPE_TOKENS = 6
_MAX_LINE_RANGE_SPAN = 200

# Period only splits when not followed by a word char so `app.py:12` stays intact.
_SENTENCE_SPLIT_RE = re.compile(r"[!?;\n]+|\.(?!\w)")
_COMMA_SPLIT_RE = re.compile(r",+")
_TOKEN_RE = re.compile(r"[A-Za-z0-9'\u2019]+")

_LINE_WORD_RE = re.compile(
    r"\blines?\s*#?(\d+)(?:\s*[-–—]\s*#?(\d+)|(?:\s+(?:and|&)\s+#?(\d+)))?\b",
    re.IGNORECASE,
)
_LINE_SHORT_RE = re.compile(r"(?<![A-Za-z0-9_])L(\d+)(?:\s*[-–—]\s*L?(\d+))?\b")
_FILE_LINE_RE = re.compile(
    r"(?:[A-Za-z0-9_.-]+/)*[A-Za-z0-9_-]+\.[A-Za-z][A-Za-z0-9]{0,9}:(\d+)(?:\s*[-–—]\s*(\d+))?\b"
)

_PROTECTED_TOKENS: frozenset[str] = DENIAL_CUES | CONTRASTIVE_PIVOTS
_REWRITE_FIRST_WORDS: frozenset[str] = frozenset(k[0] for k in PHRASE_REWRITES)
_MAX_REWRITE_LEN: int = max((len(k) for k in PHRASE_REWRITES), default=1)
_DISMISSAL_SET: frozenset[tuple[str, ...]] = frozenset(DISMISSAL_CUES)
_DISMISSAL_FIRST_WORDS: frozenset[str] = frozenset(c[0] for c in DISMISSAL_CUES)
_MAX_DISMISSAL_LEN: int = max((len(c) for c in DISMISSAL_CUES), default=1)
_DOUBLE_CONSONANTS = frozenset({"b", "d", "f", "g", "m", "n", "p", "r", "t"})
_VOWELS = frozenset("aeiouy")


@dataclass(frozen=True, slots=True)
class Token:
    """Canonical token with raw character offsets and negation flags."""

    canon: str
    start: int
    end: int
    denied: bool = False
    dismissed: bool = False


@dataclass(frozen=True, slots=True)
class Sentence:
    """Single normalized clause/sentence with extracted line references."""

    tokens: tuple[Token, ...]
    line_refs: frozenset[int]
    raw: str
    offset: int = field(default=0, repr=False, compare=False)


@dataclass(frozen=True, slots=True)
class NormalizedText:
    """Normalized representation of a review body or summary note."""

    raw: str
    sentences: tuple[Sentence, ...]


def _has_vowel(text: str) -> bool:
    return any(ch in _VOWELS for ch in text)


@lru_cache(maxsize=4096)
def _lemmatize_token(tok: str) -> str:
    if tok in LEMMA_EXCEPTIONS:
        return LEMMA_EXCEPTIONS[tok]
    if tok in _PROTECTED_TOKENS or (tok,) in PHRASE_REWRITES or len(tok) < 6:
        return tok

    if tok.endswith("ies") and len(tok) >= 6:
        stem = tok[:-3] + "y"
        if len(stem) >= 4:
            return stem

    if tok.endswith(("sses", "shes", "ches", "xes", "zes")):
        return tok[:-2]

    if tok.endswith("s") and not tok.endswith(("ss", "us", "is", "as", "os")):
        return tok[:-1]

    if tok.endswith("ing"):
        stem = tok[:-3]
        if len(stem) >= 4 and _has_vowel(stem):
            if (
                len(stem) >= 5
                and stem[-1] == stem[-2]
                and stem[-1] in _DOUBLE_CONSONANTS
            ):
                return stem[:-1]
            return stem

    if tok.endswith("ed"):
        stem = tok[:-2]
        if len(stem) >= 4 and _has_vowel(stem):
            if (
                len(stem) >= 5
                and stem[-1] == stem[-2]
                and stem[-1] in _DOUBLE_CONSONANTS
            ):
                return stem[:-1]
            return stem

    return tok


def _add_line_or_range(refs: set[int], start_s: str, end_s: str | None = None) -> None:
    start_val = int(start_s)
    if start_val <= 0:
        return
    if end_s is None:
        refs.add(start_val)
        return
    end_val = int(end_s)
    if end_val <= 0:
        refs.add(start_val)
        return
    lo, hi = (start_val, end_val) if start_val <= end_val else (end_val, start_val)
    capped_hi = min(hi, lo + _MAX_LINE_RANGE_SPAN)
    refs.update(range(lo, capped_hi + 1))


def _extract_line_refs(raw: str) -> frozenset[int]:
    refs: set[int] = set()
    for match in _LINE_WORD_RE.finditer(raw):
        g1, g2, g3 = match.group(1), match.group(2), match.group(3)
        if g2 is not None:
            _add_line_or_range(refs, g1, g2)
        else:
            _add_line_or_range(refs, g1)
            if g3 is not None:
                _add_line_or_range(refs, g3)
    for match in _LINE_SHORT_RE.finditer(raw):
        _add_line_or_range(refs, match.group(1), match.group(2))
    for match in _FILE_LINE_RE.finditer(raw):
        _add_line_or_range(refs, match.group(1), match.group(2))
    return frozenset(refs)


def _extract_raw_tokens(text: str, start: int, end: int) -> list[tuple[str, int, int]]:
    raw_tokens: list[tuple[str, int, int]] = []
    for match in _TOKEN_RE.finditer(text, start, end):
        tok_raw = match.group(0).replace("\u2019", "'")
        tok_start, tok_end = match.span()
        left_strip = len(tok_raw) - len(tok_raw.lstrip("'"))
        right_strip = len(tok_raw) - len(tok_raw.rstrip("'"))
        trimmed = tok_raw[
            left_strip : len(tok_raw) - right_strip if right_strip else None
        ]
        if not trimmed:
            continue
        raw_tokens.append(
            (trimmed.lower(), tok_start + left_strip, tok_end - right_strip)
        )
    return raw_tokens


def _apply_phrase_rewrites(
    tokens: list[tuple[str, int, int]],
) -> list[tuple[str, int, int]]:
    rewritten: list[tuple[str, int, int]] = []
    n = len(tokens)
    i = 0
    while i < n:
        tok_text, tok_start, tok_end = tokens[i]
        matched_len = 0
        replacement: tuple[str, ...] | None = None
        if tok_text in _REWRITE_FIRST_WORDS:
            max_span = min(_MAX_REWRITE_LEN, n - i)
            for span_len in range(max_span, 0, -1):
                candidate = tuple(tokens[j][0] for j in range(i, i + span_len))
                if candidate in PHRASE_REWRITES:
                    matched_len = span_len
                    replacement = PHRASE_REWRITES[candidate]
                    break
        if replacement is not None:
            span_end = tokens[i + matched_len - 1][2]
            for canon in replacement:
                rewritten.append((canon, tok_start, span_end))
            i += matched_len
        else:
            rewritten.append((tok_text, tok_start, tok_end))
            i += 1
    return rewritten


def _annotate_negation(
    tokens: list[tuple[str, int, int]],
    *,
    carry_dismiss: bool = False,
) -> tuple[tuple[Token, ...], bool]:
    annotated: list[Token] = []
    deny_rem = 0
    dismiss_rem = _NEGATION_SCOPE_TOKENS if carry_dismiss else 0
    dismiss_cue_end = -1
    saw_dismissal = carry_dismiss
    n = len(tokens)

    for i, (canon, start, end) in enumerate(tokens):
        is_dismiss_start = False
        if canon in _DISMISSAL_FIRST_WORDS:
            max_span = min(_MAX_DISMISSAL_LEN, n - i)
            for span_len in range(max_span, 1, -1):
                candidate = tuple(tokens[j][0] for j in range(i, i + span_len))
                if candidate in _DISMISSAL_SET:
                    is_dismiss_start = True
                    dismiss_cue_end = i + span_len - 1
                    saw_dismissal = True
                    break

        is_denial_cue = canon in DENIAL_CUES
        token_denied = (deny_rem > 0 and not is_denial_cue) or (
            dismiss_rem > 0 and i > dismiss_cue_end
        )
        token_dismissed = dismiss_rem > 0 and i > dismiss_cue_end

        annotated.append(
            Token(
                canon=canon,
                start=start,
                end=end,
                denied=token_denied,
                dismissed=token_dismissed,
            )
        )

        if deny_rem > 0:
            deny_rem -= 1
        if dismiss_rem > 0 and i > dismiss_cue_end:
            dismiss_rem -= 1

        if is_denial_cue:
            deny_rem = _NEGATION_SCOPE_TOKENS
        if is_dismiss_start:
            dismiss_rem = _NEGATION_SCOPE_TOKENS
            deny_rem = max(deny_rem, _NEGATION_SCOPE_TOKENS)

    return tuple(annotated), saw_dismissal


def _split_spans(
    text: str, pattern: re.Pattern[str], start: int = 0, end: int | None = None
) -> list[tuple[int, int]]:
    limit = len(text) if end is None else end
    spans: list[tuple[int, int]] = []
    prev_end = start
    for sep in pattern.finditer(text, start, limit):
        sep_start, sep_end = sep.span()
        if sep_start > prev_end:
            spans.append((prev_end, sep_start))
        prev_end = sep_end
    if prev_end < limit:
        spans.append((prev_end, limit))
    return spans


def _build_clause_sentence(
    text: str,
    clause_start: int,
    clause_end: int,
    raw_tokens: list[tuple[str, int, int]],
    *,
    carry_dismiss: bool = False,
) -> tuple[Sentence | None, bool]:
    raw_slice = text[clause_start:clause_end]
    stripped = raw_slice.strip()
    if not stripped:
        return None, False
    leading_ws = len(raw_slice) - len(raw_slice.lstrip())
    sent_offset = clause_start + leading_ws

    lemmatized = [
        (_lemmatize_token(tok), tok_s, tok_e) for tok, tok_s, tok_e in raw_tokens
    ]
    rewritten = _apply_phrase_rewrites(lemmatized)
    annotated, saw_dismissal = _annotate_negation(
        rewritten, carry_dismiss=carry_dismiss
    )
    line_refs = _extract_line_refs(stripped)
    return (
        Sentence(
            tokens=annotated,
            line_refs=line_refs,
            raw=stripped,
            offset=sent_offset,
        ),
        saw_dismissal,
    )


@lru_cache(maxsize=1024)
def normalize_text(text: str) -> NormalizedText:
    """Normalize review text into clause-split canonical tokens with negation flags."""
    if not text:
        return NormalizedText(raw=text or "", sentences=())

    sentences: list[Sentence] = []
    for sent_start, sent_end in _split_spans(text, _SENTENCE_SPLIT_RE):
        carry_dismiss = False
        for chunk_start, chunk_end in _split_spans(
            text, _COMMA_SPLIT_RE, sent_start, sent_end
        ):
            raw_tokens = _extract_raw_tokens(text, chunk_start, chunk_end)
            clause_start = chunk_start
            clause_tokens: list[tuple[str, int, int]] = []

            for tok, tok_s, tok_e in raw_tokens:
                if tok in CONTRASTIVE_PIVOTS and clause_tokens:
                    built, _ = _build_clause_sentence(
                        text,
                        clause_start,
                        tok_s,
                        clause_tokens,
                        carry_dismiss=carry_dismiss,
                    )
                    if built is not None:
                        sentences.append(built)
                    carry_dismiss = False
                    clause_start = tok_s
                    clause_tokens = [(tok, tok_s, tok_e)]
                else:
                    if not clause_tokens and tok in CONTRASTIVE_PIVOTS:
                        carry_dismiss = False
                    clause_tokens.append((tok, tok_s, tok_e))

            built, saw_dismissal = _build_clause_sentence(
                text,
                clause_start,
                chunk_end,
                clause_tokens,
                carry_dismiss=carry_dismiss,
            )
            if built is not None:
                sentences.append(built)
            carry_dismiss = saw_dismissal

    return NormalizedText(raw=text, sentences=tuple(sentences))


@lru_cache(maxsize=1024)
def normalize_phrase(keyword: str) -> tuple[str, ...]:
    """Normalize a defect keyword or phrase into canonical tokens without denial."""
    if not keyword or not keyword.strip():
        return ()
    raw_tokens = _extract_raw_tokens(keyword, 0, len(keyword))
    lemmatized = [
        (_lemmatize_token(tok), tok_s, tok_e) for tok, tok_s, tok_e in raw_tokens
    ]
    rewritten = _apply_phrase_rewrites(lemmatized)
    return tuple(canon for canon, _, _ in rewritten)
