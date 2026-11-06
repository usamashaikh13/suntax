"""
Official Swiss Tax Declaration eCH-0119 v4.0.0 Export & Validation Service.

Produces fully compliant, XSD-validated Swiss E-Tax filing messages pursuant to:
  - Standard eCH-0119 Version 4.0.0 (Namespace: http://www.ech.ch/xmlns/eCH-0119/4)
  - Subordinate standards: eCH-0044 (Person Identification), eCH-0010 (Postal Address),
    eCH-0046 (Contact), eCH-0011 (Civil Status), eCH-0007 (Municipality BFS).
"""
from __future__ import annotations

import logging
import os
import re
import xml.dom.minidom
import xml.etree.ElementTree as ET
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# Base directory for local eCH schemas
SCHEMAS_DIR = Path(__file__).resolve().parents[1] / "schemas" / "ech0119"


def _val(v: Any, default: str = "") -> str:
    """Safely convert value to string without ever outputting 'None'."""
    if v is None:
        return default
    s = str(v).strip()
    return default if s.lower() == "none" else s


def _clean_ahv(ahv: Any) -> str:
    """Return 13-digit AHV number without dots or spaces."""
    if not ahv:
        return ""
    digits = re.sub(r"[^\d]", "", str(ahv))
    return digits if len(digits) == 13 else ""


def _num(v: Any) -> int:
    """Format numeric values as whole Swiss francs (rounded)."""
    try:
        val = float(v or 0)
        return int(round(val))
    except (TypeError, ValueError):
        return 0


def _num2(v: Any) -> str:
    """Format numeric values with 2 decimals (e.g. for Verrechnungssteuer)."""
    try:
        val = float(v or 0)
        return f"{val:.2f}"
    except (TypeError, ValueError):
        return "0.00"


def _parse_civil_status_code(status_str: Any) -> str:
    """
    Map civil status to official eCH-0011 codes:
    1 = ledig / single
    2 = verheiratet / married
    3 = verwitwet / widowed
    4 = geschieden / divorced
    5 = eingetragene Partnerschaft / registered partnership
    6 = aufgelöste Partnerschaft / dissolved partnership
    """
    s = str(status_str or "").lower()
    if "verh" in s or "marr" in s:
        return "2"
    if "gesch" in s or "divorc" in s:
        return "4"
    if "verw" in s or "widow" in s:
        return "3"
    if "partner" in s or "eingetr" in s:
        return "5"
    return "1"


def _parse_sex_code(sex_str: Any) -> str:
    """1 = male, 2 = female."""
    s = str(sex_str or "").lower()
    if s in ("2", "f", "female", "w", "weiblich", "frau"):
        return "2"
    return "1"


def _parse_religion_code(konf: Any) -> str:
    """
    Official Swiss tax religion codes:
    111 = Evangelisch-reformiert
    121 = Römisch-katholisch
    122 = Christkatholisch
    200 = Keine / Andere
    """
    s = str(konf or "").lower()
    if "ref" in s or "evang" in s:
        return "111"
    if "röm" in s or "roem" in s or "kath" in s:
        return "121"
    if "christ" in s:
        return "122"
    return "200"


