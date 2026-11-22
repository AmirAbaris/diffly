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
    r"\b(?:lines\s*#?\d+(?:\s*[-–—]\s*#?\d+)?"
    r"(?:\s*(?:,\s*(?:(?:and|&)\s+)?|\s+(?:and|&)\s+)#?\d+(?:\s*[-–—]\s*#?\d+)?)*"
    r"|line\s*#?\d+(?:\s*[-–—]\s*#?\d+|"
    r"(?:\s*(?:,\s*(?:and|&)\s+|,\s*#|\s+(?:and|&)\s+)#?\d+(?:\s*[-–—]\s*#?\d+)?)*))\b",
    re.IGNORECASE,
)
_LINE_RANGE_PART_RE = re.compile(r"#?(\d+)\s*[-–—]\s*#?(\d+)")
_LINE_SINGLE_PART_RE = re.compile(r"#?(\d+)")
_LINE_SHORT_RE = re.compile(r"(?<![A-Za-z0-9_])L(\d+)(?:\s*[-–—]\s*L?(\d+))?\b")
_FILE_LINE_RE = re.compile(
    r"((?:[A-Za-z0-9_.-]+/)*[A-Za-z0-9_-]+\.[A-Za-z][A-Za-z0-9]{0,9}):(\d+)(?:\s*[-–—]\s*(\d+))?\b"
)

