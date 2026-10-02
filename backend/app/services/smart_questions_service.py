"""
SunTax Smart Questions Service.
Generates dynamic, rule-based clarification questions based on taxpayer profile
and uploaded documents status.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional
from decimal import Decimal


def generate_smart_questions(
    personal_data: Dict[str, Any],
    income_data: Dict[str, Any],
    wealth_data: Dict[str, Any],
    deductions_data: Dict[str, Any],
    liabilities_data: Dict[str, Any],
    documents: List[Any],
    existing_answers: Optional[Dict[str, str]] = None,
) -> List[Dict[str, Any]]:
    """
    Generate contextual clarification questions based on missing profile data
    and missing document categories.
    """
    existing_answers = existing_answers or {}
    questions: List[Dict[str, Any]] = []

    doc_types = {getattr(d, "document_type", None) for d in documents if getattr(d, "document_type", None)}

    # 1. Employment & Salary Certificate
    has_salary_doc = "salary_certificate" in doc_types
    gross_income = float(income_data.get("employment_income") or income_data.get("gross_salary") or 0)
    
    if not has_salary_doc and gross_income <= 0:
        questions.append({
            "id": "q_employment_status",
            "category": "income",
            "question": "What is your primary employment status in Switzerland?",
            "is_required": True,
            "field_hint": "income_data.employment_status",
            "options": [
                "Employed (Employee with salary certificate)",
                "Self-Employed / Freelancer",
                "Retired / Pensioner (AHV / BVG / Pillar 2)",
                "Student / Not gainfully employed",
                "Cross-Border Commuter (Grenzgänger)",
            ],
            "answer": existing_answers.get("q_employment_status"),
            "is_answered": bool(existing_answers.get("q_employment_status")),
        })
        questions.append({
            "id": "q_gross_salary",
            "category": "income",
            "question": "What was your annual gross salary (Lohnausweis Box 8) in CHF?",
            "is_required": True,
            "field_hint": "income_data.employment_income",
            "options": None,
            "answer": existing_answers.get("q_gross_salary") or (str(gross_income) if gross_income > 0 else None),
            "is_answered": bool(existing_answers.get("q_gross_salary") or gross_income > 0),
        })

    # 2. Pillar 3a (Tied Pension)
    has_p3a_doc = "pillar3a" in doc_types
    p3a_amount = float(deductions_data.get("pillar3a_contributions") or 0)

    if not has_p3a_doc and p3a_amount <= 0:
        questions.append({
            "id": "q_pillar3a_contribution",
            "category": "deductions",
            "question": "Did you pay into a Pillar 3a pension account during the tax year (max deduction CHF 7,258 for employees)?",
            "is_required": False,
            "field_hint": "deductions_data.pillar3a_contributions",
            "options": [
                "Yes, full statutory maximum CHF 7,258",
                "Yes, partial contribution (specify amount)",
                "No contribution made",
            ],
            "answer": existing_answers.get("q_pillar3a_contribution"),
            "is_answered": bool(existing_answers.get("q_pillar3a_contribution")),
        })

    # 3. Commuting / Travel to Work
    has_commuting_doc = "commuting" in doc_types
    travel_exp = float(deductions_data.get("travel_expenses") or 0)

    if not has_commuting_doc and travel_exp <= 0:
        questions.append({
            "id": "q_commuting_mode",
            "category": "deductions",
            "question": "How do you commute between your residence and place of work?",
            "is_required": False,
            "field_hint": "deductions_data.travel_expenses",
            "options": [
                "Public Transport (SBB GA, Halbtax, or ZVV/Libero Network Pass)",
                "Personal Car / Motorbike (required for business or remote shift work)",
                "Bicycle / E-Bike / Walking (CHF 700 standard allowance)",
                "100% Home Office / No commuting expenses",
            ],
            "answer": existing_answers.get("q_commuting_mode"),
            "is_answered": bool(existing_answers.get("q_commuting_mode")),
        })

    # 4. Mandatory Health Insurance & Medical
    health_prem = float(deductions_data.get("health_insurance_premiums") or 0)
    if health_prem <= 0:
        questions.append({
            "id": "q_health_insurance",
            "category": "deductions",
            "question": "Do you claim the Swiss statutory deduction for health insurance premiums paid (KVG / VVG)?",
            "is_required": False,
            "field_hint": "deductions_data.health_insurance_premiums",
            "options": [
                "Yes, apply standard cantonal statutory flat-rate deduction",
                "No health insurance premiums to claim",
            ],
            "answer": existing_answers.get("q_health_insurance"),
            "is_answered": bool(existing_answers.get("q_health_insurance")),
        })

    # 5. Children & Childcare
    children = personal_data.get("children") or []
    has_children = len(children) > 0
    childcare_exp = float(deductions_data.get("childcare_expenses") or 0)

    if has_children and childcare_exp <= 0:
        questions.append({
            "id": "q_childcare_expenses",
            "category": "deductions",
            "question": f"Did you pay for third-party daycare, crèche, or after-school care for your {len(children)} child(ren)?",
            "is_required": False,
            "field_hint": "deductions_data.childcare_expenses",
            "options": [
                "Yes, I have childcare receipts to deduct",
                "No third-party childcare expenses",
            ],
            "answer": existing_answers.get("q_childcare_expenses"),
            "is_answered": bool(existing_answers.get("q_childcare_expenses")),
        })

    # 6. Real Estate & Mortgages
    real_estate = wealth_data.get("real_estate") or []
    has_property = len(real_estate) > 0 or "property" in doc_types or "mortgage" in doc_types
    mortgages = liabilities_data.get("mortgages") or []

    if has_property and not mortgages:
        questions.append({
            "id": "q_mortgage_details",
            "category": "liabilities",
            "question": "Do you have an outstanding mortgage or private loans on your property?",
            "is_required": False,
            "field_hint": "liabilities_data.mortgages",
            "options": [
                "Yes, I have a bank mortgage (interest is tax-deductible)",
                "No, property is debt-free",
            ],
            "answer": existing_answers.get("q_mortgage_details"),
            "is_answered": bool(existing_answers.get("q_mortgage_details")),
        })

    # 7. Bank & Investment Accounts
    bank_accounts = wealth_data.get("bank_accounts") or []
    has_bank_doc = "bank_statement" in doc_types or "securities_statement" in doc_types

    if not has_bank_doc and not bank_accounts:
        questions.append({
            "id": "q_bank_accounts",
            "category": "wealth",
            "question": "Do you hold any Swiss or foreign bank accounts, savings accounts, or custody portfolios as of Dec 31?",
            "is_required": True,
            "field_hint": "wealth_data.bank_accounts",
            "options": [
                "Yes, Swiss bank salary and savings accounts",
                "Yes, custody depot / stock portfolio",
                "No bank accounts exceeding CHF 0 balance",
            ],
            "answer": existing_answers.get("q_bank_accounts"),
            "is_answered": bool(existing_answers.get("q_bank_accounts")),
        })

    # 8. Charitable Donations
    donations = float(deductions_data.get("donations") or 0)
    has_donation_doc = "donation" in doc_types

    if not has_donation_doc and donations <= 0:
        questions.append({
            "id": "q_charitable_donations",
            "category": "deductions",
            "question": "Did you donate CHF 100 or more to recognized Swiss non-profit organizations or political parties?",
            "is_required": False,
            "field_hint": "deductions_data.donations",
            "options": [
                "Yes, I have donation receipts (tax deductible up to 20% of net income)",
                "No charitable donations to report",
            ],
            "answer": existing_answers.get("q_charitable_donations"),
            "is_answered": bool(existing_answers.get("q_charitable_donations")),
        })

    return questions


def apply_answers_to_profile(
    answers: Dict[str, str],
    personal_data: Dict[str, Any],
    income_data: Dict[str, Any],
    wealth_data: Dict[str, Any],
    deductions_data: Dict[str, Any],
    liabilities_data: Dict[str, Any],
) -> tuple[Dict[str, Any], Dict[str, Any], Dict[str, Any], Dict[str, Any], Dict[str, Any]]:
    """
    Parse smart question answers and map them into the profile sections.
    """
    # 1. Gross salary answer
    if "q_gross_salary" in answers:
        raw = answers["q_gross_salary"]
        match = re.search(r"([0-9][0-9'., ]*)", raw)
        if match:
            clean = match.group(1).replace("'", "").replace(" ", "").replace(",", "")
            try:
                income_data["employment_income"] = float(clean)
            except ValueError:
                pass

    # 2. Pillar 3a answer
    if "q_pillar3a_contribution" in answers:
        val = answers["q_pillar3a_contribution"]
        if "7,258" in val or "7258" in val or "maximum" in val.lower():
            deductions_data["pillar3a_contributions"] = 7258.0
        elif "no" in val.lower():
            deductions_data["pillar3a_contributions"] = 0.0
        else:
            match = re.search(r"([0-9][0-9'., ]*)", val)
            if match:
                clean = match.group(1).replace("'", "").replace(" ", "").replace(",", "")
                try:
                    deductions_data["pillar3a_contributions"] = min(float(clean), 7258.0)
                except ValueError:
                    pass

    # 3. Commuting answer
    if "q_commuting_mode" in answers:
        val = answers["q_commuting_mode"].lower()
        if "bicycle" in val or "700" in val:
            deductions_data["travel_expenses"] = 700.0
        elif "public transport" in val:
            deductions_data["travel_expenses"] = 3000.0
        elif "home office" in val:
            deductions_data["travel_expenses"] = 0.0

    # 4. Health insurance answer
    if "q_health_insurance" in answers:
        val = answers["q_health_insurance"].lower()
        if "yes" in val or "standard" in val:
            deductions_data["health_insurance_premiums"] = 2800.0

    # 5. Charitable donations
    if "q_charitable_donations" in answers:
        val = answers["q_charitable_donations"]
        match = re.search(r"([0-9][0-9'., ]*)", val)
        if match:
            clean = match.group(1).replace("'", "").replace(" ", "").replace(",", "")
            try:
                amt = float(clean)
                if amt >= 100:
                    deductions_data["donations"] = amt
            except ValueError:
                pass

    return personal_data, income_data, wealth_data, deductions_data, liabilities_data
