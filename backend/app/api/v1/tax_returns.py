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
from typing import List, Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db, set_rls_user_id
from app.core.security import get_current_user
from app.models.audit_log import AuditLog
from app.models.document import Document
from app.models.tax_return import TaxReturn
from app.models.tax_profile import TaxProfile
from app.models.tax_calculation import TaxCalculation
from app.models.user import User
from app.models.waitlist import WaitlistEntry
from app.schemas.tax_profile import TaxProfileResponse, TaxProfileUpdateRequest, TaxQuestion
from app.schemas.tax_return import (
    CantonResponse,
    MunicipalityResponse,
    TaxReturnCreate,
    TaxReturnListResponse,
    TaxReturnResponse,
    TaxReturnUpdate,
    WaitlistCreateRequest,
)
from app.services.canton_service import CantonService
from app.services.canton_transmission import (
    CantonNotAvailableError,
    get_transmission_adapter,
)
from app.services.pdf_export_service import generate_tax_return_pdf
from app.services.rules_data_service import rules_data_service
from app.services.tax_tips_service import tax_tips_service
from app.services.xml_export_service import generate_ech_xml
from app.services.smart_questions_service import (
    generate_smart_questions,
    generate_ai_questions,
    apply_answers_to_profile,
)
from app.services.tax_optimization_service import compute_tax_opportunities
from app.services.payrexx_service import payrexx_service
from app.api.v1.documents import apply_document_to_tax_profile

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
            TaxReturn.user_id == str(current_user.id),
        )
    )
    tax_return = result.scalar_one_or_none()
    if not tax_return:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tax return not found")
    return tax_return


async def _get_or_create_profile(tax_return: TaxReturn, db: AsyncSession) -> TaxProfile:
    """Every return has one editable profile, including returns created before this endpoint existed."""
    result = await db.execute(
        select(TaxProfile).where(TaxProfile.tax_return_id == str(tax_return.id))
    )
    profile = result.scalar_one_or_none()

    from app.models.user import User
    u_res = await db.execute(select(User).where(User.id == str(tax_return.user_id)))
    user = u_res.scalar_one_or_none()

    if profile:
        # Enrich personal_data if fields are missing or 'None'
        pd = dict(profile.personal_data or {})
        changed = False
        if user and user.full_name:
            if not pd.get("first_name") or str(pd.get("first_name")).lower() in ("none", "null"):
                parts = user.full_name.strip().split(" ", 1)
                pd["first_name"] = parts[0]
                pd["last_name"] = parts[1] if len(parts) > 1 else ""
                pd["name"] = user.full_name
                changed = True
        if tax_return.municipality_name:
            if not pd.get("address_city") or str(pd.get("address_city")).lower() in ("none", "null"):
                pd["address_city"] = tax_return.municipality_name
                changed = True
        if changed:
            profile.personal_data = pd
            db.add(profile)
            await db.flush()
            await db.refresh(profile)
        return profile

    import uuid
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    init_pd = {}
    if user and user.full_name:
        parts = user.full_name.strip().split(" ", 1)
        init_pd["first_name"] = parts[0]
        init_pd["last_name"] = parts[1] if len(parts) > 1 else ""
        init_pd["name"] = user.full_name
    if tax_return.municipality_name:
        init_pd["address_city"] = tax_return.municipality_name

    profile = TaxProfile(
        id=str(uuid.uuid4()),
        tax_return_id=str(tax_return.id),
        personal_data=init_pd,
        income_data={},
        wealth_data={},
        deductions_data={},
        liabilities_data={},
        tax_questions=[],
        tax_flags=[],
        completeness_score=0,
        created_at=now,
        updated_at=now,
    )
    db.add(profile)
    await db.flush()
    await db.refresh(profile)
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


@router.get(
    "/cantons/plz/{plz}",
    summary="Resolve a 4-digit Swiss postal code (PLZ) to canton and municipality",
)
async def lookup_postal_code(plz: str) -> dict:
    """
    Resolve a 4-digit Swiss postal code (PLZ) to municipality and BFS number.
    Handles ambiguous postcodes by returning all candidate municipalities.
    """
    res = canton_service.lookup_plz(plz)
    if not res:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Postleitzahl '{plz}' nicht gefunden",
        )
    return res


@router.get(
    "/cantons/{canton_code}/availability",
    summary="Check canton rollout availability ('available' vs 'coming_soon') from data config",
)
async def get_canton_availability(
    canton_code: str,
    tax_year: int = Query(2025, ge=2024, le=2030),
) -> dict:
    """Return rollout availability purely from rules_2025_2026.json (no code switch needed)."""
    code = canton_code.strip().upper()
    avail = rules_data_service.get_canton_availability(code, tax_year)
    c_rules = rules_data_service.get_canton_rules(code, tax_year)
    return {
        "canton_code": code,
        "name": c_rules.get("name", code),
        "tax_year": tax_year,
        "availability": avail,
        "is_available": avail == "available",
        "message": (
            f"Kanton {code} ist für {tax_year} freigeschaltet."
            if avail == "available"
            else f"Dein Kanton kommt bald ({code} / {tax_year}). Trag dich in die Warteliste ein."
        ),
        "submission_note": c_rules.get("submission_note", ""),
    }


