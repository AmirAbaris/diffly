from contextlib import contextmanager
from logging.config import fileConfig
from typing import Any, Literal

from sqlalchemy import Connection, create_engine, pool
from sqlmodel import SQLModel
from sqlmodel.sql.sqltypes import AutoString, UTCDateTime

import backend.models  # noqa: F401
from alembic import context
from backend.core.config import normalize_database_url, settings
from backend.core.db import resolve_sqlalchemy_url


config = context.config

if config.config_file_name is not None and config.attributes.get(
    "configure_logger", True
):
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = SQLModel.metadata


def _get_database_url() -> str:
    attr_url = config.attributes.get("sqlalchemy.url")
    if isinstance(attr_url, str) and attr_url.strip():
        return resolve_sqlalchemy_url(normalize_database_url(attr_url))

    configured_url = config.get_main_option("sqlalchemy.url")
    if configured_url and configured_url.strip():
        return resolve_sqlalchemy_url(normalize_database_url(configured_url))

    return resolve_sqlalchemy_url(normalize_database_url(settings.DATABASE_URL))


def _render_item(type_: str, obj: Any, autogen_context: Any) -> str | Literal[False]:
    if type_ == "type":
        if isinstance(obj, AutoString):
            length = getattr(obj, "length", None)
            return (
                f"sa.String(length={length})" if length is not None else "sa.String()"
            )
        if isinstance(obj, UTCDateTime):
            return "sa.DateTime(timezone=True)"
    return False


@contextmanager
def _sqlite_foreign_keys_disabled(connection: Connection):
    """Disable SQLite FK enforcement via DBAPI outside SQLAlchemy transactions."""
    if connection.dialect.name != "sqlite" or connection.in_transaction():
        yield
        return

    raw_conn = connection.connection
    dbapi_conn = getattr(raw_conn, "dbapi_connection", None)
    if dbapi_conn is None:
        yield
        return

    cursor = dbapi_conn.cursor()
    try:
        cursor.execute("PRAGMA foreign_keys")
        row = cursor.fetchone()
        previous = bool(row[0]) if row else False
        cursor.execute("PRAGMA foreign_keys=OFF")
    finally:
        cursor.close()

    try:
        yield
    finally:
        restore_cursor = dbapi_conn.cursor()
        try:
            restore_cursor.execute(f"PRAGMA foreign_keys={'ON' if previous else 'OFF'}")
        finally:
            restore_cursor.close()


def _configure_and_run(connection: Connection) -> None:
    with _sqlite_foreign_keys_disabled(connection):
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
            compare_type=True,
            render_item=_render_item,
        )
        with context.begin_transaction():
            context.run_migrations()


def run_migrations_offline() -> None:
    url = _get_database_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
        compare_type=True,
        render_item=_render_item,
        output_buffer=config.stdout,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    existing_connection: Connection | None = config.attributes.get("connection")
    if existing_connection is not None:
        _configure_and_run(existing_connection)
        return

    connectable = create_engine(_get_database_url(), poolclass=pool.NullPool)
    try:
        with connectable.connect() as connection:
            _configure_and_run(connection)
    finally:
        connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
