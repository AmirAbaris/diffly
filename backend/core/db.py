import importlib.util
from collections.abc import Generator
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlsplit

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import Engine, event, inspect, text
from sqlalchemy.pool import NullPool
from sqlmodel import Session, create_engine

from alembic import command
from backend.core.config import Settings, settings


PROJECT_ROOT = Path(__file__).resolve().parents[2]
ALEMBIC_INI_PATH = PROJECT_ROOT / "alembic.ini"
ALEMBIC_SCRIPT_LOCATION = PROJECT_ROOT / "alembic"


@dataclass(frozen=True, slots=True)
class DatabaseConfig:
    url: str
    driver: str
    is_neon: bool
    is_pooled_endpoint: bool
    is_serverless: bool
    use_null_pool: bool
    connect_args: dict[str, Any]
    pool_pre_ping: bool
    pool_recycle: int | None
    pool_size: int | None
    max_overflow: int | None


def resolve_database_config(source: Settings | str | None = None) -> DatabaseConfig:
    if source is None:
        cfg_settings = settings
        raw_url = cfg_settings.DATABASE_URL
    elif isinstance(source, Settings):
        cfg_settings = source
        raw_url = cfg_settings.DATABASE_URL
    else:
        cfg_settings = settings
        raw_url = str(source)

    normalized_url = raw_url.strip()
    parsed = urlsplit(normalized_url)
    scheme = parsed.scheme.lower()
    hostname = (parsed.hostname or "").lower()

    is_sqlite = scheme.startswith("sqlite")
    is_neon = hostname.endswith(".neon.tech")
    is_pooled = "-pooler" in hostname
    is_serverless = cfg_settings.is_vercel

    if is_sqlite:
        return DatabaseConfig(
            url=normalized_url,
            driver="sqlite",
            is_neon=False,
            is_pooled_endpoint=False,
            is_serverless=is_serverless,
            use_null_pool=False,
            connect_args={"check_same_thread": False, "timeout": 30},
            pool_pre_ping=False,
            pool_recycle=None,
            pool_size=None,
            max_overflow=None,
        )

    use_null_pool = is_pooled or is_serverless
    connect_args: dict[str, Any] = {}
    qs = parse_qs(parsed.query, keep_blank_values=True)
    if (
        (is_pooled or is_neon or is_serverless)
        and not scheme.endswith("+asyncpg")
        and "connect_timeout" not in qs
    ):
        connect_args["connect_timeout"] = cfg_settings.DB_CONNECT_TIMEOUT

    if use_null_pool:
        return DatabaseConfig(
            url=normalized_url,
            driver="postgresql",
            is_neon=is_neon,
            is_pooled_endpoint=is_pooled,
            is_serverless=is_serverless,
            use_null_pool=True,
            connect_args=connect_args,
            pool_pre_ping=False,
            pool_recycle=None,
            pool_size=None,
            max_overflow=None,
        )

    return DatabaseConfig(
        url=normalized_url,
        driver="postgresql",
        is_neon=is_neon,
        is_pooled_endpoint=is_pooled,
        is_serverless=is_serverless,
        use_null_pool=False,
        connect_args=connect_args,
        pool_pre_ping=cfg_settings.DB_POOL_PRE_PING,
        pool_recycle=cfg_settings.DB_POOL_RECYCLE_SECONDS,
        pool_size=cfg_settings.DB_POOL_SIZE,
        max_overflow=cfg_settings.DB_MAX_OVERFLOW,
    )


def build_engine_kwargs(source: Settings | str | None = None) -> dict[str, Any]:
    config = resolve_database_config(source)
    kwargs: dict[str, Any] = {
        "echo": False,
        "connect_args": dict(config.connect_args),
    }

    if config.use_null_pool:
        kwargs["poolclass"] = NullPool
        return kwargs

    if config.pool_pre_ping:
        kwargs["pool_pre_ping"] = True
    if config.pool_recycle is not None:
        kwargs["pool_recycle"] = config.pool_recycle
    if config.pool_size is not None:
        kwargs["pool_size"] = config.pool_size
    if config.max_overflow is not None:
        kwargs["max_overflow"] = config.max_overflow

    return kwargs


def _register_sqlite_listeners(target_engine: Engine) -> None:
    @event.listens_for(target_engine, "connect")
    def _set_sqlite_pragma(dbapi_connection: Any, _connection_record: Any) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()


def resolve_sqlalchemy_url(url: str) -> str:
    if (
        url.startswith("postgresql://")
        and importlib.util.find_spec("psycopg") is None
        and importlib.util.find_spec("psycopg2") is not None
    ):
        return "postgresql+psycopg2://" + url[len("postgresql://") :]
    return url


def create_db_engine(source: Settings | str | None = None) -> Engine:
    config = resolve_database_config(source)
    kwargs = build_engine_kwargs(source)
    new_engine = create_engine(resolve_sqlalchemy_url(config.url), **kwargs)

    if config.driver == "sqlite":
        _register_sqlite_listeners(new_engine)

    return new_engine


engine = create_db_engine()


def run_migrations(target_engine: Engine | None = None, revision: str = "head") -> None:
    """Apply Alembic migrations on the given (or default) engine."""
    resolved_engine = target_engine if target_engine is not None else engine
    alembic_cfg = Config(str(ALEMBIC_INI_PATH))
    alembic_cfg.set_main_option("script_location", str(ALEMBIC_SCRIPT_LOCATION))
    alembic_cfg.attributes["configure_logger"] = False

    with resolved_engine.connect() as connection:
        table_names = set(inspect(connection).get_table_names())
        if connection.in_transaction():
            connection.rollback()
        app_tables = {
            "users",
            "challenges",
            "submissions",
            "coach_threads",
            "coach_messages",
        }
        if "alembic_version" not in table_names and (table_names & app_tables):
            existing = ", ".join(sorted(table_names & app_tables))
            raise RuntimeError(
                f"Pre-Alembic database detected (existing tables: {existing}; "
                "missing alembic_version). Verify schema constraints and enums, then "
                "run `alembic stamp head` (or recreate a local dev database)."
            )
        if revision == "head" and "alembic_version" in table_names:
            current_versions = {
                row[0]
                for row in connection.execute(
                    text("SELECT version_num FROM alembic_version")
                ).fetchall()
            }
            head_versions = set(ScriptDirectory.from_config(alembic_cfg).get_heads())
            if connection.in_transaction():
                connection.rollback()
            if current_versions and current_versions == head_versions:
                return
        alembic_cfg.attributes["connection"] = connection
        command.upgrade(alembic_cfg, revision)


def init_db(target_engine: Engine | None = None) -> None:
    run_migrations(target_engine=target_engine)


def get_session() -> Generator[Session, None, None]:
    session = Session(engine)
    try:
        yield session
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
