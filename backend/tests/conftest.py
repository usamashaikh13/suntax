"""
Pytest fixtures for SunTax backend tests.
"""
import asyncio
import uuid
from typing import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from app.main import app
from app.core.database import get_db, Base
from app.core.security import hash_password, create_access_token
from app.models.user import User

import os
import shutil

from app.core.config import settings

# Strictly isolate the test database – NEVER fall back to suntax_dev.db or production DATABASE_URL!
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
if not TEST_DATABASE_URL:
    TEST_DATABASE_URL = "sqlite+aiosqlite:////tmp/suntax_isolated_test.db"

# Safety assertions: tests must NEVER touch the local dev or production databases
assert "suntax_dev.db" not in TEST_DATABASE_URL, "Test database must NOT be suntax_dev.db!"
assert TEST_DATABASE_URL != settings.DATABASE_URL, "TEST_DATABASE_URL must be strictly isolated from settings.DATABASE_URL!"


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def test_engine():
    # Clean up any leftover temporary sqlite file from prior test runs
    if "suntax_isolated_test.db" in TEST_DATABASE_URL:
        db_path = "/tmp/suntax_isolated_test.db"
        if os.path.exists(db_path):
            try:
                os.remove(db_path)
            except OSError:
                pass

    engine_kwargs = {"echo": False}
    if TEST_DATABASE_URL.startswith("sqlite"):
        engine_kwargs["connect_args"] = {"check_same_thread": False}
    engine = create_async_engine(TEST_DATABASE_URL, **engine_kwargs)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()
    if "suntax_isolated_test.db" in TEST_DATABASE_URL:
        db_path = "/tmp/suntax_isolated_test.db"
        if os.path.exists(db_path):
            try:
                os.remove(db_path)
            except OSError:
                pass


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_test_database(test_engine):
    """
    Ensure all application services and background tasks use test_engine
    instead of connecting to suntax_dev.db.
    """
    test_session_factory = async_sessionmaker(
        bind=test_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
        autocommit=False,
    )
    import app.core.database
    import app.services.document_pipeline_service

    orig_engine = app.core.database.engine
    orig_session_local = app.core.database.AsyncSessionLocal
    orig_pipeline_session_local = app.services.document_pipeline_service.AsyncSessionLocal

    app.core.database.engine = test_engine
    app.core.database.AsyncSessionLocal = test_session_factory
    app.services.document_pipeline_service.AsyncSessionLocal = test_session_factory

    yield

    app.core.database.engine = orig_engine
    app.core.database.AsyncSessionLocal = orig_session_local
    app.services.document_pipeline_service.AsyncSessionLocal = orig_pipeline_session_local


@pytest_asyncio.fixture
async def db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    session_factory = async_sessionmaker(test_engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """HTTP test client with DB session override."""
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def test_user(db_session: AsyncSession) -> User:
    user = User(
        id=str(uuid.uuid4()),
        email=f"test_{uuid.uuid4().hex[:8]}@suntax.ch",
        hashed_password=hash_password("Test1234!"),
        full_name="Test User",
        is_verified=True,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def test_user2(db_session: AsyncSession) -> User:
    """A second user for isolation tests."""
    user = User(
        id=str(uuid.uuid4()),
        email=f"test2_{uuid.uuid4().hex[:8]}@suntax.ch",
        hashed_password=hash_password("Test1234!"),
        full_name="Test User 2",
        is_verified=True,
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def admin_user(db_session: AsyncSession) -> User:
    user = User(
        id=str(uuid.uuid4()),
        email=f"admin_{uuid.uuid4().hex[:8]}@suntax.ch",
        hashed_password=hash_password("Admin1234!"),
        full_name="Admin User",
        is_verified=True,
        is_active=True,
        is_admin=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def auth_client(client: AsyncClient, test_user: User) -> AsyncClient:
    """Client with auth token for test_user."""
    token = create_access_token({"sub": str(test_user.id)})
    client.headers["Authorization"] = f"Bearer {token}"
    return client


@pytest_asyncio.fixture
async def auth_client2(client: AsyncClient, test_user2: User) -> AsyncClient:
    """Client with auth token for test_user2."""
    import copy
    from httpx import AsyncClient as HC, ASGITransport
    token = create_access_token({"sub": str(test_user2.id)})
    # Create a new client for user2
    client2 = AsyncClient(transport=ASGITransport(app=app), base_url="http://test",
                          headers={"Authorization": f"Bearer {token}"})
    yield client2
    await client2.aclose()


@pytest_asyncio.fixture
async def admin_client(client: AsyncClient, admin_user: User) -> AsyncClient:
    token = create_access_token({"sub": str(admin_user.id)})
    client.headers["Authorization"] = f"Bearer {token}"
    return client
