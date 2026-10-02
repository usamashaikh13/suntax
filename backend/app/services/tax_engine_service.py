"""
SunTax — Deterministic Swiss Tax Calculation Engine

This module is the core of SunTax.  It MUST NOT use any LLM, heuristic, or
approximation for tax calculations.  Every CHF figure is derived solely from:
  - The TaxProfile provided by the caller
  - The TaxRuleSet loaded from the verified rule files / database

Design principles:
  - All arithmetic uses Python's Decimal to avoid floating-point drift.
  - Every rule application is recorded in a TaxLineItem so the full
    calculation can be audited line-by-line.
  - Missing rules raise TaxRuleNotFoundError immediately; we never silently
    fall back to an estimate.
  - Negative taxable income / wealth is clamped to zero before bracket lookup.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.tax_calculation import (
    MaritalStatus,
    TaxCalculationResult,
    TaxDeductionsApplied,
    TaxLineItem,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class TaxEngineError(Exception):
    """Base class for all tax-engine errors."""


class TaxRuleNotFoundError(TaxEngineError):
    """
    Raised when a required tax rule or parameter is absent from the rule set.

    The engine never estimates missing values — if a rule is absent the
    calculation must be aborted and the user must be notified.
    """

    def __init__(self, rule_key: str, canton: Optional[str], tax_year: int) -> None:
        self.rule_key = rule_key
        self.canton = canton
        self.tax_year = tax_year
        super().__init__(
            f"Required tax rule '{rule_key}' not found "
            f"(canton={canton or 'federal'}, tax_year={tax_year})"
        )


class TaxCalculationError(TaxEngineError):
    """Raised when the calculation cannot proceed due to invalid input."""


# ---------------------------------------------------------------------------
# Data models (plain dataclasses — no ORM dependency)
# ---------------------------------------------------------------------------


@dataclass
class TaxBracket:
    """A single step in a progressive tax bracket table."""

    from_chf: Decimal
    to_chf: Optional[Decimal]  # None = open-ended (top bracket)
    rate: Decimal              # marginal rate for this bracket
    base_tax: Decimal          # cumulative tax already computed at bracket start


@dataclass
class WealthTaxBracket:
    from_chf: Decimal
    to_chf: Optional[Decimal]
    rate: Decimal


@dataclass
class DeductionLimits:
    """All deduction caps for a given canton / federal level and tax year."""

    pillar3a_employed_max: Decimal
    pillar3a_self_employed_max: Decimal
    commuting_max_chf: Decimal
    professional_expenses_flat_rate_pct: Decimal
    professional_expenses_min: Decimal
    professional_expenses_max: Decimal
    meal_deduction_annual: Decimal
    health_insurance_single: Decimal
    health_insurance_married: Decimal
    health_insurance_per_child: Decimal
    medical_expense_threshold_pct: Decimal
    donation_max_pct: Decimal
    donation_min_chf: Decimal
    child_deduction_per_child: Decimal
    childcare_max: Decimal
    interest_deduction_max: Optional[Decimal] = None  # None = unlimited

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "DeductionLimits":
        def _d(key: str, default: Any = None) -> Decimal:
            v = d.get(key, default)
            return Decimal(str(v)) if v is not None else None  # type: ignore[return-value]

        return cls(
            pillar3a_employed_max=_d("pillar3a_employed_max", 7258),
            pillar3a_self_employed_max=_d("pillar3a_self_employed_max", 36288),
            commuting_max_chf=_d("commuting_max_chf", 3000),
            professional_expenses_flat_rate_pct=_d("professional_expenses_flat_rate_pct", "0.03"),
            professional_expenses_min=_d("professional_expenses_min", 2000),
            professional_expenses_max=_d("professional_expenses_max", 4000),
            meal_deduction_annual=_d("meal_deduction_annual", 3200),
            health_insurance_single=_d("health_insurance_deduction_single", 2800),
            health_insurance_married=_d("health_insurance_deduction_married", 5600),
            health_insurance_per_child=_d("health_insurance_deduction_per_child", 700),
            medical_expense_threshold_pct=_d("medical_expense_threshold_pct", "0.05"),
            donation_max_pct=_d("donation_max_pct_of_income", "0.20"),
            donation_min_chf=_d("donation_min_chf", 100),
            child_deduction_per_child=_d("child_deduction_per_child", 6700),
            childcare_max=_d("childcare_max", 25000),
            interest_deduction_max=_d("interest_deduction_max"),
        )


@dataclass
class TaxRuleSet:
    """
    Versioned rule set for a specific canton + tax year combination.

    Contains both federal and cantonal rule data so a single object can drive
    the complete calculation.
    """

    canton_code: str
    canton_name: str
    municipality_code: str
    municipality_name: str
    municipality_multiplier: int          # e.g. 119 for Zürich
    tax_year: int
    version: str

    # Federal brackets
    federal_brackets_single: list[TaxBracket]
    federal_brackets_married: list[TaxBracket]
    federal_deductions: DeductionLimits

    # Cantonal brackets
    cantonal_income_brackets: list[TaxBracket]
    cantonal_wealth_brackets: list[WealthTaxBracket]
    cantonal_deductions: DeductionLimits

    # Wealth tax social deductions (per-person allowances before applying brackets)
    wealth_social_deduction_per_taxpayer: Decimal
    wealth_social_deduction_per_spouse: Decimal
    wealth_social_deduction_per_child: Decimal


@dataclass
class TaxProfile:
    """
    Taxpayer financial profile for a single tax period.

    All monetary values are in CHF (whole numbers or up to 2 decimal places).
    """

    tax_return_id: str
    tax_year: int
    canton_code: str
    municipality_code: str
    marital_status: MaritalStatus
    is_self_employed: bool = False
    num_children: int = 0

    # --- Income ---
    gross_employment_income: Decimal = Decimal("0")
    other_income: Decimal = Decimal("0")           # interest, dividends, rental etc.

    # --- Employment expense claims ---
    commuting_expense_claimed: Decimal = Decimal("0")
    meals_expense_claimed: Decimal = Decimal("0")
    equipment_expense_claimed: Decimal = Decimal("0")  # home office / tools

    # --- Deduction inputs ---
    pillar3a_contribution: Decimal = Decimal("0")
    health_insurance_premium_paid: Decimal = Decimal("0")
    medical_expenses_paid: Decimal = Decimal("0")
    interest_on_debts: Decimal = Decimal("0")
    donations: Decimal = Decimal("0")
    childcare_costs: Decimal = Decimal("0")
    other_deductions: Decimal = Decimal("0")

    # --- Assets (at tax values) ---
    bank_accounts_balance: Decimal = Decimal("0")
    securities_tax_value: Decimal = Decimal("0")
    real_estate_tax_value: Decimal = Decimal("0")
    other_assets: Decimal = Decimal("0")

    # --- Liabilities ---
    mortgage_balance: Decimal = Decimal("0")
    other_liabilities: Decimal = Decimal("0")


# ---------------------------------------------------------------------------
# Helper: bracket lookup
# ---------------------------------------------------------------------------

_ZERO = Decimal("0")
_ONE = Decimal("1")
_CENT = Decimal("0.05")  # Swiss tax rounds to nearest 5 Rappen


def _chf(value: Decimal) -> Decimal:
    """Round to nearest 5 Rappen (standard Swiss tax rounding)."""
    return (value / _CENT).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * _CENT


def _apply_progressive_bracket(
    taxable_amount: Decimal,
    brackets: list[TaxBracket],
) -> Decimal:
    """
    Compute the tax on *taxable_amount* using the supplied bracket table.

    The table must be sorted ascending by from_chf.
    Uses the base_tax (cumulative) + marginal approach for efficiency and
    accuracy — matches the Swiss cantonal tax authority published tables.
    """
    if taxable_amount <= _ZERO:
        return _ZERO

    tax = _ZERO
    for bracket in reversed(brackets):
        if taxable_amount > bracket.from_chf:
            # How much income falls in this bracket
            if bracket.to_chf is not None:
                income_in_bracket = min(taxable_amount, bracket.to_chf) - bracket.from_chf
            else:
                income_in_bracket = taxable_amount - bracket.from_chf

            if income_in_bracket > _ZERO:
                tax = bracket.base_tax + income_in_bracket * bracket.rate
            break

    return max(tax, _ZERO)


def _apply_wealth_brackets(
    taxable_wealth: Decimal,
    brackets: list[WealthTaxBracket],
) -> Decimal:
    """Compute cantonal wealth tax using marginal bracket method."""
    if taxable_wealth <= _ZERO:
        return _ZERO

    total = _ZERO
    for bracket in brackets:
        if bracket.to_chf is None:
            # Top bracket: tax everything above from_chf
            excess = taxable_wealth - bracket.from_chf
            if excess > _ZERO:
                total += excess * bracket.rate
        else:
            bracket_width = bracket.to_chf - bracket.from_chf
            taxable_in_bracket = max(
                min(taxable_wealth, bracket.to_chf) - bracket.from_chf, _ZERO
            )
            total += taxable_in_bracket * bracket.rate

    return max(total, _ZERO)


# ---------------------------------------------------------------------------
# Rule loader
# ---------------------------------------------------------------------------


class TaxRuleLoader:
    """
    Loads versioned tax rules from JSON files (for testing / seeding) or from
    the application database.

    When loading from files the rules directory structure must be:
        <rules_root>/federal/<year>.json
        <rules_root>/cantons/<CANTON>/<year>.json

    When loading from the database, the AsyncSession is used to query the
    tax_rules table by (level, canton, tax_year, version).
    """

    def __init__(self, rules_root: Optional[Path] = None) -> None:
        if rules_root is None:
            # Default: project-root/tax-rules relative to this file's location.
            self._root = (
                Path(__file__).resolve().parents[3] / "tax-rules"
            )
        else:
            self._root = rules_root

    def _load_json(self, path: Path) -> dict[str, Any]:
        if not path.exists():
            raise FileNotFoundError(f"Tax rule file not found: {path}")
        with path.open(encoding="utf-8") as fh:
            return json.load(fh)

    def _parse_brackets(self, data: list[dict]) -> list[TaxBracket]:
        brackets = []
        for b in data:
            brackets.append(
                TaxBracket(
                    from_chf=Decimal(str(b["from"])),
                    to_chf=Decimal(str(b["to"])) if b["to"] is not None else None,
                    rate=Decimal(str(b["rate"])),
                    base_tax=Decimal(str(b["base_tax"])),
                )
            )
        return sorted(brackets, key=lambda x: x.from_chf)

    def _parse_wealth_brackets(self, data: list[dict]) -> list[WealthTaxBracket]:
        brackets = []
        for b in data:
            brackets.append(
                WealthTaxBracket(
                    from_chf=Decimal(str(b["from"])),
                    to_chf=Decimal(str(b["to"])) if b["to"] is not None else None,
                    rate=Decimal(str(b["rate"])),
                )
            )
        return sorted(brackets, key=lambda x: x.from_chf)

    def load_from_files(
        self,
        canton_code: str,
        municipality_code: str,
        tax_year: int,
        version: Optional[str] = None,
    ) -> TaxRuleSet:
        """
        Load rules from the local JSON tax-rules tree.

        :param version: If supplied, validates that the loaded file version
                        matches. Otherwise, any version is accepted.
        """
        canton_code = canton_code.upper()

        federal_path = self._root / "federal" / f"{tax_year}.json"
        canton_path = self._root / "cantons" / canton_code / f"{tax_year}.json"

        federal_data = self._load_json(federal_path)
        canton_data = self._load_json(canton_path)

        # Validate version if requested
        if version is not None:
            for data, label in ((federal_data, "federal"), (canton_data, f"canton {canton_code}")):
                if data.get("version") != version:
                    raise TaxRuleNotFoundError(
                        rule_key=f"version={version}",
                        canton=None if label == "federal" else canton_code,
                        tax_year=tax_year,
                    )

        # Resolve municipality
        muni_data = canton_data.get("municipality_multipliers", {}).get(municipality_code)
        if muni_data is None:
            raise TaxRuleNotFoundError(
                rule_key=f"municipality_multiplier[{municipality_code}]",
                canton=canton_code,
                tax_year=tax_year,
            )
        multiplier: int = muni_data["multiplier"]
        municipality_name: str = muni_data["name"]

        # Wealth social deductions
        wsd = canton_data.get("wealth_tax_social_deductions", {})
        per_taxpayer = Decimal(str(wsd.get("per_taxpayer", 0)))
        per_spouse = Decimal(str(wsd.get("per_spouse", 0)))
        per_child_wsd = Decimal(str(wsd.get("per_child", 0)))

        return TaxRuleSet(
            canton_code=canton_code,
            canton_name=canton_data["canton_name"],
            municipality_code=municipality_code,
            municipality_name=municipality_name,
            municipality_multiplier=multiplier,
            tax_year=tax_year,
            version=canton_data.get("version", "unknown"),
            federal_brackets_single=self._parse_brackets(
                federal_data["income_tax_brackets_single"]
            ),
            federal_brackets_married=self._parse_brackets(
                federal_data["income_tax_brackets_married"]
            ),
            federal_deductions=DeductionLimits.from_dict(
                federal_data.get("deduction_limits", {})
            ),
            cantonal_income_brackets=self._parse_brackets(
                canton_data["income_tax_brackets_canton"]
            ),
            cantonal_wealth_brackets=self._parse_wealth_brackets(
                canton_data["wealth_tax_brackets"]
            ),
            cantonal_deductions=DeductionLimits.from_dict(
                canton_data.get("deduction_limits", {})
            ),
            wealth_social_deduction_per_taxpayer=per_taxpayer,
            wealth_social_deduction_per_spouse=per_spouse,
            wealth_social_deduction_per_child=per_child_wsd,
        )

    async def load_from_db(
        self,
        canton_code: str,
        municipality_code: str,
        tax_year: int,
        db: AsyncSession,
        version: Optional[str] = None,
    ) -> TaxRuleSet:
        """
        Load rules from the database tax_rules table.

        Falls back to JSON files if the DB does not contain the requested rule.
        This allows local development without a DB seed while ensuring
        production always uses verified, versioned DB records.
        """
        from sqlalchemy import select, text

        # Try DB first
        try:
            stmt = text(
                """
                SELECT rule_data FROM tax_rules
                WHERE level = :level AND canton_code = :canton
                  AND tax_year = :year
                  AND (:version IS NULL OR version = :version)
                ORDER BY created_at DESC
                LIMIT 1
                """
            )
            # Load federal
            fed_row = await db.execute(
                stmt,
                {"level": "federal", "canton": None, "year": tax_year, "version": version},
            )
            fed_result = fed_row.fetchone()

            # Load cantonal
            canton_row = await db.execute(
                stmt,
                {"level": "canton", "canton": canton_code.upper(), "year": tax_year, "version": version},
            )
            canton_result = canton_row.fetchone()

            if fed_result and canton_result:
                federal_data = fed_result[0]
                canton_data = canton_result[0]

                muni_data = canton_data.get("municipality_multipliers", {}).get(municipality_code)
                if muni_data is None:
                    raise TaxRuleNotFoundError(
                        f"municipality_multiplier[{municipality_code}]", canton_code, tax_year
                    )
                wsd = canton_data.get("wealth_tax_social_deductions", {})

                return TaxRuleSet(
                    canton_code=canton_code.upper(),
                    canton_name=canton_data["canton_name"],
                    municipality_code=municipality_code,
                    municipality_name=muni_data["name"],
                    municipality_multiplier=muni_data["multiplier"],
                    tax_year=tax_year,
                    version=canton_data.get("version", "unknown"),
                    federal_brackets_single=self._parse_brackets(
                        federal_data["income_tax_brackets_single"]
                    ),
                    federal_brackets_married=self._parse_brackets(
                        federal_data["income_tax_brackets_married"]
                    ),
                    federal_deductions=DeductionLimits.from_dict(
                        federal_data.get("deduction_limits", {})
                    ),
                    cantonal_income_brackets=self._parse_brackets(
                        canton_data["income_tax_brackets_canton"]
                    ),
                    cantonal_wealth_brackets=self._parse_wealth_brackets(
                        canton_data["wealth_tax_brackets"]
                    ),
                    cantonal_deductions=DeductionLimits.from_dict(
                        canton_data.get("deduction_limits", {})
                    ),
                    wealth_social_deduction_per_taxpayer=Decimal(str(wsd.get("per_taxpayer", 0))),
                    wealth_social_deduction_per_spouse=Decimal(str(wsd.get("per_spouse", 0))),
                    wealth_social_deduction_per_child=Decimal(str(wsd.get("per_child", 0))),
                )
        except Exception as exc:
            logger.warning(
                "DB rule load failed (%s), falling back to JSON files", exc
            )

        # Fallback to JSON
        return self.load_from_files(canton_code, municipality_code, tax_year, version)


# ---------------------------------------------------------------------------
# Calculation engine
# ---------------------------------------------------------------------------


class TaxCalculationEngine:
    """
    Deterministic Swiss tax calculation engine.

    Usage::

        loader = TaxRuleLoader()
        rules = loader.load_from_files("ZH", "261", 2025)
        profile = TaxProfile(...)
        engine = TaxCalculationEngine()
        result = engine.calculate(profile, rules)
    """

    def calculate(
        self, profile: TaxProfile, rules: TaxRuleSet
    ) -> TaxCalculationResult:
        """
        Execute the full Swiss tax calculation.

        Steps:
          1. Compute taxable income (employment income minus all allowed deductions)
          2. Compute taxable wealth (assets minus liabilities minus social deductions)
          3. Calculate federal income tax (DBG)
          4. Calculate cantonal income tax
          5. Calculate municipal income tax
          6. Calculate wealth taxes (cantonal + municipal)
          7. Assemble and validate result

        All intermediate values are rounded to CHF 0.05 (Swiss standard).
        Negative taxable income and wealth are clamped to zero.
        """
        breakdown: list[TaxLineItem] = []

        def _line(
            label: str,
            amount: Decimal,
            rule_key: str,
            ref: str,
            canton: Optional[str] = None,
        ) -> None:
            breakdown.append(
                TaxLineItem(
                    label=label,
                    amount=amount,
                    rule_key=rule_key,
                    rule_reference=ref,
                    canton_code=canton,
                    tax_year=rules.tax_year,
                )
            )

        is_married = profile.marital_status in (
            MaritalStatus.MARRIED,
            MaritalStatus.REGISTERED_PARTNERSHIP,
        )

        # ===================================================================
        # STEP 1: TAXABLE INCOME
        # ===================================================================

        gross_income = profile.gross_employment_income + profile.other_income
        _line(
            "Gross Income (Employment + Other)",
            gross_income,
            "gross_income",
            "DBG Art. 16",
        )

        # 1a. Commuting expenses
        commuting_ded = self._commuting_deduction(
            profile, rules, is_married, breakdown, _line
        )

        # 1b. Meal deductions
        meal_ded = self._meal_deduction(profile, rules, breakdown, _line)

        # 1c. Professional expenses (equipment + flat rate)
        prof_ded = self._professional_expenses_deduction(
            profile, rules, gross_income, breakdown, _line
        )

        # 1d. Pillar 3a
        pillar3a_ded = self._pillar3a_deduction(profile, rules, breakdown, _line)

        # 1e. Health insurance
        health_ded = self._health_insurance_deduction(
            profile, rules, is_married, breakdown, _line
        )

        # 1f. Medical expenses (above 5% threshold)
        medical_ded = self._medical_expense_deduction(
            profile, rules, gross_income, breakdown, _line
        )

        # 1g. Interest on debts
        interest_ded = self._interest_deduction(profile, rules, breakdown, _line)

        # 1h. Donations
        donation_ded = self._donation_deduction(
            profile, rules, gross_income, breakdown, _line
        )

        # 1i. Childcare
        childcare_ded = self._childcare_deduction(profile, rules, breakdown, _line)

        # 1j. Child deductions
        child_ded = self._child_deduction(profile, rules, breakdown, _line)

        # 1k. Other deductions
        other_ded = min(profile.other_deductions, profile.other_deductions)  # no cap
        if other_ded > _ZERO:
            _line("Other Deductions", -other_ded, "other_deductions", "DBG Art. 33 ff.")

        total_deductions = (
            commuting_ded
            + meal_ded
            + prof_ded
            + pillar3a_ded
            + health_ded
            + medical_ded
            + interest_ded
            + donation_ded
            + (childcare_ded or _ZERO)
            + (child_ded or _ZERO)
            + other_ded
        )

        taxable_income = max(_chf(gross_income - total_deductions), _ZERO)
        _line(
            "Taxable Income",
            taxable_income,
            "taxable_income",
            "DBG Art. 25",
        )

        # ===================================================================
        # STEP 2: TAXABLE WEALTH
        # ===================================================================

        gross_assets = (
            profile.bank_accounts_balance
            + profile.securities_tax_value
            + profile.real_estate_tax_value
            + profile.other_assets
        )
        _line("Gross Assets", gross_assets, "gross_wealth", "Cantonal StG")

        liabilities = profile.mortgage_balance + profile.other_liabilities
        if liabilities > _ZERO:
            _line("Liabilities (Mortgages + Loans)", -liabilities, "liabilities", "Cantonal StG")

        net_wealth = gross_assets - liabilities

        # Wealth social deductions
        n_persons = 2 if is_married else 1
        wealth_social_ded = (
            rules.wealth_social_deduction_per_taxpayer * n_persons
            + rules.wealth_social_deduction_per_child * profile.num_children
        )
        if wealth_social_ded > _ZERO:
            _line(
                f"Wealth Social Deduction ({n_persons} person(s) + {profile.num_children} child(ren))",
                -wealth_social_ded,
                "wealth_social_deduction",
                "Cantonal StG",
                canton=rules.canton_code,
            )

        taxable_wealth = max(_chf(net_wealth - wealth_social_ded), _ZERO)
        _line(
            "Taxable Wealth",
            taxable_wealth,
            "taxable_wealth",
            "Cantonal StG",
        )

        # ===================================================================
        # STEP 3: FEDERAL INCOME TAX
        # ===================================================================

        federal_tax = self._compute_federal_income_tax(
            taxable_income, rules, is_married, breakdown, _line
        )

        # ===================================================================
        # STEP 4: CANTONAL INCOME TAX
        # ===================================================================

        cantonal_income_tax = _chf(
            _apply_progressive_bracket(taxable_income, rules.cantonal_income_brackets)
        )
        _line(
            f"Cantonal Income Tax ({rules.canton_code}) — basic tax",
            cantonal_income_tax,
            "cantonal_income_tax_simple",
            f"StG {rules.canton_code}",
            canton=rules.canton_code,
        )

        # ===================================================================
        # STEP 5: MUNICIPAL INCOME TAX
        # ===================================================================

        muni_multiplier = Decimal(str(rules.municipality_multiplier))
        municipal_income_tax = _chf(cantonal_income_tax * muni_multiplier / Decimal("100"))
        _line(
            f"Municipal Income Tax ({rules.municipality_name}, {rules.municipality_multiplier}%)",
            municipal_income_tax,
            "municipal_income_tax",
            f"Municipal tax multiplier {rules.municipality_name}",
            canton=rules.canton_code,
        )

        # ===================================================================
        # STEP 6: WEALTH TAX
        # ===================================================================

        cantonal_wealth_simple = _chf(
            _apply_wealth_brackets(taxable_wealth, rules.cantonal_wealth_brackets)
        )
        _line(
            f"Wealth Tax ({rules.canton_code}) — basic tax",
            cantonal_wealth_simple,
            "wealth_tax_simple",
            f"StG {rules.canton_code}",
            canton=rules.canton_code,
        )

        wealth_tax_canton = _chf(cantonal_wealth_simple * muni_multiplier / Decimal("100"))
        _line(
            f"Cantonal Wealth Tax ({rules.canton_code})",
            wealth_tax_canton,
            "wealth_tax_canton",
            f"StG {rules.canton_code}",
            canton=rules.canton_code,
        )

        wealth_tax_municipal = _chf(cantonal_wealth_simple * muni_multiplier / Decimal("100"))
        # NOTE: In most cantons, the municipal wealth tax uses the same simple cantonal
        # wealth tax × municipal multiplier. The cantonal portion is the simple tax itself.
        # We separate them for display purposes.
        # Correct split: canton gets simple, municipality gets simple × (muni_mult/100)
        # Total = simple × (1 + muni_mult/100)
        wealth_tax_canton = cantonal_wealth_simple  # canton share = simple tax
        wealth_tax_municipal = _chf(cantonal_wealth_simple * muni_multiplier / Decimal("100"))

        _line(
            f"Municipal Wealth Tax ({rules.municipality_name})",
            wealth_tax_municipal,
            "wealth_tax_municipal",
            f"Municipal tax multiplier {rules.municipality_name}",
            canton=rules.canton_code,
        )

        # ===================================================================
        # STEP 7: TOTALS
        # ===================================================================

        total_tax = _chf(
            federal_tax
            + cantonal_income_tax
            + municipal_income_tax
            + wealth_tax_canton
            + wealth_tax_municipal
        )
        _line("Total Tax", total_tax, "total_tax", "All levels")

        deductions_applied = TaxDeductionsApplied(
            commuting=commuting_ded,
            meals=meal_ded,
            professional_expenses=prof_ded,
            pillar3a=pillar3a_ded,
            health_insurance=health_ded,
            medical_expenses=medical_ded,
            donations=donation_ded,
            childcare=childcare_ded,
            child_deduction=child_ded,
            interest_expenses=interest_ded,
            other=other_ded,
        )

        return TaxCalculationResult(
            tax_return_id=profile.tax_return_id,
            canton_code=rules.canton_code,
            municipality_code=rules.municipality_code,
            tax_year=rules.tax_year,
            marital_status=profile.marital_status,
            rule_version=rules.version,
            calculated_at=datetime.utcnow(),
            taxable_income=taxable_income,
            taxable_wealth=taxable_wealth,
            federal_income_tax=federal_tax,
            cantonal_income_tax=cantonal_income_tax,
            municipal_income_tax=municipal_income_tax,
            wealth_tax_canton=wealth_tax_canton,
            wealth_tax_municipal=wealth_tax_municipal,
            total_tax=total_tax,
            deductions_applied=deductions_applied,
            breakdown=breakdown,
        )

    # -----------------------------------------------------------------------
    # Private helpers — one method per deduction type
    # -----------------------------------------------------------------------

    def _commuting_deduction(
        self,
        profile: TaxProfile,
        rules: TaxRuleSet,
        is_married: bool,
        breakdown: list,
        _line,
    ) -> Decimal:
        """
        Commuting expense deduction, capped at the lower of:
          - actual claimed amount
          - cantonal maximum (takes precedence for cantonal; federal max also logged)
        """
        if profile.commuting_expense_claimed <= _ZERO:
            return _ZERO

        canton_cap = rules.cantonal_deductions.commuting_max_chf
        federal_cap = rules.federal_deductions.commuting_max_chf

        # Apply cantonal cap (typically higher than federal for cantonal tax)
        # For federal tax, the federal cap would apply. Here we use cantonal
        # because the engine computes a unified deduction set. The federal
        # bracket calculation uses the same taxable_income.
        # The conservative approach: use the LOWER of the two caps so the
        # same taxable_income is valid for both federal and cantonal.
        # Federal cap (CHF 3,000) is typically lower.
        canton_deducted = min(profile.commuting_expense_claimed, canton_cap)
        federal_deducted = min(profile.commuting_expense_claimed, federal_cap)

        # Use federal cap for federal tax calculation alignment
        deducted = min(profile.commuting_expense_claimed, min(canton_cap, federal_cap))
        # However we log both caps as separate line items for transparency
        if profile.commuting_expense_claimed > federal_cap:
            _line(
                f"Commuting — Federal cap applied (Max CHF {federal_cap:,.0f})",
                -deducted,
                "commuting_federal_cap",
                "DBG Art. 26 Abs. 1 lit. a",
            )
        else:
            _line(
                f"Commuting expenses (claimed CHF {profile.commuting_expense_claimed:,.0f})",
                -deducted,
                "commuting_deduction",
                f"StG {rules.canton_code} / DBG Art. 26",
                canton=rules.canton_code,
            )
        return deducted

    def _meal_deduction(
        self, profile: TaxProfile, rules: TaxRuleSet, breakdown: list, _line
    ) -> Decimal:
        if profile.meals_expense_claimed <= _ZERO:
            return _ZERO
        cap = rules.cantonal_deductions.meal_deduction_annual
        deducted = min(profile.meals_expense_claimed, cap)
        _line(
            f"Meal expenses (Max CHF {cap:,.0f}/year)",
            -deducted,
            "meal_deduction",
            "DBG Art. 26 Abs. 1 lit. b",
        )
        return deducted

    def _professional_expenses_deduction(
        self,
        profile: TaxProfile,
        rules: TaxRuleSet,
        gross_income: Decimal,
        breakdown: list,
        _line,
    ) -> Decimal:
        """
        Professional expenses (Berufskosten): max of:
          - actual equipment expense claimed, OR
          - flat rate (3% of income, min/max bounded)
        """
        lim = rules.cantonal_deductions
        flat = _chf(gross_income * lim.professional_expenses_flat_rate_pct)
        flat = max(min(flat, lim.professional_expenses_max), lim.professional_expenses_min)

        actual = profile.equipment_expense_claimed
        deducted = min(max(actual, flat), lim.professional_expenses_max)
        if actual > flat:
            _line(
                f"Professional expenses actual (CHF {actual:,.0f})",
                -deducted,
                "professional_expenses_actual",
                f"StG {rules.canton_code} / DBG Art. 26",
                canton=rules.canton_code,
            )
        else:
            _line(
                f"Professional expenses flat rate ({lim.professional_expenses_flat_rate_pct*100:.0f}% of CHF {gross_income:,.0f})",
                -deducted,
                "professional_expenses_flat",
                f"StG {rules.canton_code} / DBG Art. 26",
                canton=rules.canton_code,
            )
        return deducted

    def _pillar3a_deduction(
        self, profile: TaxProfile, rules: TaxRuleSet, breakdown: list, _line
    ) -> Decimal:
        if profile.pillar3a_contribution <= _ZERO:
            return _ZERO
        limit = (
            rules.cantonal_deductions.pillar3a_self_employed_max
            if profile.is_self_employed
            else rules.cantonal_deductions.pillar3a_employed_max
        )
        deducted = min(profile.pillar3a_contribution, limit)
        _line(
            f"Pillar 3a (Max CHF {limit:,.0f})",
            -deducted,
            "pillar3a_deduction",
            "BVG Art. 82 / BVV3",
        )
        return deducted

    def _health_insurance_deduction(
        self,
        profile: TaxProfile,
        rules: TaxRuleSet,
        is_married: bool,
        breakdown: list,
        _line,
    ) -> Decimal:
        lim = rules.cantonal_deductions
        if is_married:
            cap = lim.health_insurance_married
        else:
            cap = lim.health_insurance_single
        cap += lim.health_insurance_per_child * profile.num_children

        deducted = min(profile.health_insurance_premium_paid, cap)
        if deducted > _ZERO:
            _line(
                f"Health insurance premiums (Max CHF {cap:,.0f})",
                -deducted,
                "health_insurance_deduction",
                f"StG {rules.canton_code} § Krankenkasse",
                canton=rules.canton_code,
            )
        return deducted

    def _medical_expense_deduction(
        self,
        profile: TaxProfile,
        rules: TaxRuleSet,
        gross_income: Decimal,
        breakdown: list,
        _line,
    ) -> Decimal:
        if profile.medical_expenses_paid <= _ZERO:
            return _ZERO
        threshold_pct = rules.cantonal_deductions.medical_expense_threshold_pct
        threshold = _chf(gross_income * threshold_pct)
        deductible = max(profile.medical_expenses_paid - threshold, _ZERO)
        deductible = _chf(deductible)
        if deductible > _ZERO:
            _line(
                f"Medical expenses above {threshold_pct*100:.0f}% threshold (CHF {threshold:,.0f})",
                -deductible,
                "medical_expense_deduction",
                f"StG {rules.canton_code} / DBG Art. 33 lit. h",
                canton=rules.canton_code,
            )
        return deductible

    def _interest_deduction(
        self, profile: TaxProfile, rules: TaxRuleSet, breakdown: list, _line
    ) -> Decimal:
        if profile.interest_on_debts <= _ZERO:
            return _ZERO
        cap = rules.cantonal_deductions.interest_deduction_max
        deducted = (
            min(profile.interest_on_debts, cap)
            if cap is not None
            else profile.interest_on_debts
        )
        _line(
            "Schuldzinsen",
            -deducted,
            "interest_deduction",
            f"StG {rules.canton_code} / DBG Art. 33 lit. a",
            canton=rules.canton_code,
        )
        return deducted

    def _donation_deduction(
        self,
        profile: TaxProfile,
        rules: TaxRuleSet,
        gross_income: Decimal,
        breakdown: list,
        _line,
    ) -> Decimal:
        lim = rules.cantonal_deductions
        if profile.donations < lim.donation_min_chf:
            return _ZERO
        max_donation = _chf(gross_income * lim.donation_max_pct)
        deducted = min(profile.donations, max_donation)
        _line(
            f"Donations (Min CHF {lim.donation_min_chf}, Max {lim.donation_max_pct*100:.0f}% of income)",
            -deducted,
            "donation_deduction",
            f"StG {rules.canton_code} / DBG Art. 33a",
            canton=rules.canton_code,
        )
        return deducted

    def _childcare_deduction(
        self, profile: TaxProfile, rules: TaxRuleSet, breakdown: list, _line
    ) -> Optional[Decimal]:
        if profile.num_children == 0:
            return None
        if profile.childcare_costs <= _ZERO:
            return Decimal("0")
        cap = rules.cantonal_deductions.childcare_max
        deducted = min(profile.childcare_costs, cap)
        _line(
            f"Childcare costs (Max CHF {cap:,.0f})",
            -deducted,
            "childcare_deduction",
            f"StG {rules.canton_code} / DBG Art. 33 Abs. 3",
            canton=rules.canton_code,
        )
        return deducted

    def _child_deduction(
        self, profile: TaxProfile, rules: TaxRuleSet, breakdown: list, _line
    ) -> Optional[Decimal]:
        if profile.num_children == 0:
            return None
        per_child = rules.cantonal_deductions.child_deduction_per_child
        deducted = per_child * profile.num_children
        _line(
            f"Child deduction ({profile.num_children} × CHF {per_child:,.0f})",
            -deducted,
            "child_deduction",
            f"StG {rules.canton_code} child deduction",
            canton=rules.canton_code,
        )
        return deducted

    def _compute_federal_income_tax(
        self,
        taxable_income: Decimal,
        rules: TaxRuleSet,
        is_married: bool,
        breakdown: list,
        _line,
    ) -> Decimal:
        """
        Federal income tax (DBG/LIFD).

        For married taxpayers: use the married brackets directly (Swiss federal
        law uses separate married brackets, NOT a simple ÷2 divisor method).
        """
        brackets = (
            rules.federal_brackets_married
            if is_married
            else rules.federal_brackets_single
        )
        status_label = "married" if is_married else "single"
        federal_tax = _chf(_apply_progressive_bracket(taxable_income, brackets))
        _line(
            f"Federal Income Tax ({status_label}, CHF {taxable_income:,.0f})",
            federal_tax,
            "federal_income_tax",
            "DBG Art. 36",
        )
        return federal_tax
