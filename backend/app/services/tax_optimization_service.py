"""
SunTax Tax Optimization Service.
Computes deterministic, rule-based tax opportunities and deductions
grounded in Swiss federal and cantonal tax law (DBG/StHG).
All returned values are clearly labelled as estimates.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional


def compute_tax_opportunities(
    personal_data: Dict[str, Any],
    income_data: Dict[str, Any],
    wealth_data: Dict[str, Any],
    deductions_data: Dict[str, Any],
    liabilities_data: Dict[str, Any],
    canton_code: str = "ZH",
    tax_year: int = 2025,
) -> List[Dict[str, Any]]:
    """
    Evaluate available statutory deduction potentials against current taxpayer profile data.
    """
    opportunities: List[Dict[str, Any]] = []

    gross_income = float(income_data.get("employment_income") or income_data.get("gross_salary") or 0)
    # Estimate standard marginal tax bracket (~22% combined federal+canton+municipal for median earner)
    marginal_tax_rate = 0.22 if gross_income < 120000 else 0.28

    # ── 1. Pillar 3a Tied Pension Plan (Säule 3a) ─────────────────────────────
    p3a_max = 7258.0  # Employed statutory maximum
    p3a_current = float(deductions_data.get("pillar3a_contributions") or 0)
    p3a_gap = max(0.0, p3a_max - p3a_current)

    if p3a_current >= p3a_max:
        p3a_status = "applied"
        p3a_action = "Maximum statutory Pillar 3a deduction claimed for this tax year."
    elif p3a_current > 0:
        p3a_status = "incomplete"
        p3a_action = f"Contribute an additional CHF {p3a_gap:,.2f} before December 31 to utilize the full CHF {p3a_max:,.2f} ceiling."
    else:
        p3a_status = "available"
        p3a_action = f"Open a Pillar 3a account and contribute up to CHF {p3a_max:,.2f} to reduce your taxable income."

    opportunities.append({
        "id": "opp_pillar3a",
        "name": "Pillar 3a Pension Maximum",
        "category": "Retirement & Savings",
        "current_amount": p3a_current,
        "max_amount": p3a_max,
        "missing_action": p3a_action,
        "estimated_taxable_income_effect": p3a_gap,
        "estimated_tax_saving": round(p3a_gap * marginal_tax_rate, 2),
        "status": p3a_status,
        "legal_reference": "BVV 3 / DBG Art. 33 Abs. 1 Bst. e",
        "is_estimate": True,
    })

    # ── 2. Commuting & Public Transport Expenses (Fahrkosten) ─────────────────
    commuting_cap = 3200.0 if tax_year >= 2024 else 3000.0  # Federal cap
    commuting_current = float(deductions_data.get("travel_expenses") or 0)
    commuting_gap = max(0.0, commuting_cap - commuting_current)

    if commuting_current >= commuting_cap:
        commuting_status = "applied"
        commuting_action = "Commuting deduction reaches or exceeds the federal cap."
    elif commuting_current > 0:
        commuting_status = "incomplete"
        commuting_action = f"Upload annual transit passes (SBB GA/Halbtax) or mileage receipts up to CHF {commuting_cap:,.2f}."
    else:
        commuting_status = "available"
        commuting_action = f"Claim public transport fares or vehicle travel expenses between home and work (up to CHF {commuting_cap:,.2f})."

    opportunities.append({
        "id": "opp_commuting",
        "name": "Commuting & Travel Expenses",
        "category": "Employment Expenses",
        "current_amount": commuting_current,
        "max_amount": commuting_cap,
        "missing_action": commuting_action,
        "estimated_taxable_income_effect": commuting_gap,
        "estimated_tax_saving": round(commuting_gap * marginal_tax_rate, 2),
        "status": commuting_status,
        "legal_reference": "DBG Art. 26 Abs. 1 Bst. a",
        "is_estimate": True,
    })

    # ── 3. Professional Expenses Flat-Rate (Berufskosten Pauschale) ────────────
    # 3% of net salary, min 2000, max 4000
    prof_max = min(4000.0, max(2000.0, round(gross_income * 0.03, 2))) if gross_income > 0 else 2000.0
    prof_current = float(deductions_data.get("professional_expenses") or 0)
    prof_gap = max(0.0, prof_max - prof_current)

    opportunities.append({
        "id": "opp_professional_expenses",
        "name": "Professional Flat-Rate Expenses",
        "category": "Employment Expenses",
        "current_amount": prof_current,
        "max_amount": prof_max,
        "missing_action": "Standard lump-sum deduction for job-related equipment, literature, and home office costs.",
        "estimated_taxable_income_effect": prof_gap,
        "estimated_tax_saving": round(prof_gap * marginal_tax_rate, 2),
        "status": "applied" if prof_current >= prof_max else ("incomplete" if prof_current > 0 else "available"),
        "legal_reference": "DBG Art. 26 Abs. 1 Bst. c",
        "is_estimate": True,
    })

    # ── 4. Health Insurance Premiums & Social Allowances (Versicherungsabzug) ──
    civil_status = (personal_data.get("civil_status") or personal_data.get("marital_status") or "single").lower()
    is_married = civil_status in ("married", "verheiratet")
    insurance_max = 5600.0 if is_married else 2800.0  # Federal baseline
    insurance_current = float(deductions_data.get("health_insurance_premiums") or 0)
    insurance_gap = max(0.0, insurance_max - insurance_current)

    opportunities.append({
        "id": "opp_health_insurance",
        "name": "Health Insurance & Savings Interest",
        "category": "Insurance & Health",
        "current_amount": insurance_current,
        "max_amount": insurance_max,
        "missing_action": f"Ensure your full health insurance premiums (KVG/VVG) are reported up to the CHF {insurance_max:,.2f} allowance.",
        "estimated_taxable_income_effect": insurance_gap,
        "estimated_tax_saving": round(insurance_gap * marginal_tax_rate, 2),
        "status": "applied" if insurance_current >= insurance_max else ("incomplete" if insurance_current > 0 else "available"),
        "legal_reference": "DBG Art. 33 Abs. 1 Bst. g",
        "is_estimate": True,
    })

    # ── 5. Childcare Third-Party Expenses (Drittbetreuungskosten) ─────────────
    children = personal_data.get("children") or []
    if len(children) > 0:
        childcare_max = 25500.0 * len(children)  # Federal maximum per child
        childcare_current = float(deductions_data.get("childcare_expenses") or 0)
        childcare_gap = max(0.0, childcare_max - childcare_current)

        opportunities.append({
            "id": "opp_childcare",
            "name": f"Childcare Expenses ({len(children)} Child{'ren' if len(children) > 1 else ''})",
            "category": "Family & Children",
            "current_amount": childcare_current,
            "max_amount": childcare_max,
            "missing_action": "Attach official crèche (Kita), daycare, or certified childminder invoices.",
            "estimated_taxable_income_effect": childcare_gap,
            "estimated_tax_saving": round(childcare_gap * marginal_tax_rate, 2),
            "status": "applied" if childcare_current >= childcare_max else ("incomplete" if childcare_current > 0 else "available"),
            "legal_reference": "DBG Art. 33 Abs. 3",
            "is_estimate": True,
        })

    # ── 6. Charitable Donations (Spendenabzug) ─────────────────────────────────
    donation_max = round(gross_income * 0.20, 2) if gross_income > 0 else 5000.0
    donation_current = float(deductions_data.get("donations") or 0)
    donation_gap = max(0.0, min(1000.0, donation_max - donation_current))

    opportunities.append({
        "id": "opp_donations",
        "name": "Charitable Donations",
        "category": "Voluntary & Social",
        "current_amount": donation_current,
        "max_amount": donation_max,
        "missing_action": "Gifts to Swiss tax-exempt charities exceeding CHF 100 per year are deductible up to 20% of net income.",
        "estimated_taxable_income_effect": donation_gap if donation_current > 0 else 0.0,
        "estimated_tax_saving": round((donation_gap if donation_current > 0 else 0.0) * marginal_tax_rate, 2),
        "status": "applied" if donation_current >= donation_max else ("incomplete" if donation_current > 0 else "available"),
        "legal_reference": "DBG Art. 33a",
        "is_estimate": True,
    })

    # ── 7. Mortgage & Debt Interest (Schuldzinsen) ─────────────────────────────
    mortgages = liabilities_data.get("mortgages") or []
    debt_interest_current = float(deductions_data.get("debt_interest") or 0)
    has_mortgage_doc = len(mortgages) > 0

    if has_mortgage_doc or debt_interest_current > 0:
        opportunities.append({
            "id": "opp_mortgage_interest",
            "name": "Mortgage & Debt Interest Deduction",
            "category": "Property & Debts",
            "current_amount": debt_interest_current,
            "max_amount": 50000.0,  # Legal cap is taxable investment income + CHF 50k
            "missing_action": "Report all mortgage interest certificates to offset rental value (Eigenmietwert).",
            "estimated_taxable_income_effect": debt_interest_current,
            "estimated_tax_saving": round(debt_interest_current * marginal_tax_rate, 2),
            "status": "applied" if debt_interest_current > 0 else "available",
            "legal_reference": "DBG Art. 33 Abs. 1 Bst. a",
            "is_estimate": True,
        })

    # ── 8. Unreimbursed Medical Expenses (Krankheitskosten) ───────────────────
    med_threshold = round(gross_income * 0.05, 2) if gross_income > 0 else 4000.0
    med_current = float(deductions_data.get("medical_expenses") or 0)
    med_deductible = max(0.0, med_current - med_threshold)

    opportunities.append({
        "id": "opp_medical",
        "name": "Self-Borne Medical & Dental Expenses",
        "category": "Insurance & Health",
        "current_amount": med_current,
        "max_amount": med_threshold,
        "missing_action": f"Unreimbursed dental, optical, and medical costs exceeding 5% of net income (CHF {med_threshold:,.2f}) are deductible.",
        "estimated_taxable_income_effect": med_deductible,
        "estimated_tax_saving": round(med_deductible * marginal_tax_rate, 2),
        "status": "applied" if med_deductible > 0 else "available",
        "legal_reference": "DBG Art. 33 Abs. 1 Bst. h",
        "is_estimate": True,
    })

    # ── 9. Continuing Professional Education (Weiterbildungskosten) ────────────
    edu_max = 12900.0  # Federal statutory cap
    edu_current = float(deductions_data.get("education_expenses") or 0)
    edu_gap = max(0.0, edu_max - edu_current)

    opportunities.append({
        "id": "opp_education",
        "name": "Continuing Education & Training",
        "category": "Employment Expenses",
        "current_amount": edu_current,
        "max_amount": edu_max,
        "missing_action": f"Self-paid vocational training, university modules, and certifications are deductible up to CHF {edu_max:,.2f}.",
        "estimated_taxable_income_effect": edu_gap if edu_current > 0 else 0.0,
        "estimated_tax_saving": round((edu_gap if edu_current > 0 else 0.0) * marginal_tax_rate, 2),
        "status": "applied" if edu_current >= edu_max else ("incomplete" if edu_current > 0 else "available"),
        "legal_reference": "DBG Art. 33 Abs. 1 Bst. j",
        "is_estimate": True,
    })

    return opportunities
