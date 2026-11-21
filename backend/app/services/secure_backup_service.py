"""
SunTax Secure Backup & Disaster Recovery Service.

Complies with Swiss nDSG, FDPIC (EDÖB), and ISO 27001 requirements:
1. Strong AEAD Encryption: Backups are encrypted with AES-256-GCM using a dedicated
   BACKUP_ENCRYPTION_KEY separated from standard application secrets.
2. Complete Persistence: Backups package relational database state AND all encrypted DocumentBlob
   payloads so documents survive infrastructure re-provisioning.
3. Zero Plaintext Exposure: Plaintext customer PII, tax returns, and password hashes are NEVER
   written unencrypted to local disk or exposed over unauthenticated endpoints.
4. Tamper Resistance: Authenticated encryption (GCM tag) and SHA-256 manifests guarantee payload integrity.
5. Strict Restore Safety: Restores are gated and strictly forbidden from running against active
   production/staging databases.
6. Automated Retention: Older backup archives are pruned according to BACKUP_RETENTION_DAYS.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import shutil
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from app.core.config import settings
from app.core.database import Base
from app.models.user import User
from app.models.tax_return import TaxReturn
from app.models.tax_profile import TaxProfile
from app.models.tax_calculation import TaxCalculation
from app.models.document import Document
from app.models.document_blob import DocumentBlob
from app.models.waitlist import WaitlistEntry
from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)

MAGIC_BACKUP_HEADER = b"SUNTAX_ENC_V1"
BACKUP_ASSOCIATED_DATA = b"SunTax-SecureBackup-v1"


def _derive_backup_key(explicit_key: Optional[str] = None) -> bytes:
    """Derive 256-bit AESGCM key from explicit key or configuration."""
    key_str = explicit_key or getattr(settings, "BACKUP_ENCRYPTION_KEY", None)
    if key_str and len(key_str.strip()) > 0:
        return hashlib.sha256(key_str.strip().encode("utf-8")).digest()

    env_key = os.environ.get("SUNTAX_BACKUP_ENCRYPTION_KEY")
    if env_key and len(env_key.strip()) > 0:
        return hashlib.sha256(env_key.strip().encode("utf-8")).digest()

    # In dev/test, fallback to key derived with distinct domain separation salt
    if settings.ENVIRONMENT in ("production", "staging"):
        raise ValueError(
            "CRITICAL SECURITY MISCONFIGURATION: BACKUP_ENCRYPTION_KEY must be explicitly set "
            "in production/staging environments. Backup creation aborted."
        )

    logger.warning("BACKUP_ENCRYPTION_KEY not set; using development fallback key with domain separation.")
    return hashlib.sha256((settings.SECRET_KEY + ":suntax-secure-backup-domain-2026").encode("utf-8")).digest()


def _serialize_model_instance(instance: Any) -> Dict[str, Any]:
    """Serialize a SQLAlchemy model instance to JSON-compatible dict."""
    data = {}
    for column in instance.__table__.columns:
        val = getattr(instance, column.name)
        if val is None:
            data[column.name] = None
        elif isinstance(val, datetime):
            data[column.name] = val.isoformat()
        elif isinstance(val, bytes):
            data[column.name] = base64.b64encode(val).decode("ascii")
        elif isinstance(val, (int, float, str, bool, list, dict)):
            data[column.name] = val
        else:
            data[column.name] = str(val)
    return data


def _deserialize_model_dict(model_cls: Any, data: Dict[str, Any]) -> Any:
    """Deserialize a dict into a SQLAlchemy model instance with proper types."""
    kwargs = {}
    for column in model_cls.__table__.columns:
        name = column.name
        if name in data:
            val = data[name]
            if val is None:
                kwargs[name] = None
            elif str(column.type).startswith("DATETIME") or str(column.type).startswith("TIMESTAMP"):
                try:
                    kwargs[name] = datetime.fromisoformat(val)
                except Exception:
                    kwargs[name] = val
            elif str(column.type) in ("LARGEBINARY", "BYTEA", "BLOB"):
                try:
                    kwargs[name] = base64.b64decode(val.encode("ascii"))
                except Exception:
                    kwargs[name] = val
            else:
                kwargs[name] = val
    return model_cls(**kwargs)


class SecureBackupService:
    """Encrypted Backup and Disaster Recovery service."""

    def __init__(self, backup_dir: Optional[Path] = None) -> None:
        if backup_dir:
            self.backup_dir = backup_dir
        else:
            base_dir = Path(__file__).resolve().parent.parent.parent
            self.backup_dir = base_dir / getattr(settings, "BACKUP_DIR", "backups")
        self.backup_dir.mkdir(parents=True, exist_ok=True)

    async def create_encrypted_backup(
        self,
        db: AsyncSession,
        operator: str = "system",
        out_dir: Optional[Path] = None,
        explicit_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Create a full AES-256-GCM encrypted backup archive of database tables and DocumentBlobs.
        Writes to disk only in encrypted form. Returns manifest metadata.
        """
        target_dir = out_dir or self.backup_dir
        target_dir.mkdir(parents=True, exist_ok=True)

        logger.info("Starting secure encrypted backup for environment '%s'...", settings.ENVIRONMENT)

        # 1. Collect records across all primary models
        users = (await db.execute(select(User))).scalars().all()
        returns = (await db.execute(select(TaxReturn))).scalars().all()
        profiles = (await db.execute(select(TaxProfile))).scalars().all()
        calcs = (await db.execute(select(TaxCalculation))).scalars().all()
        docs = (await db.execute(select(Document))).scalars().all()
        blobs = (await db.execute(select(DocumentBlob))).scalars().all()
        waitlist = (await db.execute(select(WaitlistEntry))).scalars().all()
        audit_logs = (await db.execute(select(AuditLog))).scalars().all()

        counts = {
            "users": len(users),
            "tax_returns": len(returns),
            "tax_profiles": len(profiles),
            "tax_calculations": len(calcs),
            "documents": len(docs),
            "document_blobs": len(blobs),
            "waitlist": len(waitlist),
            "audit_logs": len(audit_logs),
        }

        tables_data = {
            "users": [_serialize_model_instance(u) for u in users],
            "tax_returns": [_serialize_model_instance(r) for r in returns],
            "tax_profiles": [_serialize_model_instance(p) for p in profiles],
            "tax_calculations": [_serialize_model_instance(c) for c in calcs],
            "documents": [_serialize_model_instance(d) for d in docs],
            "document_blobs": [_serialize_model_instance(b) for b in blobs],
            "waitlist": [_serialize_model_instance(w) for w in waitlist],
            "audit_logs": [_serialize_model_instance(a) for a in audit_logs],
        }

        tables_json = json.dumps(tables_data, sort_keys=True)
        raw_sha256 = hashlib.sha256(tables_json.encode("utf-8")).hexdigest()

        now_utc = datetime.now(timezone.utc)
        manifest = {
            "format": "suntax_encrypted_backup_v1",
            "created_at": now_utc.isoformat(),
            "environment": settings.ENVIRONMENT,
            "operator": operator,
            "record_counts": counts,
            "checksum_sha256": raw_sha256,
            "cipher": "AES-256-GCM",
        }

        package = {
            "manifest": manifest,
            "tables": tables_data,
        }
        plaintext_bytes = json.dumps(package).encode("utf-8")

        # 2. Encrypt with AES-256-GCM using dedicated BACKUP_ENCRYPTION_KEY
        key = _derive_backup_key(explicit_key)
        aesgcm = AESGCM(key)
        nonce = os.urandom(12)
        ciphertext = aesgcm.encrypt(nonce, plaintext_bytes, associated_data=BACKUP_ASSOCIATED_DATA)

        # 3. Assemble binary envelope: MAGIC (13 bytes) + Nonce (12 bytes) + Ciphertext + Tag
        encrypted_archive = MAGIC_BACKUP_HEADER + nonce + ciphertext

        timestamp_str = now_utc.strftime("%Y%m%d_%H%M%S")
        filename = f"suntax_backup_{settings.ENVIRONMENT}_{timestamp_str}.enc.suntax"
        file_path = target_dir / filename
        file_path.write_bytes(encrypted_archive)

        file_size_bytes = len(encrypted_archive)
        logger.info(
            "Encrypted backup created: %s (%d bytes, %d records)",
            filename, file_size_bytes, sum(counts.values())
        )

        # 4. Audit the backup event
        try:
            audit = AuditLog(
                user_id=None,
                action="backup.created",
                resource_type="system",
                resource_id=filename,
                extra_data=json.dumps({
                    "filename": filename,
                    "file_size_bytes": file_size_bytes,
                    "environment": settings.ENVIRONMENT,
                    "operator": operator,
                    "record_counts": counts,
                }),
            )
            db.add(audit)
            await db.commit()
        except Exception as audit_err:
            logger.warning("Could not record backup audit log: %s", audit_err)

        # 5. Prune expired backups according to retention policy
        pruned = self.purge_expired_backups(
            retention_days=getattr(settings, "BACKUP_RETENTION_DAYS", 30),
            backup_dir=target_dir,
        )

        return {
            "status": "success",
            "filename": filename,
            "path": str(file_path),
            "file_size_bytes": file_size_bytes,
            "manifest": manifest,
            "pruned_backups": pruned,
        }

    def purge_expired_backups(
        self,
        retention_days: int = 30,
        backup_dir: Optional[Path] = None,
    ) -> List[str]:
        """Remove backup files older than retention_days."""
        target_dir = backup_dir or self.backup_dir
        if not target_dir.exists():
            return []

        cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
        pruned: List[str] = []

        for p in target_dir.glob("*.enc.suntax"):
            try:
                mtime = datetime.fromtimestamp(p.stat().st_mtime, tz=timezone.utc)
                if mtime < cutoff:
                    p.unlink()
                    pruned.append(p.name)
                    logger.info("Pruned expired backup file: %s (retention: %d days)", p.name, retention_days)
            except Exception as e:
                logger.warning("Error pruning backup %s: %s", p.name, e)

        return pruned

    def read_and_decrypt_backup(
        self,
        backup_path: Path,
        explicit_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Read and decrypt backup archive, validating AEAD tag and manifest checksum."""
        if not backup_path.exists():
            raise FileNotFoundError(f"Backup file not found: {backup_path}")

        raw_bytes = backup_path.read_bytes()
        header_len = len(MAGIC_BACKUP_HEADER)
        if len(raw_bytes) < header_len + 12 + 16:
            raise ValueError("Corrupt backup file: payload is too short")

        header = raw_bytes[:header_len]
        if header != MAGIC_BACKUP_HEADER:
            raise ValueError(f"Invalid backup format header: expected {MAGIC_BACKUP_HEADER!r}, got {header!r}")

        nonce = raw_bytes[header_len : header_len + 12]
        ciphertext = raw_bytes[header_len + 12 :]

        key = _derive_backup_key(explicit_key)
        aesgcm = AESGCM(key)

        try:
            plaintext = aesgcm.decrypt(nonce, ciphertext, associated_data=BACKUP_ASSOCIATED_DATA)
        except Exception as exc:
            raise ValueError(
                "Backup decryption failed. The decryption key may be incorrect or the backup payload "
                f"has been tampered with ({type(exc).__name__})."
            )

        package = json.loads(plaintext.decode("utf-8"))
        manifest = package.get("manifest", {})
        tables = package.get("tables", {})

        # Verify integrity against manifest checksum
        tables_json = json.dumps(tables, sort_keys=True)
        computed_hash = hashlib.sha256(tables_json.encode("utf-8")).hexdigest()
        expected_hash = manifest.get("checksum_sha256")
        if expected_hash and computed_hash != expected_hash:
            raise ValueError(
                f"Backup manifest checksum mismatch: expected {expected_hash}, calculated {computed_hash}. "
                "Archive integrity check failed."
            )

        return package

    async def restore_backup(
        self,
        backup_path: Path,
        target_db_url: str,
        confirm_isolated_test_db: bool = False,
        explicit_key: Optional[str] = None,
        operator: str = "system",
        rehydrate_storage_dir: Optional[Path] = None,
    ) -> Dict[str, Any]:
        """
        Restore an encrypted backup into an ISOLATED target test database only.
        Enforces strict safety guards against accidental overwriting of active databases.
        """
        # 1. HARD SAFETY GUARD: Prevent accidental restore into active environments
        active_url = str(getattr(settings, "DATABASE_URL", "")).strip()
        target_url = str(target_db_url).strip()

        if settings.ENVIRONMENT in ("production", "staging"):
            if target_url == active_url or "suntax-db" in target_url or "render.com" in target_url:
                raise ValueError(
                    "RESTORE BLOCKED: Direct restore into active production or staging database is strictly prohibited. "
                    "You must provide an isolated verification database URL."
                )

        if not confirm_isolated_test_db:
            raise ValueError(
                "RESTORE BLOCKED: You must explicitly confirm the target database is an isolated test environment "
                "by passing confirm_isolated_test_db=True (or --confirm-isolated-database)."
            )

        # 2. Decrypt & verify archive
        package = self.read_and_decrypt_backup(backup_path, explicit_key)
        manifest = package["manifest"]
        tables = package["tables"]

        # 3. Connect to isolated target database and recreate schema
        target_engine = create_async_engine(target_url, echo=False)
        async with target_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        target_sessionmaker = async_sessionmaker(target_engine, expire_on_commit=False)

        restored_counts = {}

        async with target_sessionmaker() as session:
            # Table insert order honoring foreign keys
            model_map = [
                ("users", User),
                ("tax_returns", TaxReturn),
                ("tax_profiles", TaxProfile),
                ("tax_calculations", TaxCalculation),
                ("documents", Document),
                ("document_blobs", DocumentBlob),
                ("waitlist", WaitlistEntry),
                ("audit_logs", AuditLog),
            ]

            for table_name, model_cls in model_map:
                rows = tables.get(table_name, [])
                for row_data in rows:
                    instance = _deserialize_model_dict(model_cls, row_data)
                    await session.merge(instance)
                restored_counts[table_name] = len(rows)

            await session.commit()

        # 4. Re-hydrate documents on disk if a storage directory is provided
        rehydrated_docs = 0
        if rehydrate_storage_dir:
            rehydrate_storage_dir.mkdir(parents=True, exist_ok=True)
            for blob_data in tables.get("document_blobs", []):
                key = blob_data.get("key")
                payload_b64 = blob_data.get("payload")
                if key and payload_b64:
                    raw_payload = base64.b64decode(payload_b64.encode("ascii"))
                    file_p = rehydrate_storage_dir / key
                    file_p.parent.mkdir(parents=True, exist_ok=True)
                    file_p.write_bytes(raw_payload)
                    rehydrated_docs += 1

        logger.info(
            "Restore complete: %d records restored to %s",
            sum(restored_counts.values()), target_url
        )

        return {
            "status": "success",
            "target_database": target_url.split("@")[-1],  # redact credentials
            "backup_manifest": manifest,
            "records_restored": restored_counts,
            "rehydrated_documents": rehydrated_docs,
            "restored_at": datetime.now(timezone.utc).isoformat(),
            "operator": operator,
        }


secure_backup_service = SecureBackupService()
