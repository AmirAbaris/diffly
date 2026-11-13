from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine

from backend.core.config import settings


connect_args = (
    {"check_same_thread": False, "timeout": 30}
    if settings.DATABASE_URL.startswith("sqlite")
    else {}
)

engine = create_engine(
    settings.DATABASE_URL,
    echo=False,
    connect_args=connect_args,
)


def init_db() -> None:
    from sqlalchemy import inspect, text

    import backend.models  # noqa: F401

    try:
        SQLModel.metadata.create_all(engine)
    except Exception as exc:
        err_msg = str(exc).lower()
        if "already exists" in err_msg or "locked" in err_msg:
            pass
        else:
            raise

    # Safe lightweight schema migration for existing SQLite / Postgres tables
    try:
        inspector = inspect(engine)
        if "challenges" in inspector.get_table_names():
            columns = {c["name"] for c in inspector.get_columns("challenges")}
            with engine.connect() as conn:
                if "is_public" not in columns:
                    conn.execute(
                        text(
                            "ALTER TABLE challenges "
                            "ADD COLUMN is_public BOOLEAN DEFAULT 1"
                        )
                    )
                if "user_id" not in columns:
                    conn.execute(
                        text(
                            "ALTER TABLE challenges "
                            "ADD COLUMN user_id INTEGER DEFAULT NULL"
                        )
                    )
                if "session_id" not in columns:
                    conn.execute(
                        text(
                            "ALTER TABLE challenges "
                            "ADD COLUMN session_id VARCHAR DEFAULT NULL"
                        )
                    )
                conn.commit()
    except Exception:
        pass


def get_session() -> Generator[Session, None, None]:
    session = Session(engine)
    try:
        yield session
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
