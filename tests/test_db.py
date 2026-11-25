import contextlib
from collections.abc import Generator
from typing import Annotated
from unittest.mock import MagicMock, patch

import pytest
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.pool import NullPool
from sqlmodel import Session, SQLModel, create_engine, select

from alembic import command
from backend.core.config import Settings, normalize_database_url, settings
from backend.core.db import (
    ALEMBIC_INI_PATH,
    ALEMBIC_SCRIPT_LOCATION,
    build_engine_kwargs,
    create_db_engine,
    get_session,
    init_db,
    resolve_database_config,
    resolve_sqlalchemy_url,
    run_migrations,
)
from backend.models import Category, Challenge, Difficulty, Language, Submission, User


def test_default_settings():
    assert settings.DATABASE_URL == "sqlite:///./diffly.db"
    assert settings.JWT_SECRET_KEY == "diffly-dev-secret-key-change-in-production-only"
    assert settings.JWT_ALGORITHM == "HS256"
    assert settings.ACCESS_TOKEN_EXPIRE_MINUTES == 10080
    assert "http://localhost:3000" in settings.CORS_ORIGINS
    assert "http://localhost:8000" in settings.CORS_ORIGINS
    assert settings.CORS_ORIGIN_REGEX == (
        r"^https://diffly(?:-[a-z0-9]+)*-amirabaris\.vercel\.app$"
        r"|^https://diffly(?:-sigma)?\.vercel\.app$"
    )
    assert settings.TRUSTED_PROXY_CIDRS == []
    assert settings.DB_POOL_SIZE == 5
    assert settings.DB_MAX_OVERFLOW == 10
    assert settings.DB_POOL_RECYCLE_SECONDS == 300
    assert settings.DB_POOL_PRE_PING is True


def test_settings_cors_origins_parsing():
    # Comma-separated string
    s1 = Settings(
        CORS_ORIGINS="https://app.diffly.dev, https://api.diffly.dev",  # type: ignore[arg-type]
    )
    assert s1.CORS_ORIGINS == ["https://app.diffly.dev", "https://api.diffly.dev"]

    # JSON array string
    s2 = Settings(
        CORS_ORIGINS='["https://preview.diffly.dev", "https://diffly.dev"]',  # type: ignore[arg-type]
    )
    assert s2.CORS_ORIGINS == [
        "https://preview.diffly.dev",
        "https://diffly.dev",
    ]

    # Empty string
    s3 = Settings(CORS_ORIGINS="")  # type: ignore[arg-type]
    assert s3.CORS_ORIGINS == []

    # Invalid type
    with pytest.raises(ValueError, match="Invalid format for CORS_ORIGINS"):
        Settings(CORS_ORIGINS=12345)  # type: ignore[arg-type]


def test_cors_origin_regex_validation():
    import re

    # Valid regex
    s = Settings(CORS_ORIGIN_REGEX=r"^https://[a-z0-9-]+\.vercel\.app$")
    assert s.CORS_ORIGIN_REGEX == r"^https://[a-z0-9-]+\.vercel\.app$"

    # Invalid regex raises re.error
    with pytest.raises(re.error):
        Settings(CORS_ORIGIN_REGEX="[invalid(")


def test_normalize_database_url():
    # SQLite untouched
    assert normalize_database_url("sqlite:///./diffly.db") == "sqlite:///./diffly.db"

    # Legacy postgres:// scheme normalized to postgresql://
    raw_pg = "postgres://user:pass@ep-cool-1234.us-east-2.aws.neon.tech/neondb"
    normalized = normalize_database_url(raw_pg)
    assert normalized.startswith("postgresql://")
    assert "sslmode=require" in normalized

    # Preserves existing sslmode
    already_ssl = "postgresql://user:pass@ep-cool-1234.us-east-2.aws.neon.tech/neondb?sslmode=verify-full"
    assert normalize_database_url(already_ssl) == already_ssl

    # Standard non-neon postgres
    local_pg = "postgresql://postgres:postgres@localhost:5432/diffly"
    assert normalize_database_url(local_pg) == local_pg


def test_resolve_database_config_sqlite():
    cfg = resolve_database_config("sqlite:///./diffly.db")
    assert cfg.driver == "sqlite"
    assert cfg.is_neon is False
    assert cfg.is_pooled_endpoint is False
    assert cfg.connect_args == {"check_same_thread": False, "timeout": 30}
    assert cfg.pool_pre_ping is False
    assert cfg.pool_recycle is None