@router.post(
    "/waitlist",
    status_code=status.HTTP_201_CREATED,
    summary="Register email on waitlist for a 'coming_soon' canton (Addendum 1 Section 2)",
)
async def join_canton_waitlist(
    payload: WaitlistCreateRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Store email + canton waitlist entry for cantons not yet switched on."""
    canton_code = payload.canton_code.strip().upper()
    email_clean = payload.email.strip().lower()
    existing_res = await db.execute(
        select(WaitlistEntry).where(
            WaitlistEntry.email == email_clean,
            WaitlistEntry.canton_code == canton_code,
            WaitlistEntry.tax_year == payload.tax_year,
        )
    )
    existing = existing_res.scalar_one_or_none()
    if existing:
        return {
            "status": "already_registered",
            "id": existing.id,
            "email": email_clean,
            "canton_code": canton_code,
            "tax_year": payload.tax_year,
            "message": f"Du bist bereits auf der Warteliste für {canton_code} ({payload.tax_year}).",
        }

    entry = WaitlistEntry(
        email=email_clean,
        canton_code=canton_code,
        tax_year=payload.tax_year,
        postal_code=payload.postal_code,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return {
        "status": "subscribed",
        "id": entry.id,
        "email": email_clean,
        "canton_code": canton_code,
        "tax_year": payload.tax_year,
        "message": f"Vielen Dank! Wir benachrichtigen dich per E-Mail, sobald {canton_code} freigeschaltet ist.",
    }


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
        select(TaxReturn).where(TaxReturn.user_id == str(current_user.id)).subquery()
    )
    total_result = await db.execute(count_q)
    total = total_result.scalar_one()

    items_q = (
        select(TaxReturn)
        .where(TaxReturn.user_id == str(current_user.id))
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
        TaxReturn.user_id == str(current_user.id),
        TaxReturn.canton_code == payload.canton_code.upper(),
        TaxReturn.tax_year == payload.tax_year,
    )
    existing = (await db.execute(dup_q)).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A tax return for {payload.tax_year} in {payload.canton_code} already exists",
        )

    import uuid
    tax_return = TaxReturn(
        id=str(uuid.uuid4()),
        user_id=str(current_user.id),
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
            user_id=str(current_user.id),
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
    """Return (or lazily create) the editable taxpayer profile for a tax return."""
    tax_return = await _get_owned_tax_return(tax_return_id, current_user, db)
    profile = await _get_or_create_profile(tax_return, db)
    try:
        await db.refresh(profile)
    except Exception:
        pass
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

    # Finalized state protection: confirmed tax returns cannot be modified without reopening
    if tax_return.status == "confirmed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot modify a confirmed tax return. Reopen the tax return before making modifications.",
        )

    profile = await _get_or_create_profile(tax_return, db)

    # Selective deep merge: update only supplied fields while preserving unrelated existing values
    # and internal provenance metadata (_doc_contributions)
    for field in (
        "personal_data",
        "income_data",
        "wealth_data",
        "deductions_data",
        "liabilities_data",
    ):
        value = getattr(payload, field)
        if value is not None:
            raw_update = (
                value.model_dump(exclude_unset=True)
                if hasattr(value, "model_dump")
                else (dict(value) if isinstance(value, dict) else value)
            )
            if isinstance(raw_update, dict):
                existing_dict = dict(getattr(profile, field) or {})
                doc_contribs = existing_dict.get("_doc_contributions")
                for k, v in raw_update.items():
                    if v is not None:
                        existing_dict[k] = v
                if doc_contribs and "_doc_contributions" not in existing_dict:
                    existing_dict["_doc_contributions"] = doc_contribs
                setattr(profile, field, existing_dict)
            else:
                setattr(profile, field, raw_update)

    if payload.notes is not None:
        profile.notes = payload.notes

    profile.updated_at = datetime.now(timezone.utc)
    if profile.created_at is None:
        profile.created_at = datetime.now(timezone.utc)
    db.add(profile)

    # Invalidate prior calculation snapshots and confirmations: material profile edits render existing calculations and signatures stale
    await db.execute(
        update(TaxCalculation)
        .where(TaxCalculation.tax_return_id == str(tax_return.id))
        .values(status="stale")
    )
    if tax_return.confirmed_at or tax_return.partner2_confirmed_at:
        tax_return.confirmed_at = None
        tax_return.partner2_confirmed_at = None
        tax_return.partner2_confirmed_name = None
        if tax_return.status == "confirmed":
            tax_return.status = "draft"
        db.add(tax_return)
    if tax_return.confirmed_at or tax_return.partner2_confirmed_at:
        tax_return.confirmed_at = None
        tax_return.partner2_confirmed_at = None
        tax_return.partner2_confirmed_name = None
        if tax_return.status == "confirmed":
            tax_return.status = "draft"
        db.add(tax_return)

    await db.commit()
    await db.refresh(profile)
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
    tax_return = await _get_owned_tax_return(tax_return_id, current_user, db)
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
    tax_return = await _get_owned_tax_return(tax_return_id, current_user, db)

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
    tax_return = await _get_owned_tax_return(tax_return_id, current_user, db)

    if tax_return.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete a tax return with status '{tax_return.status}'",
        )

    db.add(
        AuditLog(
            user_id=str(current_user.id),
            action="tax_return.deleted",
            resource_type="tax_return",
            resource_id=str(tax_return.id),
        )
    )
    await db.delete(tax_return)
    await db.commit()


@router.post(
    "/tax-returns/{tax_return_id}/reopen",
    summary="Reopen a confirmed tax return for editing (invalidates confirmations and calculations)",
)
async def reopen_tax_return(
    tax_return_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Reopen a confirmed tax return so the user can make modifications."""
    tax_return = await _get_owned_tax_return(tax_return_id, current_user, db)
    if tax_return.status == "submitted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bereits übermittelte Steuererklärungen können nicht erneut geöffnet werden.",
        )

    now = datetime.now(timezone.utc)
    tax_return.status = "draft"
    tax_return.confirmed_at = None
    tax_return.partner2_confirmed_at = None
    tax_return.partner2_confirmed_name = None
    tax_return.updated_at = now

    await db.execute(
        update(TaxCalculation)
        .where(TaxCalculation.tax_return_id == str(tax_return.id))
        .values(status="stale")
    )
    db.add(tax_return)
    await db.commit()

    return {
        "status": "draft",
        "message": "Steuererklärung wurde zur Bearbeitung wieder geöffnet. Vorherige Bestätigungen wurden zurückgesetzt.",
        "tax_return_id": str(tax_return.id),
    }


