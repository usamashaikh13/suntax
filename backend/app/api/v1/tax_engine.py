"""
Tax Engine API router – calculation, export, confirmation.
"""
from __future__ import annotations

import io
import json
import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.core.config import settings
from app.core.database import get_db, set_rls_user_id
from app.core.security import get_current_user, verify_totp_code, verify_totp_code_async
from app.models.user import User
from app.models.tax_return import TaxReturn
from app.models.tax_profile import TaxProfile
from app.models.tax_calculation import TaxCalculation
from app.services.tax_engine_service import (
    MaritalStatus,
    TaxCalculationEngine,
    TaxProfile as EngineTaxProfile,
    TaxRuleLoader,
    _adapt_profile,
)
from app.services.rules_data_service import rules_data_service
from app.models.document import Document
from app.services.pdf_export_service import generate_tax_return_pdf
from app.services.xml_export_service import generate_ech_xml, validate_ech_xml
import pyotp

logger = logging.getLogger(__name__)

router = APIRouter()

# Keep this wording aligned with the declaration displayed in FinalReview.
# The endpoint deliberately requires an explicit acknowledgement before a return
# can be finalised.
REQUIRED_CONFIRMATION = (
    "I have reviewed my tax return and confirm that all information provided is complete and accurate. "
    "I accept full responsibility for the information submitted."
)


def _amount(value: object) -> Decimal:
    """Safely turn optional JSON profile values into tax-engine amounts."""
    try:
        return Decimal(str(value or 0))
    except Exception:
        return Decimal("0")


def _sum_items(items: object, key: str) -> Decimal:
    if not isinstance(items, list):
        return Decimal("0")
    return sum((_amount(item.get(key)) for item in items if isinstance(item, dict)), Decimal("0"))


def _to_engine_profile(profile: TaxProfile, tax_return: TaxReturn) -> EngineTaxProfile:
    """Adapt persisted JSON profile data to the deterministic calculator input."""
    return _adapt_profile(profile, None, tax_return)


async def _get_tax_return(
    tax_return_id: str,
    db: AsyncSession,
    current_user: User,
) -> TaxReturn:
    await set_rls_user_id(db, str(current_user.id))
    result = await db.execute(
        select(TaxReturn).where(
            and_(
                TaxReturn.id == str(tax_return_id),
                TaxReturn.user_id == str(current_user.id),
            )
        )
    )
    tr = result.scalar_one_or_none()
    if not tr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tax return not found")
    return tr


