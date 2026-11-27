"""Tests for the cross-stack language registry and C# migration."""

import importlib.util
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from backend.models.challenge import (
    SUPPORTED_CHALLENGE_EXTENSIONS,
    GenerateCustomChallengeRequest,
    Language,
    infer_language_from_path,
)
from backend.models.languages import (
    ALL_LANGUAGE_SPECS,
    CHALLENGE_LANGUAGE_SPECS,
    EXTENSION_LANGUAGE_MAP,
    LANGUAGE_ALIAS_MAP,
    assert_language_enum_parity,
    resolve_language_alias,
)


def _load_migration_0011():
    migration_path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "0011_add_csharp_language.py"
    )
    spec = importlib.util.spec_from_file_location(
        "migration_0011_add_csharp_language", migration_path
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_language_enum_matches_manifest_exactly():
    manifest_ids = {spec.id for spec in CHALLENGE_LANGUAGE_SPECS}
    enum_ids = {member.value for member in Language}
    assert enum_ids == manifest_ids
    assert "csharp" in enum_ids
    assert ".cs" in SUPPORTED_CHALLENGE_EXTENSIONS
    assert EXTENSION_LANGUAGE_MAP[".cs"] == "csharp"
    assert len(ALL_LANGUAGE_SPECS) > len(CHALLENGE_LANGUAGE_SPECS)

    assert_language_enum_parity(enum_ids)
    with pytest.raises(RuntimeError, match="Language enum drift"):
        assert_language_enum_parity(enum_ids - {"csharp"})


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("csharp", "csharp"),
        ("CSHARP", "csharp"),
        ("c#", "csharp"),
        ("C#", "csharp"),
        ("cs", "csharp"),
        (".cs", "csharp"),
        ("c-sharp", "csharp"),
        ("  dotnet  ", "csharp"),
        ("py", "python"),
        ("ts", "typescript"),
        ("golang", "go"),
        ("rs", "rust"),
        ("java", "java"),
        ("js", None),
        ("javascript", None),
        ("sql", None),
        ("yaml", None),
        ("bash", None),
        ("", None),
        ("   ", None),
        ("unknown", None),
        (123, None),
        (None, None),
    ],
)
def test_resolve_language_alias(raw: object, expected: str | None):
    assert resolve_language_alias(raw) == expected


def test_language_enum_resolves_aliases_and_rejects_auxiliary():
    assert Language("csharp") is Language.CSHARP
    assert Language("CSHARP") is Language.CSHARP
    assert Language("c#") is Language.CSHARP
    assert Language("C#") is Language.CSHARP
    assert Language("cs") is Language.CSHARP
    assert Language("c-sharp") is Language.CSHARP
    assert Language("dotnet") is Language.CSHARP
    assert LANGUAGE_ALIAS_MAP["c#"] == "csharp"

    with pytest.raises(ValueError):
        Language("javascript")
    with pytest.raises(ValueError):
        Language("bash")


def test_infer_language_from_path_supports_csharp_and_auxiliary():
    assert infer_language_from_path("Services/InvoiceRepo.cs") == "csharp"
    assert infer_language_from_path("Program.CS") == "csharp"
    assert infer_language_from_path("scripts/deploy.sh") == "bash"
    assert infer_language_from_path("README.unknown", fallback="text") == "text"


def test_generate_custom_request_description_includes_all_manifest_languages():
    description = GenerateCustomChallengeRequest.model_fields["language"].description
    assert description is not None
    for spec in CHALLENGE_LANGUAGE_SPECS:
        assert spec.id in description


def test_migration_0011_upgrade_postgresql_executes_alter_type_in_autocommit():
    migration = _load_migration_0011()
    assert migration.revision == "0011_add_csharp_language"
    assert migration.down_revision == "0010_coach_threads"

    events: list[str] = []

    @contextmanager
    def fake_autocommit():
        events.append("enter_autocommit")
        yield
        events.append("exit_autocommit")

    fake_bind = MagicMock()
    fake_bind.dialect.name = "postgresql"
    fake_context = MagicMock()
    fake_context.autocommit_block.side_effect = fake_autocommit

    def fake_execute(sql: str):
        events.append(f"execute:{sql}")

    with (
        patch.object(migration.op, "get_bind", return_value=fake_bind),
        patch.object(migration.op, "get_context", return_value=fake_context),
        patch.object(migration.op, "execute", side_effect=fake_execute),
    ):
        migration.upgrade()

    assert events == [
        "enter_autocommit",
        "execute:ALTER TYPE language ADD VALUE IF NOT EXISTS 'CSHARP'",
        "exit_autocommit",
    ]


def test_migration_0011_upgrade_sqlite_is_noop():
    migration = _load_migration_0011()
    fake_bind = MagicMock()
    fake_bind.dialect.name = "sqlite"

    with (
        patch.object(migration.op, "get_bind", return_value=fake_bind),
        patch.object(migration.op, "execute") as mock_execute,
    ):
        migration.upgrade()

    mock_execute.assert_not_called()


def test_migration_0011_downgrade_blocks_when_csharp_rows_exist():
    migration = _load_migration_0011()

    fake_ctx = MagicMock()
    fake_ctx.as_sql = False
    fake_bind = MagicMock()
    fake_bind.execute.return_value.scalar.return_value = 3
    with (
        patch.object(migration.op, "get_context", return_value=fake_ctx),
        patch.object(migration.op, "get_bind", return_value=fake_bind),
        pytest.raises(RuntimeError, match="language='CSHARP'"),
    ):
        migration.downgrade()

    fake_bind.execute.return_value.scalar.return_value = 0
    with (
        patch.object(migration.op, "get_context", return_value=fake_ctx),
        patch.object(migration.op, "get_bind", return_value=fake_bind),
    ):
        migration.downgrade()

    fake_ctx.as_sql = True
    fake_bind.execute.reset_mock()
    with (
        patch.object(migration.op, "get_context", return_value=fake_ctx),
        patch.object(migration.op, "get_bind", return_value=fake_bind),
    ):
        migration.downgrade()
    fake_bind.execute.assert_not_called()
