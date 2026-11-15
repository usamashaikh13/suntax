"""
Unified Data Loader Service for Addendum 1 Canonical Specifications:
  - rules_2025_2026.json (26 cantons + y2026 delta + availability flags + car km rates)
  - receipts_rules.json  (required vs keep_only receipts + annexes + required personal data)
  - questions.json       (14 Step-3 question cards with conditions & missing hints)
  - app_texts_de.json    (All German UI strings formatted with centralized Brand Config)
"""
from __future__ import annotations

import copy
import json
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.core.config import settings

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

RECEIPT_TRANSLATIONS_EN: Dict[str, str] = {
    # Always required
    "lohn": "Salary certificate (Lohnausweis)",
    "lohn2": "Spouse salary certificate (Lohnausweis Partner 2)",
    "securities": "Tax statement or bank/custody statements as of 31.12.",
    # Field specific
    "neben": "Secondary employment salary slip (Lohnausweis Nebenerwerb)",
    "ahv": "AHV/IV Pension certificate (Rentenbescheinigung AHV/IV)",
    "pens": "Occupational pension certificate (Rentenbescheinigung)",
    "alv": "Unemployment benefit statement (Arbeitslosenkasse)",
    "zulagen": "Daily allowances / family allowances statement",
    "other": "Documentation of other income",
    "korp": "Dividend & shares yield statement",
    "kapAbf": "Severance / lump-sum benefit statement",
    "unterIn": "Alimony received payment proofs",
    "kidUnterIn": "Child alimony received payment proofs",
    "home": "Mortgage interest certificate and property maintenance bills",
    "weekly": "Rental contract at place of employment (weekly commute)",
    "support": "Proof of support payments",
    "kidsOut": "Confirmation of education / university enrolment",
    "alimony": "Proof of spousal alimony paid",
    "kidAlimony": "Proof of child alimony paid",
    "p3a": "Pillar 3a contribution certificate (Tax certificate)",
    "p3a2": "Spouse Pillar 3a contribution certificate",
    "p3a_catchup": "Pillar 3a retroactive catch-up contribution certificate",
    "prem": "Health insurance tax certificate (Premiums & out-of-pocket costs)",
    "pkBuy": "Pension fund buy-in certificate (Pensionskassen-Einkauf)",
    "wb": "Invoices and receipts for further education",
    "bkEff": "Proof of actual job-related expenses",
    "depot": "Custody account statement / fee receipts",
    "party": "Donation receipts for political parties",
    "sick": "Medical expense receipts & health insurance settlement statements",
    "handicap": "Disability expense receipts and medical attestations",
    "donate": "Charitable donation receipts",
    "rentLeist": "Proof of annuity payments",
    "care": "Third-party childcare invoices / Kita confirmation",
    "life": "Life insurance surrender value statement as of 31.12.",
    "korpW": "Valuation of company shares / non-listed investments",
    "otherW": "Proof of other assets (vehicles, precious metals, art, cash)",
    "debt": "Debt statement / mortgage balance statement as of 31.12.",
    "capital": "Capital settlement certificate",
    "giftIn": "Inheritance or gift deed / statement",
    "giftOut": "Proof of gifts granted",
}

PERSONAL_DATA_TRANSLATIONS_EN: Dict[str, str] = {
    "ahvnr": "AHV / Social Security Number (756.xxxx.xxxx.xx)",
    "birth": "Date of birth",
    "addr": "Official residential address as of 31.12.",
    "name2": "Partner 2: Full legal name",
    "ahvnr2": "Partner 2: AHV / Social Security Number",
    "birth2": "Partner 2: Date of birth",
    "kidName": "Children: Full legal name(s)",
    "kidBirth": "Children: Date(s) of birth",
}