def test_resolve_database_config_neon_pooled():
    neon_url = "postgresql://user:pass@ep-bold-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require"
    cfg = resolve_database_config(neon_url)
    assert cfg.driver == "postgresql"
    assert cfg.is_neon is True
    assert cfg.is_pooled_endpoint is True
    assert cfg.use_null_pool is True
    assert cfg.connect_args == {"connect_timeout": 10}
    assert cfg.pool_pre_ping is False
    assert cfg.pool_recycle is None
    assert cfg.pool_size is None
    assert cfg.max_overflow is None

    kwargs = build_engine_kwargs(neon_url)
    assert kwargs["poolclass"] is NullPool
    assert kwargs["connect_args"] == {"connect_timeout": 10}
    assert "pool_size" not in kwargs
    assert "max_overflow" not in kwargs
    assert "pool_recycle" not in kwargs
    assert "pool_pre_ping" not in kwargs

    pooled_engine = create_db_engine(neon_url)
    try:
        assert isinstance(pooled_engine.pool, NullPool)
    finally:
        pooled_engine.dispose()


def test_resolve_database_config_serverless_and_direct_postgres():
    direct_neon = (
        "postgresql://user:pass@ep-bold.us-east-2.aws.neon.tech/neondb?sslmode=require"
    )
    direct_cfg = resolve_database_config(direct_neon)
    assert direct_cfg.is_neon is True
    assert direct_cfg.is_pooled_endpoint is False
    assert direct_cfg.use_null_pool is False
    assert direct_cfg.connect_args == {"connect_timeout": 10}
    assert direct_cfg.pool_size == 5
    assert direct_cfg.max_overflow == 10

    direct_kwargs = build_engine_kwargs(direct_neon)
    assert "poolclass" not in direct_kwargs
    assert direct_kwargs["pool_pre_ping"] is True
    assert direct_kwargs["pool_recycle"] == 300
    assert direct_kwargs["pool_size"] == 5
    assert direct_kwargs["max_overflow"] == 10
    assert direct_kwargs["connect_args"] == {"connect_timeout": 10}

    vercel_settings = Settings(DATABASE_URL=direct_neon, VERCEL="1")
    vercel_cfg = resolve_database_config(vercel_settings)
    assert vercel_cfg.is_serverless is True
    assert vercel_cfg.use_null_pool is True
    vercel_kwargs = build_engine_kwargs(vercel_settings)
    assert vercel_kwargs["poolclass"] is NullPool
    assert vercel_kwargs["connect_args"] == {"connect_timeout": 10}
    assert "pool_size" not in vercel_kwargs

    explicit_timeout_url = (
        "postgresql://user:pass@ep-bold-pooler.us-east-2.aws.neon.tech/neondb"
        "?sslmode=require&connect_timeout=5"
    )
    assert resolve_database_config(explicit_timeout_url).connect_args == {}


def test_create_db_engine_sqlite():
    test_eng = create_db_engine("sqlite:///:memory:")
    assert test_eng.name == "sqlite"
    test_eng.dispose()


def test_create_db_engine_sqlite_enables_wal_and_foreign_keys(tmp_path):
    db_url = f"sqlite:///{tmp_path / 'wal_mode.db'}"
    test_eng = create_db_engine(db_url)
    try:
        with test_eng.connect() as conn:
            journal_mode = conn.execute(text("PRAGMA journal_mode")).scalar_one()
            foreign_keys = conn.execute(text("PRAGMA foreign_keys")).scalar_one()
            assert str(journal_mode).lower() == "wal"
            assert foreign_keys == 1
    finally:
        test_eng.dispose()


def test_resolve_sqlalchemy_url():
    pg_url = "postgresql://user:pass@localhost:5432/diffly"

    # psycopg absent + psycopg2 present -> rewrites postgresql:// to postgresql+psycopg2://
    with patch(
        "importlib.util.find_spec",
        side_effect=lambda name: MagicMock() if name == "psycopg2" else None,
    ):
        assert (
            resolve_sqlalchemy_url(pg_url)
            == "postgresql+psycopg2://user:pass@localhost:5432/diffly"
        )

    # psycopg present -> keeps postgresql://
    with patch(
        "importlib.util.find_spec",
        side_effect=lambda name: MagicMock() if name == "psycopg" else None,
    ):
        assert resolve_sqlalchemy_url(pg_url) == pg_url

    # Explicit +driver URL -> unchanged
    asyncpg_url = "postgresql+asyncpg://user:pass@localhost:5432/diffly"
    with patch(
        "importlib.util.find_spec",
        side_effect=lambda name: MagicMock() if name == "psycopg2" else None,
    ):
        assert resolve_sqlalchemy_url(asyncpg_url) == asyncpg_url

    # SQLite URL -> unchanged
    sqlite_url = "sqlite:///./diffly.db"
    with patch(
        "importlib.util.find_spec",
        side_effect=lambda name: MagicMock() if name == "psycopg2" else None,
    ):
        assert resolve_sqlalchemy_url(sqlite_url) == sqlite_url


