"""
SunTax Smart Questions Service.
Generates dynamic, AI-powered and rule-based clarification questions based on taxpayer
profile, Canton, tax year, and uploaded document status.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from decimal import Decimal
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.services.ai_extraction_service import get_client, get_extraction_model

logger = logging.getLogger(__name__)


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
    and missing document categories (deterministic fallback).
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


def _call_gemini_for_questions(
    canton_code: str,
    tax_year: int,
    doc_types: List[str],
    gross_income: float,
    p3a_amount: float,
    wealth_summary: str,
    deductions_summary: str,
    personal_summary: str,
) -> List[Dict[str, Any]]:
    """Synchronous worker that calls Google Gemini to generate targeted questions."""
    client = get_client()
    if not client:
        return []

    system_instruction = (
        "You are SunTax AI Question Generator, an expert Swiss tax advisor. "
        "Analyze the provided taxpayer profile summary and uploaded document types for a Swiss tax return. "
        "Generate 3 to 6 targeted, highly relevant clarification questions to uncover missing Swiss tax deductions, "
        "resolve gaps, or clarify ambiguous items. "
        "CRITICAL RULES:\n"
        "1. Categories must be one of: 'personal', 'income', 'wealth', 'deductions', 'liabilities'.\n"
        "2. Provide 2 to 4 clear multiple-choice options where applicable, or null for open numerical amounts.\n"
        "3. Only mark 'is_required' as true for vital status declarations (e.g. primary employment status or residency).\n"
        "4. Set 'field_hint' to the targeted field path (e.g. 'deductions_data.pillar3a_contributions').\n"
        "5. Output ONLY valid JSON adhering to the specified schema, with no Markdown ticks or wrapping.\n"
        "6. Never ask for details that are already clearly declared."
    )

    prompt = f"""
Tax Declaration Context:
- Canton: {canton_code}
- Tax Year: {tax_year}
- Uploaded Document Types: {', '.join(doc_types) if doc_types else 'None'}
- Personal Status: {personal_summary}
- Income Declared: Gross CHF {gross_income}
- Deductions Declared: {deductions_summary} (Pillar 3a: CHF {p3a_amount})
- Wealth Declared: {wealth_summary}