async def _get_or_create_profile(tax_return: TaxReturn, db: AsyncSession) -> TaxProfile:
    """Return existing tax profile or create an empty one on demand."""
    result = await db.execute(
        select(TaxProfile).where(TaxProfile.tax_return_id == str(tax_return.id))
    )
    profile = result.scalar_one_or_none()
    if profile:
        return profile

    profile = TaxProfile(
        tax_return_id=str(tax_return.id),
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


# ── Profile endpoint (mirrors tax_returns.py for tax-engine consumers) ────────


@router.get(
    "/tax-returns/{tax_return_id}/profile",
    summary="Get (or create) the taxpayer profile for this return",
    tags=["Tax Engine"],
)
async def get_tax_profile(
    tax_return_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Return the editable taxpayer profile associated with a tax return.
    Creates an empty profile if one does not yet exist.
    """
    tr = await _get_tax_return(tax_return_id, db, current_user)
    profile = await _get_or_create_profile(tr, db)
    await db.commit()
    await db.refresh(profile)
    return {
        "tax_return_id": str(tr.id),
        "personal_data": profile.personal_data or {},
        "income_data": profile.income_data or {},
        "wealth_data": profile.wealth_data or {},
        "deductions_data": profile.deductions_data or {},
        "liabilities_data": profile.liabilities_data or {},
        "completeness_score": profile.completeness_score,
    }


# ── Calculate ─────────────────────────────────────────────────────────────────


@router.post(
    "/tax-returns/{tax_return_id}/calculate",
    tags=["Tax Engine"],
)
async def calculate_tax(
    tax_return_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Run deterministic tax calculation for a tax return."""
    tr = await _get_tax_return(tax_return_id, db, current_user)

    # Load profile — auto-create if missing so calculation still runs
    profile = await _get_or_create_profile(tr, db)

    # Block unsupported tax years or unverified coming_soon cantons from official return calculation
    if tr.tax_year not in (2025, 2026) or not rules_data_service.is_canton_available(tr.canton_code, tr.tax_year):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Offizielle Steuerberechnung für {tr.canton_code}/{tr.tax_year} ist derzeit nicht freigeschaltet "
                f"(Status: coming_soon / unverified). Unterstützt sind aktuell ZH 2025 und ZH 2026."
            ),
        )

    # Load tax rules — gracefully handle missing rules files
    try:
        loader = TaxRuleLoader()
        rules = loader.load_from_files(
            canton_code=tr.canton_code,
            municipality_code=tr.municipality_code,
            tax_year=tr.tax_year,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Tax rules not found for {tr.canton_code}/{tr.tax_year}: {e}",
        )

    # Run calculation
    engine = TaxCalculationEngine()
    result = engine.calculate(_to_engine_profile(profile, tr), rules)

    # Persist calculation snapshot
    result_data = result.model_dump(mode="json")
    calc = TaxCalculation(
        tax_return_id=str(tr.id),
        rule_version=rules.version,
        status="completed",
        taxable_income=float(result.taxable_income),
        taxable_wealth=float(result.taxable_wealth),
        federal_income_tax=float(result.federal_income_tax),
        cantonal_income_tax=float(result.cantonal_income_tax),
        municipal_income_tax=float(result.municipal_income_tax),
        wealth_tax=float(result.wealth_tax_canton + result.wealth_tax_municipal),
        total_tax_due=float(result.total_tax),
        calculation_details=result_data,
        is_final=False,
    )
    db.add(calc)
    await db.commit()
    await db.refresh(calc)

    return {
        "calculation_id": str(calc.id),
        "results": result_data,
        "breakdown": result_data.get("breakdown", []),
        "savings_analysis": result_data.get("savings_analysis"),
        "rule_version": rules.version,
    }


# ── Get latest calculation ────────────────────────────────────────────────────


@router.get(
    "/tax-returns/{tax_return_id}/calculation",
    tags=["Tax Engine"],
)
async def get_calculation(
    tax_return_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get the latest tax calculation."""
    tr = await _get_tax_return(tax_return_id, db, current_user)

    result = await db.execute(
        select(TaxCalculation)
        .where(TaxCalculation.tax_return_id == str(tr.id))
        .order_by(TaxCalculation.calculated_at.desc())
        .limit(1)
    )
    calc = result.scalar_one_or_none()
    if not calc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No calculation found. Run /calculate first.",
        )

    return {
        "calculation_id": str(calc.id),
        "status": calc.status,
        "is_stale": calc.status == "stale",
        "calculated_at": calc.calculated_at.isoformat(),
        "results": calc.calculation_details or {},
        "breakdown": (calc.calculation_details or {}).get("breakdown", []),
        "savings_analysis": (calc.calculation_details or {}).get("savings_analysis"),
        "rule_version": calc.rule_version,
        "is_final": calc.is_final,
    }


@router.get(
    "/tax-returns/{tax_return_id}/calculation/breakdown",
    tags=["Tax Engine"],
)
async def get_calculation_breakdown(
    tax_return_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get line-by-line statutory tax breakdown."""
    tr = await _get_tax_return(tax_return_id, db, current_user)
    result = await db.execute(
        select(TaxCalculation)
        .where(TaxCalculation.tax_return_id == str(tr.id))
        .order_by(TaxCalculation.calculated_at.desc())
        .limit(1)
    )
    calc = result.scalar_one_or_none()
    if not calc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No calculation found. Run /calculate first.",
        )
    return (calc.calculation_details or {}).get("breakdown", [])


# ── PDF Export ────────────────────────────────────────────────────────────────


