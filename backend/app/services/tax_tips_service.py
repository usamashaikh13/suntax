"""
Tax Tips Service for SunTax — Addendum 1 («Tipps für dich» and December Reminders).

Implements:
  - tax_tips_de.json client canonical specification
  - Strict display rules (max 3 tips at once, priority + savings sort)
  - Legal non-guaranteed wording ('ca.' or 'bis zu')
  - Strict gating: 'verify_before_release: true' tips stay hidden until legally confirmed
  - Regulatory warnings (home_office_room, no_receipt, private_costs)
  - Full German and English bilingual rendering
"""
from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.services.rules_data_service import rules_data_service

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

ENGLISH_TIP_TRANSLATIONS: Dict[str, Dict[str, str]] = {
    "pillar3a": {
        "title": "Pillar 3a",
        "text": "Contributions paid in by December 31 can be fully deducted: up to CHF {max} with a pension fund. Pay by approx. December 20 to ensure on-time booking.",
    },
    "pk_buyin": {
        "title": "Pension Fund Buy-In",
        "text": "Voluntary buy-ins into your 2nd pillar pension fund directly reduce your taxable income. Check your pension certificate for available buy-in capacity.",
    },
    "job_costs_effective": {
        "title": "Professional Expenses: Flat Rate vs. Actual",
        "text": "If your actual work expenses exceed the 3% flat rate (min. CHF 2’000, max. CHF 4’000), you can deduct the actual documented expenses.",
    },
    "commute_car_reason": {
        "title": "Car Commute Justification",
        "text": "Deducting car travel requires a recognized justification (e.g. no public transit, over 1 hr time savings, shift work, or medical certificate).",
    },
    "training": {
        "title": "Continuing Education & Training",
        "text": "Job-related training and continuing education costs up to CHF 12’400 (Canton) / CHF 13’000 (Federal) are deductible.",
    },
    "medical": {
        "title": "Unreimbursed Medical Costs",
        "text": "Self-paid medical, dental, and disability costs that exceed 5% of your net income are deductible.",
    },
    "donations": {
        "title": "Charitable Donations",
        "text": "Donations of CHF 100 or more to tax-exempt Swiss charitable organizations can be deducted up to 20% of net income.",
    },
    "party": {
        "title": "Political Party Donations",
        "text": "Donations and membership fees to political parties are deductible up to legal cantonal and federal limits.",
    },
    "childcare": {
        "title": "Third-Party Childcare",
        "text": "Documented daycare (Kita), after-school care (Hort), and day family costs are deductible up to CHF 25’000 (ZH) / CHF 25’800 (Federal) per child under 14.",
    },
    "alimony_paid": {
        "title": "Alimony & Support Payments",
        "text": "Maintenance contributions paid to a divorced spouse or minor children are fully deductible.",
    },
    "support": {
        "title": "Support of Relatives in Need",
        "text": "Direct financial support for persons unable to work (excluding spouse and own children for whom child deductions are claimed) is deductible with proof of payment.",
    },
    "withholding_tax": {
        "title": "Reclaim Swiss Withholding Tax",
        "text": "Declare all Swiss bank accounts and securities to ensure the 35% federal withholding tax (Verrechnungssteuer) is credited against your tax bill.",
    },
    "property_planning": {
        "title": "Property Renovation Planning",
        "text": "Distribute major value-maintaining home renovations across two calendar years to optimize your progressive tax bracket in both years.",
    },
    "debt_interest": {
        "title": "Mortgage & Debt Interest",
        "text": "Private mortgage and consumer loan interest is deductible up to taxable gross wealth yield plus CHF 50’000.",
    },
    "two_earner": {
        "title": "Two-Earner Deduction",
        "text": "Married couples where both spouses work automatically receive the two-earner deduction (Canton CHF 6’100 / Federal min. CHF 8’600, max. CHF 14’100).",
    },
    "premium_reduction": {
        "title": "Health Premium Reduction",
        "text": "Taxpayers with modest taxable income may be eligible for cantonal health insurance premium subsidies (Prämienverbilligung).",
    },
}

ENGLISH_WARNINGS: Dict[str, Dict[str, str]] = {
    "home_office_room": {
        "title": "Home Office Room",
        "text": "A home office is only deductible if your employer does not provide a designated workstation. Never deduct automatically; always retain employer confirmation.",
    },
    "no_receipt": {
        "title": "No Deduction Without Receipt",
        "text": "Keep all original receipts safely. The cantonal tax administration can request proof during assessment.",
    },
    "private_costs": {
        "title": "Private Living Expenses",
        "text": "Clothing, private mobile phone plans, hobby courses, and personal gifts are strictly non-deductible under Swiss tax law.",
    },
}


