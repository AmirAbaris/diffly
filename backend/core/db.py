from collections.abc import Generator
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit

from sqlalchemy import Engine, event
from sqlmodel import Session, SQLModel, create_engine

from backend.core.config import Settings, settings


@dataclass(frozen=True, slots=True)
class DatabaseConfig:
    url: str
    driver: str
    is_neon: bool
    is_pooled_endpoint: bool
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

    if is_sqlite:
        return DatabaseConfig(
            url=normalized_url,
            driver="sqlite",
            is_neon=False,
            is_pooled_endpoint=False,
            connect_args={"check_same_thread": False, "timeout": 30},
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
        connect_args={},
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
        cursor.close()


def create_db_engine(source: Settings | str | None = None) -> Engine:
    config = resolve_database_config(source)
    kwargs = build_engine_kwargs(source)
    new_engine = create_engine(config.url, **kwargs)

    if config.driver == "sqlite":
        _register_sqlite_listeners(new_engine)

    return new_engine


engine = create_db_engine()


def init_db() -> None:
    import backend.models  # noqa: F401

    try:
        SQLModel.metadata.create_all(engine)
    except Exception as exc:
        err_msg = str(exc).lower()
        if "already exists" in err_msg or "locked" in err_msg:
            pass
        else:
            raise


def get_session() -> Generator[Session, None, None]:
    session = Session(engine)
    try:
        yield session
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
