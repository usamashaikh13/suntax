"""
API Router for Deduction Rules and Contextual Info Texts — Milestone 2, Part A1 & B5.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, get_current_admin_user
from app.models.user import User
from app.services.deduction_rules_service import deduction_rules_service
from app.services.question_info_service import question_info_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Tax Rules & Info"])


@router.get(
    "/rules/deduction-rules",
    summary="List deduction rules for canton, tax year, and tax level",
)
async def list_deduction_rules(
    canton: str = Query("ZH", description="Two-letter canton code"),
    tax_year: int = Query(2025, description="Tax assessment year"),
    level: Optional[str] = Query(None, description="'canton' or 'federal'"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Retrieve official deduction rules from the database table."""
    canton_rules = await deduction_rules_service.get_rules_for_level(
        db, canton=canton, tax_year=tax_year, level="canton"
    )
    federal_rules = await deduction_rules_service.get_rules_for_level(
        db, canton=canton, tax_year=tax_year, level="federal"
    )

    def _serialize(rule):
        return {
            "canton": rule.canton,
            "tax_year": rule.tax_year,
            "level": rule.level,
            "code": rule.code,
            "form_field": rule.form_field,
            "type": rule.type,
            "value": rule.value,
            "min": rule.min_val,
            "max": rule.max_val,
            "base": rule.base,
            "conditions": rule.conditions,
            "depends_on": rule.depends_on,
            "source_url": rule.source_url,
            "source_page": rule.source_page,
            "status": rule.status,
        }

    return {
        "canton": canton.upper(),
        "tax_year": tax_year,
        "canton_rules": {k: _serialize(v) for k, v in canton_rules.items()},
        "federal_rules": {k: _serialize(v) for k, v in federal_rules.items()},
    }


@router.get(
    "/rules/info-texts",
    summary="Get contextual «i» information cards and tips for a canton and year",
)
async def get_question_info_texts(
    canton: str = Query("ZH", description="Two-letter canton code"),
    tax_year: int = Query(2025, description="Tax assessment year"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Retrieve 3-part contextual help text and deduction warnings per canton."""
    return await question_info_service.get_info_texts(db, canton=canton, tax_year=tax_year)


@router.post(
    "/rules/deduction-rules/import-csv",
    summary="Import or update deduction rules via CSV (Admin only)",
)
async def import_deduction_rules_csv(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    admin_user: User = Depends(get_current_admin_user),
) -> Dict[str, Any]:
    """Admin endpoint to upload a new deduction_rules.csv without changing code."""
    content = (await file.read()).decode("utf-8")
    count = await deduction_rules_service.seed_from_csv(db, csv_text=content)
    return {
        "message": f"Successfully imported {count} deduction rules into the database.",
        "count": count,
    }