class TaxTipsService:
    """Evaluates and renders legal Swiss tax-saving tips adhering strictly to Addendum 1."""

    def __init__(self, data_dir: Optional[Path] = None) -> None:
        self.data_dir = data_dir or DATA_DIR

    def _load_tips_raw(self) -> Dict[str, Any]:
        p = self.data_dir / "tax_tips_de.json"
        if not p.is_file():
            return {"tips": [], "warnings": [], "display_rules": []}
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)

    def get_tips_for_tax_return(
        self,
        tax_return: Any,
        profile: Any,
        calculation: Any = None,
        lang: str = "de",
        phase: str = "filing",
    ) -> Dict[str, Any]:
        """
        Evaluate and return up to 3 legal tax tips for the current tax return.

        Strict rules:
          1. Show max 3 tips at once.
          2. Sorted by priority (1 = most important), then by estimated saving.
          3. Savings formatted with 'ca.' or 'bis zu'.
          4. verify_before_release: true stay HIDDEN until confirmed.
        """
        raw = self._load_tips_raw()
        all_tips = raw.get("tips", [])
        tax_year = int(getattr(tax_return, "tax_year", 2025) or 2025)
        canton_code = str(getattr(tax_return, "canton_code", "ZH") or "ZH").upper()
        fed_rules = rules_data_service.get_federal_rules(tax_year)
        canton_rules = rules_data_service.get_canton_rules(canton_code, tax_year)

        pd = (getattr(profile, "personal_data", None) or {}) if profile else {}
        inc = (getattr(profile, "income_data", None) or {}) if profile else {}
        ded = (getattr(profile, "deductions_data", None) or {}) if profile else {}
        wealth = (getattr(profile, "wealth_data", None) or {}) if profile else {}

        # Marginal rate estimate (default ~22% for mid-income Swiss taxpayer)
        marginal_rate = Decimal("0.22")
        if calculation and hasattr(calculation, "calculation_details"):
            cd = getattr(calculation, "calculation_details", {}) or {}
            ti = Decimal(str(cd.get("cantonal_taxable_income") or cd.get("taxable_income") or 0))
            if ti > 150000:
                marginal_rate = Decimal("0.32")
            elif ti > 90000:
                marginal_rate = Decimal("0.25")
            elif ti > 50000:
                marginal_rate = Decimal("0.18")
            elif ti > 0:
                marginal_rate = Decimal("0.12")

        max_3a_with_pf = fed_rules.get("pillar3a_with_pf", 7258)
        max_3a_no_pf = fed_rules.get("pillar3a_without_pf_max", 36288)

        def _num(v: Any) -> float:
            try:
                return float(v or 0)
            except Exception:
                return 0.0

        p3a_paid = _num(ded.get("pillar3a_total") or ded.get("pillar3a_contributions") or ded.get("pillar3a"))
        emp_income = max(_num(inc.get("net_salary")), _num(inc.get("gross_salary")), _num(inc.get("employment_income")))
        spouse_income = _num(inc.get("employment_income_spouse"))
        civil = str(pd.get("marital_status") or pd.get("civil_status") or "").lower()
        is_married = civil in ("married", "verheiratet", "registered_partnership")
        has_children = int(pd.get("children_count") or len(pd.get("children") or []) or 0) > 0
        has_home = bool(wealth.get("has_home") or _num(wealth.get("real_estate_tax_value")) > 0)
        has_debt = _num(ded.get("mortgage_interest")) > 0 or _num(ded.get("debt_interest")) > 0
        has_sec = _num(inc.get("dividend_income")) > 0 or _num(inc.get("bank_interest")) > 0 or len(wealth.get("bank_accounts") or []) > 0

        applicable_tips: List[Dict[str, Any]] = []

        for tip in all_tips:
            # Rule 5: Keep verify_before_release: true strictly hidden
            if tip.get("verify_before_release") is True:
                continue

            tid = tip.get("id")
            prio = int(tip.get("priority", 3))
            is_applicable = False
            estimated_saving_chf = 0
            saving_prefix = "ca."

            if tid == "pillar3a":
                # Applies if no 3a paid or paid less than maximum
                if p3a_paid < max_3a_with_pf:
                    is_applicable = True
                    room = max_3a_with_pf - p3a_paid
                    estimated_saving_chf = int(Decimal(str(room)) * marginal_rate)
                    saving_prefix = "bis zu"
            elif tid == "pk_buyin":
                # Applies if employed with 2nd pillar and no buy-in entered
                pk_buy = _num(ded.get("pension_buyin"))
                if emp_income > 40000 and pk_buy <= 0:
                    is_applicable = True
                    estimated_saving_chf = int(Decimal("5000") * marginal_rate)
                    saving_prefix = "bis zu"
            elif tid == "job_costs_effective":
                if emp_income > 0 and _num(ded.get("professional_expenses")) <= 0:
                    is_applicable = True
                    estimated_saving_chf = 350
                    saving_prefix = "ca."
            elif tid == "commute_car_reason":
                if ded.get("commute_mode") == "car" and not ded.get("car_reason"):
                    is_applicable = True
                    estimated_saving_chf = 600
                    saving_prefix = "bis zu"
            elif tid == "training":
                if _num(ded.get("education_expenses") or ded.get("education")) <= 0:
                    is_applicable = True
                    estimated_saving_chf = 800
                    saving_prefix = "bis zu"
            elif tid == "donations":
                if _num(ded.get("donations_total") or ded.get("donations")) <= 0:
                    is_applicable = True
                    estimated_saving_chf = 150
                    saving_prefix = "ca."
            elif tid == "childcare":
                if has_children and _num(ded.get("childcare_costs")) <= 0:
                    is_applicable = True
                    estimated_saving_chf = int(Decimal("10000") * marginal_rate)
                    saving_prefix = "bis zu"
            elif tid == "withholding_tax":
                if has_sec:
                    is_applicable = True
                    estimated_saving_chf = 200
                    saving_prefix = "ca."
            elif tid == "debt_interest":
                if has_debt:
                    is_applicable = True
                    estimated_saving_chf = 450
                    saving_prefix = "ca."
            elif tid == "two_earner":
                if is_married and emp_income > 0 and spouse_income > 0:
                    is_applicable = True
                    estimated_saving_chf = int(Decimal("6100") * marginal_rate)
                    saving_prefix = "ca."
            elif tid == "property_planning":
                if has_home:
                    is_applicable = True
                    estimated_saving_chf = 1200
                    saving_prefix = "bis zu"
            elif tid == "premium_reduction":
                if _num(ded.get("health_insurance_premiums")) > 0 and (emp_income + spouse_income) < 80000:
                    is_applicable = True
                    estimated_saving_chf = 500
                    saving_prefix = "bis zu"

            if not is_applicable:
                continue

            # Format title and text
            de_title = tip.get("title", "")
            de_text = tip.get("text", "")
            de_text = de_text.replace("{max}", f"{max_3a_with_pf:,.0f}").replace("{max_no_pf}", f"{max_3a_no_pf:,.0f}").replace(",", "’")

            is_en = str(lang or "de").lower().startswith("en")
            en_meta = ENGLISH_TIP_TRANSLATIONS.get(tid, {})
            title_out = en_meta.get("title", de_title) if is_en else de_title
            text_out = (
                en_meta.get("text", de_text).replace("{max}", f"{max_3a_with_pf:,.0f}").replace("{max_no_pf}", f"{max_3a_no_pf:,.0f}").replace(",", "’")
                if is_en
                else de_text
            )

            saving_display = ""
            if estimated_saving_chf > 0:
                saving_label = "Spart" if not is_en else "Saves"
                approx_label = "ca." if saving_prefix == "ca." else "bis zu"
                if is_en:
                    approx_label = "approx." if saving_prefix == "ca." else "up to"
                saving_display = f"{saving_label} {approx_label} CHF {estimated_saving_chf:,.0f}".replace(",", "’")

            applicable_tips.append({
                "id": tid,
                "priority": prio,
                "title": title_out,
                "text": text_out,
                "estimated_saving_chf": estimated_saving_chf,
                "saving_display": saving_display,
                "app_logic": tip.get("app_logic", ""),
            })

        # Rule 1 & 2: Sort by priority ascending, then by estimated saving descending, take max 3
        applicable_tips.sort(key=lambda t: (t["priority"], -t["estimated_saving_chf"]))
        selected_tips = applicable_tips[:3]

        # Regulatory warnings
        warnings_out = []
        is_en = str(lang or "de").lower().startswith("en")
        for w in raw.get("warnings", []):
            wid = w.get("id")
            en_w = ENGLISH_WARNINGS.get(wid, {})
            warnings_out.append({
                "id": wid,
                "title": en_w.get("title", w.get("title", "")) if is_en else w.get("title", ""),
                "text": en_w.get("text", w.get("text", "")) if is_en else w.get("text", ""),
                "app_logic": w.get("app_logic", ""),
            })

        return {
            "tax_year": tax_year,
            "canton_code": canton_code,
            "language": "en" if is_en else "de",
            "tips": selected_tips,
            "warnings": warnings_out,
            "total_applicable": len(applicable_tips),
        }


tax_tips_service = TaxTipsService()