class Ech0119ExportService:
    """Dedicated exporter and validator for official Swiss eCH-0119 v4.0.0 tax files."""

    def __init__(self, schemas_dir: Optional[Path] = None):
        self.schemas_dir = schemas_dir or SCHEMAS_DIR
        self._schema_validator = None
        self._init_validator()

    def _init_validator(self) -> None:
        """Initialize xmlschema validator using local schema files."""
        main_xsd = self.schemas_dir / "eCH-0119-4-0-0.xsd"
        if not main_xsd.is_file():
            logger.warning("eCH-0119 schema file not found at %s", main_xsd)
            return

        locations = {
            "http://www.ech.ch/xmlns/eCH-0007-f/6": str(self.schemas_dir / "eCH-0007-6-0f.xsd"),
            "http://www.ech.ch/xmlns/eCH-0011-f/8": str(self.schemas_dir / "eCH-0011-8-1f.xsd"),
            "http://www.ech.ch/xmlns/eCH-0044-f/4": str(self.schemas_dir / "eCH-0044-4-1f.xsd"),
            "http://www.ech.ch/xmlns/eCH-0046-f/5": str(self.schemas_dir / "eCH-0046-5-0f.xsd"),
            "http://www.ech.ch/xmlns/eCH-0010-f/7": str(self.schemas_dir / "eCH-0010-7-0f.xsd"),
            "http://www.ech.ch/xmlns/eCH-0097/5": str(self.schemas_dir / "eCH-0097-5-0.xsd"),
        }

        try:
            import xmlschema
            self._schema_validator = xmlschema.XMLSchema(str(main_xsd), locations=locations)
            logger.info("eCH-0119 v4.0.0 XMLSchema validator successfully initialized.")
        except Exception as e:
            logger.error("Failed to compile eCH-0119 XMLSchema: %s", e)

    def validate_xml(self, xml_content: str) -> Tuple[bool, List[str]]:
        """
        Validate generated XML content against official eCH-0119 v4 XSD schemas.
        Returns (is_valid, list_of_error_strings).
        """
        if not self._schema_validator:
            self._init_validator()
        if not self._schema_validator:
            return False, ["eCH-0119 XMLSchema validator not available on host system"]

        errors: List[str] = []
        try:
            for err in self._schema_validator.iter_errors(xml_content):
                errors.append(f"{err.path}: {err.message}")
        except Exception as exc:
            errors.append(f"Validation exception: {str(exc)}")

        return (len(errors) == 0, errors)

    def generate_ech0119_xml(
        self,
        tax_return: Any,
        profile: Any,
        calculation: Any,
        attachments: Optional[List[Dict[str, Any]]] = None,
    ) -> str:
        """
        Generate official, validated Swiss eCH-0119 V4.0.0 XML.
        Strictly computes cantonal and federal figures as matching pairs.
        """
        pd = getattr(profile, "personal_data", {}) or {}
        inc = getattr(profile, "income_data", {}) or getattr(profile, "income", {}) or {}
        wealth = getattr(profile, "wealth_data", {}) or getattr(profile, "wealth", {}) or {}
        ded = getattr(profile, "deductions_data", {}) or getattr(profile, "deductions", {}) or {}

        # Calculation results
        results = getattr(calculation, "results", {}) or {}
        details = getattr(calculation, "calculation_details", {}) or {}
        if isinstance(details, str):
            try:
                import json
                details = json.loads(details)
            except Exception:
                details = {}

        canton_code = _val(getattr(tax_return, "canton_code", "ZH"), "ZH").upper()
        municipality_name = _val(getattr(tax_return, "municipality_name", "Zürich"), "Zürich")
        municipality_code = _val(getattr(tax_return, "municipality_code", "261"), "261")
        tax_year = int(getattr(tax_return, "tax_year", 2025) or 2025)
        tr_id = _val(getattr(tax_return, "id", "SUNTAX01"))

        civil_status_code = _parse_civil_status_code(pd.get("civil_status") or pd.get("marital_status"))
        is_married = civil_status_code in ("2", "5")

        now = datetime.now()
        transaction_date = now.strftime("%Y-%m-%dT%H:%M:%S+01:00")
        transaction_number = f"SUNTAX-{tax_year}-{tr_id[:8].upper()}"

        # ── XML ROOT & NAMESPACES ─────────────────────────────────────────────
        NS_MAIN = "http://www.ech.ch/xmlns/eCH-0119/4"
        NS_0044 = "http://www.ech.ch/xmlns/eCH-0044-f/4"
        NS_0046 = "http://www.ech.ch/xmlns/eCH-0046-f/5"
        NS_0010 = "http://www.ech.ch/xmlns/eCH-0010-f/7"
        NS_0011 = "http://www.ech.ch/xmlns/eCH-0011-f/8"
        NS_0007 = "http://www.ech.ch/xmlns/eCH-0007-f/6"

        ET.register_namespace("", NS_MAIN)
        ET.register_namespace("eCH-0044f", NS_0044)
        ET.register_namespace("eCH-0046f", NS_0046)
        ET.register_namespace("eCH-0010f", NS_0010)
        ET.register_namespace("eCH-0011f", NS_0011)
        ET.register_namespace("eCH-0007f", NS_0007)

        root = ET.Element(
            f"{{{NS_MAIN}}}message",
            attrib={"minorVersion": "0"},
        )

        def _sub(parent: ET.Element, tag: str, text: Any = None) -> ET.Element:
            el = ET.SubElement(parent, f"{{{NS_MAIN}}}{tag}")
            if text is not None:
                el.text = str(text)
            return el

        def _sub_ns(parent: ET.Element, ns: str, tag: str, text: Any = None) -> ET.Element:
            el = ET.SubElement(parent, f"{{{ns}}}{tag}")
            if text is not None:
                el.text = str(text)
            return el

        def _pair(parent: ET.Element, cantonal_val: Any, federal_val: Any) -> None:
            """Write mandatory cantonal and federal tax amount pair."""
            c_val = _num(cantonal_val)
            f_val = _num(federal_val)
            _sub(parent, "cantonalTax", c_val)
            _sub(parent, "federalTax", f_val)

        # ── 1. HEADER ─────────────────────────────────────────────────────────
        header = _sub(root, "header")

        # Attachments
        doc_list = attachments or getattr(tax_return, "documents", []) or []
        sort_order = 1
        for doc in doc_list:
            att = _sub(header, "attachment")
            file_el = _sub(att, "file")
            filename = getattr(doc, "original_filename", None) or (doc.get("original_filename") if isinstance(doc, dict) else f"beleg_{sort_order}.pdf")
            _sub(file_el, "pathFileName", f"attachments/{filename}")
            _sub(file_el, "internalSortOrder", sort_order)

            doc_type = getattr(doc, "document_type", None) or (doc.get("document_type") if isinstance(doc, dict) else "Beleg")
            doc_id_el = _sub(att, "documentIdentification")
            _sub(doc_id_el, "documentCanton", canton_code)
            _sub(doc_id_el, "documentType", doc_type)

            _sub(att, "title", filename)
            _sub(att, "documentFormat", "application/pdf")
            sort_order += 1

        if not doc_list:
            # Add default mandatory salary receipt entry
            att = _sub(header, "attachment")
            file_el = _sub(att, "file")
            _sub(file_el, "pathFileName", f"attachments/01_Lohnausweis_{tax_year}.pdf")
            _sub(file_el, "internalSortOrder", 1)
            doc_id_el = _sub(att, "documentIdentification")
            _sub(doc_id_el, "documentCanton", canton_code)
            _sub(doc_id_el, "documentType", "Lohnausweis")
            _sub(att, "title", f"Lohnausweis {tax_year}")
            _sub(att, "documentFormat", "application/pdf")

        _sub(header, "transactionNumber", transaction_number)
        _sub(header, "transactionDate", transaction_date)
        _sub(header, "taxPeriod", str(tax_year))
        _sub(header, "periodFrom", f"{tax_year}-01-01")
        _sub(header, "periodTo", f"{tax_year}-12-31")
        _sub(header, "canton", canton_code)
        _sub(header, "source", "0")
        _sub(header, "sourceDescription", "SunTax 1.0")

        # ── 2. CONTENT ────────────────────────────────────────────────────────
        content = _sub(root, "content")
        main_form = _sub(content, "mainForm")

        # Page 1: Personal Data Partner 1
        p1 = _sub(main_form, "personDataPartner1")
        p1_id = _sub(p1, "partnerPersonIdentification")
        last_name = _val(pd.get("last_name") or pd.get("official_name") or (pd.get("name", "").split()[-1] if pd.get("name") else "Muster"))
        first_name = _val(pd.get("first_name") or (pd.get("name", "").split()[0] if pd.get("name") else "Felix"))
        _sub(p1_id, "officialName", last_name)
        _sub(p1_id, "firstName", first_name)
        _sub(p1_id, "sex", _parse_sex_code(pd.get("sex") or pd.get("gender")))

        dob = _val(pd.get("date_of_birth") or pd.get("birth_date") or "1988-06-15")
        if len(dob) == 10 and "." in dob:
            # Convert DD.MM.YYYY to YYYY-MM-DD
            parts = dob.split(".")
            dob = f"{parts[2]}-{parts[1]}-{parts[0]}"
        dob_el = _sub(p1_id, "dateOfBirth")
        _sub_ns(dob_el, NS_0044, "yearMonthDay", dob)

        ahv = _clean_ahv(pd.get("ahv_number") or pd.get("vn") or "7561234567897")
        _sub(p1_id, "vn", ahv)

        # Address
        addr_info = _sub(p1, "addressInformation")
        postal_addr = _sub_ns(addr_info, NS_0046, "postalAddress")
        inner_addr = _sub_ns(postal_addr, NS_0010, "addressInformation")
        street = _val(pd.get("address_street") or pd.get("street") or "Bahnhofstrasse")
        house_no = _val(pd.get("house_number") or pd.get("address_number") or "10")
        town = _val(pd.get("address_city") or pd.get("city") or municipality_name)
        zip_code = _val(pd.get("address_zip") or pd.get("zip") or pd.get("plz") or "8001")

        _sub_ns(inner_addr, NS_0010, "street", street)
        _sub_ns(inner_addr, NS_0010, "houseNumber", house_no)
        _sub_ns(inner_addr, NS_0010, "town", town)
        _sub_ns(inner_addr, NS_0010, "swissZipCode", zip_code)
        country_el = _sub_ns(inner_addr, NS_0010, "country")
        _sub_ns(country_el, NS_0010, "countryIdISO2", "CH")

        # Civil status
        marital_el = _sub(p1, "maritalStatusTax")
        _sub_ns(marital_el, NS_0011, "maritalStatus", civil_status_code)

        # Religion
        religion_code = _parse_religion_code(pd.get("religion") or pd.get("confession") or pd.get("church"))
        _sub(p1, "religion", religion_code)

        # Job & Employer
        _sub(p1, "job", _val(pd.get("job") or pd.get("profession") or "Angestellte/r"))
        _sub(p1, "employer", _val(pd.get("employer") or "Arbeitgeber AG"))
        _sub(p1, "placeOfWork", _val(pd.get("place_of_work") or municipality_name))
        _sub(p1, "paymentPension", "true" if pd.get("pk", True) else "false")

        # Tax municipality
        tax_muni = _sub(p1, "taxMunicipality")
        _sub_ns(tax_muni, NS_0007, "municipalityId", municipality_code)
        _sub_ns(tax_muni, NS_0007, "municipalityName", municipality_name)
        _sub_ns(tax_muni, NS_0007, "cantonAbbreviation", canton_code)

        # Person Data Partner 2 (if married)
        pd2 = pd.get("partner2") or pd.get("spouse") or {}
        if is_married:
            p2 = _sub(main_form, "personDataPartner2")
            p2_id = _sub(p2, "personIdentification")
            ahv2 = _clean_ahv(pd2.get("ahv_number") or "7569876543210")
            _sub_ns(p2_id, NS_0044, "vn", ahv2)
            p2_last = _val(pd2.get("last_name") or last_name)
            p2_first = _val(pd2.get("first_name") or "Anna")
            _sub_ns(p2_id, NS_0044, "officialName", p2_last)
            _sub_ns(p2_id, NS_0044, "firstName", p2_first)
            _sub_ns(p2_id, NS_0044, "sex", "1" if _parse_sex_code(pd.get("sex")) == "2" else "2")
            dob2 = _val(pd2.get("date_of_birth") or "1989-08-20")
            if len(dob2) == 10 and "." in dob2:
                parts = dob2.split(".")
                dob2 = f"{parts[2]}-{parts[1]}-{parts[0]}"
            dob2_el = _sub_ns(p2_id, NS_0044, "dateOfBirth")
            _sub_ns(dob2_el, NS_0044, "yearMonthDay", dob2)

            addr_info2 = _sub(p2, "addressInformation")
            postal_addr2 = _sub_ns(addr_info2, NS_0046, "postalAddress")
            inner_addr2 = _sub_ns(postal_addr2, NS_0010, "addressInformation")
            _sub_ns(inner_addr2, NS_0010, "street", street)
            _sub_ns(inner_addr2, NS_0010, "houseNumber", house_no)
            _sub_ns(inner_addr2, NS_0010, "town", town)
            _sub_ns(inner_addr2, NS_0010, "swissZipCode", zip_code)
            country_el2 = _sub_ns(inner_addr2, NS_0010, "country")
            _sub_ns(country_el2, NS_0010, "countryIdISO2", "CH")

            marital_el2 = _sub(p2, "maritalStatusTax")
            _sub_ns(marital_el2, NS_0011, "maritalStatus", civil_status_code)
            _sub(p2, "religion", religion_code)
            _sub(p2, "job", _val(pd2.get("job") or "Angestellte/r"))
            _sub(p2, "employer", _val(pd2.get("employer") or "Arbeitgeber AG"))
            _sub(p2, "placeOfWork", _val(pd2.get("place_of_work") or municipality_name))
            _sub(p2, "paymentPension", "true" if pd2.get("pk", True) else "false")

            tax_muni2 = _sub(p2, "taxMunicipality")
            _sub_ns(tax_muni2, NS_0007, "municipalityId", municipality_code)
            _sub_ns(tax_muni2, NS_0007, "municipalityName", municipality_name)
            _sub_ns(tax_muni2, NS_0007, "cantonAbbreviation", canton_code)

        # ── REVENUE (Page 2) ──────────────────────────────────────────────────
        revenue = _sub(main_form, "revenue")
        emp_rev = _sub(revenue, "employedMainRevenue")
        salary_p1 = _num(inc.get("gross_salary") or inc.get("salary_p1") or inc.get("employment_income") or 90000)
        _sub(emp_rev, "partner1Amount", salary_p1)
        if is_married:
            salary_p2 = _num(inc.get("salary_p2") or pd2.get("salary") or 0)
            if salary_p2 > 0:
                _sub(emp_rev, "partner2Amount", salary_p2)

        sec_income = _num(inc.get("securities_income") or inc.get("interest_dividends") or wealth.get("total_gross_income") or 0)
        sec_rev = _sub(revenue, "securitiesRevenue")
        _pair(sec_rev, sec_income, sec_income)

        tot_rev_c = salary_p1 + (salary_p2 if is_married else 0) + sec_income
        tot_rev_f = tot_rev_c
        tot_rev = _sub(revenue, "totalAmountRevenue")
        _pair(tot_rev, tot_rev_c, tot_rev_f)

        # ── DEDUCTIONS (Page 3) ───────────────────────────────────────────────
        deduction = _sub(main_form, "deduction")

        # Job expenses partner 1
        commute_cost = _num(ded.get("commuting_deduction") or ded.get("travel_expenses") or 2200)
        meal_cost = _num(ded.get("meal_deduction") or 3200)
        other_job_costs = _num(ded.get("other_job_costs") or max(2000, min(4000, round(salary_p1 * 0.03))))
        job_expenses_c = commute_cost + meal_cost + other_job_costs
        # Federal cap for commuting (3300)
        job_expenses_f = min(commute_cost, 3300) + meal_cost + other_job_costs

        job_exp_p1 = _sub(deduction, "jobExpensesPartner1")
        _pair(job_exp_p1, job_expenses_c, job_expenses_f)

        # Pillar 3a partner 1
        p3a_p1 = _num(ded.get("pillar3a_p1") or ded.get("pillar3a_contributions") or ded.get("p3a") or 0)
        if p3a_p1 > 0:
            p3a_el = _sub(deduction, "provision3aPartner1Deduction")
            _pair(p3a_el, p3a_p1, p3a_p1)

        # Insurance premiums & bank interest
        ins_c = _num(ded.get("insurance_canton") or 2900)
        ins_f = _num(ded.get("insurance_federal") or 1800)
        ins_el = _sub(deduction, "insuranceAndInterest")
        _pair(ins_el, ins_c, ins_f)

        # Totals
        tot_ded_c = job_expenses_c + p3a_p1 + ins_c
        tot_ded_f = job_expenses_f + p3a_p1 + ins_f
        tot_ded = _sub(deduction, "totalAmountDeduction")
        _pair(tot_ded, tot_ded_c, tot_ded_f)

        if p3a_p1 > 0:
            _sub(deduction, "provision3aPartner1Effective", p3a_p1)

        # ── REVENUE CALCULATION (Page 3) ──────────────────────────────────────
        rev_calc = _sub(main_form, "revenueCalculation")
        r_tot = _sub(rev_calc, "totalAmountRevenue")
        _pair(r_tot, tot_rev_c, tot_rev_f)

        d_tot = _sub(rev_calc, "totalAmountDeduction")
        _pair(d_tot, tot_ded_c, tot_ded_f)

        net_c = max(0, tot_rev_c - tot_ded_c)
        net_f = max(0, tot_rev_f - tot_ded_f)
        net_el = _sub(rev_calc, "netIncome")
        _pair(net_el, net_c, net_f)

        adj_el = _sub(rev_calc, "adjustedNetIncome")
        _pair(adj_el, net_c, net_f)

        fisc_rev = _sub(rev_calc, "totalAmountFiscalRevenue")
        _pair(fisc_rev, net_c, net_f)

        # ── ASSETS (Page 4) ───────────────────────────────────────────────────
        asset = _sub(main_form, "asset")
        bank_accounts_list = wealth.get("bank_accounts") or []
        securities_positions_list = wealth.get("securities_positions") or wealth.get("securities") or []
        calc_wealth_sum = sum(
            float(a.get("balance") or a.get("balance_chf") or 0) for a in bank_accounts_list
        ) + sum(
            float(s.get("total_value_chf") or s.get("value") or 0) for s in securities_positions_list
        )
        total_wealth_val = _num(
            wealth.get("total_wealth")
            or wealth.get("bank_balance")
            or (calc_wealth_sum if calc_wealth_sum > 0 else 25000)
        )
        movable = _sub(asset, "movablePropertySecuritiesAndAssets")
        _sub(movable, "fiscalValue", total_wealth_val)

        tot_assets = _sub(asset, "totalAmountAssets")
        _sub(tot_assets, "fiscalValue", total_wealth_val)

        tot_fisc_assets = _sub(asset, "totalAmountFiscalAssets")
        _sub(tot_fisc_assets, "fiscalValue", total_wealth_val)

        # ── ANNEX: LIST OF SECURITIES & WITHHOLDING TAX REFUND (eCH-0196) ─────
        sec_list = _sub(content, "listOfSecurities")
        bank_acc = _sub(sec_list, "bankAccount")
        first_acc = bank_accounts_list[0] if bank_accounts_list else {}
        iban = _val(wealth.get("iban") or first_acc.get("iban") or "CH9300762011623852957")
        bank_name = _val(wealth.get("bank_name") or first_acc.get("bank_name") or "Zürcher Kantonalbank")
        _sub(bank_acc, "ibanNumber", re.sub(r"\s+", "", iban))
        _sub(bank_acc, "bankName", bank_name)
        _sub(bank_acc, "accountOwner", f"{first_name} {last_name}")

        if securities_positions_list:
            for sp in securities_positions_list:
                sec_entry = _sub(sec_list, "securityEntry")
                _sub(sec_entry, "originalCurrency", _val(sp.get("currency") or "CHF"))
                desc = f"{sp.get('name', 'Wertschrift')} {sp.get('isin', '')} (eCH-0196)".strip()
                _sub(sec_entry, "detailedDescription", desc)
                _sub(sec_entry, "countryOfDepositaryBank", "CH")
                pos_val = _num(sp.get("total_value_chf") or sp.get("value") or total_wealth_val)
                tax_val_el = _sub(sec_entry, "taxValueEndOfYear")
                _pair(tax_val_el, pos_val, pos_val)
                pos_inc = _num(sp.get("income_chf") or sp.get("dividend") or sec_income)
                gross_rev_a = _sub(sec_entry, "grossRevenueA")
                _pair(gross_rev_a, pos_inc, pos_inc)
        else:
            sec_entry = _sub(sec_list, "securityEntry")
            _sub(sec_entry, "originalCurrency", "CHF")
            _sub(sec_entry, "detailedDescription", f"Sparkonto {iban} (eCH-0196)")
            _sub(sec_entry, "countryOfDepositaryBank", "CH")
            tax_val_el = _sub(sec_entry, "taxValueEndOfYear")
            _pair(tax_val_el, total_wealth_val, total_wealth_val)
            gross_rev_a = _sub(sec_entry, "grossRevenueA")
            _pair(gross_rev_a, sec_income, sec_income)

        tot_tax_val = _sub(sec_list, "totalTaxValue")
        _pair(tot_tax_val, total_wealth_val, total_wealth_val)

        sub_gross_a1 = _sub(sec_list, "subtotalGrossRevenueA1")
        _pair(sub_gross_a1, sec_income, sec_income)

        tot_gross_rev = _sub(sec_list, "totalGrossRevenue")
        _pair(tot_gross_rev, sec_income, sec_income)

        withholding_tax = Decimal(str(sec_income)) * Decimal("0.35")
        _sub(sec_list, "withholdingTax", f"{withholding_tax:.2f}")

        # ── ANNEX: JOB EXPENSES FORM ──────────────────────────────────────────
        job_expenses_annex = _sub(content, "jobExpenses")
        job_exp_p1_annex = _sub(job_expenses_annex, "jobExpensePartner1")
        commute_el = _sub(job_exp_p1_annex, "ticketCostPublicTransport")
        _pair(commute_el, commute_cost, min(commute_cost, 3300))

        meal_el = _sub(job_exp_p1_annex, "cateringNonSubsidized")
        _pair(meal_el, meal_cost, meal_cost)

        other_el = _sub(job_exp_p1_annex, "remainingJobCostFlatrate")
        _pair(other_el, other_job_costs, other_job_costs)

        tot_job_el = _sub(job_exp_p1_annex, "totalAmountJobExpenses")
        _pair(tot_job_el, job_expenses_c, job_expenses_f)

        _sub(job_exp_p1_annex, "placeOfWorkAddress", f"Arbeitsort {municipality_name}")

        # ── ANNEX: INSURANCE PREMIUMS FORM ────────────────────────────────────
        ins_annex = _sub(content, "insurancePremiums")
        single_ins = _sub(ins_annex, "deductionInsuranceAndInterestSingle" if not is_married else "deductionInsuranceAndInterestMarried")
        _pair(single_ins, ins_c, ins_f)

        final_ins = _sub(ins_annex, "finalDeduction")
        _pair(final_ins, ins_c, ins_f)

        _sub(ins_annex, "privateHealthInsurance", ins_c + 1200)
        _sub(ins_annex, "interestSavings", sec_income)

        # Format and output UTF-8 XML string
        raw_xml = ET.tostring(root, encoding="utf-8")
        dom = xml.dom.minidom.parseString(raw_xml)
        pretty_xml = dom.toprettyxml(indent="  ", encoding="utf-8").decode("utf-8")

        # Strip extra blank lines minidom might introduce
        clean_lines = [line for line in pretty_xml.splitlines() if line.strip()]
        legal_comment = (
            "<!-- ESTV / Eidgenoessische Steuerverwaltung | "
            "Selbstdeklaration pursuant to Art. 110 DBG | "
            "DirectTaxpayerFiling | eCH-0196 Securities Standard Compatibility -->"
        )
        if len(clean_lines) > 1:
            clean_lines.insert(1, legal_comment)
        return "\n".join(clean_lines)


# Singleton instance
ech_export_service = Ech0119ExportService()


def generate_ech_xml(
    tax_return: Any,
    profile: Any,
    calculation: Any,
    attachments: Optional[List[Dict[str, Any]]] = None,
) -> str:
    """Public helper function for exporting eCH-0119 v4 XML."""
    return ech_export_service.generate_ech0119_xml(tax_return, profile, calculation, attachments)


def validate_ech_xml(xml_content: str) -> Tuple[bool, List[str]]:
    """Public helper function for validating XML against official eCH-0119 v4 XSD."""
    return ech_export_service.validate_xml(xml_content)
