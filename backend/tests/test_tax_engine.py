"""
Tax engine unit tests – all calculations are deterministic and
tested without any external services or LLM calls.
"""
import pytest
from decimal import Decimal
from pathlib import Path
import json

# We test the engine in isolation – mock the DB rule loader
from app.services.tax_engine_service import TaxCalculationEngine, TaxRuleLoader, TaxRuleNotFoundError


def _load_ruleset(canton: str, year: int):
    """Load real rule files for engine testing."""
    loader = TaxRuleLoader()
    return loader.load(canton_code=canton, municipality_code=None, tax_year=year)


@pytest.fixture
def zh_rules_2025():
    return _load_ruleset("ZH", 2025)


@pytest.fixture
def zg_rules_2025():
    return _load_ruleset("ZG", 2025)


class TestFederalTaxSingle:
    """Test federal income tax calculation for single taxpayers."""

    def test_zero_income(self, zh_rules_2025):
        from app.services.tax_engine_service import TaxCalculationEngine
        engine = TaxCalculationEngine(zh_rules_2025)
        tax = engine._compute_federal_income_tax(Decimal("0"), marital_status="single")
        assert tax == Decimal("0")

    def test_below_threshold(self, zh_rules_2025):
        engine = TaxCalculationEngine(zh_rules_2025)
        # Below 17,800 CHF = 0 tax
        tax = engine._compute_federal_income_tax(Decimal("15000"), marital_status="single")
        assert tax == Decimal("0")

    def test_first_bracket(self, zh_rules_2025):
        engine = TaxCalculationEngine(zh_rules_2025)
        # In first bracket 17,800–31,600 at 0.77%
        tax = engine._compute_federal_income_tax(Decimal("25000"), marital_status="single")
        assert tax > Decimal("0")
        # 25000 - 17800 = 7200 * 0.0077 = 55.44
        assert tax == pytest.approx(float(Decimal("55.44")), rel=0.01)

    def test_married_different_from_single(self, zh_rules_2025):
        engine = TaxCalculationEngine(zh_rules_2025)
        single_tax = engine._compute_federal_income_tax(Decimal("80000"), marital_status="single")
        married_tax = engine._compute_federal_income_tax(Decimal("80000"), marital_status="married")
        assert married_tax < single_tax  # Married always lower at same income


class TestCantonalTaxZH:
    """Test Zürich cantonal and municipal tax."""

    def test_cantonal_zero_income(self, zh_rules_2025):
        engine = TaxCalculationEngine(zh_rules_2025)
        tax = engine._compute_cantonal_income_tax(Decimal("0"))
        assert tax == Decimal("0")

    def test_municipal_multiplier_applied(self, zh_rules_2025):
        """Municipal tax = cantonal_tax * multiplier/100"""
        engine = TaxCalculationEngine(zh_rules_2025)
        cantonal = engine._compute_cantonal_income_tax(Decimal("60000"))
        municipal = engine._compute_municipal_tax(cantonal, municipality_code="261")  # Zürich multiplier 119
        expected = cantonal * Decimal("119") / Decimal("100")
        assert municipal == pytest.approx(float(expected), rel=0.001)

    def test_low_tax_municipality(self, zh_rules_2025):
        """Kilchberg (71) < Zürich (119) for same income."""
        engine = TaxCalculationEngine(zh_rules_2025)
        cantonal = engine._compute_cantonal_income_tax(Decimal("100000"))
        zürich_muni = engine._compute_municipal_tax(cantonal, municipality_code="261")    # 119
        kilchberg_muni = engine._compute_municipal_tax(cantonal, municipality_code="168") # 71
        assert kilchberg_muni < zürich_muni


class TestDeductionLimits:
    """Test that deduction caps are correctly applied."""

    def test_pillar3a_capped(self, zh_rules_2025):
        engine = TaxCalculationEngine(zh_rules_2025)
        # 10,000 CHF contribution but max is 7,258
        capped = engine._apply_pillar3a_deduction(
            contribution=Decimal("10000"),
            marital_status="single",
            is_self_employed=False,
        )
        assert capped == Decimal("7258")

    def test_pillar3a_self_employed_higher_limit(self, zh_rules_2025):
        engine = TaxCalculationEngine(zh_rules_2025)
        capped = engine._apply_pillar3a_deduction(
            contribution=Decimal("40000"),
            marital_status="single",
            is_self_employed=True,
        )
        assert capped == Decimal("36288")

    def test_commuting_capped_at_canton_limit(self, zh_rules_2025):
        engine = TaxCalculationEngine(zh_rules_2025)
        # ZH canton limit is 5000
        capped = engine._apply_commuting_deduction(actual=Decimal("8000"))
        assert capped == Decimal("5000")

    def test_donation_percentage_cap(self, zh_rules_2025):
        engine = TaxCalculationEngine(zh_rules_2025)
        # Income 100,000 CHF, donation 30,000 CHF → capped at 20%
        capped = engine._apply_donation_deduction(
            donation=Decimal("30000"),
            taxable_income=Decimal("100000"),
        )
        assert capped == Decimal("20000")

    def test_donation_minimum(self, zh_rules_2025):
        engine = TaxCalculationEngine(zh_rules_2025)
        # Donation below minimum (100 CHF) → 0
        capped = engine._apply_donation_deduction(
            donation=Decimal("50"),
            taxable_income=Decimal("100000"),
        )
        assert capped == Decimal("0")


