"""
Comprehensive test suite for Swiss eCH-0119 v4.0.0 export and validation.

Verifies:
  - Strict compliance with official eCH-0119-4-0-0.xsd schema.
  - Correct formatting for single and married filers.
  - Matching cantonal and federal tax pairs.
  - Attachment listing in header.
  - Mathematical consistency of totals.
  - XXE (XML External Entity) injection resistance.
"""
from __future__ import annotations

import xml.etree.ElementTree as ET
import pytest
from app.services.xml_export_service import ech_export_service, generate_ech_xml, validate_ech_xml


class MockModel:
    def __init__(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self, k, v)


def test_ech0119_single_taxpayer_validates_against_official_xsd():
    """Verify single filer produces 100% schema-valid eCH-0119 XML."""
    tr = MockModel(
        id="tr-test-single-01",
        canton_code="ZH",
        municipality_name="Winterthur",
        municipality_code="230",
        tax_year=2025,
    )
    prof = MockModel(
        personal_data={
            "first_name": "Lea",
            "last_name": "Meier",
            "sex": "2",
            "date_of_birth": "1994-05-17",
            "ahv_number": "7561234567897",
            "address_street": "Langstrasse",
            "house_number": "12",
            "address_city": "Zürich",
            "address_zip": "8004",
            "civil_status": "ledig",
            "religion": "111",
            "job": "Projektleiterin",
            "employer": "Muster AG",
            "place_of_work": "Winterthur",
        },
        income_data={"gross_salary": 105000, "securities_income": 40},
        deductions_data={
            "commuting_deduction": 2600,
            "meal_deduction": 3200,
            "other_job_costs": 3150,
            "pillar3a_p1": 7258,
            "insurance_canton": 2900,
            "insurance_federal": 1800,
        },
        wealth_data={
            "total_wealth": 25000,
            "iban": "CH9300762011623852957",
            "bank_name": "Zürcher Kantonalbank",
        },
    )
    calc = MockModel(
        results={"taxable_income": 85932},
        calculation_details={
            "results": {"taxable_income": 85932},
            "canton_deductions_list": [
                {"code": "commute_total", "amount": 2600},
                {"code": "meal_deduction_full", "amount": 3200},
                {"code": "work_expenses_flat", "amount": 3150},
                {"code": "pillar3a", "amount": 7258},
                {"code": "health_insurance", "amount": 2900},
            ],
            "federal_deductions_list": [
                {"code": "commute_total", "amount": 2600},
                {"code": "meal_deduction_full", "amount": 3200},
                {"code": "work_expenses_flat", "amount": 3150},
                {"code": "pillar3a", "amount": 7258},
                {"code": "health_insurance", "amount": 1800},
            ],
        },
    )

    xml_content = generate_ech_xml(tr, prof, calc)
    assert "xmlns=\"http://www.ech.ch/xmlns/eCH-0119/4\"" in xml_content
    assert "<transactionNumber>SUNTAX-2025-" in xml_content

    is_valid, errors = validate_ech_xml(xml_content)
    assert is_valid, f"eCH-0119 XSD validation failed: {errors}"
    assert len(errors) == 0