ANNEX_TRANSLATIONS_EN: Dict[str, str] = {
    "job_expenses_annex": "Professional Expenses Statement",
    "securities_annex": "Securities and Assets Statement with Withholding Tax Refund Application",
    "medical_list_annex": "Medical and Accident Expenses Statement",
    "work_costs_list_annex": "Other Work-Related Expenses Statement",
    "training_list_annex": "Further Education and Training Statement",
    "donations_list_annex": "Charitable Donations Statement",
    "real_estate_annex": "Real Estate / Property Register",
    "debt_annex": "Debt and Liabilities Statement",
}


class RulesDataService:
    """Data-driven access layer for rules, availability, receipts, questions, and i18n texts."""

    def __init__(self, data_dir: Optional[Path] = None) -> None:
        self.data_dir = data_dir or DATA_DIR

    def _load_json(self, filename: str) -> Dict[str, Any]:
        path = self.data_dir / filename
        if not path.is_file():
            return {}
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    def get_rules_raw(self) -> Dict[str, Any]:
        return self._load_json("rules_2025_2026.json")

    def get_canton_rules(self, canton_code: str, tax_year: int = 2025) -> Dict[str, Any]:
        """
        Return merged rules dictionary for (canton_code, tax_year).
        Applies y2026 delta on top of 2025 base when tax_year >= 2026.
        """
        raw = self.get_rules_raw()
        kantone = raw.get("cantons") or raw.get("kantone", {})
        code = str(canton_code or "ZH").upper()
        base = copy.deepcopy(kantone.get(code, {}))
        if not base:
            return {}
        if int(tax_year) >= 2026 and isinstance(base.get("y2026"), dict):
            for k, v in base["y2026"].items():
                if isinstance(v, dict) and isinstance(base.get(k), dict):
                    merged = dict(base[k])
                    merged.update(v)
                    base[k] = merged
                else:
                    base[k] = v
        return base

    def get_federal_rules(self, tax_year: int = 2025) -> Dict[str, Any]:
        """Return federal rules dictionary merged with y2026 block when tax_year >= 2026."""
        raw = self.get_rules_raw()
        fed = raw.get("federal", {})
        if str(tax_year) in fed and isinstance(fed[str(tax_year)], dict):
            return copy.deepcopy(fed[str(tax_year)])
        if "2025" in fed and isinstance(fed["2025"], dict):
            res = copy.deepcopy(fed["2025"])
            if int(tax_year) >= 2026:
                res["car_per_km"] = 0.75
            return res
        bund = copy.deepcopy(raw.get("meta", {}).get("bund", {}))
        if int(tax_year) >= 2026 and isinstance(bund.get("y2026"), dict):
            for k, v in bund["y2026"].items():
                if isinstance(v, dict) and isinstance(bund.get(k), dict):
                    merged = dict(bund[k])
                    merged.update(v)
                    bund[k] = merged
                else:
                    bund[k] = v
        return bund

    def get_federal_car_rate(self, tax_year: int = 2025) -> Decimal:
        """Addendum 1 Section 3: Federal car rate is CHF 0.75/km in 2026, CHF 0.70/km in 2025."""
        raw = self.get_rules_raw()
        if int(tax_year) >= 2026:
            return Decimal("0.75")
        fed = raw.get("federal", {})
        if "2025" in fed and isinstance(fed["2025"], dict) and "car_per_km" in fed["2025"]:
            return Decimal(str(fed["2025"]["car_per_km"]))
        rates = raw.get("meta", {}).get("federal_car_rate", {})
        rate_val = rates.get(str(tax_year))
        if rate_val is not None:
            return Decimal(str(rate_val))
        return Decimal("0.70")

    def get_canton_availability(self, canton_code: str, tax_year: int = 2025) -> str:
        """
        Return availability status ('available' or 'coming_soon') purely from data.
        Switching a canton on requires zero code change, only editing rules_2025_2026.json.
        """
        raw = self.get_rules_raw()
        code = str(canton_code or "").upper()
        c_entry = raw.get("kantone", {}).get(code, {})
        if not c_entry.get("availability") and "cantons" in raw:
            c_entry = raw.get("cantons", {}).get(code, {})
        avail_map = c_entry.get("availability", {})
        status = avail_map.get(str(tax_year)) or avail_map.get("2025")
        if not status:
            status = "available" if code == "ZH" else "coming_soon"
        return str(status)

    def is_canton_available(self, canton_code: str, tax_year: int = 2025) -> bool:
        return self.get_canton_availability(canton_code, tax_year) == "available"

    def get_all_cantons_overview(self, tax_year: int = 2025) -> Dict[str, Any]:
        """Return full 26-canton rule summary + availability + federal reference for landing calculator."""
        raw = self.get_rules_raw()
        bund = self.get_federal_rules(tax_year)
        fed_car = float(self.get_federal_car_rate(tax_year))
        cantons_out = []
        kantone = raw.get("cantons") or raw.get("kantone", {})
        for code in sorted(kantone.keys()):
            merged = self.get_canton_rules(code, tax_year)
            avail = self.get_canton_availability(code, tax_year)
            bk = merged.get("bk") or {}
            bk_max = bk.get("fix") if "fix" in bk else bk.get("max", 4000)
            comm = merged.get("comm") or {}
            prem = merged.get("prem") or [0, 0, 0, 0, 0]
            cantons_out.append({
                "code": code,
                "name": merged.get("name", code),
                "lang": merged.get("lang", "DE"),
                "deadline": merged.get("deadline", "31. März"),
                "availability": avail,
                "availability_by_year": merged.get("availability", {"2025": avail, "2026": avail}),
                "y2026_confirmed": bool(merged.get("y2026_confirmed", False)),
                "submission_note": merged.get("submission_note", ""),
                "commute_max": comm.get("max"),
                "commute_car_rate": comm.get("car", fed_car),
                "work_expenses_max": bk_max,
                "health_insurance_single_pk": prem[0] if len(prem) > 0 else 0,
                "health_insurance_married_pk": prem[2] if len(prem) > 2 else 0,
                "child_deduction": merged.get("kid", 0),
                "childcare_max": merged.get("care", 0),
                "education_max": merged.get("wb", 12000),
            })

        return {
            "tax_year": int(tax_year),
            "federal": {
                "car_rate_per_km": fed_car,
                "commute_max": bund.get("comm", {}).get("max", 3300),
                "pillar3a_max": 7258,
                "pillar3a_catchup_max": bund.get("pillar3a_catchup_max", 7258) if int(tax_year) >= 2026 else 0,
                "health_insurance_single_pk": (bund.get("prem") or [1800])[0],
                "health_insurance_married_pk": (bund.get("prem") or [1800, 2700, 3700])[2],
                "child_deduction": bund.get("kid", 6800),
                "childcare_max": bund.get("care", 25800),
            },
            "cantons": cantons_out,
        }

    def get_receipt_rules(self, canton_code: str = "ZH", tax_year: int = 2025) -> Dict[str, Any]:
        """Load receipt rules per canton and year (falling back to Zürich per Addendum 1 § 4)."""
        raw = self._load_json("receipts_rules.json")
        rules_root = raw.get("rules", {})
        c_up = str(canton_code or "ZH").upper()
        default_tpl = raw.get("default_template", "ZH")
        c_dict = rules_root.get(c_up) or rules_root.get(default_tpl, {})
        y_dict = c_dict.get(str(tax_year)) or c_dict.get("2025") or {}
        if not y_dict and default_tpl in rules_root:
            y_dict = rules_root[default_tpl].get(str(tax_year)) or rules_root[default_tpl].get("2025") or {}
        res = copy.deepcopy(y_dict)
        if "per_field" in raw:
            res["per_field"] = raw["per_field"]
        if "always_required_if_present" in raw:
            res["always_required_if_present"] = raw["always_required_if_present"]
        if "generated_by_app" in raw:
            res["generated_by_app"] = raw["generated_by_app"]
        if "required_personal_data" in raw:
            res["required_personal_data_list"] = raw["required_personal_data"]
        return res

    def evaluate_receipts(
        self,
        tax_return: Any,
        profile: Any,
        documents: List[Any],
    ) -> Dict[str, Any]:
        """
        Evaluate uploaded receipts & profile data against receipts_rules.json.
        Distinguishes:
          - required_missing: receipts required to submit (submission blocked)
          - attached_ok: required/optional receipts already uploaded
          - keep_only_items: receipts taxpayer only keeps (never attached)
          - app_generated_annexes: annexes generated automatically by the app
          - missing_personal_data: required personal details missing before submission
        """
        canton = str(getattr(tax_return, "canton_code", "ZH")).upper()
        tax_year = int(getattr(tax_return, "tax_year", 2025) or 2025)
        rules = self.get_receipt_rules(canton, tax_year)

        pd = (getattr(profile, "personal_data", None) or {}) if profile else {}
        inc = (getattr(profile, "income_data", None) or {}) if profile else {}
        ded = (getattr(profile, "deductions_data", None) or {}) if profile else {}
        wealth = (getattr(profile, "wealth_data", None) or {}) if profile else {}
        liab = (getattr(profile, "liabilities_data", None) or {}) if profile else {}

        doc_types_present = {
            str(getattr(d, "document_type", "") or "").lower()
            for d in (documents or [])
            if getattr(d, "processing_status", "") != "error"
        }

        doc_type_aliases: Dict[str, set[str]] = {
            "salary_certificate": {"salary_certificate", "lohnausweis", "side_income_receipt"},
            "salary_certificate_partner2": {"salary_certificate_partner2", "salary_certificate"},
            "bank_statement": {"bank_statement", "tax_statement", "securities_statement", "depot_fee_receipt"},
            "securities_statement": {"securities_statement", "tax_statement", "bank_statement"},
            "pillar3a": {"pillar3a", "pillar3a_certificate", "pillar3a_catchup_certificate"},
            "pillar3a_certificate": {"pillar3a", "pillar3a_certificate", "pillar3a_catchup_certificate"},
            "pillar3a_catchup_certificate": {"pillar3a", "pillar3a_catchup_certificate"},
            "mortgage_statement": {"mortgage", "mortgage_statement", "debt_statement"},
            "debt_statement": {"mortgage", "debt_statement", "mortgage_statement"},
            "property_maintenance": {"mortgage", "property_maintenance", "mortgage_statement"},
            "health_insurance": {"insurance", "health_insurance", "insurance_certificate"},
            "insurance_certificate": {"insurance", "insurance_certificate", "health_insurance"},
            "donation_receipt": {"donation", "donation_receipt"},
            "donation": {"donation", "donation_receipt"},
            "medical_receipt": {"medical", "medical_receipt"},
            "childcare_receipt": {"childcare", "childcare_receipt", "kita_invoice"},
            "kita_invoice": {"childcare", "kita_invoice", "childcare_receipt"},
        }

        def _has_any_doc(candidates: List[str]) -> bool:
            for c in candidates:
                c_low = c.lower()
                accepted = doc_type_aliases.get(c_low, {c_low})
                if doc_types_present & accepted:
                    return True
            return False

        def _num(val: Any) -> float:
            try:
                return float(val or 0)
            except Exception:
                return 0.0

        civil = str(pd.get("marital_status") or pd.get("civil_status") or "single").lower()
        is_married = civil in ("married", "verheiratet", "registered_partnership", "eingetragene partnerschaft")
        children_raw = pd.get("children")
        children_list = children_raw if isinstance(children_raw, list) else []
        children_count = int(
            pd.get("children_count")
            or pd.get("num_children")
            or ded.get("number_of_children")
            or len(children_list)
            or 0
        )

        sec_list = wealth.get("securities") or wealth.get("securities_positions") or []
        bank_list = wealth.get("bank_accounts") or []
        sec_total = sum(_num(s.get("tax_value") or s.get("val") or s.get("value_chf") or s.get("value")) for s in sec_list if isinstance(s, dict))
        sec_total += sum(_num(b.get("balance_chf") or b.get("balance")) for b in bank_list if isinstance(b, dict))
        sec_total += _num(wealth.get("total_wealth")) + _num(wealth.get("bank_accounts_total"))

        required_missing: List[Dict[str, Any]] = []
        attached_ok: List[Dict[str, Any]] = []
        keep_only_items: List[Dict[str, Any]] = []

        # 1. Always required checks
        emp_income = max(
            _num(inc.get("net_salary")),
            _num(inc.get("gross_salary")),
            _num(inc.get("employment_income")),
            _num(inc.get("total_employment_income")),
        )
        spouse_income = _num(inc.get("employment_income_spouse") or inc.get("spouse_employment_income"))
        sec_income = _num(inc.get("dividends")) + _num(inc.get("dividend_income")) + _num(inc.get("bank_interest")) + _num(inc.get("interest_income")) + _num(inc.get("securities_yield"))

        always_triggers = {
            "lohn": emp_income > 0,
            "lohn2": is_married and spouse_income > 0,
            "securities": sec_total > 0 or sec_income > 0,
        }
        for rule_def in rules.get("always_required_receipts", []):
            key = rule_def.get("key", "")
            if not always_triggers.get(key, False):
                continue
            doc_cands = rule_def.get("doc_types", [])
            label = rule_def.get("label", key)
            req = rule_def.get("requirement", "required")
            has_doc = _has_any_doc(doc_cands)
            item = {
                "key": key,
                "label": label,
                "label_en": RECEIPT_TRANSLATIONS_EN.get(key, label),
                "requirement": req,
                "attached": has_doc,
                "hint": rule_def.get("hint", ""),
            }
            if has_doc:
                attached_ok.append(item)
            else:
                required_missing.append(item)

        # 2. All 37 field-specific receipt rules (required vs keep_only)
        home_owned = bool(
            wealth.get("has_home")
            or (isinstance(wealth.get("real_estate"), list) and len(wealth.get("real_estate")) > 0)
            or _num(wealth.get("real_estate_tax_value")) > 0
            or _num(ded.get("home_maintenance")) > 0
            or _num(inc.get("home_imputed_rent")) > 0
        )
        other_Assets_tot = _num(wealth.get("other_assets_total") or wealth.get("otherW"))
        if isinstance(wealth.get("other_assets"), list):
            other_Assets_tot += sum(_num(x.get("value")) for x in wealth.get("other_assets") if isinstance(x, dict))

        liab_total = (
            _num(ded.get("mortgage_interest") or ded.get("debt_interest") or liab.get("debt_interest"))
            + _num(liab.get("total_mortgage_debt"))
            + _num(liab.get("other_liabilities"))
        )
        if isinstance(liab.get("mortgages"), list):
            liab_total += sum(_num(m.get("outstanding_balance")) for m in liab.get("mortgages") if isinstance(m, dict))
        if isinstance(liab.get("loans"), list):
            liab_total += sum(_num(l.get("outstanding_balance")) for l in liab.get("loans") if isinstance(l, dict))

        field_triggers: Dict[str, bool] = {
            "neben": _num(inc.get("side_job_income") or inc.get("self_employment_income")) > 0,
            "ahv": _num(inc.get("ahv_pension")) > 0,
            "pens": _num(inc.get("pk_pension") or inc.get("pension_income")) > 0,
            "alv": _num(inc.get("alv_income") or inc.get("unemployment_benefit")) > 0,
            "zulagen": _num(inc.get("daily_allowances") or inc.get("zulagen")) > 0,
            "other": _num(inc.get("other_income")) > 0,
            "korp": _num(inc.get("corporate_yield") or inc.get("korp_income")) > 0,
            "kapAbf": _num(inc.get("capital_payment_recurring") or inc.get("kapAbf")) > 0,
            "unterIn": _num(inc.get("spousal_alimony_received") or inc.get("unterIn")) > 0,
            "kidUnterIn": _num(inc.get("alimony_received") or inc.get("kidUnterIn")) > 0,
            "home": home_owned,
            "weekly": _num(ded.get("weekly_residence_costs")) > 0,
            "support": _num(ded.get("support_expenses") or ded.get("num_supported_persons")) > 0,
            "kidsOut": int(pd.get("children_in_education") or ded.get("kidsOut") or 0) > 0,
            "alimony": _num(ded.get("alimony_paid")) > 0,
            "kidAlimony": _num(ded.get("kid_alimony_paid")) > 0,
            "p3a": _num(ded.get("pillar3a_total") or ded.get("pillar3a_contributions") or ded.get("pillar3a")) > 0,
            "p3a2": is_married and _num(ded.get("pillar3a_spouse") or ded.get("p3a2")) > 0,
            "p3a_catchup": _num(ded.get("pillar3a_catchup")) > 0,
            "prem": _num(ded.get("health_insurance_total") or ded.get("health_insurance_premiums")) > 0,
            "pkBuy": _num(ded.get("pension_buyin")) > 0,
            "wb": _num(ded.get("education_expenses") or ded.get("education")) > 0,
            "bkEff": _num(ded.get("professional_expenses") or ded.get("bkEff")) > 0,
            "depot": _num(ded.get("depot_fees")) > 0,
            "party": _num(ded.get("party_donations")) > 0,
            "sick": _num(ded.get("medical_expenses")) > 0,
            "handicap": _num(ded.get("handicap_costs")) > 0,
            "donate": _num(ded.get("donations_total") or ded.get("donations")) >= 100,
            "rentLeist": _num(ded.get("annuity_paid") or ded.get("rentLeist")) > 0,
            "care": _num(ded.get("childcare_costs") or ded.get("childcare_expenses")) > 0,
            "life": _num(wealth.get("life_insurance_value") or wealth.get("life")) > 0,
            "korpW": _num(wealth.get("corporate_shares_value") or wealth.get("korpW")) > 0,
            "otherW": other_Assets_tot > 0,
            "debt": liab_total > 0,
            "capital": _num(inc.get("capital_benefit_lump") or inc.get("capital")) > 0,
            "giftIn": _num(wealth.get("gift_inheritance_received") or wealth.get("giftIn")) > 0,
            "giftOut": _num(wealth.get("gift_given") or wealth.get("giftOut")) > 0,
        }
        f_rules = rules.get("field_rules", {})
        for fkey, rdef in f_rules.items():
            if not field_triggers.get(fkey, False):
                continue
            req = rdef.get("requirement", "keep_only")
            lbl = rdef.get("label", fkey)
            cands = rdef.get("doc_types", [])
            has_doc = _has_any_doc(cands)
            entry = {
                "key": fkey,
                "label": lbl,
                "label_en": RECEIPT_TRANSLATIONS_EN.get(fkey, lbl),
                "requirement": req,
                "form_field": rdef.get("form_field", ""),
                "attached": has_doc,
            }
            if req == "keep_only":
                keep_only_items.append(entry)
            else:
                if has_doc:
                    attached_ok.append(entry)
                else:
                    required_missing.append(entry)

        # 3. All 8 Required personal data rules from receipts_rules.json
        p2 = pd.get("partner2") or pd.get("spouse") or {}
        personal_validators = {
            "ahvnr": bool(str(pd.get("ahv_number") or pd.get("vn") or "").strip()),
            "birth": bool(str(pd.get("date_of_birth") or pd.get("birth_date") or "").strip()),
            "addr": bool(str(pd.get("address_street") or pd.get("address") or pd.get("address_city") or "").strip()),
            "name2": (not is_married) or bool(str(p2.get("first_name") or p2.get("name") or pd.get("partner2_first_name") or pd.get("spouse_name") or "").strip()),
            "ahvnr2": (not is_married) or bool(str(p2.get("ahv_number") or p2.get("vn") or pd.get("partner2_ahv_number") or "").strip()),
            "birth2": (not is_married) or bool(str(p2.get("date_of_birth") or p2.get("birth_date") or pd.get("partner2_date_of_birth") or "").strip()),
            "kidName": children_count <= 0 or (len(children_list) >= children_count and all(bool(str(c.get("first_name") or c.get("name") or "").strip()) for c in children_list if isinstance(c, dict))),
            "kidBirth": children_count <= 0 or (len(children_list) >= children_count and all(bool(str(c.get("date_of_birth") or c.get("birth_date") or "").strip()) for c in children_list if isinstance(c, dict))),
        }
        missing_personal: List[Dict[str, str]] = []
        for req_pd in rules.get("required_personal_data", []):
            pkey = req_pd.get("key", "")
            cond = req_pd.get("condition", "always")
            if cond == "married" and not is_married:
                continue
            if cond == "children_count > 0" and children_count <= 0:
                continue
            if not personal_validators.get(pkey, True):
                lbl_de = req_pd.get("label", pkey)
                missing_personal.append({
                    "key": pkey,
                    "label": lbl_de,
                    "label_en": PERSONAL_DATA_TRANSLATIONS_EN.get(pkey, lbl_de),
                })

        # 4. All 8 App-generated annexes from receipts_rules.json
        annex_conditions = {
            "always_if_employed": (emp_income + spouse_income) > 0,
            "always_or_securities": sec_total > 0 or sec_income > 0 or _has_any_doc(["securities_statement", "bank_statement"]),
            "deductions.medical_expenses > 0": _num(ded.get("medical_expenses")) > 0,
            "deductions.professional_expenses > 0": _num(ded.get("professional_expenses")) > 0 or (emp_income + spouse_income) > 0,
            "deductions.education_expenses > 0": _num(ded.get("education_expenses") or ded.get("education")) > 0,
            "deductions.donations > 0": _num(ded.get("donations_total") or ded.get("donations")) >= 100,
            "wealth.has_home": home_owned,
            "liabilities.total > 0": liab_total > 0,
        }
        annexes = [
            {
                "key": a["key"],
                "title": a["title"],
                "title_en": ANNEX_TRANSLATIONS_EN.get(a["key"], a["title"]),
            }
            for a in rules.get("app_generated_annexes", [])
            if annex_conditions.get(a.get("condition", ""), False)
        ]

        return {
            "canton_code": canton,
            "tax_year": tax_year,
            "required_missing": required_missing,
            "attached_ok": attached_ok,
            "keep_only_items": keep_only_items,
            "app_generated_annexes": annexes,
            "missing_personal_data": missing_personal,
            "is_submittable": len(required_missing) == 0 and len(missing_personal) == 0,
        }

    def get_question_catalogue(self, tax_year: int = 2025, canton_code: str = "ZH") -> Dict[str, Any]:
        """Return the canonical 14-card question catalogue."""
        raw = self._load_json("questions.json")
        out = copy.deepcopy(raw)
        out["tax_year"] = int(tax_year)
        out["canton_code"] = str(canton_code).upper()
        return out

    def get_de_texts(self) -> Dict[str, Any]:
        """Load German texts from app_texts_de.json and interpolate centralized Brand Config."""
        raw = self._load_json("app_texts_de.json")
        brand = settings.get_brand_config()

        def _interp(val: Any) -> Any:
            if isinstance(val, str):
                return (
                    val.replace("{brandName}", brand["brand_name"])
                    .replace("{supportEmail}", brand["support_email"])
                    .replace("{brandDomain}", brand["brand_domain"])
                )
            if isinstance(val, dict):
                return {k: _interp(v) for k, v in val.items()}
            if isinstance(val, list):
                return [_interp(x) for x in val]
            return val

        return _interp(raw)


rules_data_service = RulesDataService()
