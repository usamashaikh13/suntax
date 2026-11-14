"""
Async SQLAlchemy database setup for SunTax.

Provides:
- async engine backed by asyncpg
- AsyncSessionLocal factory
- Base declarative class (shared by all models)
- get_db() FastAPI dependency
- set_rls_user_id() for PostgreSQL Row-Level Security
"""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from typing import Optional
from uuid import UUID

from urllib.parse import parse_qs, urlencode, urlparse, urlunparse
from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, MappedColumn
from sqlalchemy.pool import NullPool

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── Engine URL sanitization for asyncpg & Render compatibility ───────────────


def _prepare_db_url_and_args(raw_url: str) -> tuple[str, dict]:
    url = raw_url.strip()
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgresql://") and not url.startswith("postgresql+asyncpg://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)

    connect_args: dict = {}
    if not url.startswith("sqlite"):
        parsed = urlparse(url)
        query_params = parse_qs(parsed.query)

        # asyncpg does not accept sslmode in URL query; convert to connect_args['ssl']
        if "sslmode" in query_params:
            mode = query_params.pop("sslmode")[0].lower()
            if mode in ("require", "prefer", "verify-ca", "verify-full"):
                connect_args["ssl"] = "require"
            elif mode == "disable":
                connect_args["ssl"] = False

        if "ssl" in query_params:
            ssl_val = query_params.pop("ssl")[0].lower()
            if ssl_val in ("true", "1", "require"):
                connect_args["ssl"] = "require"
            elif ssl_val in ("false", "0", "disable"):
                connect_args["ssl"] = False

        new_query = urlencode(query_params, doseq=True)
        url = urlunparse(
            (parsed.scheme, parsed.netloc, parsed.path, parsed.params, new_query, parsed.fragment)
        )

    return url, connect_args


_database_url, _db_connect_args = _prepare_db_url_and_args(settings.DATABASE_URL)
_is_sqlite = _database_url.startswith("sqlite")

if _is_sqlite:
    # SQLite — used for local dev without PostgreSQL
    engine = create_async_engine(
        _database_url,
        echo=settings.DEBUG,
        connect_args={"check_same_thread": False},
    )
else:
    # PostgreSQL (production / staging)
    _pool_class = NullPool if settings.ENVIRONMENT == "test" else None
    _engine_kwargs: dict = {
        "echo": settings.DEBUG,
        "pool_pre_ping": True,
    }
    if _db_connect_args:
        _engine_kwargs["connect_args"] = _db_connect_args
    if _pool_class:
        _engine_kwargs["poolclass"] = _pool_class
    else:
        _engine_kwargs["pool_size"] = settings.DB_POOL_SIZE
        _engine_kwargs["max_overflow"] = settings.DB_MAX_OVERFLOW
    engine = create_async_engine(_database_url, **_engine_kwargs)

# ── Session factory ───────────────────────────────────────────────────────────

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


# ── Declarative base ──────────────────────────────────────────────────────────


class Base(DeclarativeBase):
    """Shared declarative base for all SQLAlchemy models."""


# ── Row-Level Security helper ─────────────────────────────────────────────────


async def set_rls_user_id(session: AsyncSession, user_id: UUID | str) -> None:
    """
    Set the PostgreSQL session-local variable consumed by RLS policies.
    No-op for SQLite (used in local dev mode).
    """
    try:
        bind = session.bind or session.get_bind()
        if bind and getattr(bind.dialect, "name", "") == "sqlite":
            return
    except Exception:
        pass
    if _is_sqlite:
        return  # SQLite has no RLS support
    uid = str(user_id)
    try:
        await session.execute(
            text("SELECT set_config('app.current_user_id', :uid, false)"),
            {"uid": uid},
        )
    except Exception as exc:
        if "no such function: set_config" in str(exc).lower():
            return
        raise


# ── FastAPI dependency ────────────────────────────────────────────────────────


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that yields an async database session.

    The session is automatically committed on success and rolled back on error.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            if not _is_sqlite:
                try:
                    await session.execute(text("SELECT set_config('app.current_user_id', '', false)"))
                except Exception:
                    pass
            await session.close()


# ── Convenience context manager (for Celery tasks) ────────────────────────────


class db_session:  # noqa: N801 – intentional lowercase for ergonomics
    """
    Async context manager for use inside Celery tasks or scripts.

    Usage::

        async with db_session() as session:
            result = await session.execute(...)
    """

    async def __aenter__(self) -> AsyncSession:
        self._session = AsyncSessionLocal()
        return self._session

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        if exc_type:
            await self._session.rollback()
        else:
            await self._session.commit()
        await self._session.close()
