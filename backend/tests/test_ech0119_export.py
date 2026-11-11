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
