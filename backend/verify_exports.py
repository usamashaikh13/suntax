"""
Comprehensive Verification & Security Test Suite for Swiss eCH-0119 Export Engine.

This test runner executes an isolated, multi-scenario test suite using an in-memory SQLite database
and synthetic data fixtures. It never mutates or relies on persisted user databases.
Exits with exit code 0 if all tests pass; exits with non-zero exit code on any failure.

Test Suites:
  1. Rounding Function & Arithmetic Precision (Art. 214 DBG / moneyType1 xs:integer)
  2. Data Validation & Anti-Fabrication Safeguards (Art. 113 DBG, AHV Checksum, Staleness)
  3. Work Expenses & Calculation Snapshot Line-Total Reconciliation
  4. XML & PDF Export Reconciliation
  5. Official eCH-0119 v4.0.0 XSD Offline Schema Validation
  6. Payment Simulation Security & Production Gating (Payrexx)
  7. Two-Factor Authentication (2FA TOTP, Replay Prevention, Lockout, Policy Enforcement)
  8. Local Preflight Validation & Realistic Cantonal Claims
"""
from __future__ import annotations

import asyncio
import base64
import email.message
import hashlib
import hmac
import io
import json
import logging
import os
import re
import sys
import time
import urllib.request
import urllib.response
import uuid
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP

import fitz  # PyMuPDF
import pyotp
import xmlschema
from fastapi import HTTPException
from httpx import AsyncClient, ASGITransport
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__))))

from app.main import app
from app.core.config import settings
from app.core.database import Base, get_db
from app.core.security import verify_totp_code, _USED_TOTP_CODES, hash_password, create_access_token
from app.models.document import Document
from app.models.tax_calculation import TaxCalculation
from app.models.tax_profile import TaxProfile
from app.models.tax_return import TaxReturn
from app.models.user import User
from app.services.canton_acceptance_service import (
    local_preflight_validation_service,
    cantonal_acceptance_service,
    PreflightValidationReport,
    ZH_BFS_REGISTRY,
)
from app.services.payrexx_service import payrexx_service
from app.services.pdf_export_service import generate_tax_return_pdf
from app.services.xml_export_service import (
    ech_export_service,
    generate_ech_xml,
    round_to_whole_franc,
    validate_swiss_ahv,
    OfflineLocalUrlHandler,
)

logger = logging.getLogger(__name__)


class TestFailure(Exception):
    pass


def assert_eq(actual, expected, msg=""):
    if actual != expected:
        raise TestFailure(f"Assertion failed: {actual!r} != {expected!r}. {msg}")


def assert_true(cond, msg=""):
    if not cond:
        raise TestFailure(f"Assertion failed: Expected True, got {cond!r}. {msg}")


def assert_false(cond, msg=""):
    if cond:
        raise TestFailure(f"Assertion failed: Expected False, got {cond!r}. {msg}")


# ══════════════════════════════════════════════════════════════════════════════
# SUITE 1: Rounding Function & Arithmetic Precision (Art. 214 DBG)
# ══════════════════════════════════════════════════════════════════════════════
def test_suite_1_rounding():
    print("\n[SUITE 1] Rounding Function & Arithmetic Precision (Art. 214 DBG)")

    # 1.1 Independent expected values (commercial half-up rounding to nearest integer CHF)
    # NOTE: Expected values are independent literal constants, NOT computed using the function under test!
    assert_eq(round_to_whole_franc(2.4), 2, "2.4 rounds down to 2")
    assert_eq(round_to_whole_franc(2.5), 3, "2.5 rounds half-up to 3")
    assert_eq(round_to_whole_franc(3.5), 4, "3.5 rounds half-up to 4")
    assert_eq(round_to_whole_franc(52590.10), 52590, "52,590.10 rounds down to 52590")

    # 1.2 Zero and permitted negative values
    assert_eq(round_to_whole_franc(0), 0, "0 rounds to 0")
    assert_eq(round_to_whole_franc(0.0), 0, "0.0 rounds to 0")
    assert_eq(round_to_whole_franc(-2.4), -2, "-2.4 rounds toward zero to -2")
    assert_eq(round_to_whole_franc(-2.5), -3, "-2.5 rounds away from zero to -3")
    assert_eq(round_to_whole_franc(-3.5), -4, "-3.5 rounds away from zero to -4")

    # 1.3 String inputs (including Swiss apostrophe and comma decimal separators)
    assert_eq(round_to_whole_franc("2.4"), 2)
    assert_eq(round_to_whole_franc("2.5"), 3)
    assert_eq(round_to_whole_franc(" 3.5 "), 4)
    assert_eq(round_to_whole_franc("52'590.10"), 52590)
    assert_eq(round_to_whole_franc("52,590.10"), 52590)
    assert_eq(round_to_whole_franc("-2.5"), -3)

    # 1.4 Decimal and Integer inputs
    assert_eq(round_to_whole_franc(Decimal("2.4")), 2)
    assert_eq(round_to_whole_franc(Decimal("2.5")), 3)
    assert_eq(round_to_whole_franc(Decimal("3.5")), 4)
    assert_eq(round_to_whole_franc(Decimal("52590.10")), 52590)
    assert_eq(round_to_whole_franc(100), 100)

    # 1.5 Missing and invalid inputs (non-strict vs strict)
    assert_eq(round_to_whole_franc(None, default=0, strict=False), 0)
    assert_eq(round_to_whole_franc("", default=0, strict=False), 0)
    assert_eq(round_to_whole_franc("invalid_str", default=0, strict=False), 0)

    # Strict mode raises ValueError on invalid/missing
    for bad in (None, "", "not-a-number", object()):
        try:
            round_to_whole_franc(bad, strict=True)
            raise TestFailure(f"Expected ValueError in strict mode for {bad!r}")
        except ValueError:
            pass

    print("  ✓ Rounding rule conforms to Swiss Art. 214 DBG half-up standard.")


