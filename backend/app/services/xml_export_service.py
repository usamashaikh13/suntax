"""
eCH-0196 compatible XML export for Swiss tax returns.
This produces a structured XML file that can be imported into cantonal tax software.
"""
from __future__ import annotations

import xml.etree.ElementTree as ET
from datetime import datetime


def _sub(parent, tag, text=None, **attrs):
    el = ET.SubElement(parent, tag, **attrs)
    if text is not None:
        el.text = str(text)
    return el


def generate_ech_xml(tax_return, profile, calculation) -> str:
    """Generate eCH-0196 compatible XML from the tax return."""

    pd = profile.personal_data or {}
    inc = profile.income or {}
    wealth = profile.wealth or {}
    ded = profile.deductions or {}
    liab = profile.liabilities or {}
    secs = profile.securities or []
    results = calculation.results or {}

    now = datetime.now().isoformat()

    # Root element
    root = ET.Element(
        "taxData",
        attrib={
            "xmlns": "http://www.ech.ch/xmlns/eCH-0196/1",
            "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
            "version": "1.0",
            "schemaVersion": "eCH-0196",
        }
    )

    # Header
    header = _sub(root, "header")
    _sub(header, "generatedAt", now)
    _sub(header, "generator", "SunTax")
    _sub(header, "generatorVersion", "1.0.0")
    _sub(header, "canton", tax_return.canton_code)
    _sub(header, "municipality", tax_return.municipality_name)
    _sub(header, "taxYear", tax_return.tax_year)
    _sub(header, "ruleVersion", calculation.tax_rule_version)

    # Taxpayer
    taxpayer = _sub(root, "taxpayer")
    _sub(taxpayer, "name", pd.get("name", ""))
    _sub(taxpayer, "address", pd.get("address", ""))
    _sub(taxpayer, "dateOfBirth", pd.get("date_of_birth", ""))
    _sub(taxpayer, "maritalStatus", pd.get("marital_status", ""))
    _sub(taxpayer, "ahvNumber", pd.get("ahv_number", ""))

    # Income
    income_el = _sub(root, "income")
    _sub(income_el, "totalEmploymentIncome", inc.get("total_employment_income", 0))
    _sub(income_el, "bankInterest", inc.get("bank_interest", 0))
    _sub(income_el, "dividends", inc.get("dividends", 0))

    # Employers
    employers_el = _sub(income_el, "employers")
    for emp in (inc.get("employers") or []):
        emp_el = _sub(employers_el, "employer")
        _sub(emp_el, "name", emp.get("employer_name", ""))
        _sub(emp_el, "grossSalary", emp.get("gross_salary", 0))
        _sub(emp_el, "netSalary", emp.get("net_salary", 0))

    # Wealth
    wealth_el = _sub(root, "wealth")
    accounts_el = _sub(wealth_el, "bankAccounts")
    for acc in (wealth.get("bank_accounts") or []):
        acc_el = _sub(accounts_el, "account")
        _sub(acc_el, "bankName", acc.get("bank_name", ""))
        _sub(acc_el, "iban", acc.get("iban", ""))
        _sub(acc_el, "balance", acc.get("balance", 0))
        _sub(acc_el, "currency", acc.get("currency", "CHF"))

    # Securities
    secs_el = _sub(wealth_el, "securities")
    for sec in secs:
        sec_el = _sub(secs_el, "security")
        _sub(sec_el, "isin", sec.get("isin", ""))
        _sub(sec_el, "valor", sec.get("valor", ""))
        _sub(sec_el, "name", sec.get("name", ""))
        _sub(sec_el, "quantity", sec.get("quantity", 0))
        _sub(sec_el, "value", sec.get("value", 0))
        _sub(sec_el, "currency", sec.get("currency", "CHF"))
        _sub(sec_el, "dividend", sec.get("dividend", 0))

    # Deductions
    deductions_el = _sub(root, "deductions")
    _sub(deductions_el, "pillar3aTotal", ded.get("pillar3a_total", 0))
    _sub(deductions_el, "donationsTotal", ded.get("donations_total", 0))
    _sub(deductions_el, "mortgageInterest", ded.get("mortgage_interest", 0))

    # Liabilities
    liab_el = _sub(root, "liabilities")
    _sub(liab_el, "totalMortgageDebt", liab.get("total_mortgage_debt", 0))
    mortgages_el = _sub(liab_el, "mortgages")
    for m in (liab.get("mortgages") or []):
        m_el = _sub(mortgages_el, "mortgage")
        _sub(m_el, "bank", m.get("bank", ""))
        _sub(m_el, "propertyAddress", m.get("property_address", ""))
        _sub(m_el, "balance", m.get("balance", 0))
        _sub(m_el, "annualInterest", m.get("annual_interest", 0))

    # Calculation results
    calc_el = _sub(root, "taxCalculation")
    _sub(calc_el, "taxableIncome", results.get("taxable_income", 0))
    _sub(calc_el, "taxableWealth", results.get("taxable_wealth", 0))
    _sub(calc_el, "federalIncomeTax", results.get("federal_income_tax", 0))
    _sub(calc_el, "cantonalIncomeTax", results.get("cantonal_income_tax", 0))
    _sub(calc_el, "municipalIncomeTax", results.get("municipal_income_tax", 0))
    _sub(calc_el, "wealthTax", results.get("wealth_tax", 0))
    _sub(calc_el, "totalTax", results.get("total_tax", 0))

    ET.indent(root, space="  ")
    return ET.tostring(root, encoding="unicode", xml_declaration=True)
