"""
Public configuration & i18n API router (Brand centralization + German texts + 26-canton rules).
"""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Query

from app.core.config import settings
from app.services.rules_data_service import rules_data_service

router = APIRouter(tags=["Config & Data"])


@router.get(
    "/config/brand",
    summary="Return centralized brand configuration (Addendum 1 § 1)",
)
async def get_brand_config() -> Dict[str, Any]:
    """Single source of truth for brand name, domain, logo, contact email, and eCH sourceDescription."""
    return settings.get_brand_config()


@router.get(
    "/i18n/de",
    summary="Return unified German UI translations (Addendum 1 § 6)",
)
async def get_de_translations() -> Dict[str, Any]:
    """All German app texts from app_texts_de.json interpolated with centralized brand config."""
    return rules_data_service.get_de_texts()


@router.get(
    "/rules/cantons-overview",
    summary="Return 26-canton deduction limits and rollout availability (Addendum 1 § 2 & 3)",
)
async def get_cantons_overview(
    tax_year: int = Query(2025, description="Tax year (2025 or 2026)"),
) -> Dict[str, Any]:
    """Public informational overview of all 26 cantons for website calculator and app start."""
    return rules_data_service.get_all_cantons_overview(tax_year=tax_year)