# ── Smart Questions ───────────────────────────────────────────────────────────


@router.get(
    "/tax-returns/{tax_return_id}/questions",
    response_model=List[TaxQuestion],
    summary="Get dynamic smart questions for missing tax data",
)
async def get_tax_return_questions(
    tax_return_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[TaxQuestion]:
    """Dynamically generate missing-data questions based on profile and document status."""
    tax_return = await _get_owned_tax_return(tax_return_id, current_user, db)
    profile = await _get_or_create_profile(tax_return, db)
    docs = (
        await db.execute(
            select(Document).where(Document.tax_return_id == str(tax_return.id))
        )
    ).scalars().all()

    existing_ans = {}
    for q in (profile.tax_questions or []):
        if isinstance(q, dict) and q.get("answer"):
            existing_ans[q["id"]] = q["answer"]

    qs = await generate_ai_questions(
        personal_data=profile.personal_data or {},
        income_data=profile.income_data or {},
        wealth_data=profile.wealth_data or {},
        deductions_data=profile.deductions_data or {},
        liabilities_data=profile.liabilities_data or {},
        documents=docs,
        canton_code=tax_return.canton_code,
        tax_year=tax_return.tax_year,
        existing_answers=existing_ans,
    )
    profile.tax_questions = qs
    db.add(profile)
    await db.commit()
    return [TaxQuestion.model_validate(q) for q in qs]


@router.post(
    "/tax-returns/{tax_return_id}/questions/{question_id}/answer",
    response_model=TaxQuestion,
    summary="Answer an individual smart question",
)
async def answer_single_question(
    tax_return_id: str,
    question_id: str,
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaxQuestion:
    """Submit an answer to a single question and update the profile accordingly."""
    tax_return = await _get_owned_tax_return(tax_return_id, current_user, db)
    if tax_return.status == "confirmed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot modify a confirmed tax return. Reopen the tax return before making modifications.",
        )

    profile = await _get_or_create_profile(tax_return, db)
    answer = payload.get("answer", "")

    p_data, inc_data, w_data, ded_data, liab_data = apply_answers_to_profile(
        answers={question_id: answer},
        personal_data=dict(profile.personal_data or {}),
        income_data=dict(profile.income_data or {}),
        wealth_data=dict(profile.wealth_data or {}),
        deductions_data=dict(profile.deductions_data or {}),
        liabilities_data=dict(profile.liabilities_data or {}),
        questions_list=profile.tax_questions,
    )
    profile.personal_data = p_data
    profile.income_data = inc_data
    profile.wealth_data = w_data
    profile.deductions_data = ded_data
    profile.liabilities_data = liab_data

    qs = list(profile.tax_questions or [])
    updated_q = None
    for q in qs:
        if isinstance(q, dict) and q.get("id") == question_id:
            q["answer"] = answer
            q["is_answered"] = bool(answer)
            updated_q = q
            break
    if not updated_q:
        updated_q = {
            "id": question_id,
            "category": "other",
            "question": question_id,
            "answer": answer,
            "is_answered": bool(answer),
        }
        qs.append(updated_q)

    profile.tax_questions = qs
    profile.updated_at = datetime.now(timezone.utc)
    db.add(profile)

    await db.execute(
        update(TaxCalculation)
        .where(TaxCalculation.tax_return_id == str(tax_return.id))
        .values(status="stale")
    )
    if tax_return.confirmed_at or tax_return.partner2_confirmed_at:
        tax_return.confirmed_at = None
        tax_return.partner2_confirmed_at = None
        tax_return.partner2_confirmed_name = None
        if tax_return.status == "confirmed":
            tax_return.status = "draft"
        db.add(tax_return)

    await db.commit()
    return TaxQuestion.model_validate(updated_q)


@router.post(
    "/tax-returns/{tax_return_id}/questions/submit",
    summary="Submit batch answers to smart questions",
)
async def submit_questions(
    tax_return_id: str,
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Submit answers to multiple questions and refresh the profile."""
    tax_return = await _get_owned_tax_return(tax_return_id, current_user, db)
    if tax_return.status == "confirmed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot modify a confirmed tax return. Reopen the tax return before making modifications.",
        )

    profile = await _get_or_create_profile(tax_return, db)
    answers = payload.get("answers", {})

    p_data, inc_data, w_data, ded_data, liab_data = apply_answers_to_profile(
        answers=answers,
        personal_data=dict(profile.personal_data or {}),
        income_data=dict(profile.income_data or {}),
        wealth_data=dict(profile.wealth_data or {}),
        deductions_data=dict(profile.deductions_data or {}),
        liabilities_data=dict(profile.liabilities_data or {}),
    )
    profile.personal_data = p_data
    profile.income_data = inc_data
    profile.wealth_data = w_data
    profile.deductions_data = ded_data
    profile.liabilities_data = liab_data

    qs = list(profile.tax_questions or [])
    for q in qs:
        if isinstance(q, dict) and q.get("id") in answers:
            q["answer"] = answers[q["id"]]
            q["is_answered"] = bool(answers[q["id"]])
    profile.tax_questions = qs
    profile.updated_at = datetime.now(timezone.utc)
    db.add(profile)

    await db.execute(
        update(TaxCalculation)
        .where(TaxCalculation.tax_return_id == str(tax_return.id))
        .values(status="stale")
    )
    if tax_return.confirmed_at or tax_return.partner2_confirmed_at:
        tax_return.confirmed_at = None
        tax_return.partner2_confirmed_at = None
        tax_return.partner2_confirmed_name = None
        if tax_return.status == "confirmed":
            tax_return.status = "draft"
        db.add(tax_return)

    await db.commit()
    return {"message": f"Successfully updated profile with {len(answers)} answers."}


# ── Tax Profile Merge ─────────────────────────────────────────────────────────


@router.post(
    "/tax-returns/{tax_return_id}/apply-documents",
    summary="Apply all approved documents to the profile",
)
async def apply_all_documents(
    tax_return_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Merge approved fields from all documents into the tax profile."""
    tax_return = await _get_owned_tax_return(tax_return_id, current_user, db)
    if tax_return.status == "confirmed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot modify a confirmed tax return. Reopen the tax return before making modifications.",
        )

    profile = await _get_or_create_profile(tax_return, db)
    docs = (
        await db.execute(
            select(Document).where(Document.tax_return_id == str(tax_return.id))
        )
    ).scalars().all()

    all_applied = []
    for doc in docs:
        applied = await apply_document_to_tax_profile(db, doc, profile)
        all_applied.extend(applied)

    await db.execute(
        update(TaxCalculation)
        .where(TaxCalculation.tax_return_id == str(tax_return.id))
        .values(status="stale")
    )
    if tax_return.confirmed_at or tax_return.partner2_confirmed_at:
        tax_return.confirmed_at = None
        tax_return.partner2_confirmed_at = None
        tax_return.partner2_confirmed_name = None
        if tax_return.status == "confirmed":
            tax_return.status = "draft"
        db.add(tax_return)

    await db.commit()
    return {
        "message": f"Applied {len(all_applied)} fields from {len(docs)} documents to tax profile.",
        "applied_fields": all_applied,
    }


# ── Tax Optimisation Opportunities ────────────────────────────────────────────


@router.get(
    "/tax-returns/{tax_return_id}/opportunities",
    summary="Get rule-based tax deduction opportunities and estimates",
)
async def get_tax_opportunities(
    tax_return_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[dict]:
    """Evaluate applicable Swiss tax deductions and optimization opportunities."""
    tax_return = await _get_owned_tax_return(tax_return_id, current_user, db)
    profile = await _get_or_create_profile(tax_return, db)
    return compute_tax_opportunities(
        personal_data=profile.personal_data or {},
        income_data=profile.income_data or {},
        wealth_data=profile.wealth_data or {},
        deductions_data=profile.deductions_data or {},
        liabilities_data=profile.liabilities_data or {},
        canton_code=tax_return.canton_code,
        tax_year=tax_return.tax_year,
    )


# ── Defaults Auto-Suggestion (Milestone 2, Part B2) ──────────────────────────


@router.get(
    "/tax-returns/suggest-defaults",
    summary="Suggest default tax year, canton, and municipality based on customer documents",
)
async def suggest_tax_return_defaults(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Suggest canton, municipality, and tax year (2025 by default).
    If a previous profile or Lohnausweis exists, suggests municipality from address.
    """
    # Find most recent return or doc
    stmt = (
        select(TaxReturn)
        .where(TaxReturn.user_id == str(current_user.id))
        .order_by(TaxReturn.created_at.desc())
        .limit(1)
    )
    res = await db.execute(stmt)
    last_tr = res.scalar_one_or_none()

    suggested_year = 2025
    suggested_canton = "ZH"
    suggested_municipality_code = "261"
    suggested_municipality_name = "Zürich"

    if last_tr:
        suggested_canton = last_tr.canton_code
        if last_tr.municipality_code:
            suggested_municipality_code = last_tr.municipality_code
            suggested_municipality_name = last_tr.municipality_name or "Zürich"

    return {
        "suggested_tax_year": suggested_year,
        "suggested_canton": suggested_canton,
        "suggested_municipality_code": suggested_municipality_code,
        "suggested_municipality_name": suggested_municipality_name,
        "reason": "Vorgeschlagen basierend auf den Steuerrichtlinien 2025 und Schweizer Wohnsitzdaten.",
    }


# ── Payment Workflow (Milestone 2, Part B6: CHF 39 TWINT / Card) ───────────────


@router.post(
    "/tax-returns/{tax_return_id}/payment/checkout",
    summary="Initiate payment for CHF 39 filing fee via TWINT or Card",
)
@router.post(
    "/tax-returns/{tax_return_id}/payment/initiate",
    summary="Initiate payment for CHF 39 filing fee (ad-blocker resilient alias)",
)
async def create_payment_checkout(
    tax_return_id: str,
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Creates a payment checkout session for the flat CHF 39.00 filing fee.
    Supports TWINT and Credit Card via Swiss payment provider Payrexx.
    SunTax never stores sensitive credit card data.
    """
    tax_return = await _get_owned_tax_return(tax_return_id, current_user, db)
    if not rules_data_service.is_canton_available(tax_return.canton_code, tax_return.tax_year):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Dein Kanton kommt bald ({tax_return.canton_code} / {tax_return.tax_year}). Keine Zahlung möglich.",
        )
    method = (payload.get("method") or "twint").lower()
    if method not in ("twint", "credit_card", "card", "postfinance"):
        method = "twint"

    success_url = payload.get("success_url") or f"{settings.FRONTEND_URL}/tax-returns/{tax_return.id}?payment=success"
    failed_url = payload.get("failed_url") or f"{settings.FRONTEND_URL}/tax-returns/{tax_return.id}?payment=failed"
    cancel_url = payload.get("cancel_url") or f"{settings.FRONTEND_URL}/tax-returns/{tax_return.id}?payment=cancel"

    gateway = await payrexx_service.create_gateway(
        tax_return_id=str(tax_return.id),
        amount_chf=39.00,
        currency="CHF",
        payment_methods=[method] if method != "card" else ["mastercard", "visa"],
        success_redirect_url=success_url,
        failed_redirect_url=failed_url,
        cancel_redirect_url=cancel_url,
        user_email=current_user.email,
        user_name=current_user.full_name,
    )

    tax_return.payment_gateway_id = gateway["gateway_id"]
    tax_return.payment_status = "pending"
    tax_return.payment_method = method
    await db.commit()

    return {
        "tax_return_id": str(tax_return.id),
        "amount_chf": 39.00,
        "currency": "CHF",
        "method": method,
        "gateway_id": gateway["gateway_id"],
        "session_id": gateway["gateway_id"],
        "checkout_url": gateway["checkout_url"],
        "status": "ready",
        "is_sandbox": gateway.get("is_sandbox", False),
        "provider": "payrexx",
        "instructions": (
            "Öffnen Sie Ihre TWINT App und scannen Sie den QR-Code oder bestätigen Sie die Zahlung."
            if method == "twint"
            else "Geben Sie Ihre Kreditkartendetails über den gesicherten Payment-Provider ein."
        ),
    }


@router.post(
    "/tax-returns/{tax_return_id}/payment/sandbox-simulate",
    summary="Simulate external payment provider confirmation for sandbox/dev testing",
)
async def simulate_sandbox_payment_endpoint(
    tax_return_id: str,
    payload: dict = Body(default={}),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Simulates provider confirmation for the CHF 39 fee strictly in sandbox/dev environments.
    Disabled in production with live Payrexx credentials.
    """
    # 1. HARD SECURITY GATE: Never allow payment simulation in production under any circumstance
    if settings.ENVIRONMENT == "production":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Payment simulation is strictly forbidden in production environments.",
        )

    # 2. Block if live Payrexx credentials are configured
    if payrexx_service.is_configured:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Simulation is disabled when live Payrexx credentials are configured.",
        )

    tax_return = await _get_owned_tax_return(tax_return_id, current_user, db)
    if not rules_data_service.is_canton_available(tax_return.canton_code, tax_return.tax_year):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Dein Kanton kommt bald ({tax_return.canton_code} / {tax_return.tax_year}). Keine Zahlung möglich.",
        )

    method = (payload.get("method") or tax_return.payment_method or "twint").lower()
    gw_id = tax_return.payment_gateway_id
    if not gw_id or gw_id not in payrexx_service._sandbox_gateways:
        gw = await payrexx_service.create_gateway(
            tax_return_id=str(tax_return.id),
            amount_chf=39.00,
            payment_methods=[method] if method != "card" else ["mastercard", "visa"],
            user_email=current_user.email,
            user_name=current_user.full_name,
        )
        gw_id = gw["gateway_id"]
        tax_return.payment_gateway_id = gw_id
        tax_return.payment_method = method
        await db.commit()

    # Transition sandbox gateway to confirmed via provider simulation
    payrexx_service.simulate_provider_payment(
        gateway_id=gw_id,
        payment_method=method,
        status="confirmed",
    )

    # Validate through official verification pipeline
    verification = await payrexx_service.verify_transaction(
        tax_return_id=str(tax_return.id),
        gateway_id=gw_id,
    )
    if not verification.get("verified"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=verification.get("error") or "Simulation verification failed",
        )

    now = datetime.now(timezone.utc)
    tax_return.payment_status = "paid"
    tax_return.payment_method = method
    tax_return.payment_amount = 39.00
    tax_return.payment_transaction_id = verification.get("transaction_id") or f"tx_sandbox_{uuid.uuid4().hex[:10]}"
    tax_return.paid_at = now
    tax_return.updated_at = now

    db.add(
        AuditLog(
            user_id=str(current_user.id),
            action="payment_received",
            resource_type="tax_return",
            resource_id=str(tax_return.id),
            extra_data=f'{{"amount_chf": 39.00, "method": "{method}", "is_sandbox": true, "transaction_id": "{tax_return.payment_transaction_id}"}}',
        )
    )
    await db.commit()

    return {
        "success": True,
        "is_paid": True,
        "payment_status": "paid",
        "method": method,
        "amount_chf": 39.00,
        "transaction_id": tax_return.payment_transaction_id,
        "gateway_id": gw_id,
        "message": "Sandbox payment successfully confirmed and verified.",
    }


@router.post(
    "/tax-returns/{tax_return_id}/payment/confirm",
    summary="Confirm completed payment for CHF 39 filing fee",
)
async def confirm_payment(
    tax_return_id: str,
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Verify and record receipt of the CHF 39 fee payment.
    Requires genuine verification from Payrexx payment provider.
    """
    tax_return = await _get_owned_tax_return(tax_return_id, current_user, db)

    # Idempotent return if already paid
    if tax_return.payment_status == "paid":
        return {
            "status": "paid",
            "amount_chf": tax_return.payment_amount or 39.0,
            "method": tax_return.payment_method or payload.get("method", "twint"),
            "transaction_id": tax_return.payment_transaction_id,
            "paid_at": tax_return.paid_at.isoformat() if tax_return.paid_at else None,
            "is_sandbox": False,
            "message": "Zahlung von CHF 39.00 wurde bereits erfolgreich verbucht.",
        }

    method = payload.get("method", "twint")
    transaction_id = payload.get("transaction_id")
    gateway_id = payload.get("gateway_id") or tax_return.payment_gateway_id

    # Verify with Payrexx provider
    verification = await payrexx_service.verify_transaction(
        tax_return_id=str(tax_return.id),
        transaction_id=transaction_id,
        gateway_id=gateway_id,
    )

    if not verification.get("verified"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=verification.get("error") or "Zahlung konnte beim Zahlungsanbieter nicht verifiziert werden.",
        )

    # Strict production gate: sandbox payments cannot unlock production returns
    if str(getattr(settings, "ENVIRONMENT", "")).lower() in ("production", "prod") and verification.get("is_sandbox"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sandbox payments cannot be used to unlock tax returns in production.",
        )

    now = datetime.now(timezone.utc)
    tax_return.payment_status = "paid"
    tax_return.payment_method = verification.get("method") or method
    tax_return.payment_amount = verification.get("amount_chf") or 39.0
    tax_return.payment_transaction_id = verification.get("transaction_id")
    tax_return.paid_at = now
    tax_return.updated_at = now

    # Audit log
    audit = AuditLog(
        user_id=str(current_user.id),
        action="payment_received",
        resource_type="tax_return",
        resource_id=str(tax_return.id),
        extra_data=f'{{"amount_chf": 39.00, "method": "{tax_return.payment_method}", "transaction_id": "{tax_return.payment_transaction_id}", "is_sandbox": {str(verification.get("is_sandbox", False)).lower()}, "timestamp": "{now.isoformat()}"}}',
    )
    db.add(audit)
    await db.commit()

    return {
        "status": "paid",
        "amount_chf": 39.00,
        "method": tax_return.payment_method,
        "transaction_id": tax_return.payment_transaction_id,
        "paid_at": now.isoformat(),
        "is_sandbox": verification.get("is_sandbox", False),
        "message": "Zahlung von CHF 39.00 erfolgreich beim Zahlungsanbieter verifiziert und verbucht. Ihre Steuererklärung ist freigeschaltet.",
    }


@router.post(
    "/tax-returns/payment/webhook",
    summary="Handle Payrexx signed payment webhook notification",
)
async def payrexx_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Receives and validates Payrexx webhook events with HMAC-SHA256 signature verification.
    Idempotent: updates tax return payment status upon verified transaction confirmation.
    """
    raw_body = await request.body()
    sig_header = request.headers.get("X-Payrexx-Signature") or request.headers.get("Payrexx-Signature")

    try:
        import json
        payload = json.loads(raw_body.decode("utf-8")) if raw_body else {}
    except Exception:
        raise HTTPException(status_code=400, detail="Ungültiges JSON im Webhook Body.")

    result = payrexx_service.process_webhook_payload(
        payload=payload,
        raw_body=raw_body,
        signature=sig_header,
        enforce_signature=payrexx_service.is_configured or str(getattr(settings, "ENVIRONMENT", "")).lower() in ("production", "prod"),
    )

    if not result.get("valid"):
        logger.warning("Rejected Payrexx webhook: %s", result.get("error"))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=result.get("error") or "Ungültiger Webhook.",
        )

    tax_return_id = result.get("reference_id")
    stmt = select(TaxReturn).where(TaxReturn.id == tax_return_id)
    res = await db.execute(stmt)
    tax_return = res.scalar_one_or_none()

    if not tax_return:
        logger.error("Payrexx webhook tax return not found: %s", tax_return_id)
        raise HTTPException(status_code=404, detail="Steuererklärung nicht gefunden.")

    # Idempotent check
    if tax_return.payment_status == "paid":
        return {"status": "already_processed", "tax_return_id": tax_return_id}

    now = datetime.now(timezone.utc)
    tax_return.payment_status = "paid"
    tax_return.payment_method = result.get("payment_method", "twint")
    tax_return.payment_amount = result.get("amount_chf", 39.0)
    tax_return.payment_transaction_id = result.get("transaction_id")
    tax_return.paid_at = now
    tax_return.updated_at = now

    audit = AuditLog(
        user_id=str(tax_return.user_id),
        action="payment_received_webhook",
        resource_type="tax_return",
        resource_id=str(tax_return.id),
        extra_data=f'{{"amount_chf": 39.00, "method": "{tax_return.payment_method}", "transaction_id": "{tax_return.payment_transaction_id}", "timestamp": "{now.isoformat()}"}}',
    )
    db.add(audit)
    await db.commit()

    logger.info("Successfully marked tax return %s as paid via Payrexx webhook", tax_return_id)
    return {"status": "success", "tax_return_id": tax_return_id, "paid": True}


@router.get(
    "/tax-returns/{tax_return_id}/payment/status",
    summary="Get payment status of tax return",
)
async def get_payment_status(
    tax_return_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Check if the CHF 39 filing fee has been paid."""
    tax_return = await _get_owned_tax_return(tax_return_id, current_user, db)
    return {
        "tax_return_id": str(tax_return.id),
        "payment_status": tax_return.payment_status or "pending",
        "payment_method": tax_return.payment_method,
        "payment_amount": tax_return.payment_amount or 39.0,
        "paid_at": tax_return.paid_at.isoformat() if tax_return.paid_at else None,
        "is_paid": (tax_return.payment_status == "paid"),
        "gateway_id": tax_return.payment_gateway_id,
        "transaction_id": tax_return.payment_transaction_id,
    }


# ── Spouse Confirmation (Art. 113 DBG) ─────────────────────────────────────────

@router.post(
    "/tax-returns/{tax_return_id}/partner2/invite",
    summary="Generate personal invitation and confirmation token for Partner 2",
)
async def invite_partner2(
    tax_return_id: str,
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Generate an expiring single-use token for Partner 2 to review and personally
    confirm the tax return pursuant to Art. 113 DBG.
    """
    import secrets
    from datetime import timedelta

    tax_return = await _get_owned_tax_return(tax_return_id, current_user, db)
    email = payload.get("email") or payload.get("partner2_email")
    phone = payload.get("phone") or payload.get("partner2_phone")

    token = f"p2_tok_{secrets.token_urlsafe(32)}"
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=7)

    tax_return.partner2_email = email
    tax_return.partner2_phone = phone
    tax_return.partner2_confirmation_token = token
    tax_return.partner2_token_expires_at = expires_at
    tax_return.updated_at = now

    audit = AuditLog(
        user_id=str(current_user.id),
        action="partner2_invited",
        resource_type="tax_return",
        resource_id=str(tax_return.id),
        extra_data=f'{{"email": "{email}", "expires_at": "{expires_at.isoformat()}"}}',
    )
    db.add(audit)
    await db.commit()

    return {
        "status": "invited",
        "partner2_email": email,
        "confirmation_token": token,
        "confirmation_url": f"/partner-confirm?token={token}",
        "expires_at": expires_at.isoformat(),
        "message": f"Persönliche Einladung für Partner 2 erstellt. Gültig bis {expires_at.strftime('%d.%m.%Y')}.",
    }


def _is_datetime_expired(dt: Optional[datetime]) -> bool:
    if not dt:
        return False
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt < datetime.now(timezone.utc)


@router.get(
    "/tax-returns/{tax_return_id}/partner2/status",
    summary="Get Partner 2 confirmation status",
)
async def get_partner2_status(
    tax_return_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Check whether Partner 2 has personally signed the tax return."""
    tax_return = await _get_owned_tax_return(tax_return_id, current_user, db)
    return {
        "tax_return_id": str(tax_return.id),
        "is_confirmed": bool(tax_return.partner2_confirmed_at),
        "confirmed_at": tax_return.partner2_confirmed_at.isoformat() if tax_return.partner2_confirmed_at else None,
        "confirmed_name": tax_return.partner2_confirmed_name,
        "partner2_email": tax_return.partner2_email,
        "token_expires_at": tax_return.partner2_token_expires_at.isoformat() if tax_return.partner2_token_expires_at else None,
        "is_token_expired": _is_datetime_expired(tax_return.partner2_token_expires_at),
    }


@router.get(
    "/tax-returns/partner-confirm/{token}",
    summary="Public verification endpoint to inspect return summary for Partner 2",
)
async def inspect_partner_return(
    token: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Allows Partner 2 to review the return summary before giving personal confirmation."""
    clean_token = token.strip()
    stmt = select(TaxReturn).where(TaxReturn.partner2_confirmation_token == clean_token)
    res = await db.execute(stmt)
    tr = res.scalar_one_or_none()

    if not tr:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ungültiger oder nicht gefundener Bestätigungslink.",
        )

    if _is_datetime_expired(tr.partner2_token_expires_at):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Dieser Bestätigungslink ist abgelaufen. Bitte bitten Sie Ihren Partner um einen neuen Link.",
        )

    # Load profile details
    prof_stmt = select(TaxProfile).where(TaxProfile.tax_return_id == str(tr.id))
    prof_res = await db.execute(prof_stmt)
    prof = prof_res.scalar_one_or_none()

    p_data = prof.personal_data if prof and prof.personal_data else {}
    pd2 = p_data.get("partner2", {})

    return {
        "tax_return_id": str(tr.id),
        "canton_code": tr.canton_code,
        "municipality_name": tr.municipality_name,
        "tax_year": tr.tax_year,
        "partner1_name": f"{p_data.get('first_name', '')} {p_data.get('last_name', '')}".strip() or "Partner 1",
        "partner2_name": f"{pd2.get('first_name', '')} {pd2.get('last_name', '')}".strip() or "Partner 2",
        "already_confirmed": bool(tr.partner2_confirmed_at),
        "confirmed_at": tr.partner2_confirmed_at.isoformat() if tr.partner2_confirmed_at else None,
    }


@router.post(
    "/tax-returns/partner-confirm/{token}",
    summary="Public endpoint for Partner 2 to personally confirm and sign the return",
)
async def confirm_partner_return(
    token: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Record personal signature and confirmation from Partner 2 pursuant to Art. 113 DBG."""
    clean_token = token.strip()
    stmt = select(TaxReturn).where(TaxReturn.partner2_confirmation_token == clean_token)
    res = await db.execute(stmt)
    tr = res.scalar_one_or_none()

    if not tr:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Ungültiger Bestätigungslink.",
        )

    if _is_datetime_expired(tr.partner2_token_expires_at):
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Dieser Bestätigungslink ist abgelaufen.",
        )

    if tr.partner2_confirmed_at:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Diese Steuererklärung wurde bereits von Partner 2 bestätigt (Replay-Schutz).",
        )

    confirmed = payload.get("confirmed", False)
    full_name = str(payload.get("full_name") or "").strip()
    if not confirmed or not full_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bitte bestätigen Sie die Richtigkeit der Angaben und geben Sie Ihren vollständigen Namen ein.",
        )

    now = datetime.now(timezone.utc)
    tr.partner2_confirmed_at = now
    tr.partner2_confirmed_name = full_name
    tr.updated_at = now

    audit = AuditLog(
        user_id=str(tr.user_id),
        action="partner2_confirmed",
        resource_type="tax_return",
        resource_id=str(tr.id),
        extra_data=f'{{"name": "{full_name}", "timestamp": "{now.isoformat()}"}}',
    )
    db.add(audit)
    await db.commit()

    return {
        "status": "confirmed",
        "confirmed_at": now.isoformat(),
        "confirmed_name": full_name,
        "message": f"Vielen Dank, {full_name}. Ihre Bestätigung als Partner 2 wurde rechtsgültig erfasst (Art. 113 DBG).",
    }


@router.get(
    "/tax-returns/{tax_return_id}/receipt-check",
    summary="Evaluate required vs keep-only receipts & annexes from receipts_rules.json (Addendum 1 Section 4)",
)
async def check_tax_return_receipts(
    tax_return_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return data-driven receipt requirements, keep-only items, annexes, and missing personal data."""
    tax_return = await _get_owned_tax_return(tax_return_id, current_user, db)
    p_res = await db.execute(select(TaxProfile).where(TaxProfile.tax_return_id == str(tax_return.id)))
    profile = p_res.scalar_one_or_none()
    d_res = await db.execute(select(Document).where(Document.tax_return_id == str(tax_return.id)))
    documents = list(d_res.scalars().all())
    return rules_data_service.evaluate_receipts(tax_return, profile, documents)


@router.get(
    "/tax-returns/{tax_return_id}/tax-tips",
    summary="Get legal tax tips for tax return (Addendum 1 tax_tips_de.json)",
)
async def get_tax_tips_for_return(
    tax_return_id: str,
    lang: str = Query("de"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    tax_return = await _get_owned_tax_return(tax_return_id, current_user, db)
    p_res = await db.execute(select(TaxProfile).where(TaxProfile.tax_return_id == str(tax_return.id)))
    profile = p_res.scalar_one_or_none()
    c_res = await db.execute(select(TaxCalculation).where(TaxCalculation.tax_return_id == str(tax_return.id)))
    calculation = c_res.scalar_one_or_none()
    return tax_tips_service.get_tips_for_tax_return(
        tax_return=tax_return,
        profile=profile,
        calculation=calculation,
        lang=lang,
    )


@router.post(
    "/tax-returns/{tax_return_id}/submit-canton",
    summary="Transmit or finalize eCH-0119 dossier through modular per-canton adapter (Addendum 1 Section 2)",
)
async def submit_to_canton_adapter(
    tax_return_id: str,
    payload: dict = Body(default={}),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Dispatch validated eCH-0119 XML + PDF package to the modular canton transmission adapter.
    Enforces data-driven canton availability ('available' vs 'coming_soon') and payment status.
    """
    tax_return = await _get_owned_tax_return(tax_return_id, current_user, db)
    if not rules_data_service.is_canton_available(tax_return.canton_code, tax_return.tax_year):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Dein Kanton kommt bald ({tax_return.canton_code} / {tax_return.tax_year}).",
        )
    if tax_return.payment_status != "paid":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bitte schliesse zuerst die Zahlung ab, bevor du einreichst.",
        )

    p_res = await db.execute(select(TaxProfile).where(TaxProfile.tax_return_id == str(tax_return.id)))
    profile = p_res.scalar_one_or_none()
    c_res = await db.execute(
        select(TaxCalculation)
        .where(TaxCalculation.tax_return_id == str(tax_return.id))
        .order_by(TaxCalculation.calculated_at.desc())
        .limit(1)
    )
    calc = c_res.scalar_one_or_none()
    if not profile or not calc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Profil oder Steuerberechnung fehlt. Bitte zuerst berechnen.",
        )

    d_res = await db.execute(select(Document).where(Document.tax_return_id == str(tax_return.id)))
    documents = list(d_res.scalars().all())
    tax_return.user = current_user

    xml_str = generate_ech_xml(tax_return, profile, calc, attachments=documents)
    pdf_bytes = generate_tax_return_pdf(tax_return, profile, calc)
    attachments_meta = [
        {"id": str(d.id), "filename": d.original_filename, "document_type": d.document_type}
        for d in documents
    ]

    adapter = get_transmission_adapter(tax_return.canton_code, tax_return.tax_year)
    try:
        tx_res = await adapter.prepare_or_transmit(
            tax_return=tax_return,
            xml_str=xml_str,
            pdf_bytes=pdf_bytes,
            attachments=attachments_meta,
            access_code=(payload or {}).get("access_code"),
        )
    except CantonNotAvailableError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    if tx_res.accepted:
        tax_return.status = "submitted"
        tax_return.updated_at = datetime.now(timezone.utc)
        audit = AuditLog(
            user_id=str(current_user.id),
            action="canton_transmission_prepared",
            resource_type="tax_return",
            resource_id=str(tax_return.id),
            extra_data=(
                f'{{"canton": "{tx_res.canton_code}", "channel": "{tx_res.channel}", '
                f'"transmission_id": "{tx_res.transmission_id or ""}"}}'
            ),
        )
        db.add(audit)
        await db.commit()

    return {
        "accepted": tx_res.accepted,
        "canton_code": tx_res.canton_code,
        "tax_year": tx_res.tax_year,
        "channel": tx_res.channel,
        "status": tx_res.status,
        "transmission_id": tx_res.transmission_id,
        "message": tx_res.message,
        "metadata": tx_res.metadata,
    }



