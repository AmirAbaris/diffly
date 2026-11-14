from collections.abc import Callable, Generator
from itertools import count
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

import backend.models  # noqa: F401
from api.index import app
from backend.core.db import get_session


DEFAULT_TEST_PASSWORD = "TestPassword123!"
_USER_COUNTER = count(1)


@pytest.fixture(name="engine")
def engine_fixture():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    yield engine
    SQLModel.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture(name="session")
def session_fixture(engine) -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


@pytest.fixture(name="client_factory")
def client_factory_fixture(
    session: Session,
) -> Generator[Callable[[], TestClient], None, None]:
    def get_session_override() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[get_session] = get_session_override
    created_clients: list[TestClient] = []

    def _create_client() -> TestClient:
        test_client = TestClient(app)
        created_clients.append(test_client)
        return test_client

    yield _create_client

    for test_client in created_clients:
        test_client.close()
    app.dependency_overrides.clear()


@pytest.fixture(name="client")
def client_fixture(session: Session) -> Generator[TestClient, None, None]:
    def get_session_override() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[get_session] = get_session_override
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture(name="register_user")
def register_user_fixture(
    client_factory: Callable[[], TestClient],
) -> Callable[..., dict[str, Any]]:
    def _register_user(
        username: str | None = None,
        *,
        email: str | None = None,
        password: str = DEFAULT_TEST_PASSWORD,
        session_id: str | None = None,
    ) -> dict[str, Any]:
        idx = next(_USER_COUNTER)
        resolved_username = username or f"testuser_{idx}"
        resolved_email = email or f"{resolved_username}@diffly.dev"
        payload: dict[str, Any] = {
            "email": resolved_email,
            "username": resolved_username,
            "password": password,
        }
        if session_id is not None:
            payload["session_id"] = session_id

        reg_client = client_factory()
        res = reg_client.post("/api/auth/register", json=payload)
        assert res.status_code == 200, res.text
        user_data: dict[str, Any] = res.json()
        user_data["password"] = password
        return user_data

    return _register_user


@pytest.fixture(name="login_as")
def login_as_fixture(
    client_factory: Callable[[], TestClient],
) -> Callable[..., TestClient]:
    def _login_as(
        identifier: str,
        *,
        password: str = DEFAULT_TEST_PASSWORD,
        session_id: str | None = None,
    ) -> TestClient:
        payload: dict[str, Any] = {
            "identifier": identifier,
            "password": password,
        }
        if session_id is not None:
            payload["session_id"] = session_id

        auth_client = client_factory()
        res = auth_client.post("/api/auth/login", json=payload)
        assert res.status_code == 200, res.text
        return auth_client

    return _login_as