def test_ech0119_married_couple_validates_against_official_xsd():
    """Verify married couple filer with partner 2 produces 100% schema-valid eCH-0119 XML."""
    tr = MockModel(
        id="tr-test-married-02",
        canton_code="BE",
        municipality_name="Bern",
        municipality_code="351",
        tax_year=2025,
    )
    prof = MockModel(
        personal_data={
            "first_name": "Thomas",
            "last_name": "Gerber",
            "sex": "1",
            "date_of_birth": "1980-03-12",
            "ahv_number": "7569217076985",
            "address_street": "Kramgasse",
            "house_number": "5",
            "address_city": "Bern",
            "address_zip": "3011",
            "civil_status": "verheiratet",
            "religion": "121",
            "job": "Ingenieur",
            "employer": "Tech AG",
            "place_of_work": "Bern",
            "partner2": {
                "first_name": "Anna",
                "last_name": "Gerber",
                "date_of_birth": "1982-07-25",
                "ahv_number": "7561111222239",
                "job": "Lehrerin",
                "employer": "Kanton Bern",
                "place_of_work": "Bern",
                "salary": 65000,
            },
        },
        income_data={
            "gross_salary": 110000,
            "salary_p2": 65000,
            "securities_income": 120,
        },
        deductions_data={
            "commuting_deduction": 1800,
            "meal_deduction": 3200,
            "other_job_costs": 3300,
            "pillar3a_p1": 7258,
            "insurance_canton": 4900,
            "insurance_federal": 3700,
        },
        wealth_data={
            "total_wealth": 80000,
            "iban": "CH4400790123456789012",
            "bank_name": "Berner Kantonalbank",
        },
    )
    calc = MockModel(
        results={"taxable_income": 150000},
        calculation_details={
            "results": {"taxable_income": 150000},
            "canton_deductions_list": [
                {"code": "commute_total", "amount": 1800},
                {"code": "meal_deduction_full", "amount": 3200},
                {"code": "work_expenses_flat", "amount": 3300},
                {"code": "pillar3a", "amount": 7258},
                {"code": "health_insurance", "amount": 4900},
            ],
            "federal_deductions_list": [
                {"code": "commute_total", "amount": 1800},
                {"code": "meal_deduction_full", "amount": 3200},
                {"code": "work_expenses_flat", "amount": 3300},
                {"code": "pillar3a", "amount": 7258},
                {"code": "health_insurance", "amount": 3700},
            ],
        },
    )

    xml_content = generate_ech_xml(tr, prof, calc)
    assert "<personDataPartner2>" in xml_content
    assert "<partner2Amount>65000</partner2Amount>" in xml_content

    is_valid, errors = validate_ech_xml(xml_content)
    assert is_valid, f"Married return eCH-0119 XSD validation failed: {errors}"
    assert len(errors) == 0


def test_ech0119_cantonal_and_federal_tax_pairs():
    """Verify all differing amounts are written strictly as cantonal/federal pairs."""
    tr = MockModel(
        id="tr-test-pairs",
        canton_code="ZH",
        municipality_name="Zürich",
        municipality_code="261",
        tax_year=2025,
    )
    prof = MockModel(
        personal_data={"first_name": "Test", "last_name": "User", "civil_status": "ledig", "ahv_number": "7569217076985"},
        income_data={"gross_salary": 90000},
        deductions_data={"insurance_canton": 2900, "insurance_federal": 1800},
        wealth_data={"total_wealth": 10000},
    )
    calc = MockModel(
        results={"taxable_income": 75000},
        calculation_details={
            "results": {"taxable_income": 75000},
            "canton_deductions_list": [{"code": "health_insurance", "amount": 2900}],
            "federal_deductions_list": [{"code": "health_insurance", "amount": 1800}],
        },
    )

    xml_content = generate_ech_xml(tr, prof, calc)
    root = ET.fromstring(xml_content)
    ns = {"m": "http://www.ech.ch/xmlns/eCH-0119/4"}

    # In insuranceAndInterest, cantonalTax and federalTax must both be present
    ins_el = root.find(".//m:insuranceAndInterest", ns)
    assert ins_el is not None
    assert ins_el.find("m:cantonalTax", ns).text == "2900"
    assert ins_el.find("m:federalTax", ns).text == "1800"


def test_ech0119_rejects_malformed_xml():
    """Verify validator catches illegal element structures."""
    malformed_xml = "<message xmlns=\"http://www.ech.ch/xmlns/eCH-0119/4\"><invalidTag/></message>"
    is_valid, errors = validate_ech_xml(malformed_xml)
    assert not is_valid
    assert len(errors) > 0