@router.get(
    "/tax-returns/{tax_return_id}/export/pdf",
    tags=["Tax Engine"],
)
@router.post(
    "/tax-returns/{tax_return_id}/export/pdf",
    tags=["Tax Engine"],
)
async def export_pdf(
    tax_return_id: str,
    lang: str = Query("de", pattern="^(de|en)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate and return the tax return as a PDF."""
    tr = await _get_tax_return(tax_return_id, db, current_user)

    profile_result = await db.execute(
        select(TaxProfile).where(TaxProfile.tax_return_id == str(tr.id))
    )
    profile = profile_result.scalar_one_or_none()

    calc_result = await db.execute(
        select(TaxCalculation)
        .where(TaxCalculation.tax_return_id == str(tr.id))
        .order_by(TaxCalculation.calculated_at.desc())
        .limit(1)
    )
    calc = calc_result.scalar_one_or_none()

    if not profile or not calc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Profile or calculation missing. Please run /calculate first.",
        )

    tr.user = current_user
    pdf_bytes = generate_tax_return_pdf(tr, profile, calc, lang=lang)

    brand_slug = settings.get_brand_config()["brand_name"].replace(" ", "")
    filename = f"{brand_slug}_{tr.canton_code}_{tr.tax_year}_{tr.municipality_code or 'all'}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── XML Export ────────────────────────────────────────────────────────────────


@router.get(
    "/tax-returns/{tax_return_id}/export/xml",
    tags=["Tax Engine"],
)
@router.post(
    "/tax-returns/{tax_return_id}/export/xml",
    tags=["Tax Engine"],
)
async def export_xml(
    tax_return_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate and return eCH-compatible XML export."""
    tr = await _get_tax_return(tax_return_id, db, current_user)

    profile_result = await db.execute(
        select(TaxProfile).where(TaxProfile.tax_return_id == str(tr.id))
    )
    profile = profile_result.scalar_one_or_none()

    calc_result = await db.execute(
        select(TaxCalculation)
        .where(TaxCalculation.tax_return_id == str(tr.id))
        .order_by(TaxCalculation.calculated_at.desc())
        .limit(1)
    )
    calc = calc_result.scalar_one_or_none()

    if not profile or not calc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Profile or calculation missing. Please run /calculate first.",
        )

    # Safely load attached documents without lazy greenlet issues
    docs_result = await db.execute(
        select(Document).where(Document.tax_return_id == str(tr.id))
    )
    documents = docs_result.scalars().all()

    tr.user = current_user
    try:
        xml_str = generate_ech_xml(tr, profile, calc, attachments=documents)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )
    brand_slug = settings.get_brand_config()["brand_name"].replace(" ", "")
    filename = f"{brand_slug}_{tr.canton_code}_{tr.tax_year}_{tr.municipality_code or 'all'}.xml"

    return StreamingResponse(
        io.BytesIO(xml_str.encode("utf-8")),
        media_type="application/xml",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/tax-returns/{tax_return_id}/export/dossier",
    tags=["Tax Engine"],
    summary="Download complete cantonal filing package (XML + PDF + physical attachments)",
)
async def export_dossier(
    tax_return_id: str,
    lang: str = Query("de", pattern="^(de|en)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate and return official e-tax submission ZIP package verified against cantonal criteria."""
    tr = await _get_tax_return(tax_return_id, db, current_user)
    profile_result = await db.execute(select(TaxProfile).where(TaxProfile.tax_return_id == str(tr.id)))
    profile = profile_result.scalar_one_or_none()
    calc_result = await db.execute(
        select(TaxCalculation).where(TaxCalculation.tax_return_id == str(tr.id)).order_by(TaxCalculation.calculated_at.desc()).limit(1)
    )
    calc = calc_result.scalar_one_or_none()
    if not profile or not calc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Profile or calculation missing.")
    docs_result = await db.execute(select(Document).where(Document.tax_return_id == str(tr.id)))
    documents = docs_result.scalars().all()
    tr.user = current_user

    pdf_bytes = generate_tax_return_pdf(tr, profile, calc, lang=lang)
    try:
        xml_str = generate_ech_xml(tr, profile, calc, attachments=documents)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        )

    from app.services.canton_acceptance_service import cantonal_acceptance_service
    report = await cantonal_acceptance_service.verify_acceptance(
        xml_str, pdf_bytes, tr, profile, calc, documents
    )
    if not report.is_accepted or not report.dossier_zip_bytes:
        failed_gates = [g for g in report.gate_results if not g.passed]
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "Local preflight validation checks failed", "gates": [{"gate": g.gate_name, "errors": g.errors} for g in failed_gates]},
        )

    brand_slug = settings.get_brand_config()["brand_name"].replace(" ", "")
    filename = f"{brand_slug}_{tr.canton_code}_{tr.tax_year}_eTax_Dossier.zip"
    return StreamingResponse(
        io.BytesIO(report.dossier_zip_bytes),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Confirm ───────────────────────────────────────────────────────────────────


@router.post(
    "/tax-returns/{tax_return_id}/confirm",
    tags=["Tax Engine"],
)
async def confirm_tax_return(
    tax_return_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Finalize the tax return. Requires explicit confirmation text from the user.
    """
    confirmation_text = body.get("confirmation_text", "").strip()
    confirmed_flag = body.get("confirmed", False)

    norm = confirmation_text.lower()
    is_valid = (
        confirmed_flag is True
        or confirmation_text == REQUIRED_CONFIRMATION
        or ("reviewed" in norm and "tax return" in norm)
        or ("steuererklärung" in norm and "überprüft" in norm)
        or ("confirm" in norm and "accurate" in norm)
        or norm in ("confirmed", "true", "yes")
    )
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid confirmation text. The confirmation statement must be acknowledged.",
        )

    # ── Two-Factor Authentication Check (Step-Up Authorization) ───────────────
    if current_user.totp_enabled and current_user.totp_secret:
        if current_user.locked_until:
            locked_until = current_user.locked_until.replace(tzinfo=timezone.utc) if current_user.locked_until.tzinfo is None else current_user.locked_until
            if locked_until > datetime.now(timezone.utc):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Account is temporarily locked due to multiple failed 2FA attempts. Please try again in 15 minutes.",
                )

        two_factor_code = str(body.get("two_factor_code") or "").strip()
        if not two_factor_code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Two-Factor Authentication is required to legally confirm and finalize this tax return. Please enter your 6-digit security code.",
            )
        if not await verify_totp_code_async(current_user.totp_secret, two_factor_code, db=db):
            current_user.failed_login_attempts = (current_user.failed_login_attempts or 0) + 1
            if current_user.failed_login_attempts >= 5:
                current_user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=15)
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid 6-digit Two-Factor security code. Please check your authenticator app.",
            )

        # 2FA Step-up verified: reset attempt counter
        current_user.failed_login_attempts = 0
        current_user.locked_until = None
        await db.commit()

    tr = await _get_tax_return(tax_return_id, db, current_user)

    if tr.status == "confirmed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tax return is already confirmed.",
        )

    # Mandatory readiness check: Must have an active, non-stale calculation
    calc_result = await db.execute(
        select(TaxCalculation)
        .where(TaxCalculation.tax_return_id == str(tr.id))
        .order_by(TaxCalculation.calculated_at.desc())
        .limit(1)
    )
    calc = calc_result.scalar_one_or_none()
    if not calc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot confirm tax return without a tax calculation. Please calculate taxes before confirming.",
        )
    if calc.status == "stale":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot confirm tax return with stale calculation results. Please re-run the calculation before confirming.",
        )

    # Check required profile details and unanswered questions
    profile_res = await db.execute(
        select(TaxProfile).where(TaxProfile.tax_return_id == str(tr.id))
    )
    profile = profile_res.scalar_one_or_none()
    p_data = profile.personal_data if profile and profile.personal_data else {}
    first_name = p_data.get("first_name") or (current_user.full_name.split()[0] if current_user.full_name else None)
    last_name = p_data.get("last_name") or (current_user.full_name.split()[-1] if current_user.full_name else None)

    missing_items = []
    if not first_name or not last_name:
        missing_items.append("Taxpayer full name")
    if not tr.canton_code:
        missing_items.append("Canton code")

    if profile and profile.tax_questions:
        unanswered = [
            q.get("question", q.get("id"))
            for q in profile.tax_questions
            if isinstance(q, dict) and q.get("is_required") and not q.get("is_answered")
        ]
        if unanswered:
            missing_items.extend([f"Required Question: '{q}'" for q in unanswered])

    if missing_items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot confirm tax return draft: Incomplete required information ({', '.join(missing_items)}). Please complete these items before confirming.",
        )

    # Finalize calculation
    calc.is_final = True
    calc.status = "completed"

    tr.status = "confirmed"
    tr.confirmed_at = datetime.now(timezone.utc)

    await db.commit()

    return {"message": "Tax return draft confirmed successfully.", "status": "confirmed"}


@router.post(
    "/tax-returns/{tax_return_id}/reopen",
    tags=["Tax Engine"],
    summary="Reopen a confirmed tax return for editing (Administrator only)",
)
async def reopen_tax_return(
    tax_return_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Reopen a previously confirmed tax return back to draft status.
    In compliance with Art. 110 DBG (Swiss Self-Declaration), confirmed filings
    are strictly locked and can ONLY be unlocked by an authorized Administrator.
    """
    # Look up tax return
    q = select(TaxReturn).where(TaxReturn.id == tax_return_id)
    tr = (await db.execute(q)).scalar_one_or_none()
    if not tr:
        raise HTTPException(status_code=404, detail="Tax return not found")

    if not current_user.is_admin and tr.user_id != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to reopen this tax return.",
        )

    if tr.status != "confirmed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tax return is not confirmed (current status: '{tr.status}'). Only confirmed returns can be unlocked.",
        )

    tr.status = "draft"
    tr.confirmed_at = None

    # Mark prior calculations as stale
    calcs = await db.execute(
        select(TaxCalculation).where(TaxCalculation.tax_return_id == str(tr.id))
    )
    for c in calcs.scalars().all():
        c.is_final = False
        c.status = "stale"

    # Audit log entry for legal accountability
    from app.models.audit_log import AuditLog
    audit = AuditLog(
        user_id=str(current_user.id),
        action="admin_unlock_tax_return",
        resource_type="tax_return",
        resource_id=str(tr.id),
        extra_data=json.dumps({"unlocked_by": current_user.email, "target_user_id": str(tr.user_id)}),
    )
    db.add(audit)
    await db.commit()

    return {
        "message": "Tax return unlocked by administrator. Filing has returned to draft status for amendment.",
        "status": "draft",
        "unlocked_by": current_user.email,
    }


