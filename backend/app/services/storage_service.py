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
from app.services.envelope_encryption import envelope_service

logger = logging.getLogger(__name__)

# ── Local dev storage ─────────────────────────────────────────────────────────

_BACKEND_DIR = pathlib.Path(__file__).resolve().parent.parent.parent
_LOCAL_STORAGE = _BACKEND_DIR / "dev_storage"
if not _LOCAL_STORAGE.exists() and (_BACKEND_DIR.parent / "dev_storage").exists():
    _LOCAL_STORAGE = _BACKEND_DIR.parent / "dev_storage"


def _local_key_to_path(key: str) -> pathlib.Path:
    safe = key.replace("/", "_").replace("..", "__")
    p1 = _LOCAL_STORAGE / safe
    if p1.exists():
        return p1
    alt_dir = (
        _BACKEND_DIR.parent / "dev_storage"
        if _LOCAL_STORAGE == (_BACKEND_DIR / "dev_storage")
        else (_BACKEND_DIR / "dev_storage")
    )
    p2 = alt_dir / safe
    if p2.exists():
        return p2
    return p1


class _LocalStorageService:
    """Filesystem-based storage with PostgreSQL / SQLite persistent blob fallback (survives Render dyno restarts)."""

    def __init__(self) -> None:
        _LOCAL_STORAGE.mkdir(exist_ok=True)

    async def upload_file(self, file_bytes: bytes, key: str, content_type: str = "") -> str:
        safe_key = key.replace("/", "_").replace("..", "__")
        p = _local_key_to_path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        # Apply multi-layer AES-256-GCM envelope encryption (FDPIC / nDSG compliant)
        encrypted_bytes = envelope_service.encrypt_document(file_bytes)
        p.write_bytes(encrypted_bytes)

        # Sync to persistent database blob storage (protects against Render free-tier container wipes)
        try:
            from app.core.database import AsyncSessionLocal
            from app.models.document_blob import DocumentBlob

            async with AsyncSessionLocal() as session:
                existing = await session.get(DocumentBlob, safe_key)
                if existing:
                    existing.payload = encrypted_bytes
                else:
                    session.add(DocumentBlob(key=safe_key, payload=encrypted_bytes))
                await session.commit()
        except Exception as exc:
            logger.warning("Could not persist document blob '%s' to database: %s", safe_key, exc)

        return key

    async def download_file(self, key: str) -> bytes:
        safe_key = key.replace("/", "_").replace("..", "__")
        p = _local_key_to_path(key)
        encrypted_payload: Optional[bytes] = None

        if p.exists() and p.stat().st_size > 0:
            encrypted_payload = p.read_bytes()
        else:
            # Fallback to database blob storage if disk was purged on Render restart
            try:
                from app.core.database import AsyncSessionLocal
                from app.models.document_blob import DocumentBlob

                async with AsyncSessionLocal() as session:
                    blob = await session.get(DocumentBlob, safe_key)
                    if blob and blob.payload:
                        encrypted_payload = bytes(blob.payload)
                        # Re-hydrate file onto local filesystem for fast access
                        try:
                            p.parent.mkdir(parents=True, exist_ok=True)
                            p.write_bytes(encrypted_payload)
                        except Exception:
                            pass
            except Exception as exc:
                logger.warning("Could not retrieve document blob '%s' from database: %s", safe_key, exc)

        if not encrypted_payload:
            raise FileNotFoundError(f"Storage: '{key}' not found on disk or database")

        # Transparently decrypt envelope with KMS-managed DEK
        return envelope_service.decrypt_document(encrypted_payload)

    async def generate_presigned_url(self, key: str, expires_seconds: int = 600) -> str:
        # Local/DB storage does not issue unauthenticated raw file URLs.
        # Direct presigned URLs require S3/MinIO. In local storage mode, clients
        # route file requests through the authenticated endpoint /api/v1/documents/{id}/file.
        return ""

    async def delete_file(self, key: str, db: Optional[object] = None) -> bool:
        safe_key = key.replace("/", "_").replace("..", "__")
        p = _local_key_to_path(key)
        if p.exists():
            try:
                p.unlink()
            except Exception:
                pass
        try:
            from app.models.document_blob import DocumentBlob

            if db is not None:
                blob = await db.get(DocumentBlob, safe_key)
                if blob:
                    await db.delete(blob)
            else:
                from app.core.database import AsyncSessionLocal
                async with AsyncSessionLocal() as session:
                    blob = await session.get(DocumentBlob, safe_key)
                    if blob:
                        await session.delete(blob)
                        await session.commit()
        except Exception as exc:
            logger.warning("Could not delete document blob '%s' from database: %s", safe_key, exc)
        return True

    async def file_exists(self, key: str) -> bool:
        if _local_key_to_path(key).exists():
            return True
        safe_key = key.replace("/", "_").replace("..", "__")
        try:
            from app.core.database import AsyncSessionLocal
            from app.models.document_blob import DocumentBlob

            async with AsyncSessionLocal() as session:
                blob = await session.get(DocumentBlob, safe_key)
                return blob is not None
        except Exception:
            return False

    async def get_object_metadata(self, key: str) -> Optional[dict]:
        p = _local_key_to_path(key)
        if p.exists():
            return {"ContentLength": p.stat().st_size}
        safe_key = key.replace("/", "_").replace("..", "__")
        try:
            from app.core.database import AsyncSessionLocal
            from app.models.document_blob import DocumentBlob

            async with AsyncSessionLocal() as session:
                blob = await session.get(DocumentBlob, safe_key)
                if blob and blob.payload:
                    return {"ContentLength": len(blob.payload)}
        except Exception:
            pass
        return None