def test_init_db_applies_alembic_migrations():
    test_engine = create_engine("sqlite:///:memory:")
    try:
        with patch("backend.core.db.engine", test_engine):
            init_db()
            inspector = inspect(test_engine)
            table_names = set(inspector.get_table_names())
            assert {
                "users",
                "challenges",
                "submissions",
                "coach_threads",
                "coach_messages",
                "alembic_version",
            }.issubset(table_names)

            cfg = Config(str(ALEMBIC_INI_PATH))
            cfg.set_main_option("script_location", str(ALEMBIC_SCRIPT_LOCATION))
            head_rev = ScriptDirectory.from_config(cfg).get_current_head()

            with test_engine.connect() as conn:
                current_rev = conn.execute(
                    text("SELECT version_num FROM alembic_version")
                ).scalar_one()
            assert current_rev == head_rev
    finally:
        test_engine.dispose()


def test_alembic_upgrade_parity_with_sqlmodel_metadata(tmp_path):
    db_url = f"sqlite:///{tmp_path / 'parity.db'}"
    test_engine = create_db_engine(db_url)
    try:
        run_migrations(test_engine)
        with test_engine.connect() as conn:
            migration_ctx = MigrationContext.configure(
                conn, opts={"compare_type": True}
            )
            diffs = compare_metadata(migration_ctx, SQLModel.metadata)
        assert diffs == []
    finally:
        test_engine.dispose()


