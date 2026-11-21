#!/usr/bin/env python3
"""
SunTax Render PostgreSQL Backup Script.

Exports a full snapshot of all database tables (users, tax returns, profiles,
calculations, documents, waitlist) to a local timestamped JSON file.
Works with Render free PostgreSQL to protect against the 30-day trial expiry.

Usage:
    python scripts/backup_render_db.py
"""
import asyncio
import json
import os
import sys
from datetime import datetime
from pathlib import Path

# Add backend directory to sys.path
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models.user import User
from app.models.tax_return import TaxReturn
from app.models.tax_profile import TaxProfile
from app.models.tax_calculation import TaxCalculation
from app.models.document import Document
from app.models.waitlist import WaitlistEntry


async def run_backup():
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    out_dir = BACKEND_DIR / "backups"
    out_dir.mkdir(exist_ok=True)
    out_file = out_dir / f"suntax_db_backup_{timestamp}.json"

    print(f"Connecting to database to generate backup: {out_file.name} ...")

    async with AsyncSessionLocal() as db:
        users = (await db.execute(select(User))).scalars().all()
        returns = (await db.execute(select(TaxReturn))).scalars().all()
        profiles = (await db.execute(select(TaxProfile))).scalars().all()
        calcs = (await db.execute(select(TaxCalculation))).scalars().all()
        docs = (await db.execute(select(Document))).scalars().all()
        waitlist = (await db.execute(select(WaitlistEntry))).scalars().all()

        backup_data = {
            "version": "1.0",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "stats": {
                "users": len(users),
                "tax_returns": len(returns),
                "tax_profiles": len(profiles),
                "tax_calculations": len(calcs),
                "documents": len(docs),
                "waitlist": len(waitlist),
            },
            "users": [
                {
                    "id": str(u.id),
                    "email": u.email,
                    "hashed_password": u.hashed_password,
                    "full_name": u.full_name,
                    "is_active": u.is_active,
                    "is_verified": u.is_verified,
                    "is_admin": u.is_admin,
                    "totp_secret": u.totp_secret,
                    "totp_enabled": u.totp_enabled,
                    "created_at": u.created_at.isoformat() if u.created_at else None,
                }
                for u in users
            ],
            "tax_returns": [
                {
                    "id": str(r.id),
                    "user_id": str(r.user_id),
                    "canton_code": r.canton_code,
                    "tax_year": r.tax_year,
                    "status": r.status,
                    "transmission_status": r.transmission_status,
                    "payment_status": r.payment_status,
                    "confirmed_at": r.confirmed_at.isoformat() if r.confirmed_at else None,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                }
                for r in returns
            ],
            "tax_profiles": [
                {
                    "id": str(p.id),
                    "tax_return_id": str(p.tax_return_id),
                    "personal_data": p.personal_data,
                    "income_data": p.income_data,
                    "wealth_data": p.wealth_data,
                    "deductions_data": p.deductions_data,
                    "liabilities_data": p.liabilities_data,
                    "tax_questions": p.tax_questions,
                }
                for p in profiles
            ],
            "tax_calculations": [
                {
                    "id": str(c.id),
                    "tax_return_id": str(c.tax_return_id),
                    "cantonal_income_tax": float(c.cantonal_income_tax) if c.cantonal_income_tax is not None else 0.0,
                    "municipal_income_tax": float(c.municipal_income_tax) if c.municipal_income_tax is not None else 0.0,
                    "federal_income_tax": float(c.federal_income_tax) if c.federal_income_tax is not None else 0.0,
                    "total_tax_due": float(c.total_tax_due) if c.total_tax_due is not None else 0.0,
                    "calculation_details": c.calculation_details,
                    "is_final": c.is_final,
                    "calculated_at": c.calculated_at.isoformat() if c.calculated_at else None,
                }
                for c in calcs
            ],
            "documents": [
                {
                    "id": str(d.id),
                    "tax_return_id": str(d.tax_return_id) if d.tax_return_id else None,
                    "user_id": str(d.user_id),
                    "filename": d.original_filename,
                    "document_type": d.document_type,
                    "storage_key": d.storage_key,
                    "mime_type": d.mime_type,
                    "file_size_bytes": d.file_size_bytes,
                    "processing_status": d.processing_status,
                    "ocr_text": d.ocr_text,
                    "extracted_data": d.extracted_data,
                    "uploaded_at": d.uploaded_at.isoformat() if d.uploaded_at else None,
                }
                for d in docs
            ],
            "waitlist": [
                {
                    "id": str(w.id),
                    "email": w.email,
                    "canton_code": w.canton_code,
                    "created_at": w.created_at.isoformat() if w.created_at else None,
                }
                for w in waitlist
            ],
        }

        out_file.write_text(json.dumps(backup_data, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"Backup successfully generated: {out_file} ({out_file.stat().st_size} bytes)")
        print(f"Summary: {backup_data['stats']}")


if __name__ == "__main__":
    asyncio.run(run_backup())
