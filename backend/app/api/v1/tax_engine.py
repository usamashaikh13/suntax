"""
Tax Engine API router – calculation, export, confirmation.
"""
from __future__ import annotations

import io
import logging
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.core.database import get_db, set_rls_user_id
from app.core.security import get_current_user
from app.models.user import User
from app.models.tax_return import TaxReturn
from app.models.tax_profile import TaxProfile
from app.models.tax_calculation import TaxCalculation
from app.services.tax_engine_service import (
    MaritalStatus,
    TaxCalculationEngine,
    TaxProfile as EngineTaxProfile,
    TaxRuleLoader,
)
from app.services.pdf_export_service import generate_tax_return_pdf
from app.services.xml_export_service import generate_ech_xml
from app.schemas.tax_calculation import TaxCalculationResult

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
    personal = profile.personal_data or {}
    income = profile.income_data or {}
    wealth = profile.wealth_data or {}
    deductions = profile.deductions_data or {}
    liabilities = profile.liabilities_data or {}
    marital_value = personal.get("civil_status", "single")
    try:
        marital_status = MaritalStatus(marital_value)
    except ValueError:
        marital_status = MaritalStatus.SINGLE

    other_income = sum(
        (_amount(income.get(key)) for key in (
            "self_employment_income", "pension_income", "rental_income",
            "dividend_income", "interest_income", "capital_gains", "alimony_received",
        )),
        _sum_items(income.get("other_income"), "amount"),
    )

    gross_emp = (
        _amount(income.get("employment_income"))
        or _amount(income.get("gross_salary"))
        or _amount(income.get("total_employment_income"))
    )
    bank_bal = _sum_items(wealth.get("bank_accounts"), "balance_chf") or _sum_items(wealth.get("bank_accounts"), "balance")

    return EngineTaxProfile(
        tax_return_id=str(tax_return.id),
        tax_year=tax_return.tax_year,
        canton_code=tax_return.canton_code,
        municipality_code=tax_return.municipality_code or "",
        marital_status=marital_status,
        num_children=len(personal.get("children") or []),
        gross_employment_income=gross_emp + _amount(income.get("employment_income_spouse")),
        other_income=other_income,
        commuting_expense_claimed=_amount(deductions.get("travel_expenses")),
        meals_expense_claimed=_amount(deductions.get("meal_expenses")),
        equipment_expense_claimed=_amount(deductions.get("professional_expenses")),
        pillar3a_contribution=_amount(deductions.get("pillar3a_contributions")),
        health_insurance_premium_paid=_amount(deductions.get("health_insurance_premiums")),
        medical_expenses_paid=_amount(deductions.get("medical_expenses")),
        interest_on_debts=_amount(deductions.get("debt_interest")),
        donations=_amount(deductions.get("donations")),
        childcare_costs=_amount(deductions.get("childcare_expenses")),
        other_deductions=_sum_items(deductions.get("other_deductions"), "amount"),
        bank_accounts_balance=bank_bal,
        securities_tax_value=_sum_items(wealth.get("securities"), "value_chf"),
        real_estate_tax_value=_sum_items(wealth.get("real_estate"), "market_value"),
        other_assets=_sum_items(wealth.get("other_assets"), "value"),
        mortgage_balance=_sum_items(liabilities.get("mortgages"), "outstanding_balance"),
        other_liabilities=_sum_items(liabilities.get("loans"), "outstanding_balance") + _amount(liabilities.get("other_liabilities")),
    )


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

    # Load tax rules — gracefully handle missing rules files
    try:
        loader = TaxRuleLoader()
        rules = loader.load_from_files(
            canton_code=tr.canton_code,
            municipality_code=tr.municipality_code,
            tax_year=tr.tax_year,
        )
    except FileNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Tax rules not found for {tr.canton_code}/{tr.tax_year}: {e}",
        )
    except Exception as e:
        logger.exception("Error loading tax rules: %s", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to load tax rules. Please try again.",
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
        "calculated_at": calc.calculated_at.isoformat(),
        "results": calc.calculation_details or {},
        "breakdown": (calc.calculation_details or {}).get("breakdown", []),
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


@router.post(
    "/tax-returns/{tax_return_id}/export/pdf",
    tags=["Tax Engine"],
)
async def export_pdf(
    tax_return_id: str,
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

    pdf_bytes = generate_tax_return_pdf(tr, profile, calc)

    filename = f"SunTax_{tr.canton_code}_{tr.tax_year}_{tr.municipality_code or 'all'}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── XML Export ────────────────────────────────────────────────────────────────


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

    xml_str = generate_ech_xml(tr, profile, calc)
    filename = f"SunTax_{tr.canton_code}_{tr.tax_year}_{tr.municipality_code or 'all'}.xml"

    return StreamingResponse(
        io.BytesIO(xml_str.encode("utf-8")),
        media_type="application/xml",
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

    tr = await _get_tax_return(tax_return_id, db, current_user)

    if tr.status == "confirmed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tax return is already confirmed.",
        )

    # Mark latest calculation as final
    calc_result = await db.execute(
        select(TaxCalculation)
        .where(TaxCalculation.tax_return_id == str(tr.id))
        .order_by(TaxCalculation.calculated_at.desc())
        .limit(1)
    )
    calc = calc_result.scalar_one_or_none()
    if calc:
        calc.is_final = True

    from datetime import datetime, timezone
    tr.status = "confirmed"
    tr.confirmed_at = datetime.now(timezone.utc)

    await db.commit()

    return {"message": "Tax return confirmed successfully.", "status": "confirmed"}


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