def test_alembic_migrated_sqlite_enforces_constraints_and_foreign_keys(tmp_path):
    db_url = f"sqlite:///{tmp_path / 'constraints.db'}"
    test_engine = create_db_engine(db_url)
    try:
        init_db(test_engine)

        with test_engine.connect() as conn:
            fk_enabled = conn.execute(text("PRAGMA foreign_keys")).scalar_one()
            assert fk_enabled == 1

        with Session(test_engine) as db:
            user = User(
                email="alembic_fk@diffly.dev",
                username="alembic_fk_user",
                hashed_password="hashed-password",
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            assert user.id is not None

            bad_challenge = Challenge(
                slug="bad-dual-owner-ch",
                title="Bad Dual Owner Challenge",
                difficulty=Difficulty.EASY,
                category=Category.SECURITY,
                language=Language.PYTHON,
                description="desc",
                code_snippet="x = 1",
                is_public=False,
                user_id=user.id,
                session_id="g_dual_owner",
            )
            db.add(bad_challenge)
            with pytest.raises(IntegrityError):
                db.commit()
            db.rollback()

            owned_challenge = Challenge(
                slug="owned-custom-ch",
                title="Owned Custom Challenge",
                difficulty=Difficulty.MEDIUM,
                category=Category.SECURITY,
                language=Language.JAVA,
                description="desc",
                code_snippet="class A {}",
                is_public=False,
                user_id=user.id,
            )
            public_challenge = Challenge(
                slug="public-cascade-ch",
                title="Public Cascade Challenge",
                difficulty=Difficulty.EASY,
                category=Category.LOGIC_FLAWS,
                language=Language.PYTHON,
                description="desc",
                code_snippet="x = 1",
                is_public=True,
            )
            db.add(owned_challenge)
            db.add(public_challenge)
            db.commit()
            db.refresh(owned_challenge)
            db.refresh(public_challenge)
            assert owned_challenge.id is not None
            assert public_challenge.id is not None

            bad_submission = Submission(
                challenge_id=public_challenge.id,
                user_id=user.id,
                session_id="g_dual_owner",
                flagged_lines=[1],
                comments="Dual owner submission",
                score=50,
            )
            db.add(bad_submission)
            with pytest.raises(IntegrityError):
                db.commit()
            db.rollback()

            user_submission = Submission(
                challenge_id=public_challenge.id,
                user_id=user.id,
                flagged_lines=[1],
                comments="Owned submission",
                score=90,
            )
            db.add(user_submission)
            db.commit()
            db.refresh(user_submission)
            assert user_submission.id is not None

            user_id = user.id
            owned_ch_id = owned_challenge.id
            pub_ch_id = public_challenge.id
            sub_id = user_submission.id

        with test_engine.begin() as conn:
            conn.execute(text("DELETE FROM users WHERE id = :id"), {"id": user_id})

        with Session(test_engine) as db:
            reloaded_ch = db.get(Challenge, owned_ch_id)
            reloaded_sub = db.get(Submission, sub_id)
            assert reloaded_ch is not None
            assert reloaded_ch.user_id is None
            assert reloaded_sub is not None
            assert reloaded_sub.user_id is None

        with test_engine.begin() as conn:
            conn.execute(
                text("DELETE FROM challenges WHERE id = :id"), {"id": pub_ch_id}
            )

        with Session(test_engine) as db:
            assert db.get(Submission, sub_id) is None
    finally:
        test_engine.dispose()


def test_alembic_downgrade_base_and_upgrade_head_roundtrip(tmp_path):
    db_url = f"sqlite:///{tmp_path / 'roundtrip.db'}"
    cfg = Config(str(ALEMBIC_INI_PATH))
    cfg.set_main_option("script_location", str(ALEMBIC_SCRIPT_LOCATION))
    cfg.attributes["sqlalchemy.url"] = db_url
    cfg.attributes["configure_logger"] = False

    command.upgrade(cfg, "head")
    test_engine = create_db_engine(db_url)
    try:
        assert {
            "users",
            "challenges",
            "submissions",
            "coach_threads",
            "coach_messages",
            "alembic_version",
        }.issubset(set(inspect(test_engine).get_table_names()))
    finally:
        test_engine.dispose()

    command.downgrade(cfg, "base")
    test_engine = create_db_engine(db_url)
    try:
        table_names = set(inspect(test_engine).get_table_names())
        assert "users" not in table_names
        assert "challenges" not in table_names
        assert "submissions" not in table_names
        assert "coach_threads" not in table_names
        assert "coach_messages" not in table_names
    finally:
        test_engine.dispose()

    command.upgrade(cfg, "head")
    test_engine = create_db_engine(db_url)
    try:
        assert {
            "users",
            "challenges",
            "submissions",
            "coach_threads",
            "coach_messages",
            "alembic_version",
        }.issubset(set(inspect(test_engine).get_table_names()))
        with test_engine.connect() as conn:
            migration_ctx = MigrationContext.configure(
                conn, opts={"compare_type": True}
            )
            assert compare_metadata(migration_ctx, SQLModel.metadata) == []
    finally:
        test_engine.dispose()


def test_get_session_yields_session():
    gen: Generator[Session, None, None] = get_session()
    session = next(gen)
    assert isinstance(session, Session)
    # Complete generator cleanly
    with contextlib.suppress(StopIteration):
        next(gen)


def test_get_session_rollback_and_close_on_exception():
    mock_session = MagicMock(spec=Session)

    with patch("backend.core.db.Session", return_value=mock_session):
        gen = get_session()
        sess = next(gen)
        assert sess == mock_session

        test_exception = RuntimeError("Database operation failed")
        with pytest.raises(RuntimeError, match="Database operation failed"):
            gen.throw(test_exception)

        mock_session.rollback.assert_called_once()
        mock_session.close.assert_called_once()


def test_get_session_closes_on_normal_exit():
    mock_session = MagicMock(spec=Session)

    with patch("backend.core.db.Session", return_value=mock_session):
        gen = get_session()
        _ = next(gen)
        with contextlib.suppress(StopIteration):
            next(gen)

        mock_session.close.assert_called_once()
        mock_session.rollback.assert_not_called()


def test_session_dependency_injection_route(client: TestClient, session: Session):
    # Dynamically mount a test route that relies on get_session
    test_sub_app = FastAPI()

    @test_sub_app.get("/test-db-user")
    def create_and_get_user(db: Annotated[Session, Depends(get_session)]):
        user = User(
            email="fixture@diffly.dev",
            username="fixtureuser",
            hashed_password="pw",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return {"id": user.id, "username": user.username}

    # Verify dependency override works via client fixture
    def override_get_session():
        yield session

    test_sub_app.dependency_overrides[get_session] = override_get_session
    with TestClient(test_sub_app) as sub_client:
        res = sub_client.get("/test-db-user")
        assert res.status_code == 200
        data = res.json()
        assert data["username"] == "fixtureuser"

        # Check that user exists in session
        statement = select(User).where(User.username == "fixtureuser")
        db_user = session.exec(statement).first()
        assert db_user is not None
        assert db_user.email == "fixture@diffly.dev"


def test_database_isolation_between_tests_part1(session: Session):
    # Insert a user in this test
    user = User(
        email="iso1@diffly.dev",
        username="iso1",
        hashed_password="pw1",
    )
    session.add(user)
    session.commit()
    users = session.exec(select(User)).all()
    assert len(users) == 1


def test_database_isolation_between_tests_part2(session: Session):
    # Verify that part1's user is NOT present due to StaticPool per-test isolation
    users = session.exec(select(User)).all()
    assert len(users) == 0


def test_startup_guard_rejects_default_secret_in_production():
    for kwargs in (
        {"ENVIRONMENT": "production"},
        {"NODE_ENV": "production"},
        {"COOKIE_SECURE": True},
    ):
        with pytest.raises(RuntimeError, match="default development secret"):
            Settings(**kwargs)


def test_startup_guard_rejects_short_secret_in_production():
    with pytest.raises(RuntimeError, match="at least 32 characters"):
        Settings(ENVIRONMENT="production", JWT_SECRET_KEY="too-short-secret")

    with pytest.raises(RuntimeError, match="at least 32 characters"):
        Settings(COOKIE_SECURE=True, JWT_SECRET_KEY="   31-chars-padded-with-spaces   ")


def test_startup_guard_allows_strong_secret_in_production_and_default_in_dev():
    prod_settings = Settings(
        ENVIRONMENT="production",
        JWT_SECRET_KEY="a-very-strong-production-secret-key-32-plus-chars",
    )
    assert prod_settings.is_cookie_secure is True

    dev_settings = Settings(ENVIRONMENT="development")
    assert dev_settings.is_cookie_secure is False


def test_app_lifespan_fails_fast_with_unsafe_production_secret(monkeypatch):
    from api.index import app

    monkeypatch.setattr(settings, "ENVIRONMENT", "production")
    with pytest.raises(RuntimeError, match="Insecure JWT_SECRET_KEY"), TestClient(app):
        pass

    monkeypatch.setattr(settings, "JWT_SECRET_KEY", "short-key")
    with pytest.raises(RuntimeError, match="at least 32 characters"), TestClient(app):
        pass

    monkeypatch.setattr(
        settings,
        "JWT_SECRET_KEY",
        "valid-production-secret-with-more-than-32-characters",
    )
    with (
        patch("api.index.init_db"),
        patch("api.index.seed_missing_challenges"),
        TestClient(app) as tc,
    ):
        assert tc is not None


def test_app_lifespan_runs_init_db_on_vercel(monkeypatch):
    from api.index import app

    monkeypatch.setattr(settings, "VERCEL", "1")
    with (
        patch("api.index.init_db") as mock_init_db,
        patch("api.index.seed_missing_challenges") as mock_seed,
        TestClient(app),
    ):
        mock_init_db.assert_called_once()
        mock_seed.assert_called_once()

    monkeypatch.setattr(settings, "VERCEL", None)
    with (
        patch("api.index.init_db") as mock_init_db,
        patch("api.index.seed_missing_challenges") as mock_seed,
        TestClient(app),
    ):
        mock_init_db.assert_called_once()
        mock_seed.assert_called_once()


def test_run_migrations_skips_upgrade_when_already_at_head(tmp_path):
    db_url = f"sqlite:///{tmp_path / 'at_head.db'}"
    test_engine = create_db_engine(db_url)
    try:
        run_migrations(test_engine)
        with patch("backend.core.db.command.upgrade") as mock_upgrade:
            run_migrations(test_engine)
            mock_upgrade.assert_not_called()
    finally:
        test_engine.dispose()


def test_settings_is_vercel_parsing():
    assert Settings(VERCEL=None).is_vercel is False
    assert Settings(VERCEL="0").is_vercel is False
    assert Settings(VERCEL="false").is_vercel is False
    assert Settings(VERCEL="1").is_vercel is True
    assert Settings(VERCEL="true").is_vercel is True


def test_run_migrations_rejects_pre_alembic_legacy_database(tmp_path):
    db_url = f"sqlite:///{tmp_path / 'legacy.db'}"
    test_engine = create_db_engine(db_url)
    try:
        with test_engine.begin() as conn:
            conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))

        with pytest.raises(RuntimeError, match="alembic stamp head"):
            run_migrations(test_engine)
    finally:
        test_engine.dispose()