# ── MinIO / S3 production storage ─────────────────────────────────────────────

class _S3StorageService:
    """boto3-backed MinIO/S3 storage for production."""

    def __init__(self) -> None:
        import boto3
        from botocore.config import Config

        endpoint = settings.MINIO_ENDPOINT.strip()
        if not endpoint.startswith("http://") and not endpoint.startswith("https://"):
            protocol = "https" if settings.MINIO_USE_SSL else "http"
            endpoint = f"{protocol}://{endpoint}"

        region = settings.STORAGE_REGION or "auto"

        self._client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=settings.MINIO_ACCESS_KEY,
            aws_secret_access_key=settings.MINIO_SECRET_KEY,
            config=Config(
                signature_version="s3v4",
                retries={"max_attempts": 3, "mode": "adaptive"},
                s3={"addressing_style": "virtual" if "r2.cloudflarestorage.com" in endpoint else "auto"},
            ),
            region_name=region,
        )
        self._bucket = settings.MINIO_BUCKET_NAME
        self._local_fallback = _LocalStorageService()
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
        extra_args: dict[str, str] = {"ContentType": content_type}
        # Multi-layer AES-256-GCM envelope encryption at the file level
        encrypted_bytes = envelope_service.encrypt_document(file_bytes)
        # Enable AES-256 server-side encryption for production compliance if specified
        if getattr(settings, "STORAGE_SERVER_SIDE_ENCRYPTION", None):
            extra_args["ServerSideEncryption"] = settings.STORAGE_SERVER_SIDE_ENCRYPTION
            if getattr(settings, "STORAGE_ENCRYPTION_KEY_ID", None):
                extra_args["SSEKMSKeyId"] = settings.STORAGE_ENCRYPTION_KEY_ID

        try:
            await self._run_sync(
                self._client.upload_fileobj,
                io.BytesIO(encrypted_bytes),
                self._bucket,
                key,
                ExtraArgs=extra_args,
            )
        except Exception as exc:
            # Cloudflare R2 automatically encrypts at rest and may reject AWS-specific SSE headers
            if "ServerSideEncryption" in extra_args or "SSEKMSKeyId" in extra_args:
                extra_args.pop("ServerSideEncryption", None)
                extra_args.pop("SSEKMSKeyId", None)
                try:
                    await self._run_sync(
                        self._client.upload_fileobj,
                        io.BytesIO(encrypted_bytes),
                        self._bucket,
                        key,
                        ExtraArgs=extra_args,
                    )
                except Exception as inner_exc:
                    if "Could not connect to the endpoint URL" in str(inner_exc):
                        logger.warning("S3 unreachable (%s), storing locally.", inner_exc)
                        return await self._local_fallback.upload_file(file_bytes, key, content_type)
                    raise inner_exc
            elif "Could not connect to the endpoint URL" in str(exc):
                logger.warning("S3 unreachable (%s), storing locally.", exc)
                return await self._local_fallback.upload_file(file_bytes, key, content_type)
            else:
                raise exc
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
        except Exception as exc:
            if "Could not connect to the endpoint URL" in str(exc):
                logger.warning("S3 unreachable (%s), downloading from local fallback.", exc)
                return await self._local_fallback.download_file(key)
            raise exc
        buf.seek(0)
        return envelope_service.decrypt_document(buf.read())

    async def generate_presigned_url(self, key: str, expires_seconds: int = 600) -> str:
        try:
            url: str = await self._run_sync(
                self._client.generate_presigned_url,
                "get_object",
                Params={"Bucket": self._bucket, "Key": key},
                ExpiresIn=expires_seconds,
            )
            return url
        except Exception as exc:
            logger.warning("S3 presigned URL generation failed (%s), using local route.", exc)
            return await self._local_fallback.generate_presigned_url(key, expires_seconds)

    async def delete_file(self, key: str) -> bool:
        from botocore.exceptions import ClientError
        try:
            await self._run_sync(self._client.delete_object, Bucket=self._bucket, Key=key)
            return True
        except ClientError:
            return False
        except Exception as exc:
            if "Could not connect to the endpoint URL" in str(exc):
                return await self._local_fallback.delete_file(key)
            return False

    async def file_exists(self, key: str) -> bool:
        from botocore.exceptions import ClientError
        try:
            await self._run_sync(self._client.head_object, Bucket=self._bucket, Key=key)
            return True
        except ClientError:
            return False
        except Exception as exc:
            if "Could not connect to the endpoint URL" in str(exc):
                return await self._local_fallback.file_exists(key)
            return False

    async def get_object_metadata(self, key: str) -> Optional[dict]:
        from botocore.exceptions import ClientError
        try:
            return await self._run_sync(self._client.head_object, Bucket=self._bucket, Key=key)
        except ClientError:
            return None
        except Exception as exc:
            if "Could not connect to the endpoint URL" in str(exc):
                return await self._local_fallback.get_object_metadata(key)
            return None