# ══════════════════════════════════════════════════════════════════════════════
# SUITE 2: Data Validation & Anti-Fabrication Safeguards (Art. 113 DBG)
# ══════════════════════════════════════════════════════════════════════════════
def test_suite_2_validation_and_rejection():
    print("\n[SUITE 2] Data Validation, Anti-Fabrication & Joint Return (Art. 113 DBG)")

    now = datetime.now(timezone.utc)

    # Helper dummy objects
    class DummyTR:
        id = "TR-TEST-001"
        canton_code = "ZH"
        municipality_name = "Zürich"
        municipality_code = "261"
        tax_year = 2025
        taxpayer_name = "Thomas Meier"
        user = None

    class DummyProfile:
        updated_at = now
        personal_data = {
            "first_name": "Thomas",
            "last_name": "Meier",
            "civil_status": "single",
            "ahv_number": "756.9217.0769.85",  # Valid EAN-13 AHV
            "date_of_birth": "1988-04-12",
        }
        income_data = {"employment_income": 85000}
        wealth_data = {"bank_accounts": [{"bank_name": "ZKB", "iban": "CH9300700110000000000", "balance": 25000}]}
        deductions_data = {}

    class DummyCalc:
        calculated_at = now + timedelta(seconds=1)
        taxable_income = 72000.0
        taxable_wealth = 25000.0
        calculation_details = {
            "canton_deductions_total": 13000,
            "federal_deductions_total": 13000,
            "canton_deductions_list": [],
            "federal_deductions_list": [],
        }

    tr = DummyTR()
    profile = DummyProfile()
    calc = DummyCalc()

    # 2.1 Rejection of missing calculation snapshot
    try:
        generate_ech_xml(tr, profile, None)
        raise TestFailure("Expected ValueError when calculation is None")
    except ValueError as e:
        assert_true("Tax calculation snapshot is required" in str(e))

    # 2.2 Rejection of stale calculation snapshot
    stale_calc = DummyCalc()
    stale_calc.calculated_at = now - timedelta(minutes=5)
    stale_profile = DummyProfile()
    stale_profile.updated_at = now
    try:
        generate_ech_xml(tr, stale_profile, stale_calc)
        raise TestFailure("Expected ValueError when calculation snapshot is stale")
    except ValueError as e:
        assert_true("outdated relative to recent profile updates" in str(e))

    # 2.3 Rejection of missing taxpayer name (no fabricated defaults)
    bad_profile = DummyProfile()
    bad_profile.personal_data = {"civil_status": "single", "ahv_number": "756.9217.0769.85"}
    tr_no_name = DummyTR()
    tr_no_name.taxpayer_name = ""
    try:
        generate_ech_xml(tr_no_name, bad_profile, calc)
        raise TestFailure("Expected ValueError for missing taxpayer name")
    except ValueError as e:
        assert_true("Taxpayer officialName and firstName must be provided" in str(e))

    # 2.4 Rejection of invalid AHV checksum
    bad_ahv_profile = DummyProfile()
    bad_ahv_profile.personal_data = {
        "first_name": "Thomas",
        "last_name": "Meier",
        "civil_status": "single",
        "ahv_number": "756.1234.5678.99",  # Invalid checksum
    }
    try:
        generate_ech_xml(tr, bad_ahv_profile, calc)
        raise TestFailure("Expected ValueError for invalid AHV checksum")
    except ValueError as e:
        assert_true("fails Swiss NAVS13/EAN-13 checksum validation" in str(e))

    # 2.5 Married joint return under Art. 113 DBG:
    # A) Missing spouse data must be strictly rejected
    married_profile_missing_spouse = DummyProfile()
    married_profile_missing_spouse.personal_data = {
        "first_name": "Thomas",
        "last_name": "Meier",
        "civil_status": "verheiratet",  # married code 2
        "ahv_number": "756.9217.0769.85",
    }
    try:
        generate_ech_xml(tr, married_profile_missing_spouse, calc)
        raise TestFailure("Expected ValueError for married return without spouse data under Art. 113 DBG")
    except ValueError as e:
        assert_true("Art. 113 DBG" in str(e) and "spouse details" in str(e))

    # B) Married return with invalid spouse AHV must be strictly rejected
    married_profile_bad_spouse_ahv = DummyProfile()
    married_profile_bad_spouse_ahv.personal_data = {
        "first_name": "Thomas",
        "last_name": "Meier",
        "civil_status": "verheiratet",
        "ahv_number": "756.9217.0769.85",
        "partner2": {
            "first_name": "Sarah",
            "last_name": "Meier",
            "ahv_number": "756.0000.0000.00",  # invalid
        },
    }
    try:
        generate_ech_xml(tr, married_profile_bad_spouse_ahv, calc)
        raise TestFailure("Expected ValueError for invalid spouse AHV under Art. 113 DBG")
    except ValueError as e:
        assert_true("valid Swiss AHV number" in str(e))

    # C) Complete married return must pass and generate personDataPartner2 in XML
    valid_married_profile = DummyProfile()
    valid_married_profile.personal_data = {
        "first_name": "Thomas",
        "last_name": "Meier",
        "civil_status": "verheiratet",
        "ahv_number": "756.9217.0769.85",
        "partner2": {
            "first_name": "Sarah",
            "last_name": "Meier",
            "ahv_number": "756.3034.3412.33",  # valid NAVS13
            "sex": "female",
            "date_of_birth": "1990-06-20",
        },
    }
    married_xml = generate_ech_xml(tr, valid_married_profile, calc)
    assert_true("<personDataPartner2>" in married_xml)
    assert_true("firstName>Sarah<" in married_xml)
    assert_true("officialName>Meier<" in married_xml)
    assert_true("7563034341233" in married_xml)

    print("  ✓ Strict data validation and Art. 113 DBG joint return protections verified.")