def test_alembic_autocommit_block_succeeds_in_run_migrations_and_cli_env(tmp_path):
    import shutil

    script_dir = tmp_path / "alembic"
    shutil.copytree(ALEMBIC_SCRIPT_LOCATION, script_dir)
    probe_cfg = Config(str(ALEMBIC_INI_PATH))
    probe_cfg.set_main_option("script_location", str(script_dir))
    head_rev = ScriptDirectory.from_config(probe_cfg).get_current_head()
    (script_dir / "versions" / "9999_autocommit_probe.py").write_text(
        '"""Autocommit probe.\n\n'
        "Revision ID: 9999_autocommit_probe\n"
        f"Revises: {head_rev}\n"
        '"""\n\n'
        "from alembic import op\n\n"
        'revision = "9999_autocommit_probe"\n'
        f'down_revision = "{head_rev}"\n'
        "branch_labels = None\n"
        "depends_on = None\n\n\n"
        "def upgrade() -> None:\n"
        "    with op.get_context().autocommit_block():\n"
        '        op.execute("SELECT 1")\n\n\n'
        "def downgrade() -> None:\n"
        "    pass\n",
        encoding="utf-8",
    )

    cli_db_url = f"sqlite:///{tmp_path / 'cli_autocommit.db'}"
    cfg = Config(str(ALEMBIC_INI_PATH))
    cfg.set_main_option("script_location", str(script_dir))
    cfg.attributes["sqlalchemy.url"] = cli_db_url
    cfg.attributes["configure_logger"] = False
    command.upgrade(cfg, "head")

    inproc_engine = create_db_engine(f"sqlite:///{tmp_path / 'inproc_autocommit.db'}")
    try:
        with patch("backend.core.db.ALEMBIC_SCRIPT_LOCATION", script_dir):
            run_migrations(inproc_engine)
    finally:
        inproc_engine.dispose()


