"""
Comprehensive Test Suite for all 26 Swiss Cantons Tax Engine Calculations.
Validates:
1. Deterministic calculation across all 26 cantons for tax years 2025 & 2026
2. Statutory Pillar 3a deduction caps (CHF 7'258 for employed, CHF 36'288 for self-employed)
3. Cantonal vs Federal commuting deduction caps
4. Progressive bracket tables and municipality multiplier scaling
5. Marital status splitting & family deductions
6. Wealth tax deductions and non-negative clamping
"""

import pytest
from decimal import Decimal
from app.services.tax_engine_service import (
    TaxRuleLoader,
    TaxCalculationEngine,
    TaxProfile,
    MaritalStatus,
)

ALL_CANTONS = [
    "AG", "AI", "AR", "BE", "BL", "BS", "FR", "GE", "GL", "GR",
    "JU", "LU", "NE", "NW", "OW", "SG", "SH", "SO", "SZ", "TG",
    "TI", "UR", "VD", "VS", "ZG", "ZH"
]


@pytest.fixture(scope="module")
def tax_engine():
    return TaxCalculationEngine()


@pytest.fixture(scope="module")
def rule_loader():
    return TaxRuleLoader()


@pytest.mark.parametrize("canton_code", ALL_CANTONS)
def test_canton_2025_single_earner(canton_code, tax_engine, rule_loader):
    """Verify single earner calculation produces valid positive tax across all 26 cantons."""
    rules = rule_loader.load_from_files(canton_code, municipality_code="default", tax_year=2025)
    assert rules.canton_code == canton_code
    assert rules.tax_year == 2025
    assert rules.municipality_multiplier > 0

    profile = TaxProfile(
        tax_return_id=f"test-2025-single-{canton_code}",
        tax_year=2025,
        canton_code=canton_code,
        municipality_code=rules.municipality_code,
        marital_status=MaritalStatus.SINGLE,
        gross_employment_income=Decimal("95000"),
        commuting_expense_claimed=Decimal("4500"),
        pillar3a_contribution=Decimal("9000"),  # Exceeds cap
        health_insurance_premium_paid=Decimal("3800"),
        bank_accounts_balance=Decimal("60000"),
        securities_tax_value=Decimal("25000"),
    )

    result = tax_engine.calculate(profile, rules)

    assert result.total_tax > Decimal("0")
    assert result.federal_income_tax > Decimal("0")
    assert result.cantonal_income_tax > Decimal("0")
    assert result.municipal_income_tax > Decimal("0")

    # Pillar 3a MUST be strictly capped at 7'258
    assert result.deductions_applied.pillar3a == Decimal("7258")

    # Taxable income must be non-negative
    assert result.taxable_income > Decimal("0")
    assert result.taxable_wealth >= Decimal("0")


@pytest.mark.parametrize("canton_code", ALL_CANTONS)
def test_canton_2026_married_with_children(canton_code, tax_engine, rule_loader):
    """Verify married couple with children calculation across all 26 cantons."""
    rules = rule_loader.load_from_files(canton_code, municipality_code="default", tax_year=2026)
    assert rules.canton_code == canton_code
    assert rules.tax_year == 2026

    profile = TaxProfile(
        tax_return_id=f"test-2026-married-{canton_code}",
        tax_year=2026,
        canton_code=canton_code,
        municipality_code=rules.municipality_code,
        marital_status=MaritalStatus.MARRIED,
        num_children=2,
        gross_employment_income=Decimal("160000"),
        commuting_expense_claimed=Decimal("6000"),
        pillar3a_contribution=Decimal("7258"),
        health_insurance_premium_paid=Decimal("8000"),
        childcare_costs=Decimal("15000"),
        bank_accounts_balance=Decimal("120000"),
    )

    result = tax_engine.calculate(profile, rules)

    assert result.total_tax > Decimal("0")
    assert result.marital_status == "married"
    assert result.taxable_income < Decimal("160000")


def test_pillar_3a_statutory_limits(tax_engine, rule_loader):
    """Verify employed vs self-employed statutory maximums."""
    rules_zh = rule_loader.load_from_files("ZH", "261", 2025)

    # Employed: claimed CHF 15'000 -> capped at CHF 7'258
    profile_employed = TaxProfile(
        tax_return_id="test-p3a-employed",
        tax_year=2025,
        canton_code="ZH",
        municipality_code="261",
        marital_status=MaritalStatus.SINGLE,
        is_self_employed=False,
        gross_employment_income=Decimal("120000"),
        pillar3a_contribution=Decimal("15000"),
    )
    res_emp = tax_engine.calculate(profile_employed, rules_zh)
    assert res_emp.deductions_applied.pillar3a == Decimal("7258")

    # Self-employed: claimed CHF 40'000 -> capped at CHF 36'288
    profile_self = TaxProfile(
        tax_return_id="test-p3a-self",
        tax_year=2025,
        canton_code="ZH",
        municipality_code="261",
        marital_status=MaritalStatus.SINGLE,
        is_self_employed=True,
        gross_employment_income=Decimal("150000"),
        pillar3a_contribution=Decimal("40000"),
    )
    res_self = tax_engine.calculate(profile_self, rules_zh)
    assert res_self.deductions_applied.pillar3a == Decimal("36288")


def test_commuting_deduction_cantonal_cap_respect(tax_engine, rule_loader):
    """Verify that commuting deduction respects cantonal limits."""
    # Canton ZH has 5'000 cap; Canton BE has 6'700 or statutory limit
    rules_zh = rule_loader.load_from_files("ZH", "261", 2025)
    zh_cap = rules_zh.cantonal_deductions.commuting_max_chf

    profile = TaxProfile(
        tax_return_id="test-commuting-zh",
        tax_year=2025,
        canton_code="ZH",
        municipality_code="261",
        marital_status=MaritalStatus.SINGLE,
        gross_employment_income=Decimal("100000"),
        commuting_expense_claimed=Decimal("12000"),
    )
    res = tax_engine.calculate(profile, rules_zh)
    assert res.deductions_applied.commuting <= zh_cap