Return a JSON array of objects with the following schema:
[
  {{
    "id": "q_descriptive_key",
    "category": "deductions",
    "question": "Clear, polite English question text",
    "is_required": false,
    "field_hint": "deductions_data.pillar3a_contributions",
    "options": ["Option 1", "Option 2"]
  }}
]
"""
    try:
        from google.genai import types

        response = client.models.generate_content(
            model=get_extraction_model(),
            contents=[types.Content(role="user", parts=[types.Part.from_text(text=prompt)])],
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.1,
                response_mime_type="application/json",
            ),
        )
        text = response.text or ""
        text = text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            text = "\n".join(lines).strip()

        data = json.loads(text)
        if isinstance(data, dict) and "questions" in data:
            data = data["questions"]
        if not isinstance(data, list):
            return []

        cleaned: List[Dict[str, Any]] = []
        for item in data:
            if not isinstance(item, dict):
                continue
            q_id = str(item.get("id") or "").strip()
            q_text = str(item.get("question") or "").strip()
            if not q_id or not q_text:
                continue
            cat = str(item.get("category") or "deductions").lower()
            if cat not in ("personal", "income", "wealth", "deductions", "liabilities"):
                cat = "deductions"
            options = item.get("options")
            if options and not isinstance(options, list):
                options = None
            cleaned.append({
                "id": q_id,
                "category": cat,
                "question": q_text,
                "is_required": bool(item.get("is_required", False)),
                "field_hint": str(item.get("field_hint") or "") or None,
                "options": options,
            })
        return cleaned
    except Exception as exc:
        logger.warning("AI questions generation failed: %s", exc)
        return []


async def generate_ai_questions(
    personal_data: Dict[str, Any],
    income_data: Dict[str, Any],
    wealth_data: Dict[str, Any],
    deductions_data: Dict[str, Any],
    liabilities_data: Dict[str, Any],
    documents: List[Any],
    canton_code: Optional[str] = "ZH",
    tax_year: Optional[int] = 2025,
    existing_answers: Optional[Dict[str, str]] = None,
) -> List[Dict[str, Any]]:
    """
    Generate dynamic AI questions using Gemini with seamless fallback to rule-based questions.
    """
    existing_answers = existing_answers or {}
    canton = canton_code or "ZH"
    year = tax_year or 2025

    # Always generate baseline rule questions
    rule_questions = generate_smart_questions(
        personal_data=personal_data,
        income_data=income_data,
        wealth_data=wealth_data,
        deductions_data=deductions_data,
        liabilities_data=liabilities_data,
        documents=documents,
        existing_answers=existing_answers,
    )

    client = get_client()
    if not client:
        return rule_questions

    # Prepare context summaries
    doc_types = [getattr(d, "document_type", None) for d in documents if getattr(d, "document_type", None)]
    gross_income = float(income_data.get("employment_income") or income_data.get("gross_salary") or 0)
    p3a_amount = float(deductions_data.get("pillar3a_contributions") or 0)

    children_count = len(personal_data.get("children") or [])
    marital_status = personal_data.get("marital_status", "single")
    personal_summary = f"Marital status: {marital_status}, Children: {children_count}"

    bank_count = len(wealth_data.get("bank_accounts") or [])
    real_estate_count = len(wealth_data.get("real_estate") or [])
    wealth_summary = f"{bank_count} bank accounts, {real_estate_count} real estate properties"

    ded_items = []
    if float(deductions_data.get("travel_expenses") or 0) > 0:
        ded_items.append("Travel expenses")
    if float(deductions_data.get("health_insurance_premiums") or 0) > 0:
        ded_items.append("Health insurance")
    if float(deductions_data.get("donations") or 0) > 0:
        ded_items.append("Donations")
    deductions_summary = ", ".join(ded_items) if ded_items else "None specified"

    try:
        ai_raw_questions = await asyncio.to_thread(
            _call_gemini_for_questions,
            canton_code=canton,
            tax_year=year,
            doc_types=doc_types,
            gross_income=gross_income,
            p3a_amount=p3a_amount,
            wealth_summary=wealth_summary,
            deductions_summary=deductions_summary,
            personal_summary=personal_summary,
        )
    except Exception as exc:
        logger.warning("Error running AI questions worker in thread: %s", exc)
        ai_raw_questions = []

    if not ai_raw_questions or len(ai_raw_questions) < 2:
        return rule_questions

    # Populate answers from existing_answers and combine
    final_questions: List[Dict[str, Any]] = []
    seen_ids = set()

    for q in ai_raw_questions:
        q_id = q["id"]
        seen_ids.add(q_id)
        ans = existing_answers.get(q_id)
        q["answer"] = ans
        q["is_answered"] = bool(ans)
        final_questions.append(q)

    # If any previous answers existed for rule questions not returned by AI, preserve them
    for rq in rule_questions:
        if rq["id"] not in seen_ids and rq["id"] in existing_answers:
            final_questions.append(rq)
            seen_ids.add(rq["id"])

    return final_questions


def apply_answers_to_profile(
    answers: Dict[str, str],
    personal_data: Dict[str, Any],
    income_data: Dict[str, Any],
    wealth_data: Dict[str, Any],
    deductions_data: Dict[str, Any],
    liabilities_data: Dict[str, Any],
    questions_list: Optional[List[Dict[str, Any]]] = None,
) -> tuple[Dict[str, Any], Dict[str, Any], Dict[str, Any], Dict[str, Any], Dict[str, Any]]:
    """
    Parse smart question answers and map them into the profile sections.
    Supports both rule-based keys and dynamic AI question field_hints.
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

    # 6. Dynamic field_hint mapper for AI questions
    field_hints = {}
    if questions_list:
        for q in questions_list:
            if isinstance(q, dict) and q.get("id") and q.get("field_hint"):
                field_hints[q["id"]] = q["field_hint"]

    for q_id, val in answers.items():
        if q_id in field_hints and val:
            hint = field_hints[q_id]
            parts = hint.split(".")
            if len(parts) == 2:
                section_name, field_name = parts[0], parts[1]
                target_dict = None
                if "personal" in section_name:
                    target_dict = personal_data
                elif "income" in section_name:
                    target_dict = income_data
                elif "wealth" in section_name:
                    target_dict = wealth_data
                elif "deduction" in section_name:
                    target_dict = deductions_data
                elif "liabilit" in section_name:
                    target_dict = liabilities_data

                if target_dict is not None:
                    match = re.search(r"([0-9][0-9'., ]*)", str(val))
                    if match:
                        clean = match.group(1).replace("'", "").replace(" ", "").replace(",", "")
                        try:
                            target_dict[field_name] = float(clean)
                        except ValueError:
                            target_dict[field_name] = str(val)
                    else:
                        target_dict[field_name] = str(val)

    return personal_data, income_data, wealth_data, deductions_data, liabilities_data
