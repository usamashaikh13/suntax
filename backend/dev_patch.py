"""
Dev mode patcher — replaces PostgreSQL + Redis with SQLite + fakeredis.
Import this before anything else in dev_server.py.
"""
import os

# Override env to SQLite + fake redis
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./suntax_dev.db")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")  # will be patched below
os.environ.setdefault("SECRET_KEY", "15f53083bb141c9c60e30917b96c9bcfccdb64ba732383f96059f8a860e4128f")
os.environ.setdefault("GEMINI_API_KEY", os.environ.get("GEMINI_API_KEY", ""))
os.environ.setdefault("MINIO_ENDPOINT", "localhost:9000")
os.environ.setdefault("MINIO_ACCESS_KEY", "minioadmin")
os.environ.setdefault("MINIO_SECRET_KEY", "minioadmin")
os.environ.setdefault("MINIO_BUCKET_NAME", "suntax-documents")
os.environ.setdefault("MINIO_USE_SSL", "false")
os.environ.setdefault("FRONTEND_URL", "http://localhost:3000")
os.environ.setdefault('BACKEND_CORS_ORIGINS', '["http://localhost:3000","http://localhost:3001","http://localhost:8000"]')
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("RESEND_API_KEY", "")
os.environ.setdefault("EMAIL_FROM", "noreply@suntax.local")

import fakeredis

# ── Patch redis module so all app code gets fakeredis ──────────────────────────
import redis as real_redis_module
import redis.asyncio as real_redis_async

_fake_server = fakeredis.FakeServer()
_fake_sync   = fakeredis.FakeRedis(server=_fake_server, decode_responses=True)
_fake_async  = fakeredis.FakeRedis(server=_fake_server, decode_responses=True)

_orig_from_url      = real_redis_module.Redis.from_url
_orig_async_from_url = real_redis_async.Redis.from_url


def _fake_from_url(url, **kwargs):
    return fakeredis.FakeRedis(server=_fake_server, decode_responses=kwargs.get("decode_responses", True))


def _fake_async_from_url(url, **kwargs):
    return fakeredis.FakeRedis(server=_fake_server, decode_responses=kwargs.get("decode_responses", True))


real_redis_module.Redis.from_url = staticmethod(_fake_from_url)
real_redis_async.Redis.from_url  = staticmethod(_fake_async_from_url)

# ── Patch SQLAlchemy to use SQLite ─────────────────────────────────────────────
import sqlalchemy
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
import sqlalchemy.orm

_orig_create_async_engine = sqlalchemy.ext.asyncio.create_async_engine

def _sqlite_engine(url, **kwargs):
    # SQLite doesn't support all postgres-specific kwargs
    for key in ["pool_size", "max_overflow", "pool_pre_ping", "pool_recycle"]:
        kwargs.pop(key, None)
    if "postgresql" in str(url):
        url = "sqlite+aiosqlite:///./suntax_dev.db"
    return _orig_create_async_engine(url, **kwargs)

sqlalchemy.ext.asyncio.create_async_engine = _sqlite_engine

# ── Patch set_rls_user_id to no-op for SQLite ─────────────────────────────────
import app.core.database as _db_module
_orig_set_rls = _db_module.set_rls_user_id

async def _noop_rls(session, user_id):
    pass  # SQLite has no RLS; skip

_db_module.set_rls_user_id = _noop_rls

# ── Patch storage service to use local filesystem instead of MinIO ─────────────
import app.services.storage_service as _storage_mod

import pathlib, uuid as _uuid

LOCAL_STORAGE = pathlib.Path("./dev_storage")
LOCAL_STORAGE.mkdir(exist_ok=True)


def _local_upload(file_bytes: bytes, key: str, content_type: str = "application/octet-stream") -> str:
    dest = LOCAL_STORAGE / key.replace("/", "_")
    dest.write_bytes(file_bytes)
    return key


def _local_presigned(key: str, expires_seconds: int = 600) -> str:
    return f"http://localhost:8000/dev-storage/{key.replace('/', '_')}"


def _local_delete(key: str) -> bool:
    p = LOCAL_STORAGE / key.replace("/", "_")
    if p.exists():
        p.unlink()
    return True


def _local_exists(key: str) -> bool:
    return (LOCAL_STORAGE / key.replace("/", "_")).exists()


_storage_mod.StorageService.upload_file    = staticmethod(_local_upload)
_storage_mod.StorageService.generate_presigned_url = staticmethod(_local_presigned)
_storage_mod.StorageService.delete_file   = staticmethod(_local_delete)
_storage_mod.StorageService.file_exists   = staticmethod(_local_exists)

print("✅ Dev patches applied: SQLite + fakeredis + local file storage")