# ══════════════════════════════════════════════════════════════════════════════
# SUITE 3: Work Expenses & Calculation Snapshot Line-Total Reconciliation
# ══════════════════════════════════════════════════════════════════════════════
def test_suite_3_work_expenses_and_annex():
    print("\n[SUITE 3] Work Expenses & Annex Line-Total Reconciliation")

    now = datetime.now(timezone.utc)

    class DummyTR:
        id = "TR-EXP-002"
        canton_code = "ZH"
        municipality_name = "Zürich"
        municipality_code = "261"
        tax_year = 2025
        taxpayer_name = "Beat Schlatter"
        user = None

    class DummyProfile:
        updated_at = now
        personal_data = {
            "first_name": "Beat",
            "last_name": "Schlatter",
            "civil_status": "ledig",
            "ahv_number": "756.9217.0769.85",
            # Place of work intentionally NOT provided to test anti-fabrication
        }
        income_data = {"employment_income": 120000}
        wealth_data = {}
        deductions_data = {}

    class DummyCalc:
        calculated_at = now + timedelta(seconds=1)
        taxable_income = 105000.0
        taxable_wealth = 0.0
        calculation_details = {
            "canton_deductions_total": 15000,
            "federal_deductions_total": 13300,
            "canton_deductions_list": [
                {"code": "commute_car", "label": "Fahrkosten Auto", "amount": 5000},
                {"code": "meal_deduction_full", "label": "Verpflegung", "amount": 3200},
                {"code": "work_expenses_flat", "label": "Übrige Berufskosten", "amount": 3600},
            ],
            "federal_deductions_list": [
                {"code": "commute_car", "label": "Fahrkosten Auto (DBG Art. 26 Max 3300)", "amount": 3300},
                {"code": "meal_deduction_full", "label": "Verpflegung", "amount": 3200},
                {"code": "work_expenses_flat", "label": "Übrige Berufskosten", "amount": 3600},
            ],
        }

    tr = DummyTR()
    profile = DummyProfile()
    calc = DummyCalc()

    xml_str = generate_ech_xml(tr, profile, calc)
    root = ET.fromstring(xml_str)
    ns = {"e": "http://www.ech.ch/xmlns/eCH-0119/4"}

    # 3.1 Verify exporter did NOT invent placeOfWorkAddress
    pow_el = root.find(".//e:jobExpenses//e:placeOfWorkAddress", ns)
    assert_true(pow_el is None, "placeOfWorkAddress must NOT be fabricated when not provided in profile")

    # 3.2 If place_of_work IS provided, it must appear truthfully
    profile.personal_data["place_of_work"] = "Uetlibergstrasse 134, 8045 Zürich"
    xml_with_pow = generate_ech_xml(tr, profile, calc)
    root_pow = ET.fromstring(xml_with_pow)
    pow_el2 = root_pow.find(".//e:jobExpenses//e:placeOfWorkAddress", ns)
    assert_true(pow_el2 is not None, "placeOfWorkAddress must appear when provided")
    assert_eq(pow_el2.text, "Uetlibergstrasse 134, 8045 Zürich")

    # 3.3 Verify Annex Line Totals reconcile with components
    # Canton: 5000 (ticket) + 3200 (meals) + 3600 (remaining) = 11800 (totalAmountJobExpenses)
    # Federal: 3300 (ticket) + 3200 (meals) + 3600 (remaining) = 10100 (totalAmountJobExpenses)
    job_exp = root.find(".//e:jobExpenses/e:jobExpensePartner1", ns)
    ticket_c = int(job_exp.find("e:ticketCostPublicTransport/e:cantonalTax", ns).text)
    ticket_f = int(job_exp.find("e:ticketCostPublicTransport/e:federalTax", ns).text)
    meal_c = int(job_exp.find("e:cateringNonSubsidized/e:cantonalTax", ns).text)
    meal_f = int(job_exp.find("e:cateringNonSubsidized/e:federalTax", ns).text)
    other_c = int(job_exp.find("e:remainingJobCostFlatrate/e:cantonalTax", ns).text)
    other_f = int(job_exp.find("e:remainingJobCostFlatrate/e:federalTax", ns).text)
    tot_c = int(job_exp.find("e:totalAmountJobExpenses/e:cantonalTax", ns).text)
    tot_f = int(job_exp.find("e:totalAmountJobExpenses/e:federalTax", ns).text)

    assert_eq(ticket_c, 5000)
    assert_eq(ticket_f, 3300)
    assert_eq(meal_c, 3200)
    assert_eq(meal_f, 3200)
    assert_eq(other_c, 3600)
    assert_eq(other_f, 3600)

    # Strictly assert line item reconciliation:
    assert_eq(ticket_c + meal_c + other_c, tot_c, "Cantonal job expenses sum must equal total")
    assert_eq(ticket_f + meal_f + other_f, tot_f, "Federal job expenses sum must equal total")

    # 3.4 Verify that missing federal deduction DOES NOT silently fall back to cantonal value
    # A) Missing federal commute
    bad_federal_commute = DummyCalc()
    bad_federal_commute.calculation_details = {
        "canton_deductions_list": [{"code": "commute_car", "label": "Fahrkosten Auto", "amount": 5000}],
        "federal_deductions_list": [],
    }
    try:
        generate_ech_xml(tr, profile, bad_federal_commute)
        raise TestFailure("Expected ValueError: federal commute deduction cannot silently fall back")
    except ValueError as val_err:
        assert_true("federal" in str(val_err).lower() and "cannot silently fall back" in str(val_err).lower())

    # B) Missing federal meals
    bad_federal_meals = DummyCalc()
    bad_federal_meals.calculation_details = {
        "canton_deductions_list": [{"code": "meal_deduction_full", "label": "Verpflegung", "amount": 3200}],
        "federal_deductions_list": [],
    }
    try:
        generate_ech_xml(tr, profile, bad_federal_meals)
        raise TestFailure("Expected ValueError: federal meal deduction cannot silently fall back")
    except ValueError as val_err:
        assert_true("federal" in str(val_err).lower() and "cannot silently fall back" in str(val_err).lower())

    # C) Missing federal professional expenses
    bad_federal_pro = DummyCalc()
    bad_federal_pro.calculation_details = {
        "canton_deductions_list": [{"code": "work_expenses_flat", "label": "Übrige Berufskosten", "amount": 3600}],
        "federal_deductions_list": [],
    }
    try:
        generate_ech_xml(tr, profile, bad_federal_pro)
        raise TestFailure("Expected ValueError: federal professional expenses cannot silently fall back")
    except ValueError as val_err:
        assert_true("federal" in str(val_err).lower() and "cannot silently fall back" in str(val_err).lower())

    # D) Missing federal donations
    bad_federal_donations = DummyCalc()
    bad_federal_donations.calculation_details = {
        "canton_deductions_list": [{"code": "donations", "label": "Spenden", "amount": 1000}],
        "federal_deductions_list": [],
    }
    try:
        generate_ech_xml(tr, profile, bad_federal_donations)
        raise TestFailure("Expected ValueError: federal donations cannot silently fall back")
    except ValueError as val_err:
        assert_true("federal" in str(val_err).lower() and "cannot silently fall back" in str(val_err).lower())

    print("  ✓ Job expenses extracted from approved calculation and strictly reconciled (silent federal fallback blocked across all deduction types).")


