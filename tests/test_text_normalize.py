"""Tests for deterministic text normalization, lexicon rewrites, and negation scopes."""

from backend.services.grading.text import (
    PHRASE_REWRITES,
    normalize_phrase,
    normalize_text,
)


def test_synonym_phrase_rewrites_and_separator_normalization():
    """Synonyms and underscore/hyphen variants map to shared canonical phrases."""
    assert normalize_phrase("sqli") == ("sql", "injection")
    assert normalize_phrase("sql_injection") == ("sql", "injection")
    assert normalize_phrase("sql-injection") == ("sql", "injection")
    assert normalize_phrase("SQL Injection") == ("sql", "injection")

    assert normalize_phrase("authz") == ("authorization",)
    assert normalize_phrase("unauthorized") == ("authorization",)
    assert normalize_phrase("authorisation") == ("authorization",)
    assert normalize_phrase("access control") == ("authorization",)
    assert normalize_phrase("permission check") == ("authorization",)
    assert normalize_phrase("privilege check") == ("authorization",)

    assert normalize_phrase("authn") == ("authentication",)
    assert normalize_phrase("unauthenticated") == ("authentication",)

    assert normalize_phrase("toctou") == ("race", "condition")
    assert normalize_phrase("data race") == ("race", "condition")
    assert normalize_phrase("xss") == ("cross", "site", "scripting")
    assert normalize_phrase("cross-site scripting") == ("cross", "site", "scripting")
    assert normalize_phrase("csrf") == ("cross", "site", "request", "forgery")
    assert normalize_phrase("xsrf") == ("cross", "site", "request", "forgery")
    assert normalize_phrase("rce") == ("remote", "code", "execution")
    assert normalize_phrase("arbitrary code execution") == (
        "remote",
        "code",
        "execution",
    )
    assert normalize_phrase("idor") == ("insecure", "direct", "object", "reference")
    assert normalize_phrase("bola") == ("insecure", "direct", "object", "reference")
    assert normalize_phrase("ssrf") == ("server", "side", "request", "forgery")
    assert normalize_phrase("prepared statement") == ("parameterize",)
    assert normalize_phrase("bindparam") == ("parameterize",)
    assert normalize_phrase("bound parameter") == ("parameterize",)


def test_every_phrase_rewrite_is_idempotent_under_normalize_phrase():
    """Lemmatization never shadows multi-word PHRASE_REWRITES keys."""
    for key_tokens, target_tokens in PHRASE_REWRITES.items():
        assert normalize_phrase(" ".join(key_tokens)) == target_tokens


def test_lemmatization_exceptions_and_short_token_preservation():
    """Conservative lemmatization preserves short technical terms."""
    for variant in (
        "sanitizing",
        "sanitized",
        "sanitization",
        "sanitise",
        "sanitising",
        "sanitised",
    ):
        assert normalize_phrase(variant) == ("sanitize",)

    assert normalize_phrase("locking") == ("lock",)
    assert normalize_phrase("locked") == ("lock",)
    assert normalize_phrase("validating") == ("validate",)
    assert normalize_phrase("validation") == ("validate",)
    assert normalize_phrase("escaping") == ("escape",)
    assert normalize_phrase("escaped") == ("escape",)
    assert normalize_phrase("parameterized") == ("parameterize",)
    assert normalize_phrase("parametrized") == ("parameterize",)
    assert normalize_phrase("deserializing") == ("deserialize",)
    assert normalize_phrase("deserialization") == ("deserialize",)
    assert normalize_phrase("leaking") == ("leak",)
    assert normalize_phrase("leaks") == ("leak",)
    assert normalize_phrase("executing") == ("execute",)
    assert normalize_phrase("execution") == ("execute",)

    assert normalize_phrase("sql") != normalize_phrase("sqlite")
    assert normalize_phrase("ast") != normalize_phrase("faster")
    assert normalize_phrase("eval") != normalize_phrase("evaluate")


def test_clause_splitting_and_line_ref_extraction():
    """Punctuation and pivots split clauses while keeping dotted refs intact."""
    norm = normalize_text(
        "Line 12 has no sql injection, but app.py:14 leaks secrets; "
        "lines 20-22 and L30 lack auth."
    )
    assert len(norm.sentences) == 3

    s0, s1, s2 = norm.sentences
    assert s0.line_refs == frozenset({12})
    assert [t.canon for t in s0.tokens] == [
        "line",
        "12",
        "has",
        "no",
        "sql",
        "injection",
    ]
    assert s0.tokens[4].denied is True
    assert s0.tokens[5].denied is True

    assert s1.line_refs == frozenset({14})
    assert [t.canon for t in s1.tokens] == ["but", "app", "py", "14", "leak", "secret"]
    assert all(not t.denied for t in s1.tokens)

    assert s2.line_refs == frozenset({20, 21, 22, 30})
    assert s2.tokens[-1].canon == "auth"
    assert s2.tokens[-1].denied is True


def test_denial_and_dismissal_token_scopes_and_offsets():
    """Denial and dismissal scopes last 6 tokens or until clause boundary."""
    text = "There is no t1 t2 t3 t4 t5 t6 t7. Not vulnerable to sql injection."
    norm = normalize_text(text)
    assert len(norm.sentences) == 2

    first_tokens = norm.sentences[0].tokens
    for tok in first_tokens:
        assert text[tok.start : tok.end].lower() == tok.canon
    denied_flags = [tok.denied for tok in first_tokens]
    assert denied_flags == [
        False,
        False,
        False,
        True,
        True,
        True,
        True,
        True,
        True,
        False,
    ]

    second_tokens = norm.sentences[1].tokens
    assert [t.canon for t in second_tokens] == [
        "not",
        "vulnerable",
        "to",
        "sql",
        "injection",
    ]
    assert second_tokens[3].dismissed is True
    assert second_tokens[4].dismissed is True
    assert second_tokens[3].denied is True
    assert second_tokens[4].denied is True


def test_quoted_tokens_and_contractions():
    """Surrounding single quotes strip cleanly while contractions remain intact."""
    norm = normalize_text("It isn't safe from 'eval' calls.")
    tokens = norm.sentences[0].tokens
    assert tokens[1].canon == "isn't"
    eval_tok = next(t for t in tokens if t.canon == "eval")
    assert norm.raw[eval_tok.start : eval_tok.end] == "eval"
    assert eval_tok.denied is True
    assert eval_tok.dismissed is True
