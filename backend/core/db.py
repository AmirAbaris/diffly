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
