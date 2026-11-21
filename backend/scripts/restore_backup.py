#!/usr/bin/env python3
"""
SunTax Secure Backup Restoration CLI.

Safely restores an AES-256-GCM encrypted backup archive into an isolated test database.
Enforces strict guardrails to prevent accidental overwriting of active production databases.

Usage:
    python scripts/restore_backup.py <path_to_backup.enc.suntax> \\
        --target-db-url "sqlite+aiosqlite:///tmp/isolated_restore.db" \\
        --confirm-isolated-database \\
        [--rehydrate-storage-dir ./tmp/rehydrated_docs]
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

# Setup sys.path to load backend app modules
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import settings
from app.services.secure_backup_service import secure_backup_service


async def main() -> int:
    parser = argparse.ArgumentParser(description="Restore AES-256-GCM encrypted SunTax backup into an isolated test database")
    parser.add_argument("backup_file", type=str, help="Path to .enc.suntax encrypted backup file")
    parser.add_argument("--target-db-url", type=str, required=True, help="Async SQLAlchemy URL of isolated test database")
    parser.add_argument(
        "--confirm-isolated-database",
        action="store_true",
        required=False,
        default=False,
        help="Mandatory confirmation flag certifying target is an isolated test environment",
    )
    parser.add_argument("--key", type=str, default=None, help="Explicit decryption key (optional)")
    parser.add_argument("--rehydrate-storage-dir", type=str, default=None, help="Directory to re-hydrate document blobs onto disk")
    args = parser.parse_args()

    backup_path = Path(args.backup_file)
    rehydrate_dir = Path(args.rehydrate_storage_dir) if args.rehydrate_storage_dir else None

    print(f"============================================================")
    print(f"SunTax Secure Backup Restoration")
    print(f"Backup File : {backup_path.name}")
    print(f"Target DB   : {args.target_db_url.split('@')[-1]}")
    print(f"Confirmed   : {args.confirm_isolated_database}")
    print(f"============================================================")

    if not args.confirm_isolated_database:
        print(
            "RESTORE BLOCKED: You MUST pass --confirm-isolated-database to certify that the target "
            "database is an isolated test environment and not an active database.",
            file=sys.stderr,
        )
        return 1

    try:
        res = await secure_backup_service.restore_backup(
            backup_path=backup_path,
            target_db_url=args.target_db_url,
            confirm_isolated_test_db=args.confirm_isolated_database,
            explicit_key=args.key,
            operator=os.environ.get("USER", "cli-restore-operator"),
            rehydrate_storage_dir=rehydrate_dir,
        )
        print("Restoration Succeeded:")
        print(f"  Target DB      : {res['target_database']}")
        print(f"  Restored Counts: {res['records_restored']}")
        if res.get("rehydrated_documents"):
            print(f"  Rehydrated Docs: {res['rehydrated_documents']} files")
        print("============================================================")
        return 0
    except Exception as exc:
        print(f"ERROR restoring backup: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
