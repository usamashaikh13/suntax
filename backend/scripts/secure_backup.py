#!/usr/bin/env python3
"""
SunTax Secure Encrypted Backup CLI.

Creates an AES-256-GCM encrypted backup archive of all database records and
DocumentBlobs with zero plaintext leakage.

Usage:
    python scripts/secure_backup.py [--retention-days 30] [--out-dir ./backups]
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
from app.core.database import AsyncSessionLocal
from app.services.secure_backup_service import secure_backup_service


async def main() -> int:
    parser = argparse.ArgumentParser(description="Create AES-256-GCM encrypted SunTax backup")
    parser.add_argument("--retention-days", type=int, default=30, help="Prune backups older than N days (default: 30)")
    parser.add_argument("--out-dir", type=str, default=None, help="Directory to save encrypted backup")
    parser.add_argument("--key", type=str, default=None, help="Explicit encryption key (optional; defaults to BACKUP_ENCRYPTION_KEY)")
    args = parser.parse_args()

    out_dir = Path(args.out_dir) if args.out_dir else None

    print(f"============================================================")
    print(f"SunTax Secure Encrypted Backup")
    print(f"Environment : {settings.ENVIRONMENT}")
    print(f"Retention   : {args.retention_days} days")
    print(f"============================================================")

    async with AsyncSessionLocal() as db:
        try:
            result = await secure_backup_service.create_encrypted_backup(
                db=db,
                operator=os.environ.get("USER", "cli-operator"),
                out_dir=out_dir,
                explicit_key=args.key,
            )
            print("Backup created successfully:")
            print(f"  File: {result['filename']}")
            print(f"  Path: {result['path']}")
            print(f"  Size: {result['file_size_bytes']} bytes")
            print(f"  Counts: {result['manifest']['record_counts']}")
            if result.get("pruned_backups"):
                print(f"  Pruned expired archives: {result['pruned_backups']}")
            print("============================================================")
            return 0
        except Exception as exc:
            print(f"ERROR creating secure backup: {exc}", file=sys.stderr)
            return 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
