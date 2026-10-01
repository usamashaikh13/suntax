"""
Tax returns and canton/municipality API router.

Endpoints:
  GET    /tax-returns
  POST   /tax-returns
  GET    /tax-returns/{id}
  PATCH  /tax-returns/{id}
  DELETE /tax-returns/{id}
  GET    /cantons
  GET    /cantons/{code}/municipalities
"""

from __future__ import annotations

import logging
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db, set_rls_user_id
from app.core.security import get_current_user
from app.models.audit_log import AuditLog
from app.models.tax_return import TaxReturn
from app.models.tax_profile import TaxProfile
from app.models.user import User
from app.schemas.tax_profile import TaxProfileResponse, TaxProfileUpdateRequest
from app.schemas.tax_return import (
    CantonResponse,
    MunicipalityResponse,
    TaxReturnCreate,
    TaxReturnListResponse,
    TaxReturnResponse,
    TaxReturnUpdate,
)
from app.services.canton_service import CantonService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Tax Returns"])
canton_service = CantonService()


async def _get_owned_tax_return(
    tax_return_id: str,
    current_user: User,
    db: AsyncSession,
) -> TaxReturn:
    """Load one return and consistently enforce ownership."""
    await set_rls_user_id(db, current_user.id)
    result = await db.execute(
        select(TaxReturn).where(
            TaxReturn.id == str(tax_return_id),
            TaxReturn.user_id == current_user.id,
        )
    )
    tax_return = result.scalar_one_or_none()
    if not tax_return:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tax return not found")
    return tax_return


async def _get_or_create_profile(tax_return: TaxReturn, db: AsyncSession) -> TaxProfile:
    """Every return has one editable profile, including returns created before this endpoint existed."""
    result = await db.execute(
        select(TaxProfile).where(TaxProfile.tax_return_id == tax_return.id)
    )
    profile = result.scalar_one_or_none()
    if profile:
        return profile

    profile = TaxProfile(
        tax_return_id=tax_return.id,
        personal_data={},
        income_data={},
        wealth_data={},
        deductions_data={},
        liabilities_data={},
        tax_questions=[],
        tax_flags=[],
        completeness_score=0,
    )
    db.add(profile)
    await db.flush()
    return profile


# ── Canton / municipality lookups ─────────────────────────────────────────────


@router.get(
    "/cantons",
    response_model=List[CantonResponse],
    summary="List all supported Swiss cantons",
)
async def list_cantons() -> List[CantonResponse]:
    """Return all supported cantons with their ISO codes and display names."""
    return canton_service.get_all_cantons()


@router.get(
    "/cantons/{canton_code}/municipalities",
    response_model=List[MunicipalityResponse],
    summary="List municipalities for a canton",
)
async def list_municipalities(
    canton_code: str,
) -> List[MunicipalityResponse]:
    """Return major municipalities (Gemeinden) for a given canton code."""
    municipalities = canton_service.get_municipalities(canton_code.upper())
    if not municipalities:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Canton '{canton_code}' not found or not supported",
        )
    return municipalities


# ── Tax return CRUD ───────────────────────────────────────────────────────────