def test_alembic_sqlite_batch_alter_preserves_foreign_key_owners(tmp_path):
    import shutil

    db_url = f"sqlite:///{tmp_path / 'batch_fk.db'}"
    test_engine = create_db_engine(db_url)
    try:
        run_migrations(test_engine)

        with Session(test_engine) as db:
            user = User(
                email="batch@diffly.dev",
                username="batchuser",
                hashed_password="pw",
            )
            db.add(user)
            db.commit()
            db.refresh(user)
            assert user.id is not None

            challenge = Challenge(
                slug="batch-owned-challenge",
                title="Batch Owned",
                difficulty=Difficulty.EASY,
                category=Category.SECURITY,
                language=Language.PYTHON,
                description="desc",
                code_snippet="x = 1",
                is_public=False,
                user_id=user.id,
            )
            db.add(challenge)
            db.commit()
            db.refresh(challenge)
            assert challenge.id is not None

            sub = Submission(
                challenge_id=challenge.id,
                user_id=user.id,
                flagged_lines=[1],
                comments="note",
                score=80,
            )
            db.add(sub)
            db.commit()
            db.refresh(sub)
            user_id = user.id
            ch_id = challenge.id
            sub_id = sub.id

        script_dir = tmp_path / "alembic"
        shutil.copytree(ALEMBIC_SCRIPT_LOCATION, script_dir)
        batch_cfg = Config(str(ALEMBIC_INI_PATH))
        batch_cfg.set_main_option("script_location", str(script_dir))
        head_rev = ScriptDirectory.from_config(batch_cfg).get_current_head()
        (script_dir / "versions" / "9999_batch_users.py").write_text(
            '"""Batch rebuild users.\n\n'
            "Revision ID: 9999_batch_users\n"
            f"Revises: {head_rev}\n"
            '"""\n\n'
            "import sqlalchemy as sa\n"
            "from alembic import op\n\n"
            'revision = "9999_batch_users"\n'
            f'down_revision = "{head_rev}"\n'
            "branch_labels = None\n"
            "depends_on = None\n\n\n"
            "def upgrade() -> None:\n"
            '    with op.batch_alter_table("users", recreate="always") as batch_op:\n'
            "        batch_op.add_column(\n"
            '            sa.Column("display_note", sa.String(), nullable=True)\n'
            "        )\n\n\n"
            "def downgrade() -> None:\n"
            '    with op.batch_alter_table("users", recreate="always") as batch_op:\n'
            '        batch_op.drop_column("display_note")\n',
            encoding="utf-8",
        )

        with patch("backend.core.db.ALEMBIC_SCRIPT_LOCATION", script_dir):
            run_migrations(test_engine)

        with test_engine.connect() as conn:
            assert conn.execute(text("PRAGMA foreign_keys")).scalar_one() == 1
            ch_owner = conn.execute(
                text("SELECT user_id FROM challenges WHERE id = :id"), {"id": ch_id}
            ).scalar_one()
            sub_owner = conn.execute(
                text("SELECT user_id FROM submissions WHERE id = :id"), {"id": sub_id}
            ).scalar_one()
            assert ch_owner == user_id
            assert sub_owner == user_id

        user_indexes = {
            idx["name"]: idx for idx in inspect(test_engine).get_indexes("users")
        }
        assert user_indexes["ix_users_email_lower"]["unique"] == 1
        assert user_indexes["ix_users_username_lower"]["unique"] == 1

        with Session(test_engine) as db:
            db.add(
                User(
                    email="BATCH@DIFFLY.DEV",
                    username="other_batch_user",
                    hashed_password="pw",
                )
            )
            with pytest.raises(IntegrityError):
                db.commit()
            db.rollback()
    finally:
        test_engine.dispose()


