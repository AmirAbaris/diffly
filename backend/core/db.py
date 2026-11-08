import os
from collections.abc import Generator

from sqlmodel import Session, SQLModel, create_engine


# Support NeonDB connection URL (PostgreSQL) with SQLite fallback for offline dev/tests
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./diffly.db")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    DATABASE_URL,
    echo=False,
    connect_args=connect_args,
)


def init_db() -> None:
    import backend.models  # noqa: F401

    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