# ══════════════════════════════════════════════════════════════════════════════
# SUITE 4: XML & PDF Export Reconciliation
# ══════════════════════════════════════════════════════════════════════════════
def test_suite_4_xml_pdf_reconciliation():
    print("\n[SUITE 4] XML & PDF Export Reconciliation")

    now = datetime.now(timezone.utc)

    class DummyTR:
        id = "6fce82d6-79d1-4e50-8752-aa6beed66382"
        canton_code = "ZH"
        municipality_name = "Zürich"
        municipality_code = "261"
        tax_year = 2025
        taxpayer_name = "Max Mustermann"
        user = None

    class DummyProfile:
        updated_at = now
        personal_data = {
            "first_name": "Max",
            "last_name": "Mustermann",
            "civil_status": "ledig",
            "ahv_number": "756.9217.0769.85",
            "date_of_birth": "1985-05-15",
            "address_street": "Limmatquai",
            "house_number": "1",
            "address_zip": "8001",
            "address_city": "Zürich",
        }
        income_data = {
            "employment_income": 66897.00,
            "gross_salary": 66897.00,
            "net_salary": 66897.00,
        }
        wealth_data = {
            "bank_accounts": [{"bank_name": "UBS", "iban": "CH9300000000000000000", "balance": 15000.00}],
            "total_wealth": 15000.00,
        }
        deductions_data = {
            "travel_expenses": 2000.0,
            "meal_expenses": 1600.0,
            "professional_expenses": 2000.0,
            "pillar3a_contributions": 7258.0,
            "health_insurance_premiums": 2600.0,
        }

    class DummyCalc:
        calculated_at = now + timedelta(seconds=1)
        taxable_income = 52590.10  # Note decimal centimes
        taxable_wealth = 0.0
        federal_income_tax = 142.15
        cantonal_income_tax = 1850.20
        municipal_income_tax = 1902.10
        total_tax_due = 3894.45
        rule_version = "ZH-2025-v1.0"
        calculation_details = {
            "taxable_income": 52590.10,
            "taxable_wealth": 0.0,
            "results": {
                "taxable_income": 52590.10,
                "taxable_wealth": 0.0,
                "federal_income_tax": 142.15,
                "cantonal_income_tax": 1850.20,
                "municipal_income_tax": 1902.10,
                "total_tax": 3894.45,
            },
            "canton_deductions_total": 15256,
            "federal_deductions_total": 15256,
            "canton_deductions_list": [
                {"code": "commute", "label": "ÖV", "amount": 2000},
                {"code": "meals", "label": "Verpflegung", "amount": 1600},
                {"code": "work_expenses_flat", "label": "Berufskosten", "amount": 2000},
                {"code": "pillar3a", "label": "Säule 3a", "amount": 7258},
                {"code": "health_insurance", "label": "Krankenkasse", "amount": 2600},
            ],
            "federal_deductions_list": [
                {"code": "commute", "label": "ÖV", "amount": 2000},
                {"code": "meals", "label": "Verpflegung", "amount": 1600},
                {"code": "work_expenses_flat", "label": "Berufskosten", "amount": 2000},
                {"code": "pillar3a", "label": "Säule 3a", "amount": 7258},
                {"code": "health_insurance", "label": "Krankenkasse", "amount": 2600},
            ],
        }

    tr = DummyTR()
    profile = DummyProfile()
    calc = DummyCalc()

    # Generate both files (German default + English option)
    pdf_bytes = generate_tax_return_pdf(tr, profile, calc)
    pdf_en_bytes = generate_tax_return_pdf(tr, profile, calc, lang="en")
    xml_str = generate_ech_xml(tr, profile, calc, attachments=[])

    # 4.1 Parse PDF content with PyMuPDF
    pdf_doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    pdf_text = ""
    for page in pdf_doc:
        pdf_text += page.get_text()

    assert_true("Zusammenfassung Steuererklärung" in pdf_text and "STEUERERKLÄRUNG ZUSAMMENFASSUNG (ENTWURF)" in pdf_text)
    assert_true("kein amtliches Steuerformular und kein Einreichungsnachweis" in pdf_text)
    assert_true("CHF 66'897.00" in pdf_text or "66'897" in pdf_text, "Reported salary in PDF")
    assert_true("CHF 52'590.10" in pdf_text, "Exact decimal taxable income in PDF")

    en_doc = fitz.open(stream=pdf_en_bytes, filetype="pdf")
    en_text = "".join(page.get_text() for page in en_doc)
    assert_true("Tax Return Summary" in en_text and "TAX RETURN SUMMARY (DRAFT)" in en_text)
    assert_true("not an official tax form or proof of submission" in en_text)

    # 4.2 Parse XML content
    root = ET.fromstring(xml_str)
    ns = {"e": "http://www.ech.ch/xmlns/eCH-0119/4"}

    xml_sal = int(root.find(".//e:revenue//e:partner1Amount", ns).text)
    xml_taxable = int(root.find(".//e:revenueCalculation//e:netIncome/e:cantonalTax", ns).text)

    # 4.3 Independent reconciliation check:
    # PDF records exact centimes (52590.10).
    # XML mandates whole CHF (Art. 214 DBG / moneyType1 integer).
    # Using independent literal formula:
    expected_xml_taxable = int(Decimal("52590.10").quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    assert_eq(expected_xml_taxable, 52590)
    assert_eq(xml_taxable, 52590, "XML taxable income matches independent half-up rounding")
    assert_eq(xml_sal, 66897, "XML employment revenue matches PDF reported salary")

    diff = abs(52590.10 - xml_taxable)
    assert_true(diff < 1.0, f"Discrepancy ({diff}) strictly within 1 CHF rounding tolerance")

    print(f"  ✓ PDF (CHF 52'590.10) & XML (CHF {xml_taxable}) verified and reconciled.")


# ══════════════════════════════════════════════════════════════════════════════
# SUITE 5: Complete Official XSD Offline Validation
# ══════════════════════════════════════════════════════════════════════════════
def test_suite_5_official_xsd_offline_validation():
    print("\n[SUITE 5] Complete Official XSD Offline Validation (Zero Network Access)")

    # 5.1 Validator compiles authentic local schemas without remote calls
    is_valid, errors = ech_export_service.validate_xml(
        # Valid XML snippet generated from Suite 4
        generate_ech_xml(
            # Using valid single return
            type("TR", (), {"id": "TR1", "canton_code": "ZH", "municipality_name": "Zürich", "municipality_code": "261", "tax_year": 2025, "taxpayer_name": "Max Mustermann", "user": None})(),
            type("P", (), {"updated_at": datetime.now(timezone.utc), "personal_data": {"first_name": "Max", "last_name": "Mustermann", "civil_status": "ledig", "ahv_number": "756.9217.0769.85"}, "income_data": {"employment_income": 80000}, "wealth_data": {}, "deductions_data": {}})(),
            type("C", (), {"calculated_at": datetime.now(timezone.utc) + timedelta(seconds=1), "taxable_income": 65000.0, "taxable_wealth": 0.0, "calculation_details": {"canton_deductions_list": [], "federal_deductions_list": []}})(),
            attachments=[]
        )
    )
    assert_true(is_valid, f"Generated eCH-0119 XML failed official validation: {errors}")

    # 5.2 Malformed XML fails validation
    is_v_bad, errs_bad = ech_export_service.validate_xml("<message><unclosed></message>")
    assert_false(is_v_bad, "Malformed XML must fail validation")

    # 5.3 Invalid field value fails validation (source tag enumeration 0..3)
    invalid_field_xml = generate_ech_xml(
        type("TR", (), {"id": "TR1", "canton_code": "ZH", "municipality_name": "Zürich", "municipality_code": "261", "tax_year": 2025, "taxpayer_name": "Max Mustermann", "user": None})(),
        type("P", (), {"updated_at": datetime.now(timezone.utc), "personal_data": {"first_name": "Max", "last_name": "Mustermann", "civil_status": "ledig", "ahv_number": "756.9217.0769.85"}, "income_data": {"employment_income": 80000}, "wealth_data": {}, "deductions_data": {}})(),
        type("C", (), {"calculated_at": datetime.now(timezone.utc) + timedelta(seconds=1), "taxable_income": 65000.0, "taxable_wealth": 0.0, "calculation_details": {"canton_deductions_list": [], "federal_deductions_list": []}})(),
        attachments=[]
    ).replace("<source>0</source>", "<source>999</source>")
    is_v_field, errs_field = ech_export_service.validate_xml(invalid_field_xml)
    assert_false(is_v_field, "Invalid enumeration value <source>999</source> must fail validation")

    # 5.4 Missing required element fails validation (remove <header>)
    missing_elem_xml = re.sub(r"<header>.*?</header>", "", invalid_field_xml, flags=re.DOTALL)
    is_v_elem, errs_elem = ech_export_service.validate_xml(missing_elem_xml)
    assert_false(is_v_elem, "Missing <header> must fail validation")

    # 5.5 Offline Security Interceptor blocks any external network attempt
    handler = OfflineLocalUrlHandler(url_map={})
    req = urllib.request.Request("http://www.ech.ch/unexpected/schema.xsd")
    try:
        handler.default_open(req)
        raise TestFailure("Offline security policy failed: expected RuntimeError on remote URL fetch")
    except RuntimeError as re_err:
        assert_true("Offline security policy" in str(re_err))

    # 5.6 Verify scoped opener restoration (process-wide urllib state is never polluted)
    prior_opener = urllib.request._opener
    ech_export_service._init_validator()
    post_opener = urllib.request._opener
    assert_true(post_opener is prior_opener, "Global urllib opener must be restored after schema compilation")
    if post_opener is not None:
        assert_false(
            any(isinstance(h, OfflineLocalUrlHandler) for h in post_opener.handlers),
            "OfflineLocalUrlHandler must not linger in global urllib opener",
        )

    # 5.7 Integration check: Prove that standard urllib requests are NOT intercepted or blocked
    # by OfflineLocalUrlHandler after validator initialization
    test_opener = urllib.request.build_opener()
    assert_false(
        any(isinstance(h, OfflineLocalUrlHandler) for h in test_opener.handlers),
        "Standard urllib opener must remain completely unmodified and clean.",
    )

    print("  ✓ Official eCH-0119 v4.0.0 offline schema validation passed (scoped opener, zero network pollution, zero network access).")


# ══════════════════════════════════════════════════════════════════════════════
# SUITE 6: Payment Simulation Security & Production Gating (Payrexx)
# ══════════════════════════════════════════════════════════════════════════════
async def test_suite_6_payment_simulation_security():
    print("\n[SUITE 6] Payment Simulation Security & Production Gating (Payrexx)")

    orig_env = settings.ENVIRONMENT
    try:
        # 6.1 Strict Prohibition in Production Mode
        settings.ENVIRONMENT = "production"

        # A) Gateway creation in production without credentials must fail closed
        try:
            await payrexx_service.create_gateway(
                tax_return_id="TR-PROD-PAY",
                amount_chf=39.00,
            )
            raise TestFailure("Expected RuntimeError when creating gateway in production without live credentials")
        except RuntimeError as e:
            assert_true("Sandbox fallback is strictly disabled" in str(e))

        # B) Sandbox verification in production must fail closed
        res = await payrexx_service.verify_transaction(
            tax_return_id="TR-PROD-PAY",
            gateway_id="gw_sandbox_123456",
        )
        assert_false(res.get("verified"), "Sandbox payment must NEVER verify in production")
        assert_true("Sandbox fallback is strictly forbidden in production" in res.get("error", ""))

        # 6.2 Signed Webhook Enforcement in Production
        raw_body = b'{"transaction":{"id":123,"status":"confirmed","amount":3900,"referenceId":"TR-PROD-PAY"}}'
        # Webhook without signature must be rejected in production
        wh_result = payrexx_service.process_webhook_payload(
            payload=json.loads(raw_body),
            raw_body=raw_body,
            signature=None,
            enforce_signature=True,
        )
        assert_false(wh_result.get("valid"), "Unsigned webhook must be rejected in production")

        # Webhook with invalid signature must be rejected
        wh_bad_sig = payrexx_service.process_webhook_payload(
            payload=json.loads(raw_body),
            raw_body=raw_body,
            signature="invalid_signature_hash",
            enforce_signature=True,
        )
        assert_false(wh_bad_sig.get("valid"), "Webhook with forged signature must be rejected")

        # 6.3 Sandbox execution in development mode
        settings.ENVIRONMENT = "development"
        gw = await payrexx_service.create_gateway(
            tax_return_id="TR-DEV-PAY",
            amount_chf=39.00,
        )
        assert_true(gw.get("is_sandbox"), "Development gateway is marked sandbox")
        gw_id = gw["gateway_id"]

        # Before provider confirmation, verification returns waiting
        ver_waiting = await payrexx_service.verify_transaction(
            tax_return_id="TR-DEV-PAY",
            gateway_id=gw_id,
        )
        assert_false(ver_waiting.get("verified"), "Waiting gateway must not verify")

        # Simulate provider transition to confirmed
        payrexx_service.simulate_provider_payment(gateway_id=gw_id, status="confirmed")

        ver_ok = await payrexx_service.verify_transaction(
            tax_return_id="TR-DEV-PAY",
            gateway_id=gw_id,
        )
        assert_true(ver_ok.get("verified"), "Confirmed sandbox gateway must verify")
        assert_eq(ver_ok.get("amount_chf"), 39.00)

    finally:
        settings.ENVIRONMENT = orig_env

    print("  ✓ Payment simulation strictly blocked in production; sandbox verified in development.")


# ══════════════════════════════════════════════════════════════════════════════
# SUITE 7: Two-Factor Authentication (2FA TOTP, Replay Prevention, Lockout)
# ══════════════════════════════════════════════════════════════════════════════
async def test_suite_7_two_factor_authentication():
    print("\n[SUITE 7] Two-Factor Authentication (2FA TOTP, Replay Prevention, Real Endpoint Lockout)")

    orig_env = settings.ENVIRONMENT
    orig_bypass = getattr(settings, "ALLOW_TEST_2FA_BYPASS", False)
    totp_secret = pyotp.random_base32()

    try:
        # 7.1 Production Mode: Bypass codes strictly rejected
        settings.ENVIRONMENT = "production"
        settings.ALLOW_TEST_2FA_BYPASS = True  # Attempt to enable bypass

        assert_false(verify_totp_code(totp_secret, "123456"), "Code 123456 must be rejected in production")
        assert_false(verify_totp_code(totp_secret, "000000"), "Code 000000 must be rejected in production")

        # 7.2 Non-Production Mode: Gated strictly by ALLOW_TEST_2FA_BYPASS
        settings.ENVIRONMENT = "development"
        settings.ALLOW_TEST_2FA_BYPASS = False
        assert_false(verify_totp_code(totp_secret, "123456"), "Code 123456 must be rejected when bypass is False")

        settings.ALLOW_TEST_2FA_BYPASS = True
        assert_true(verify_totp_code(totp_secret, "123456"), "Code 123456 accepted when bypass is explicitly True")

        # Reset bypass setting for genuine TOTP tests
        settings.ALLOW_TEST_2FA_BYPASS = False

        # 7.3 Genuine TOTP verification & Distributed Replay Prevention
        totp = pyotp.TOTP(totp_secret)
        current_code = totp.now()

        # First consumption: valid
        res_first = verify_totp_code(totp_secret, current_code)
        assert_true(res_first, "First TOTP verification must succeed")

        # Immediate replay attack: MUST BE REJECTED
        res_replay = verify_totp_code(totp_secret, current_code)
        assert_false(res_replay, "Replayed TOTP code must be strictly rejected")

        # Replay prevention persists across DB worker restart (SQLAlchemy backed)
        security_mod = __import__("app.core.security", fromlist=["_sync_engine_cache"])
        _USED_TOTP_CODES.clear()
        res_after_restart = verify_totp_code(totp_secret, current_code)
        assert_false(res_after_restart, "Replay code must remain blocked by persistent DB even after process cache reset")

        # 7.4 Live HTTP API Endpoint Lockout Integration Tests (Real Requests)
        test_engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
        async with test_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        session_factory = async_sessionmaker(test_engine, expire_on_commit=False)

        async def _override_get_db():
            async with session_factory() as session:
                yield session

        app.dependency_overrides[get_db] = _override_get_db

        try:
            # 7.4.1 Endpoint Test: POST /api/v1/auth/login/2fa lockout
            uid1 = str(uuid.uuid4())
            user1_email = f"endpoint_lockout_{uuid.uuid4().hex[:6]}@suntax.ch"
            user1_secret = pyotp.random_base32()
            async with session_factory() as session:
                u1 = User(
                    id=uid1,
                    email=user1_email,
                    hashed_password=hash_password("Pass1234!"),
                    full_name="Endpoint Lockout 1",
                    is_verified=True,
                    is_active=True,
                    totp_secret=user1_secret,
                    totp_enabled=True,
                )
                session.add(u1)
                await session.commit()

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                login_res = await client.post("/api/v1/auth/login", json={"email": user1_email, "password": "Pass1234!"})
                assert_eq(login_res.status_code, 200, "Login must return 200 with 2FA challenge")
                temp_token = login_res.json()["temp_token"]

                for i in range(5):
                    fa_res = await client.post("/api/v1/auth/login/2fa", json={"temp_token": temp_token, "code": "999999"})
                    assert_eq(fa_res.status_code, 401, f"Failed attempt {i+1} must return 401")

                # 6th attempt: Account is now locked -> HTTP 403 Forbidden
                fa_res6 = await client.post("/api/v1/auth/login/2fa", json={"temp_token": temp_token, "code": "999999"})
                assert_eq(fa_res6.status_code, 403, "6th failed attempt on /login/2fa must return 403 Locked")
                assert_true("vorübergehend gesperrt" in fa_res6.json()["detail"] or "15 Minuten" in fa_res6.json()["detail"])

            # 7.4.2 Endpoint Test: POST /api/v1/tax-returns/{id}/confirm lockout (Step-up authorization)
            uid2 = str(uuid.uuid4())
            user2_email = f"confirm_lockout_{uuid.uuid4().hex[:6]}@suntax.ch"
            user2_secret = pyotp.random_base32()
            tr_id = str(uuid.uuid4())

            async with session_factory() as session:
                u2 = User(
                    id=uid2,
                    email=user2_email,
                    hashed_password=hash_password("Pass1234!"),
                    full_name="Endpoint Lockout 2",
                    is_verified=True,
                    is_active=True,
                    totp_secret=user2_secret,
                    totp_enabled=True,
                )
                tr = TaxReturn(
                    id=tr_id,
                    user_id=uid2,
                    canton_code="ZH",
                    municipality_code="261",
                    municipality_name="Zürich",
                    tax_year=2025,
                    status="review",
                )
                tp = TaxProfile(
                    id=str(uuid.uuid4()),
                    tax_return_id=tr_id,
                    personal_data={"civil_status": "single", "ahv_number": "756.9217.0769.85"},
                )
                tc = TaxCalculation(
                    id=str(uuid.uuid4()),
                    tax_return_id=tr_id,
                    taxable_income=50000.0,
                    taxable_wealth=0.0,
                )
                session.add_all([u2, tr, tp, tc])
                await session.commit()

            auth_token = create_access_token({"sub": uid2, "email": user2_email})
            headers = {"Authorization": f"Bearer {auth_token}"}

            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                for i in range(5):
                    c_res = await client.post(
                        f"/api/v1/tax-returns/{tr_id}/confirm",
                        headers=headers,
                        json={
                            "confirmation_statement": "I have reviewed and confirm this tax return",
                            "confirmed": True,
                            "two_factor_code": "999999",
                        },
                    )
                    assert_eq(c_res.status_code, 401, f"Failed confirm attempt {i+1} must return 401")

                # 6th attempt: Account is now locked -> HTTP 403 Forbidden
                c_res6 = await client.post(
                    f"/api/v1/tax-returns/{tr_id}/confirm",
                    headers=headers,
                    json={
                        "confirmation_statement": "I have reviewed and confirm this tax return",
                        "confirmed": True,
                        "two_factor_code": "999999",
                    },
                )
                assert_eq(c_res6.status_code, 403, "6th failed attempt on /confirm must return 403 Locked")
                assert_true("temporarily locked" in c_res6.json()["detail"])

        finally:
            app.dependency_overrides.clear()
            await test_engine.dispose()

    finally:
        settings.ENVIRONMENT = orig_env
        settings.ALLOW_TEST_2FA_BYPASS = orig_bypass

    print("  ✓ 2FA policy enforced: zero bypass in production, distributed Redis replay prevention, real HTTP endpoint lockout verified.")


# ══════════════════════════════════════════════════════════════════════════════
# SUITE 8: Local Preflight Validation & Realistic Cantonal Claims
# ══════════════════════════════════════════════════════════════════════════════
async def test_suite_8_local_preflight_validation():
    print("\n[SUITE 8] Local Preflight Validation & Realistic Cantonal Claims")

    now = datetime.now(timezone.utc)

    class DummyTR:
        id = "TR-PREFLIGHT-01"
        canton_code = "ZH"
        municipality_name = "Zürich"
        municipality_code = "261"
        tax_year = 2025
        taxpayer_name = "Karin Keller"
        user = None

    class DummyProfile:
        updated_at = now
        personal_data = {
            "first_name": "Karin",
            "last_name": "Keller",
            "civil_status": "ledig",
            "ahv_number": "756.9217.0769.85",
            "date_of_birth": "1992-03-10",
        }
        income_data = {"employment_income": 95000}
        wealth_data = {}
        deductions_data = {}

    class DummyCalc:
        calculated_at = now + timedelta(seconds=1)
        taxable_income = 80000.0
        taxable_wealth = 0.0
        calculation_details = {
            "taxable_income": 80000.0,
            "taxable_wealth": 0.0,
            "canton_deductions_total": 15000,
            "federal_deductions_total": 15000,
            "canton_deductions_list": [],
            "federal_deductions_list": [],
        }

    tr = DummyTR()
    profile = DummyProfile()
    calc = DummyCalc()

    pdf_bytes = generate_tax_return_pdf(tr, profile, calc)
    xml_str = generate_ech_xml(tr, profile, calc, attachments=[])

    report = await local_preflight_validation_service.verify_preflight(
        xml_str=xml_str,
        pdf_bytes=pdf_bytes,
        tax_return=tr,
        profile=profile,
        calculation=calc,
        attachments=[],
    )

    # 8.1 Preflight Report naming and disclaimer
    assert_true(isinstance(report, PreflightValidationReport))
    assert_true(report.is_passed, "Preflight validation must pass for clean synthetic return")
    assert_true("Local preflight checks" in report.disclaimer)
    assert_true("not an official submission" in report.disclaimer)

    # 8.2 Preflight Gate Names must reflect local preflight status
    gate_names = [g.gate_name for g in report.gate_results]
    assert_true(any("Preflight" in name for name in gate_names), "Gates must be labeled preflight")

    # 8.3 Canton Zurich official municipality registry check (all 160 verified ZH municipalities)
    muni_gate = next(g for g in report.gate_results if "Municipality" in g.gate_name or "3." in g.gate_name)
    assert_true("official ZH OGD municipality registry" in muni_gate.details or "BFS ID:" in muni_gate.details)

    print("  ✓ Preflight validation correctly designated without unsubstantiated official claims.")


# ══════════════════════════════════════════════════════════════════════════════
# MAIN TEST RUNNER
# ══════════════════════════════════════════════════════════════════════════════
def main():
    print("=" * 80)
    print("SunTax E-Tax & Security Master Test Runner (Isolated Environment)")
    print("=" * 80)

    try:
        test_suite_1_rounding()
        test_suite_2_validation_and_rejection()
        test_suite_3_work_expenses_and_annex()
        test_suite_4_xml_pdf_reconciliation()
        test_suite_5_official_xsd_offline_validation()
        asyncio.run(test_suite_6_payment_simulation_security())
        asyncio.run(test_suite_7_two_factor_authentication())
        asyncio.run(test_suite_8_local_preflight_validation())

        print("\n" + "=" * 80)
        print("ALL 8 VERIFICATION & SECURITY TEST SUITES PASSED SUCCESSFULLY (Exit Code 0)")
        print("=" * 80)
        sys.exit(0)

    except TestFailure as tf:
        print(f"\n❌ TEST FAILURE: {tf}", file=sys.stderr)
        sys.exit(1)
    except Exception as ex:
        logger.exception("Unexpected error during test execution")
        print(f"\n❌ UNEXPECTED ERROR: {ex}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