def test_alembic_postgres_offline_sql_generation_and_percent_url():
    import io

    pg_url = "postgresql://user:p%40ss%25word@ep-bold.us-east-2.aws.neon.tech/neondb"
    upgrade_buf = io.StringIO()
    cfg_up = Config(str(ALEMBIC_INI_PATH), stdout=upgrade_buf)
    cfg_up.set_main_option("script_location", str(ALEMBIC_SCRIPT_LOCATION))
    cfg_up.attributes["sqlalchemy.url"] = pg_url
    cfg_up.attributes["configure_logger"] = False
    command.upgrade(cfg_up, "head", sql=True)
    up_sql = upgrade_buf.getvalue()
    assert "CREATE TABLE users" in up_sql
    assert "ck_challenges_single_owner" in up_sql
    assert "ck_submissions_single_owner" in up_sql
    assert "JAVA" in up_sql
    assert "ix_users_email_lower" in up_sql
    assert "ix_users_username_lower" in up_sql
    assert "content_hash" in up_sql
    assert "share_token" in up_sql
    assert "CREATE TABLE coach_threads" in up_sql
    assert "CREATE TABLE coach_messages" in up_sql
    assert "ck_coach_threads_single_owner" in up_sql
    assert "ck_coach_threads_mode" in up_sql
    assert "ck_coach_messages_role" in up_sql
    assert "PRIMARY KEY (thread_id, id)" in up_sql
    assert "ix_coach_messages_thread_id" not in up_sql

    downgrade_buf = io.StringIO()
    cfg_down = Config(str(ALEMBIC_INI_PATH), stdout=downgrade_buf)
    cfg_down.set_main_option("script_location", str(ALEMBIC_SCRIPT_LOCATION))
    cfg_down.attributes["sqlalchemy.url"] = pg_url
    cfg_down.attributes["configure_logger"] = False
    command.downgrade(cfg_down, "head:base", sql=True)
    down_sql = downgrade_buf.getvalue()
    assert "DROP COLUMN share_token" in down_sql
    assert "DROP COLUMN content_hash" in down_sql
    assert "DROP INDEX ix_users_email_lower" in down_sql
    assert "DROP INDEX ix_users_username_lower" in down_sql
    assert "DROP TABLE coach_messages" in down_sql
    assert "DROP TABLE coach_threads" in down_sql
    assert "DROP TABLE submissions" in down_sql
    assert "DROP TYPE language" in down_sql


def test_alembic_0002_backfills_existing_users_unicode_lowercase(tmp_path):
    db_url = f"sqlite:///{tmp_path / 'backfill.db'}"
    cfg = Config(str(ALEMBIC_INI_PATH))
    cfg.set_main_option("script_location", str(ALEMBIC_SCRIPT_LOCATION))
    cfg.attributes["sqlalchemy.url"] = db_url
    cfg.attributes["configure_logger"] = False

    command.upgrade(cfg, "0001_initial_schema")

    test_engine = create_db_engine(db_url)
    try:
        with test_engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO users "
                    "(email, username, avatar_url, is_active, hashed_password, "
                    "created_at, updated_at) "
                    "VALUES (:email, :username, NULL, 1, 'pw', "
                    "'2026-01-01 00:00:00', '2026-01-01 00:00:00')"
                ),
                {"email": "  Üser@Example.COM ", "username": " ÜserName "},
            )
    finally:
        test_engine.dispose()

    command.upgrade(cfg, "head")

    test_engine = create_db_engine(db_url)
    try:
        with test_engine.connect() as conn:
            row = conn.execute(
                text("SELECT email_lower, username_lower FROM users")
            ).one()
            assert row.email_lower == "üser@example.com"
            assert row.username_lower == "üsername"
    finally:
        test_engine.dispose()


def test_alembic_0003_adds_content_hash_and_preserves_challenges(tmp_path):
    db_url = f"sqlite:///{tmp_path / 'content_hash_mig.db'}"
    cfg = Config(str(ALEMBIC_INI_PATH))
    cfg.set_main_option("script_location", str(ALEMBIC_SCRIPT_LOCATION))
    cfg.attributes["sqlalchemy.url"] = db_url
    cfg.attributes["configure_logger"] = False

    command.upgrade(cfg, "0002_case_insensitive_user_indexes")

    test_engine = create_db_engine(db_url)
    try:
        with test_engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO challenges "
                    "(slug, title, difficulty, category, language, description, "
                    "threat_model, defect_target, code_snippet, expected_issues, "
                    "hints, canonical_review, recommended_fix_diff, "
                    "estimated_minutes, is_public, created_at) "
                    "VALUES ('legacy-ch', 'Legacy', 'EASY', 'SECURITY', 'PYTHON', "
                    "'desc', '', '', 'x = 1', '[]', '[]', '', '', 5, 1, "
                    "'2026-01-01 00:00:00')"
                )
            )
    finally:
        test_engine.dispose()

    command.upgrade(cfg, "head")

    test_engine = create_db_engine(db_url)
    try:
        cols = {c["name"] for c in inspect(test_engine).get_columns("challenges")}
        assert "content_hash" in cols
        with test_engine.connect() as conn:
            row = conn.execute(
                text(
                    "SELECT slug, content_hash FROM challenges WHERE slug = 'legacy-ch'"
                )
            ).one()
            assert row.slug == "legacy-ch"
            assert row.content_hash is None
    finally:
        test_engine.dispose()