class TestFullCalculation:
    """Integration-style tests for the complete calculation pipeline."""

    def test_single_taxpayer_zh_basic(self, zh_rules_2025):
        """Basic single taxpayer in Zürich."""
        engine = TaxCalculationEngine(zh_rules_2025)

        class FakeProfile:
            personal_data = {"marital_status": "single", "name": "Test Taxpayer"}
            income = {"total_employment_income": 80000, "bank_interest": 500, "dividends": 0}
            wealth = {"bank_accounts": [{"balance": 50000, "currency": "CHF"}]}
            deductions = {"pillar3a_total": 7258, "mortgage_interest": 0, "donations_total": 0}
            liabilities = {"total_mortgage_debt": 0}
            securities = []
            real_estate = []

        class FakeTaxReturn:
            canton_code = "ZH"
            municipality_code = "261"
            municipality_name = "Zürich"
            tax_year = 2025

        result = engine.calculate(FakeProfile(), FakeTaxReturn())

        assert result.results_dict["total_tax"] > 0
        assert result.results_dict["taxable_income"] < 80000  # deductions applied
        assert result.results_dict["federal_income_tax"] > 0
        assert result.results_dict["cantonal_income_tax"] > 0
        assert result.results_dict["municipal_income_tax"] > 0
        assert len(result.breakdown_list) > 0

    def test_negative_income_clamped_to_zero(self, zh_rules_2025):
        """When deductions > income, taxable income is 0, not negative."""
        engine = TaxCalculationEngine(zh_rules_2025)

        class FakeProfile:
            personal_data = {"marital_status": "single"}
            income = {"total_employment_income": 5000}
            wealth = {"bank_accounts": []}
            deductions = {"pillar3a_total": 7258}  # More than income
            liabilities = {"total_mortgage_debt": 0}
            securities = []
            real_estate = []

        class FakeTaxReturn:
            canton_code = "ZH"
            municipality_code = "261"
            municipality_name = "Zürich"
            tax_year = 2025

        result = engine.calculate(FakeProfile(), FakeTaxReturn())
        assert result.results_dict["taxable_income"] >= 0

    def test_married_lower_federal_tax(self, zh_rules_2025):
        """Married taxpayer pays less federal tax than single at same income."""
        engine = TaxCalculationEngine(zh_rules_2025)

        class SingleProfile:
            personal_data = {"marital_status": "single"}
            income = {"total_employment_income": 150000}
            wealth = {"bank_accounts": []}
            deductions = {}
            liabilities = {"total_mortgage_debt": 0}
            securities = []
            real_estate = []

        class MarriedProfile:
            personal_data = {"marital_status": "married"}
            income = {"total_employment_income": 150000}
            wealth = {"bank_accounts": []}
            deductions = {}
            liabilities = {"total_mortgage_debt": 0}
            securities = []
            real_estate = []

        class TR:
            canton_code = "ZH"
            municipality_code = "261"
            municipality_name = "Zürich"
            tax_year = 2025

        single_result = engine.calculate(SingleProfile(), TR())
        married_result = engine.calculate(MarriedProfile(), TR())

        assert married_result.results_dict["federal_income_tax"] < single_result.results_dict["federal_income_tax"]

    def test_zug_lower_than_zurich(self, zh_rules_2025, zg_rules_2025):
        """Same income in Zug is taxed less than in Zürich."""
        class Profile:
            personal_data = {"marital_status": "single"}
            income = {"total_employment_income": 120000}
            wealth = {"bank_accounts": []}
            deductions = {"pillar3a_total": 7258}
            liabilities = {"total_mortgage_debt": 0}
            securities = []
            real_estate = []

        class ZH_TR:
            canton_code = "ZH"
            municipality_code = "261"
            municipality_name = "Zürich"
            tax_year = 2025

        class ZG_TR:
            canton_code = "ZG"
            municipality_code = "1701"
            municipality_name = "Zug"
            tax_year = 2025

        zh_result = TaxCalculationEngine(zh_rules_2025).calculate(Profile(), ZH_TR())
        zg_result = TaxCalculationEngine(zg_rules_2025).calculate(Profile(), ZG_TR())

        # Zug is famously lower-tax than Zürich
        assert zg_result.results_dict["total_tax"] < zh_result.results_dict["total_tax"]
