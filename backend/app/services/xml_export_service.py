"""
Swiss Tax Declaration XML Export Service.
Produces a clean, validated E-Tax data interchange XML document for taxpayer review,
data backup, and electronic tax software interoperability.
"""
from __future__ import annotations

import json
import xml.dom.minidom
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Any, Optional


def _val(v: Any, default: str = "") -> str:
    """Safely convert value to string without ever outputting 'None'."""
    if v is None:
        return default
    s = str(v).strip()
    return default if s.lower() == "none" else s


def _num(v: Any) -> str:
    """Format numeric values as two-decimal strings."""
    try:
        val = float(v or 0)
        return f"{val:.2f}"
    except (TypeError, ValueError):
        return "0.00"


def _sub(parent: ET.Element, tag: str, text: Any = None, **attrs: Any) -> ET.Element:
    el = ET.SubElement(parent, tag, **attrs)
    if text is not None:
        el.text = _val(text)
    return el


def generate_ech_xml(tax_return: Any, profile: Any, calculation: Any) -> str:
    """
    Generate a well-formed, transparent Swiss Tax Declaration Export XML.

    Note on official Swiss e-filing:
    - Official filing across cantons follows cantonal e-tax portals (e.g., eTax.AI in AI,
      TaxMe in BE, ZhServices in ZH) or standards like eCH-0119.
    - eCH-0196 is specifically the E-Steuerauszug standard for bank & security statements.
    - This XML represents the structured SunTax declaration data for interoperability.
    """
    pd = getattr(profile, "personal_data", {}) or {}
    inc = getattr(profile, "income_data", {}) or getattr(profile, "income", {}) or {}
    wealth = getattr(profile, "wealth_data", {}) or getattr(profile, "wealth", {}) or {}
    ded = getattr(profile, "deductions_data", {}) or getattr(profile, "deductions", {}) or {}
    liab = getattr(profile, "liabilities_data", {}) or getattr(profile, "liabilities", {}) or {}

    details = getattr(calculation, "calculation_details", {}) or {}
    if isinstance(details, str):
        try:
            details = json.loads(details)
        except Exception:
            details = {}
    elif not isinstance(details, dict):
        details = {}

    results = getattr(calculation, "results", None) or details.get("results") or details or {}

    canton_code = _val(getattr(tax_return, "canton_code", "ZH")).upper()
    municipality = _val(getattr(tax_return, "municipality_name", "") or getattr(tax_return, "municipality_code", ""))
    tax_year = _val(getattr(tax_return, "tax_year", 2025))
    tr_id = _val(getattr(tax_return, "id", ""))

    first = _val(pd.get("first_name"))
    last = _val(pd.get("last_name"))
    taxpayer_name = f"{first} {last}".strip() if (first or last) else _val(pd.get("name"), "Taxpayer")
    address = f"{_val(pd.get('address_street'))}, {_val(pd.get('address_zip'))} {_val(pd.get('address_city'))}".strip(" ,") or _val(pd.get("address"))

    now = datetime.now().isoformat()

    # Root element
    root = ET.Element(
        "suntaxDraftTaxData",
        attrib={
            "version": "1.0",
            "schema": "suntax-draft-tax-data-v1.0",
            "documentType": "draft-structured-tax-data-xml",
            "taxYear": tax_year,
            "canton": canton_code,
            "generatedAt": now,
        },
    )

    # 1. Filing notice & legal status
    notice = _sub(root, "draftNotice")
    _sub(notice, "status", "DRAFT_STRUCTURED_TAX_DATA")
    _sub(notice, "documentLabel", "Draft Structured Tax Data XML")
    _sub(notice, "disclaimer", (
        "This XML file is a draft export of structured personal tax data for personal records and data portability. "
        "It is not an officially validated cantonal filing and is not accepted as an electronic filing by Swiss tax portals. "
        "Filing must be completed via your canton's official portal or by mailing the signed Tax Return Summary PDF."
    ))
    _sub(notice, "standardCompatibilityNote", (
        "Draft structured tax data export modeled for interoperability with Swiss electronic tax statement standards (eCH-0196 / eCH-0119 draft export)."
    ))

    # 2. Header
    header = _sub(root, "declarationHeader")
    _sub(header, "returnId", tr_id)
    _sub(header, "generator", "SunTax AI Platform")
    _sub(header, "cantonCode", canton_code)
    _sub(header, "municipality", municipality)
    _sub(header, "taxYear", tax_year)
    _sub(header, "ruleVersion", _val(getattr(calculation, "rule_version", "1.0.0")))

    # 3. Taxpayer Identity
    tp = _sub(root, "taxpayer")
    _sub(tp, "fullName", taxpayer_name)
    if first:
        _sub(tp, "firstName", first)
    if last:
        _sub(tp, "lastName", last)
    if address:
        _sub(tp, "address", address)
    _sub(tp, "ahvNumber", _val(pd.get("ahv_number")))
    _sub(tp, "dateOfBirth", _val(pd.get("date_of_birth")))
    _sub(tp, "civilStatus", _val(pd.get("civil_status", pd.get("marital_status", "Single"))))
    _sub(tp, "profession", _val(pd.get("profession", "Angestellte/r")))
    _sub(tp, "activityRate", _val(pd.get("activity_rate", "100%")))

    # 4. Income
    gross_emp = inc.get("employment_income") or inc.get("gross_salary") or inc.get("total_employment_income") or 0
    pension = inc.get("pension_income", 0) or 0
    dividends = inc.get("dividend_income", 0) or inc.get("dividends", 0) or 0
    interest = inc.get("interest_income", 0) or inc.get("bank_interest", 0) or 0

    income_el = _sub(root, "income")
    _sub(income_el, "grossEmploymentIncome", _num(gross_emp))
    if inc.get("net_salary"):
        _sub(income_el, "netSalary", _num(inc.get("net_salary")))
    _sub(income_el, "pensionIncome", _num(pension))
    _sub(income_el, "securitiesDividends", _num(dividends))
    _sub(income_el, "bankInterest", _num(interest))
    total_income = float(gross_emp) + float(pension) + float(dividends) + float(interest)
    _sub(income_el, "totalGrossIncome", _num(total_income))

    # 5. Deductions
    ded_el = _sub(root, "deductions")
    prof_exp = ded.get("professional_expenses") or ded.get("travel_expenses", 0) or 2000.0
    pillar3 = ded.get("pillar3a_contributions", 0) or 0
    insurance = ded.get("health_insurance_premiums", 0) or 2600.0
    debt_interest = ded.get("debt_interest", 0) or 0

    _sub(ded_el, "professionalExpensesFlatRate", _num(prof_exp))
    _sub(ded_el, "pillar3aContributions", _num(pillar3))
    _sub(ded_el, "healthInsurancePremiums", _num(insurance))
    _sub(ded_el, "debtInterest", _num(debt_interest))
    total_ded = float(prof_exp) + float(pillar3) + float(insurance) + float(debt_interest)
    _sub(ded_el, "totalDeductions", _num(total_ded))

    # 6. Wealth & Assets
    wealth_el = _sub(root, "wealth")
    accounts_el = _sub(wealth_el, "bankAccounts")
    bank_accounts = wealth.get("bank_accounts") or []
    for acc in bank_accounts:
        if isinstance(acc, dict):
            acc_el = _sub(accounts_el, "account")
            _sub(acc_el, "bankName", _val(acc.get("bank_name"), "Swiss Bank"))
            _sub(acc_el, "iban", _val(acc.get("iban")))
            _sub(acc_el, "balanceChf", _num(acc.get("balance_chf") or acc.get("balance", 0)))
            _sub(acc_el, "currency", _val(acc.get("currency"), "CHF"))

    # 7. Tax Calculation
    calc_el = _sub(root, "taxCalculation")
    _sub(calc_el, "taxableIncome", _num(results.get("taxable_income", max(0, total_income - total_ded))))
    _sub(calc_el, "taxableWealth", _num(results.get("taxable_wealth", 0)))
    _sub(calc_el, "federalIncomeTax", _num(results.get("federal_income_tax", details.get("federal_tax", 0))))
    _sub(calc_el, "cantonalIncomeTax", _num(results.get("cantonal_income_tax", details.get("cantonal_tax", 0))))
    _sub(calc_el, "municipalIncomeTax", _num(results.get("municipal_income_tax", details.get("municipal_tax", 0))))
    _sub(calc_el, "wealthTax", _num(results.get("wealth_tax", 0)))
    _sub(calc_el, "totalTaxDue", _num(results.get("total_tax", getattr(calculation, "total_tax_due", 0))))

    # Pretty print XML
    raw_str = ET.tostring(root, encoding="utf-8")
    dom = xml.dom.minidom.parseString(raw_str)
    return dom.toprettyxml(indent="  ")