def test_alembic_0005_adds_share_token_with_nullable_uniqueness(tmp_path):
    db_url = f"sqlite:///{tmp_path / 'share_token_mig.db'}"
    cfg = Config(str(ALEMBIC_INI_PATH))
    cfg.set_main_option("script_location", str(ALEMBIC_SCRIPT_LOCATION))
    cfg.attributes["sqlalchemy.url"] = db_url
    cfg.attributes["configure_logger"] = False

    command.upgrade(cfg, "0004_composite_indexes_and_submission_scores")

    test_engine = create_db_engine(db_url)
    try:
        with test_engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO challenges "
                    "(slug, title, difficulty, category, language, description, "
                    "threat_model, defect_target, code_snippet, expected_issues, "
                    "hints, canonical_review, recommended_fix_diff, "
                    "estimated_minutes, is_public, created_at) "
                    "VALUES ('pre-share-ch', 'Pre Share', 'EASY', 'SECURITY', "
                    "'PYTHON', 'desc', '', '', 'x = 1', '[]', '[]', '', '', 5, 1, "
                    "'2026-01-01 00:00:00')"
                )
            )
    finally:
        test_engine.dispose()

    command.upgrade(cfg, "head")

    test_engine = create_db_engine(db_url)
    try:
        cols = {c["name"] for c in inspect(test_engine).get_columns("challenges")}
        assert "share_token" in cols
        indexes = {
            idx["name"]: idx for idx in inspect(test_engine).get_indexes("challenges")
        }
        assert indexes["ix_challenges_share_token"]["unique"] == 1

        with Session(test_engine) as db:
            # Multiple challenges with share_token=None are permitted
            db.add_all(
                [
                    Challenge(
                        slug="null-share-1",
                        title="Null Share 1",
                        difficulty=Difficulty.EASY,
                        category=Category.SECURITY,
                        language=Language.PYTHON,
                        description="desc",
                        code_snippet="x = 1",
                        is_public=False,
                        share_token=None,
                    ),
                    Challenge(
                        slug="null-share-2",
                        title="Null Share 2",
                        difficulty=Difficulty.EASY,
                        category=Category.SECURITY,
                        language=Language.PYTHON,
                        description="desc",
                        code_snippet="x = 1",
                        is_public=False,
                        share_token=None,
                    ),
                ]
            )
            db.commit()

            # Duplicate non-null share_token is rejected by unique index
            db.add(
                Challenge(
                    slug="dup-share-1",
                    title="Dup Share 1",
                    difficulty=Difficulty.EASY,
                    category=Category.SECURITY,
                    language=Language.PYTHON,
                    description="desc",
                    code_snippet="x = 1",
                    is_public=False,
                    share_token="shared-token-dup-check",
                )
            )
            db.commit()
            db.add(
                Challenge(
                    slug="dup-share-2",
                    title="Dup Share 2",
                    difficulty=Difficulty.EASY,
                    category=Category.SECURITY,
                    language=Language.PYTHON,
                    description="desc",
                    code_snippet="x = 1",
                    is_public=False,
                    share_token="shared-token-dup-check",
                )
            )
            with pytest.raises(IntegrityError):
                db.commit()
            db.rollback()
    finally:
        test_engine.dispose()

    command.downgrade(cfg, "0004_composite_indexes_and_submission_scores")
    test_engine = create_db_engine(db_url)
    try:
        cols_after_downgrade = {
            c["name"] for c in inspect(test_engine).get_columns("challenges")
        }
        assert "share_token" not in cols_after_downgrade
        with test_engine.connect() as conn:
            remaining_slugs = {
                row[0] for row in conn.execute(text("SELECT slug FROM challenges"))
            }
            assert {"pre-share-ch", "null-share-1", "dup-share-1"} <= remaining_slugs
    finally:
        test_engine.dispose()

    command.upgrade(cfg, "head")
    test_engine = create_db_engine(db_url)
    try:
        cols_after_reupgrade = {
            c["name"] for c in inspect(test_engine).get_columns("challenges")
        }
        assert "share_token" in cols_after_reupgrade
        with Session(test_engine) as db:
            reupgraded_slugs = {row.slug for row in db.exec(select(Challenge)).all()}
            assert {"pre-share-ch", "null-share-1", "dup-share-1"} <= reupgraded_slugs
    finally:
        test_engine.dispose()


def test_requirements_separate_runtime_and_dev_dependencies():
    from pathlib import Path

    root = Path(__file__).resolve().parents[1]
    runtime_reqs = (root / "requirements.txt").read_text(encoding="utf-8")
    dev_reqs = (root / "requirements-dev.txt").read_text(encoding="utf-8")

    for dev_pkg in ("pytest", "pytest-cov", "ruff"):
        assert dev_pkg not in runtime_reqs
        assert dev_pkg in dev_reqs
    assert "-r requirements.txt" in dev_reqs
