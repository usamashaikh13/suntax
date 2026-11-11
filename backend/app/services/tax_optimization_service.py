"""
SunTax Tax Optimization Service.
Computes deterministic counterfactual deduction opportunities grounded in Swiss
federal (DBG) and cantonal tax law via the deterministic TaxCalculationEngine.
"""

from __future__ import annotations

from dataclasses import replace
from decimal import Decimal
from typing import Any, Dict, List

from app.services.tax_engine_service import (
    TaxCalculationEngine,
    TaxProfile,
    TaxRuleLoader,
    _adapt_profile,
)


def compute_tax_opportunities(
    personal_data: Dict[str, Any],
    income_data: Dict[str, Any],
    wealth_data: Dict[str, Any],
    deductions_data: Dict[str, Any],
    liabilities_data: Dict[str, Any],
    canton_code: str = "ZH",
    tax_year: int = 2025,
    municipality_code: str = "default",
) -> List[Dict[str, Any]]:
    """
    Evaluate statutory deduction potentials via real counterfactual runs on
    TaxCalculationEngine rather than flat marginal-rate approximations.
    """
    loader = TaxRuleLoader()
    rules = loader.load_from_files(canton_code, municipality_code, tax_year)

    class _ProfileAdapter:
        def __init__(self) -> None:
            self.personal_data = personal_data or {}
            self.income_data = income_data or {}
            self.wealth_data = wealth_data or {}
            self.deductions_data = deductions_data or {}
            self.liabilities_data = liabilities_data or {}

    class _TRAdapter:
        def __init__(self) -> None:
            self.id = "opportunity-eval"
            self.canton_code = canton_code.upper()
            self.municipality_code = rules.municipality_code
            self.tax_year = tax_year

    engine = TaxCalculationEngine(rules)
    profile: TaxProfile = _adapt_profile(_ProfileAdapter(), rules, _TRAdapter())
    base_res = engine.calculate(profile, rules, _compute_savings=False)
    lim_c = rules.cantonal_deductions
    lim_f = rules.federal_deductions
    is_married = profile.marital_status.value in ("married", "registered_partnership")

    def _cf_saving(override_kwargs: Dict[str, Any]) -> float:
        cf_profile = replace(profile, **override_kwargs)
        cf_res = engine.calculate(cf_profile, rules, _compute_savings=False)
        diff = base_res.total_tax - cf_res.total_tax
        return float(max(Decimal("0"), diff.quantize(Decimal("0.01"))))

    opportunities: List[Dict[str, Any]] = []

    # 1. Pillar 3a
    p3a_max = float(lim_c.pillar3a_self_employed_max if profile.is_self_employed else lim_c.pillar3a_employed_max)
    p3a_cur = float(profile.pillar3a_contribution)
    p3a_gap = max(0.0, p3a_max - p3a_cur)
    opportunities.append({
        "id": "opp_pillar3a",
        "name": "Pillar 3a Pension Maximum",
        "category": "Retirement & Savings",
        "current_amount": p3a_cur,
        "max_amount": p3a_max,
        "missing_action": (
            "Maximum statutory Pillar 3a deduction claimed for this tax year."
            if p3a_gap <= 0
            else f"Contribute an additional CHF {p3a_gap:,.2f} before December 31 to utilize the full CHF {p3a_max:,.2f} ceiling."
        ),
        "estimated_taxable_income_effect": p3a_gap,
        "estimated_tax_saving": _cf_saving({"pillar3a_contribution": Decimal(str(p3a_max))}) if p3a_gap > 0 else 0.0,
        "status": "applied" if p3a_cur >= p3a_max else ("incomplete" if p3a_cur > 0 else "available"),
        "legal_reference": "BVV 3 / DBG Art. 33 Abs. 1 Bst. e",
        "is_estimate": bool(base_res.is_estimate_only),
    })

    # 2. Commuting (Canton + Federal limits evaluated separately in counterfactual)
    comm_max = float(lim_c.commuting_max_chf)
    comm_cur = float(base_res.deductions_applied.commuting)
    comm_gap = max(0.0, comm_max - comm_cur)
    opportunities.append({
        "id": "opp_commuting",
        "name": "Commuting & Travel Expenses",
        "category": "Employment Expenses",
        "current_amount": comm_cur,
        "max_amount": comm_max,
        "missing_action": (
            f"Commuting deduction reaches or exceeds the CHF {comm_max:,.0f} cantonal cap."
            if comm_cur >= comm_max
            else f"Claim annual public transport (SBB GA/ZVV) or qualifying vehicle travel up to CHF {comm_max:,.0f} ({canton_code}) / CHF {float(lim_f.commuting_max_chf):,.0f} (Federal)."
        ),
        "estimated_taxable_income_effect": comm_gap,
        "estimated_tax_saving": _cf_saving({"commute_mode": "pt", "commuting_expense_claimed": lim_c.commuting_max_chf}) if (comm_gap > 0 and not profile.has_company_car) else 0.0,
        "status": "applied" if comm_cur >= comm_max else ("incomplete" if comm_cur > 0 else "available"),
        "legal_reference": f"StG {canton_code} § 26 / DBG Art. 26",
        "is_estimate": bool(base_res.is_estimate_only),
    })

    # 3. Professional expenses
    net_base = profile.net_salary if profile.net_salary > 0 else profile.gross_employment_income
    prof_flat = float(max(min(net_base * lim_c.professional_expenses_flat_rate_pct, lim_c.professional_expenses_max), lim_c.professional_expenses_min)) if net_base > 0 else float(lim_c.professional_expenses_min)
    prof_max = float(lim_c.professional_expenses_max)
    prof_cur = float(base_res.deductions_applied.professional_expenses)
    prof_gap = max(0.0, prof_max - prof_cur)
    opportunities.append({
        "id": "opp_professional_expenses",
        "name": "Professional Expenses",
        "category": "Employment Expenses",
        "current_amount": prof_cur,
        "max_amount": prof_max,
        "missing_action": f"Standard 3% flat rate yields CHF {prof_flat:,.0f}; documented work-tool receipts exceeding this are deductible up to CHF {prof_max:,.0f}.",
        "estimated_taxable_income_effect": prof_gap,
        "estimated_tax_saving": _cf_saving({"equipment_expense_claimed": lim_c.professional_expenses_max}) if prof_gap > 0 else 0.0,
        "status": "applied" if prof_cur >= prof_flat else "available",
        "legal_reference": f"StG {canton_code} § 26 / DBG Art. 26",
        "is_estimate": bool(base_res.is_estimate_only),
    })

    # 4. Health insurance premiums
    hi_base_cap = (lim_c.health_insurance_married if is_married else lim_c.health_insurance_single) if profile.has_pillar2 else ((lim_c.health_insurance_married_no_pension or lim_c.health_insurance_married) if is_married else (lim_c.health_insurance_single_no_pension or lim_c.health_insurance_single))
    hi_max = float(hi_base_cap + lim_c.health_insurance_per_child * Decimal(str(profile.num_children)))
    hi_cur = float(profile.health_insurance_premium_paid)
    hi_gap = max(0.0, hi_max - hi_cur)
    opportunities.append({
        "id": "opp_health_insurance",
        "name": "Health Insurance & Savings Interest",
        "category": "Insurance & Health",
        "current_amount": min(hi_cur, hi_max),
        "max_amount": hi_max,
        "missing_action": f"Ensure full KVG/VVG premiums up to CHF {hi_max:,.0f} ({canton_code} cap) are entered.",
        "estimated_taxable_income_effect": hi_gap,
        "estimated_tax_saving": _cf_saving({"health_insurance_premium_paid": Decimal(str(hi_max))}) if hi_gap > 0 else 0.0,
        "status": "applied" if hi_cur >= hi_max else ("incomplete" if hi_cur > 0 else "available"),
        "legal_reference": f"StG {canton_code} § 31 lit. g / DBG Art. 33",
        "is_estimate": bool(base_res.is_estimate_only),
    })

    # 5. Childcare
    if profile.num_children > 0:
        care_max = float(lim_c.childcare_max * Decimal(str(profile.num_children)))
        care_cur = float(profile.childcare_costs)
        care_gap = max(0.0, care_max - care_cur)
        opportunities.append({
            "id": "opp_childcare",
            "name": f"Childcare Expenses ({profile.num_children} Child{'ren' if profile.num_children > 1 else ''})",
            "category": "Family & Children",
            "current_amount": min(care_cur, care_max),
            "max_amount": care_max,
            "missing_action": f"Attach Kita/daycare invoices up to CHF {float(lim_c.childcare_max):,.0f} per child ({canton_code}) / CHF {float(lim_f.childcare_max):,.0f} (Federal).",
            "estimated_taxable_income_effect": care_gap,
            "estimated_tax_saving": _cf_saving({"childcare_costs": Decimal(str(care_max))}) if care_gap > 0 else 0.0,
            "status": "applied" if care_cur >= care_max else ("incomplete" if care_cur > 0 else "available"),
            "legal_reference": f"StG {canton_code} § 31 lit. j / DBG Art. 33 Abs. 3",
            "is_estimate": bool(base_res.is_estimate_only),
        })

    # 6. Continuing Education
    edu_max = float(lim_c.training_max)
    edu_cur = float(profile.education_expenses)
    edu_gap = max(0.0, edu_max - edu_cur)
    opportunities.append({
        "id": "opp_education",
        "name": "Continuing Education & Training",
        "category": "Employment Expenses",
        "current_amount": min(edu_cur, edu_max),
        "max_amount": edu_max,
        "missing_action": f"Self-paid career continuing education is deductible up to CHF {edu_max:,.0f} ({canton_code}) / CHF {float(lim_f.training_max):,.0f} (Federal).",
        "estimated_taxable_income_effect": edu_gap if edu_cur > 0 else 0.0,
        "estimated_tax_saving": _cf_saving({"education_expenses": Decimal(str(edu_max))}) if edu_cur > 0 and edu_gap > 0 else 0.0,
        "status": "applied" if edu_cur >= edu_max else ("incomplete" if edu_cur > 0 else "available"),
        "legal_reference": f"StG {canton_code} § 31 lit. k / DBG Art. 33 Abs. 1 lit. j",
        "is_estimate": bool(base_res.is_estimate_only),
    })

    # 7. Donations & Debt Interest
    don_cur = float(profile.donations)
    if profile.interest_on_debts > 0 or profile.mortgage_balance > 0:
        opportunities.append({
            "id": "opp_mortgage_interest",
            "name": "Mortgage & Debt Interest Deduction",
            "category": "Property & Debts",
            "current_amount": float(base_res.deductions_applied.interest_expenses),
            "max_amount": float(profile.asset_yield + lim_c.interest_deduction_extra_above_yield),
            "missing_action": "Report all mortgage/loan interest statements (capped at asset yield + CHF 50'000).",
            "estimated_taxable_income_effect": float(base_res.deductions_applied.interest_expenses),
            "estimated_tax_saving": float((engine.calculate(replace(profile, interest_on_debts=Decimal("0")), rules, _compute_savings=False).total_tax - base_res.total_tax).quantize(Decimal("0.01"))),
            "status": "applied" if profile.interest_on_debts > 0 else "available",
            "legal_reference": "StG ZH § 31 lit. a / DBG Art. 33 Abs. 1 lit. a",
            "is_estimate": bool(base_res.is_estimate_only),
        })

    if don_cur > 0:
        opportunities.append({
            "id": "opp_donations",
            "name": "Charitable Donations",
            "category": "Voluntary & Social",
            "current_amount": float(base_res.deductions_applied.donations),
            "max_amount": float((profile.gross_employment_income * lim_c.donation_max_pct).quantize(Decimal("0.01"))),
            "missing_action": "Gifts to Swiss tax-exempt charities >= CHF 100 are deductible up to 20% of Reineinkommen.",
            "estimated_taxable_income_effect": float(base_res.deductions_applied.donations),
            "estimated_tax_saving": float((engine.calculate(replace(profile, donations=Decimal("0")), rules, _compute_savings=False).total_tax - base_res.total_tax).quantize(Decimal("0.01"))),
            "status": "applied",
            "legal_reference": "StG ZH § 32 lit. b / DBG Art. 33a",
            "is_estimate": bool(base_res.is_estimate_only),
        })

    return opportunities