# ── Public singleton ──────────────────────────────────────────────────────────

def _is_s3_reachable(endpoint: str, timeout: float = 0.5) -> bool:
    """Check if the MinIO/S3 endpoint is reachable before binding."""
    import socket
    from urllib.parse import urlparse
    if not endpoint.startswith("http://") and not endpoint.startswith("https://"):
        endpoint = f"http://{endpoint}"
    try:
        parsed = urlparse(endpoint)
        host = parsed.hostname or "localhost"
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        # External cloud object storage (e.g. AWS S3, Cloudflare R2, Exoscale) is always treated as configured
        if host not in ("localhost", "127.0.0.1", "0.0.0.0"):
            return True
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except Exception:
        return False


def _make_storage():
    if settings.ENVIRONMENT in ("development", "test"):
        logger.info("Using LOCAL filesystem storage (dev mode)")
        return _LocalStorageService()

    endpoint = getattr(settings, "MINIO_ENDPOINT", "localhost:9000")
    if not _is_s3_reachable(endpoint):
        logger.warning(
            "MinIO/S3 endpoint '%s' is not reachable. "
            "Using resilient local filesystem storage (dev_storage). "
            "To enable external cloud storage, configure MINIO_ENDPOINT, MINIO_ACCESS_KEY, and MINIO_SECRET_KEY in Render environment.",
            endpoint,
        )
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