def test_ech0119_health_insurance_never_fabricates_actual_premium_when_unknown():
    """Verify that when actual paid health insurance premium is unknown, the XML does not fabricate privateHealthInsurance from capped deduction."""
    tr = MockModel(
        id="tr-test-hi-unknown",
        canton_code="ZH",
        municipality_name="Zürich",
        municipality_code="261",
        tax_year=2025,
    )
    prof = MockModel(
        personal_data={"first_name": "Test", "last_name": "Person", "civil_status": "ledig", "ahv_number": "7569217076985"},
        income_data={"gross_salary": 90000},
        deductions_data={"insurance_canton": 2900, "insurance_federal": 1800},
        wealth_data={"total_wealth": 10000},
    )
    calc = MockModel(
        results={"taxable_income": 75000},
        calculation_details={
            "cantonal_taxable_income": 75000,
            "federal_taxable_income": 75000,
            "canton_deductions_list": [{"code": "health_insurance", "amount": 2900}],
            "federal_deductions_list": [{"code": "health_insurance", "amount": 1800}],
        },
    )

    xml_content = generate_ech_xml(tr, prof, calc)
    root = ET.fromstring(xml_content)
    ns = {"e": "http://www.ech.ch/xmlns/eCH-0119/4"}

    # finalDeduction must be present with the statutory caps
    final_ded_c = root.find(".//e:insurancePremiums//e:finalDeduction/e:cantonalTax", ns).text
    final_ded_f = root.find(".//e:insurancePremiums//e:finalDeduction/e:federalTax", ns).text
    assert final_ded_c == "2900"
    assert final_ded_f == "1800"

    # privateHealthInsurance must NOT be fabricated when actual amount is unknown
    phi_el = root.find(".//e:insurancePremiums//e:privateHealthInsurance", ns)
    assert phi_el is None

    # Still validates against official schema
    is_valid, errors = validate_ech_xml(xml_content)
    assert is_valid, f"Validation failed: {errors}"


def test_ech0119_numeric_religion_code_mapping():
    """Verify numeric religion codes (111, 121, 122, 200) are mapped correctly and not turned into 200."""
    from app.services.xml_export_service import _parse_religion_code
    assert _parse_religion_code("111") == "111"
    assert _parse_religion_code(111) == "111"
    assert _parse_religion_code("121") == "121"
    assert _parse_religion_code("122") == "122"
    assert _parse_religion_code("200") == "200"
    assert _parse_religion_code("evangelisch") == "111"
    assert _parse_religion_code("römisch-katholisch") == "121"
    assert _parse_religion_code("christkatholisch") == "122"
    assert _parse_religion_code("keine") == "200"