@router.get(
    "/tax-returns",
    response_model=TaxReturnListResponse,
    summary="List the current user's tax returns",
)
async def list_tax_returns(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaxReturnListResponse:
    """Paginated list of tax returns owned by the authenticated user."""
    await set_rls_user_id(db, current_user.id)

    offset = (page - 1) * page_size

    count_q = select(func.count()).select_from(
        select(TaxReturn).where(TaxReturn.user_id == current_user.id).subquery()
    )
    total_result = await db.execute(count_q)
    total = total_result.scalar_one()

    items_q = (
        select(TaxReturn)
        .where(TaxReturn.user_id == current_user.id)
        .order_by(TaxReturn.tax_year.desc(), TaxReturn.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    items_result = await db.execute(items_q)
    items = items_result.scalars().all()

    return TaxReturnListResponse(
        items=[TaxReturnResponse.model_validate(r) for r in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/tax-returns",
    response_model=TaxReturnResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new tax return",
)
async def create_tax_return(
    payload: TaxReturnCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaxReturnResponse:
    """
    Create a new draft tax return for the given canton/year.

    Validates that the canton is supported and no duplicate exists.
    """
    await set_rls_user_id(db, current_user.id)

    # Validate canton
    if not canton_service.canton_exists(payload.canton_code.upper()):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Canton '{payload.canton_code}' is not supported",
        )

    # Check for duplicate
    dup_q = select(TaxReturn).where(
        TaxReturn.user_id == current_user.id,
        TaxReturn.canton_code == payload.canton_code.upper(),
        TaxReturn.tax_year == payload.tax_year,
    )
    existing = (await db.execute(dup_q)).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A tax return for {payload.tax_year} in {payload.canton_code} already exists",
        )

    tax_return = TaxReturn(
        user_id=current_user.id,
        canton_code=payload.canton_code.upper(),
        municipality_code=payload.municipality_code,
        municipality_name=payload.municipality_name,
        tax_year=payload.tax_year,
        status="draft",
    )
    db.add(tax_return)
    await db.flush()
    await _get_or_create_profile(tax_return, db)

    # Audit
    db.add(
        AuditLog(
            user_id=current_user.id,
            action="tax_return.created",
            resource_type="tax_return",
            resource_id=str(tax_return.id),
        )
    )

    logger.info("Created TaxReturn id=%s user=%s", tax_return.id, current_user.id)
    return TaxReturnResponse.model_validate(tax_return)


@router.get(
    "/tax-returns/{tax_return_id}/profile",
    response_model=TaxProfileResponse,
    summary="Get the editable taxpayer profile",
)
async def get_tax_profile(
    tax_return_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaxProfileResponse:
    tax_return = await _get_owned_tax_return(tax_return_id, current_user, db)
    profile = await _get_or_create_profile(tax_return, db)
    return TaxProfileResponse.model_validate(profile)


@router.patch(
    "/tax-returns/{tax_return_id}/profile",
    response_model=TaxProfileResponse,
    summary="Update the editable taxpayer profile",
)
async def update_tax_profile(
    tax_return_id: str,
    payload: TaxProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaxProfileResponse:
    tax_return = await _get_owned_tax_return(tax_return_id, current_user, db)
    profile = await _get_or_create_profile(tax_return, db)
    for field in (
        "personal_data",
        "income_data",
        "wealth_data",
        "deductions_data",
        "liabilities_data",
        "notes",
    ):
        value = getattr(payload, field)
        if value is not None:
            setattr(profile, field, value.model_dump() if hasattr(value, "model_dump") else value)
    db.add(profile)
    await db.flush()
    return TaxProfileResponse.model_validate(profile)


@router.get(
    "/tax-returns/{tax_return_id}",
    response_model=TaxReturnResponse,
    summary="Get a specific tax return",
)
async def get_tax_return(
    tax_return_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaxReturnResponse:
    """Return a single tax return. Enforces ownership."""
    await set_rls_user_id(db, current_user.id)

    result = await db.execute(
        select(TaxReturn).where(
            TaxReturn.id == str(tax_return_id),
            TaxReturn.user_id == current_user.id,
        )
    )
    tax_return = result.scalar_one_or_none()
    if not tax_return:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tax return not found")

    return TaxReturnResponse.model_validate(tax_return)


@router.patch(
    "/tax-returns/{tax_return_id}",
    response_model=TaxReturnResponse,
    summary="Update a tax return's status",
)
async def update_tax_return(
    tax_return_id: str,
    payload: TaxReturnUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaxReturnResponse:
    """Update mutable fields on a tax return. Only status is permitted via this endpoint."""
    await set_rls_user_id(db, current_user.id)

    result = await db.execute(
        select(TaxReturn).where(
            TaxReturn.id == str(tax_return_id),
            TaxReturn.user_id == current_user.id,
        )
    )
    tax_return = result.scalar_one_or_none()
    if not tax_return:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tax return not found")

    if payload.status is not None:
        tax_return.status = payload.status

    db.add(tax_return)
    return TaxReturnResponse.model_validate(tax_return)


@router.delete(
    "/tax-returns/{tax_return_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Delete a draft tax return",
)
async def delete_tax_return(
    tax_return_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Delete a tax return. Only returns in 'draft' status may be deleted.
    """
    await set_rls_user_id(db, current_user.id)

    result = await db.execute(
        select(TaxReturn).where(
            TaxReturn.id == str(tax_return_id),
            TaxReturn.user_id == current_user.id,
        )
    )
    tax_return = result.scalar_one_or_none()
    if not tax_return:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tax return not found")

    if tax_return.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete a tax return with status '{tax_return.status}'",
        )

    db.add(
        AuditLog(
            user_id=current_user.id,
            action="tax_return.deleted",
            resource_type="tax_return",
            resource_id=str(tax_return.id),
        )
    )
    await db.delete(tax_return)
