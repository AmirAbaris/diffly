"""Text normalization, lexicon, and negation primitives for grading."""

from backend.services.grading.text.lexicon import (
    CONTRASTIVE_PIVOTS,
    DENIAL_CUES,
    DISMISSAL_CUES,
    LEMMA_EXCEPTIONS,
    PHRASE_REWRITES,
    TERM_POLARITY,
    Polarity,
)
from backend.services.grading.text.normalize import (
    NormalizedText,
    Sentence,
    Token,
    normalize_phrase,
    normalize_text,
)


__all__ = [
    "CONTRASTIVE_PIVOTS",
    "DENIAL_CUES",
    "DISMISSAL_CUES",
    "LEMMA_EXCEPTIONS",
    "PHRASE_REWRITES",
    "TERM_POLARITY",
    "NormalizedText",
    "Polarity",
    "Sentence",
    "Token",
    "normalize_phrase",
    "normalize_text",
]
