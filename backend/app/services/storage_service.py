"""
Storage service for SunTax.

In development (ENVIRONMENT=development) uses the local filesystem.
In production uses MinIO/S3 via boto3.
"""
from __future__ import annotations

import asyncio
import io
import logging
import os
import pathlib
from functools import partial
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── Local dev storage ─────────────────────────────────────────────────────────

_LOCAL_STORAGE = pathlib.Path("./dev_storage")


def _local_key_to_path(key: str) -> pathlib.Path:
    safe = key.replace("/", "_").replace("..", "__")
    return _LOCAL_STORAGE / safe


class _LocalStorageService:
    """Filesystem-based storage for local development (no MinIO required)."""

    def __init__(self) -> None:
        _LOCAL_STORAGE.mkdir(exist_ok=True)

    async def upload_file(self, file_bytes: bytes, key: str, content_type: str = "") -> str:
        p = _local_key_to_path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(file_bytes)
        return key

    async def download_file(self, key: str) -> bytes:
        p = _local_key_to_path(key)
        if not p.exists():
            raise FileNotFoundError(f"Dev storage: '{key}' not found")
        return p.read_bytes()

    async def generate_presigned_url(self, key: str, expires_seconds: int = 600) -> str:
        # Return a local URL; the /dev-files route in main.py serves these
        return f"http://localhost:8000/dev-files/{key.replace('/', '_')}"

    async def delete_file(self, key: str) -> bool:
        p = _local_key_to_path(key)
        if p.exists():
            p.unlink()
        return True

    async def file_exists(self, key: str) -> bool:
        return _local_key_to_path(key).exists()

    async def get_object_metadata(self, key: str) -> Optional[dict]:
        p = _local_key_to_path(key)
        if not p.exists():
            return None
        return {"ContentLength": p.stat().st_size}


# ── MinIO / S3 production storage ─────────────────────────────────────────────

class _S3StorageService:
    """boto3-backed MinIO/S3 storage for production."""

    def __init__(self) -> None:
        import boto3
        from botocore.config import Config

        protocol = "https" if settings.MINIO_USE_SSL else "http"
        self._client = boto3.client(
            "s3",
            endpoint_url=f"{protocol}://{settings.MINIO_ENDPOINT}",
            aws_access_key_id=settings.MINIO_ACCESS_KEY,
            aws_secret_access_key=settings.MINIO_SECRET_KEY,
            config=Config(
                signature_version="s3v4",
                retries={"max_attempts": 3, "mode": "adaptive"},
            ),
            region_name="us-east-1",
        )
        self._bucket = settings.MINIO_BUCKET_NAME
        self._ensure_bucket()

    def _ensure_bucket(self) -> None:
        from botocore.exceptions import ClientError
        try:
            self._client.head_bucket(Bucket=self._bucket)
        except Exception as exc:
            try:
                self._client.create_bucket(Bucket=self._bucket)
                logger.info("Created bucket '%s'", self._bucket)
            except Exception as e:
                logger.warning("Could not verify/create bucket: %s", e)

    async def _run_sync(self, fn, *args, **kwargs):
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, partial(fn, *args, **kwargs))

    async def upload_file(self, file_bytes: bytes, key: str, content_type: str = "application/octet-stream") -> str:
        await self._run_sync(
            self._client.upload_fileobj,
            io.BytesIO(file_bytes),
            self._bucket,
            key,
            ExtraArgs={"ContentType": content_type},
        )
        return key

    async def download_file(self, key: str) -> bytes:
        from botocore.exceptions import ClientError
        buf = io.BytesIO()
        try:
            await self._run_sync(self._client.download_fileobj, self._bucket, key, buf)
        except ClientError as exc:
            if exc.response["Error"]["Code"] in ("404", "NoSuchKey"):
                raise FileNotFoundError(f"Object '{key}' not found")
            raise
        buf.seek(0)
        return buf.read()

    async def generate_presigned_url(self, key: str, expires_seconds: int = 600) -> str:
        url: str = await self._run_sync(
            self._client.generate_presigned_url,
            "get_object",
            Params={"Bucket": self._bucket, "Key": key},
            ExpiresIn=expires_seconds,
        )
        return url

    async def delete_file(self, key: str) -> bool:
        from botocore.exceptions import ClientError
        try:
            await self._run_sync(self._client.delete_object, Bucket=self._bucket, Key=key)
            return True
        except ClientError:
            return False

    async def file_exists(self, key: str) -> bool:
        from botocore.exceptions import ClientError
        try:
            await self._run_sync(self._client.head_object, Bucket=self._bucket, Key=key)
            return True
        except ClientError:
            return False

    async def get_object_metadata(self, key: str) -> Optional[dict]:
        from botocore.exceptions import ClientError
        try:
            return await self._run_sync(self._client.head_object, Bucket=self._bucket, Key=key)
        except ClientError:
            return None


# ── Public singleton ──────────────────────────────────────────────────────────

def _make_storage():
    if settings.ENVIRONMENT == "development":
        logger.info("Using LOCAL filesystem storage (dev mode)")
        return _LocalStorageService()
    return _S3StorageService()


# Lazy singleton — instantiated on first use to avoid import-time network calls
_storage_instance: Optional[object] = None


def get_storage():
    global _storage_instance
    if _storage_instance is None:
        _storage_instance = _make_storage()
    return _storage_instance


# Provide a module-level proxy class so existing code can do:
#   storage = StorageService()
class StorageService:
    def __init__(self):
        pass

    def __getattr__(self, name):
        return getattr(get_storage(), name)


# Convenience instance for import-style usage: from app.services.storage_service import storage
storage = get_storage()