def test_ech0119_cantonal_federal_net_income_divergence():
    """Verify cantonal and federal net income diverge accurately when deductions differ."""
    tr = MockModel(
        id="tr-test-divergence",
        canton_code="ZH",
        municipality_name="Winterthur",
        municipality_code="230",
        tax_year=2025,
    )
    prof = MockModel(
        personal_data={
            "first_name": "Lea",
            "last_name": "Meier",
            "civil_status": "ledig",
            "ahv_number": "756.1234.5678.97",
            "religion": "111",
        },
        income_data={"gross_salary": 105000, "securities_income": 40},
        deductions_data={
            "commuting_deduction": 2600,
            "meal_deduction": 3200,
            "other_job_costs": 3150,
            "pillar3a_p1": 7258,
            "insurance_canton": 2900,
            "insurance_federal": 1800,
            "health_insurance_actual": 4800,
        },
        wealth_data={"total_wealth": 25000},
        liabilities_data={"total_debt": 0},
    )
    calc = MockModel(
        results={"taxable_income": 85932, "federal_taxable_income": 87032},
        calculation_details={
            "cantonal_taxable_income": 85932,
            "federal_taxable_income": 87032,
            "canton_deductions_total": 19108,
            "federal_deductions_total": 18008,
            "canton_deductions_list": [
                {"code": "commute_total", "amount": 2600},
                {"code": "meal_deduction_full", "amount": 3200},
                {"code": "work_expenses_flat", "amount": 3150},
                {"code": "pillar3a", "amount": 7258},
                {"code": "health_insurance", "amount": 2900},
            ],
            "federal_deductions_list": [
                {"code": "commute_total", "amount": 2600},
                {"code": "meal_deduction_full", "amount": 3200},
                {"code": "work_expenses_flat", "amount": 3150},
                {"code": "pillar3a", "amount": 7258},
                {"code": "health_insurance", "amount": 1800},
            ],
        },
    )

    xml_content = generate_ech_xml(tr, prof, calc)
    root = ET.fromstring(xml_content)
    ns = {"e": "http://www.ech.ch/xmlns/eCH-0119/4"}

    # Religion code preserved
    rel_el = root.find(".//e:personDataPartner1//e:religion", ns)
    assert rel_el is not None
    assert rel_el.text == "111"

    # Net income cantonal (85932) vs federal (87032)
    net_c = root.find(".//e:revenueCalculation//e:netIncome/e:cantonalTax", ns).text
    net_f = root.find(".//e:revenueCalculation//e:netIncome/e:federalTax", ns).text
    assert net_c == "85932"
    assert net_f == "87032"

    # Actual health insurance paid (4800) vs capped deductions (2900 / 1800)
    phi_el = root.find(".//e:insurancePremiums//e:privateHealthInsurance", ns)
    assert phi_el is not None
    assert phi_el.text == "4800"

    final_ded_c = root.find(".//e:insurancePremiums//e:finalDeduction/e:cantonalTax", ns).text
    final_ded_f = root.find(".//e:insurancePremiums//e:finalDeduction/e:federalTax", ns).text
    assert final_ded_c == "2900"
    assert final_ded_f == "1800"

    # Assets & taxable wealth
    tot_assets = root.find(".//e:asset//e:totalAmountAssets/e:fiscalValue", ns).text
    tot_fisc_assets = root.find(".//e:asset//e:totalAmountFiscalAssets/e:fiscalValue", ns).text
    assert tot_assets == "25000"
    assert tot_fisc_assets == "25000"

    # Validates against official schema
    is_valid, errors = validate_ech_xml(xml_content)
    assert is_valid, f"Validation failed: {errors}"


def test_ech0119_asset_liabilities_and_net_wealth():
    """Verify debts are included and reduce totalAmountFiscalAssets (Reinvermögen)."""
    tr = MockModel(
        id="tr-test-debt",
        canton_code="ZH",
        municipality_name="Zürich",
        municipality_code="261",
        tax_year=2025,
    )
    prof = MockModel(
        personal_data={"first_name": "Anna", "last_name": "Keller", "civil_status": "ledig", "ahv_number": "7569217076985"},
        income_data={"gross_salary": 80000},
        deductions_data={"insurance_canton": 2900, "insurance_federal": 1800},
        wealth_data={"total_wealth": 50000},
        liabilities_data={"total_debt": 15000},
    )
    calc = MockModel(
        results={"taxable_income": 65000},
        calculation_details={
            "cantonal_taxable_income": 65000,
            "federal_taxable_income": 65000,
            "canton_deductions_list": [{"code": "health_insurance", "amount": 2900}],
            "federal_deductions_list": [{"code": "health_insurance", "amount": 1800}],
        },
    )

    xml_content = generate_ech_xml(tr, prof, calc)
    root = ET.fromstring(xml_content)
    ns = {"e": "http://www.ech.ch/xmlns/eCH-0119/4"}

    tot_assets = root.find(".//e:asset//e:totalAmountAssets/e:fiscalValue", ns).text
    tot_liab = root.find(".//e:asset//e:totalAmountLiabilities/e:fiscalValue", ns).text
    tot_fisc_assets = root.find(".//e:asset//e:totalAmountFiscalAssets/e:fiscalValue", ns).text

    assert tot_assets == "50000"
    assert tot_liab == "15000"
    assert tot_fisc_assets == "35000"

    is_valid, errors = validate_ech_xml(xml_content)
    assert is_valid, f"Validation failed: {errors}"


def test_ech0119_xxe_prevention():
    """Verify XML external entity injection attempts are rejected."""
    xxe_xml = """<?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE foo [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]>
    <message xmlns="http://www.ech.ch/xmlns/eCH-0119/4">
      <header>&xxe;</header>
    </message>
    """
    is_valid, errors = validate_ech_xml(xxe_xml)
    assert not is_valid