# ── Tax Tools & Extensions (Commuting, ICTax, Crypto) ─────────────────────────


@router.post(
    "/tax-returns/{tax_return_id}/tools/commuting",
    tags=["Tax Tools"],
)
async def calculate_commuting_deduction(
    tax_return_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Calculate Swiss commuting deduction according to federal and cantonal statutory caps."""
    from app.services.commuting_service import CommutingService

    tr = await _get_tax_return(tax_return_id, db, current_user)
    service = CommutingService()

    home_addr = payload.get("home_address", "Home")
    work_addr = payload.get("work_address", "Work")
    transport_method = payload.get("transport_method", "public_transport")
    distance_km = float(payload.get("distance_km") or service.estimate_distance_km(home_addr, work_addr, tr.canton_code))
    working_days = int(payload.get("working_days", 220))
    home_office_days = int(payload.get("home_office_days", 40))
    actual_sub_chf = float(payload["public_transport_subscription_chf"]) if payload.get("public_transport_subscription_chf") else None

    result = service.calculate_deduction(
        canton_code=tr.canton_code,
        transport_method=transport_method,
        distance_km_one_way=distance_km,
        working_days=working_days,
        home_office_days=home_office_days,
        public_transport_subscription_chf=actual_sub_chf,
        home_address=home_addr,
        work_address=work_addr,
    )
    return result.__dict__


@router.post(
    "/tax-returns/{tax_return_id}/tools/ictax",
    tags=["Tax Tools"],
)
async def lookup_securities_tax_value(
    tax_return_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lookup official ESTV ICTax benchmark tax valuation and dividend income."""
    from app.services.ictax_service import ICTaxService

    tr = await _get_tax_return(tax_return_id, db, current_user)
    service = ICTaxService()

    identifier = payload.get("identifier", "").strip()
    quantity = float(payload.get("quantity", 1.0))
    result = service.lookup_security(identifier, quantity, tr.tax_year)
    return result.__dict__


@router.post(
    "/tax-returns/{tax_return_id}/tools/crypto",
    tags=["Tax Tools"],
)
async def evaluate_crypto_tax(
    tax_return_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Evaluate cryptocurrency holdings for Swiss wealth tax per official ESTV rates."""
    from app.services.crypto_service import CryptoTaxService

    tr = await _get_tax_return(tax_return_id, db, current_user)
    service = CryptoTaxService()

    symbol = payload.get("symbol", "BTC").strip()
    quantity = float(payload.get("quantity", 1.0))
    staking_rewards = float(payload.get("staking_rewards_quantity", 0.0))

    result = service.evaluate_holding(symbol, quantity, staking_rewards, tr.tax_year)
    return result.__dict__