_MAX_ENUM_CONTINUATION_TOKENS = 6
_CLAUSE_BREAK_STARTERS: frozenset[str] = CONTRASTIVE_PIVOTS | frozenset(
    {
        "so",
        "therefore",
        "thus",
        "hence",
        "then",
        "meaning",
        "which",
        "that",
        "because",
        "since",
        "while",
        "where",
        "instead",
        "rather",
        "otherwise",
        "actually",
        "wait",
        "except",
        "unless",
        "until",
        "when",
        "if",
        "only",
        "allow",
        "enable",
        "cause",
        "expose",
        "lead",
        "result",
        "trigger",
    }
)
_CLAUSE_PREDICATE_BREAKERS: frozenset[str] = frozenset(
    {
        "is",
        "are",
        "was",
        "were",
        "be",
        "been",
        "being",
        "has",
        "have",
        "had",
        "do",
        "does",
        "did",
        "can",
        "could",
        "will",
        "would",
        "shall",
        "should",
        "may",
        "might",
        "must",
        "it",
        "they",
        "we",
        "you",
        "he",
        "she",
        "there",
        "allow",
        "enable",
        "cause",
        "expose",
        "result",
        "exist",
        "exists",
        "occur",
        "occurs",
        "introduce",
        "seem",
        "seems",
        "appear",
        "contain",
        "include",
        "require",
        "need",
        "needs",
        "happen",
        "happens",
    }
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
    file_line_refs: frozenset[tuple[str, int]] = frozenset()


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


def _add_line_or_range(
    refs: set[int],
    start_s: str,
    end_s: str | None = None,
    *,
    file_refs: set[tuple[str, int]] | None = None,
    file_path: str | None = None,
) -> None:
    start_val = int(start_s)
    if start_val <= 0:
        return
    if end_s is None:
        refs.add(start_val)
        if file_refs is not None and file_path is not None:
            file_refs.add((file_path, start_val))
        return
    end_val = int(end_s)
    if end_val <= 0:
        refs.add(start_val)
        if file_refs is not None and file_path is not None:
            file_refs.add((file_path, start_val))
        return
    lo, hi = (start_val, end_val) if start_val <= end_val else (end_val, start_val)
    capped_hi = min(hi, lo + _MAX_LINE_RANGE_SPAN)
    for ln in range(lo, capped_hi + 1):
        refs.add(ln)
        if file_refs is not None and file_path is not None:
            file_refs.add((file_path, ln))


def _extract_line_refs_and_files(
    raw: str,
) -> tuple[frozenset[int], frozenset[tuple[str, int]]]:
    refs: set[int] = set()
    file_refs: set[tuple[str, int]] = set()
    for match in _LINE_WORD_RE.finditer(raw):
        matched_text = match.group(0)

        def _collect_range(range_match: re.Match[str]) -> str:
            _add_line_or_range(refs, range_match.group(1), range_match.group(2))
            return " "

        remainder = _LINE_RANGE_PART_RE.sub(_collect_range, matched_text)
        for num_str in _LINE_SINGLE_PART_RE.findall(remainder):
            _add_line_or_range(refs, num_str)

    for match in _LINE_SHORT_RE.finditer(raw):
        _add_line_or_range(refs, match.group(1), match.group(2))
    for match in _FILE_LINE_RE.finditer(raw):
        _add_line_or_range(
            refs,
            match.group(2),
            match.group(3),
            file_refs=file_refs,
            file_path=match.group(1).lower(),
        )
    return frozenset(refs), frozenset(file_refs)


def _extract_line_refs(raw: str) -> frozenset[int]:
    refs, _ = _extract_line_refs_and_files(raw)
    return refs


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


def _apply_phrase_rewrites(tokens: list[Token]) -> tuple[Token, ...]:
    rewritten: list[Token] = []
    n = len(tokens)
    i = 0
    while i < n:
        tok = tokens[i]
        matched_len = 0
        replacement: tuple[str, ...] | None = None
        if tok.canon in _REWRITE_FIRST_WORDS:
            max_span = min(_MAX_REWRITE_LEN, n - i)
            for span_len in range(max_span, 0, -1):
                candidate = tuple(tokens[j].canon for j in range(i, i + span_len))
                if candidate in PHRASE_REWRITES:
                    matched_len = span_len
                    replacement = PHRASE_REWRITES[candidate]
                    break
        if replacement is not None:
            span = tokens[i : i + matched_len]
            span_end = span[-1].end
            span_denied = any(t.denied for t in span)
            span_dismissed = any(t.dismissed for t in span)
            for canon in replacement:
                rewritten.append(
                    Token(
                        canon=canon,
                        start=tok.start,
                        end=span_end,
                        denied=span_denied,
                        dismissed=span_dismissed,
                    )
                )
            i += matched_len
        else:
            rewritten.append(tok)
            i += 1
    return tuple(rewritten)


def _annotate_negation(
    tokens: list[tuple[str, int, int]],
    *,
    initial_deny_rem: int = 0,
    initial_dismiss_rem: int = 0,
) -> tuple[list[Token], int, int]:
    annotated: list[Token] = []
    deny_rem = initial_deny_rem
    dismiss_rem = initial_dismiss_rem
    dismiss_cue_end = -1
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

    return annotated, deny_rem, dismiss_rem


def _split_spans(
    text: str,
    pattern: re.Pattern[str],
    start: int = 0,
    end: int | None = None,
    *,
    protected_spans: list[tuple[int, int]] | None = None,
) -> list[tuple[int, int]]:
    limit = len(text) if end is None else end
    spans: list[tuple[int, int]] = []
    prev_end = start
    for sep in pattern.finditer(text, start, limit):
        sep_start, sep_end = sep.span()
        if protected_spans and any(
            p_start <= sep_start < p_end for p_start, p_end in protected_spans
        ):
            continue
        if sep_start > prev_end:
            spans.append((prev_end, sep_start))
        prev_end = sep_end
    if prev_end < limit:
        spans.append((prev_end, limit))
    return spans


def _is_enumeration_continuation(lemmatized: list[tuple[str, int, int]]) -> bool:
    if not lemmatized or len(lemmatized) > _MAX_ENUM_CONTINUATION_TOKENS:
        return False
    if lemmatized[0][0] in _CLAUSE_BREAK_STARTERS:
        return False
    return not any(tok in _CLAUSE_PREDICATE_BREAKERS for tok, _, _ in lemmatized)


def _build_clause_sentence(
    text: str,
    clause_start: int,
    clause_end: int,
    lemmatized: list[tuple[str, int, int]],
    *,
    line_refs: frozenset[int],
    file_line_refs: frozenset[tuple[str, int]],
    initial_deny_rem: int = 0,
    initial_dismiss_rem: int = 0,
) -> tuple[Sentence | None, int, int]:
    raw_slice = text[clause_start:clause_end]
    stripped = raw_slice.strip()
    if not stripped:
        return None, 0, 0
    leading_ws = len(raw_slice) - len(raw_slice.lstrip())
    sent_offset = clause_start + leading_ws

    annotated, next_deny_rem, next_dismiss_rem = _annotate_negation(
        lemmatized,
        initial_deny_rem=initial_deny_rem,
        initial_dismiss_rem=initial_dismiss_rem,
    )
    rewritten = _apply_phrase_rewrites(annotated)
    return (
        Sentence(
            tokens=rewritten,
            line_refs=line_refs,
            raw=stripped,
            offset=sent_offset,
            file_line_refs=file_line_refs,
        ),
        next_deny_rem,
        next_dismiss_rem,
    )


def normalize_text(text: str) -> NormalizedText:
    """Normalize review text into clause-split canonical tokens with negation flags."""
    if not text:
        return NormalizedText(raw=text or "", sentences=())

    sentences: list[Sentence] = []
    for sent_start, sent_end in _split_spans(text, _SENTENCE_SPLIT_RE):
        sent_raw = text[sent_start:sent_end]
        major_refs, major_file_refs = _extract_line_refs_and_files(sent_raw)
        protected_spans = [
            match.span() for match in _LINE_WORD_RE.finditer(text, sent_start, sent_end)
        ]

        active_refs: frozenset[int] = frozenset()
        active_file_refs: frozenset[tuple[str, int]] = frozenset()
        carry_deny_rem = 0
        carry_dismiss_rem = 0

        for chunk_start, chunk_end in _split_spans(
            text,
            _COMMA_SPLIT_RE,
            sent_start,
            sent_end,
            protected_spans=protected_spans,
        ):
            raw_tokens = _extract_raw_tokens(text, chunk_start, chunk_end)
            sub_clauses: list[tuple[int, int, list[tuple[str, int, int]], bool]] = []
            clause_start = chunk_start
            clause_tokens: list[tuple[str, int, int]] = []
            after_pivot = False

            for tok, tok_s, tok_e in raw_tokens:
                if tok in CONTRASTIVE_PIVOTS:
                    if clause_tokens:
                        sub_clauses.append(
                            (clause_start, tok_s, clause_tokens, after_pivot)
                        )
                    clause_start = tok_s
                    clause_tokens = [(tok, tok_s, tok_e)]
                    after_pivot = True
                else:
                    clause_tokens.append((tok, tok_s, tok_e))

            sub_clauses.append((clause_start, chunk_end, clause_tokens, after_pivot))

            for sub_start, sub_end, sub_tokens, is_pivot_clause in sub_clauses:
                sub_stripped = text[sub_start:sub_end].strip()
                if not sub_stripped:
                    continue

                lemmatized = [
                    (_lemmatize_token(tok), tok_s, tok_e)
                    for tok, tok_s, tok_e in sub_tokens
                ]
                sub_refs, sub_file_refs = _extract_line_refs_and_files(sub_stripped)
                distinct_line_ref = bool(
                    sub_refs and active_refs and sub_refs != active_refs
                )

                if sub_refs:
                    clause_refs = sub_refs
                    clause_file_refs = sub_file_refs
                    active_refs = sub_refs
                    active_file_refs = sub_file_refs
                elif active_refs:
                    clause_refs = active_refs
                    clause_file_refs = active_file_refs
                else:
                    clause_refs = major_refs
                    clause_file_refs = major_file_refs

                if is_pivot_clause or distinct_line_ref:
                    init_deny_rem = 0
                    init_dismiss_rem = 0
                else:
                    init_dismiss_rem = carry_dismiss_rem
                    init_deny_rem = (
                        max(carry_deny_rem, _NEGATION_SCOPE_TOKENS)
                        if carry_deny_rem > 0
                        and _is_enumeration_continuation(lemmatized)
                        else 0
                    )

                built, carry_deny_rem, carry_dismiss_rem = _build_clause_sentence(
                    text,
                    sub_start,
                    sub_end,
                    lemmatized,
                    line_refs=clause_refs,
                    file_line_refs=clause_file_refs,
                    initial_deny_rem=init_deny_rem,
                    initial_dismiss_rem=init_dismiss_rem,
                )
                if built is not None:
                    sentences.append(built)

    return NormalizedText(raw=text, sentences=tuple(sentences))


@lru_cache(maxsize=1024)
def normalize_phrase(keyword: str) -> tuple[str, ...]:
    """Normalize a defect keyword or phrase into canonical tokens without denial."""
    if not keyword or not keyword.strip():
        return ()
    raw_tokens = _extract_raw_tokens(keyword, 0, len(keyword))
    lemmatized = [
        Token(canon=_lemmatize_token(tok), start=tok_s, end=tok_e)
        for tok, tok_s, tok_e in raw_tokens
    ]
    rewritten = _apply_phrase_rewrites(lemmatized)
    return tuple(tok.canon for tok in rewritten)
