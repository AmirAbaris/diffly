import contextlib
from collections.abc import Generator
from typing import Annotated
from unittest.mock import MagicMock, patch

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlmodel import Session, create_engine, select

from backend.core.config import Settings, normalize_database_url, settings
from backend.core.db import (
    build_engine_kwargs,
    create_db_engine,
    get_session,
    init_db,
    resolve_database_config,
    resolve_sqlalchemy_url,
)
from backend.models import User


def test_default_settings():
    assert settings.DATABASE_URL == "sqlite:///./diffly.db"
    assert settings.JWT_SECRET_KEY == "diffly-dev-secret-key-change-in-production-only"
    assert settings.JWT_ALGORITHM == "HS256"
    assert settings.ACCESS_TOKEN_EXPIRE_MINUTES == 10080
    assert "http://localhost:3000" in settings.CORS_ORIGINS
    assert "http://localhost:8000" in settings.CORS_ORIGINS
    assert settings.CORS_ORIGIN_REGEX == r"^https://.*\.vercel\.app$"
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
    assert cfg.pool_pre_ping is True
    assert cfg.pool_recycle == 300
    assert cfg.pool_size == 5
    assert cfg.max_overflow == 10

    kwargs = build_engine_kwargs(neon_url)
    assert kwargs["pool_pre_ping"] is True
    assert kwargs["pool_recycle"] == 300
    assert kwargs["pool_size"] == 5
    assert kwargs["max_overflow"] == 10


def test_create_db_engine_sqlite():
    test_eng = create_db_engine("sqlite:///:memory:")
    assert test_eng.name == "sqlite"
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


def test_init_db_creates_all_tables():
    test_engine = create_engine("sqlite:///:memory:")
    try:
        with patch("backend.core.db.engine", test_engine):
            init_db()
            from sqlalchemy import inspect

            inspector = inspect(test_engine)
            table_names = set(inspector.get_table_names())
            assert "users" in table_names
            assert "challenges" in table_names
            assert "submissions" in table_names
    finally:
        test_engine.dispose()


def test_init_db_tolerates_duplicate_key_and_raises_unrelated_errors():
    with patch(
        "backend.core.db.SQLModel.metadata.create_all",
        side_effect=RuntimeError("duplicate key value violates unique constraint"),
    ):
        init_db()

    with (
        patch(
            "backend.core.db.SQLModel.metadata.create_all",
            side_effect=RuntimeError("connection refused"),
        ),
        pytest.raises(RuntimeError, match="connection refused"),
    ):
        init_db()


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
        patch("api.index.seed_challenges_if_empty"),
        TestClient(app) as tc,
    ):
        assert tc is not None
