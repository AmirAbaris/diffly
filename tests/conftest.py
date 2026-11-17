import time
from collections.abc import Callable, Generator
from itertools import count
from typing import Any
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

import backend.models  # noqa: F401
from api.index import app
from backend.core.config import settings
from backend.core.db import get_session
from backend.core.guest_session import GuestSession, _encode, mint_guest_session


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

    with (
        patch("api.index.init_db"),
        patch("api.index.seed_missing_challenges"),
    ):

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
    with (
        patch("api.index.init_db"),
        patch("api.index.seed_missing_challenges"),
        TestClient(app) as test_client,
    ):
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture(name="as_guest")
def as_guest_fixture() -> Callable[[TestClient, str | None], str]:
    def _as_guest(target_client: TestClient, guest_id: str | None = None) -> str:
        guest = (
            GuestSession(id=guest_id, issued_at=int(time.time()))
            if guest_id is not None
            else mint_guest_session()
        )
        target_client.cookies.set(
            settings.GUEST_COOKIE_NAME, _encode(guest), domain="testserver.local"
        )
        return guest.id

    return _as_guest


@pytest.fixture(name="register_user")
def register_user_fixture(
    client_factory: Callable[[], TestClient],
) -> Callable[..., dict[str, Any]]:
    def _register_user(
        username: str | None = None,
        *,
        email: str | None = None,
        password: str = DEFAULT_TEST_PASSWORD,
        guest_id: str | None = None,
    ) -> dict[str, Any]:
        idx = next(_USER_COUNTER)
        resolved_username = username or f"testuser_{idx}"
        resolved_email = email or f"{resolved_username}@diffly.dev"
        payload: dict[str, Any] = {
            "email": resolved_email,
            "username": resolved_username,
            "password": password,
        }

        reg_client = client_factory()
        if guest_id is not None:
            guest = GuestSession(id=guest_id, issued_at=int(time.time()))
            reg_client.cookies.set(
                settings.GUEST_COOKIE_NAME, _encode(guest), domain="testserver.local"
            )
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
        guest_id: str | None = None,
    ) -> TestClient:
        payload: dict[str, Any] = {
            "identifier": identifier,
            "password": password,
        }

        auth_client = client_factory()
        if guest_id is not None:
            guest = GuestSession(id=guest_id, issued_at=int(time.time()))
            auth_client.cookies.set(
                settings.GUEST_COOKIE_NAME, _encode(guest), domain="testserver.local"
            )
        res = auth_client.post("/api/auth/login", json=payload)
        assert res.status_code == 200, res.text
        return auth_client

    return _login_as
