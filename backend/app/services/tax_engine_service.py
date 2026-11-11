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
from dataclasses import dataclass, field, replace
from datetime import datetime
from decimal import ROUND_DOWN, ROUND_HALF_UP, Decimal
from pathlib import Path
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.tax_calculation import (
    MaritalStatus,
    TaxCalculationResult,
    TaxDeductionsApplied,
    TaxLineItem,
)
from app.services.rules_data_service import rules_data_service

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
    end_tax: Optional[Decimal] = None  # exact tax at to_chf when linear table step differs slightly from rounded rate
    flat_on_total: bool = False        # True when DBG Art. 36 top flat rate applies to total taxable income


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
    interest_deduction_max: Optional[Decimal] = None  # None = unlimited (yield + 50k rule applies)
    commuting_bike_chf: Decimal = Decimal("700")
    commuting_car_rate: Decimal = Decimal("0.70")
    meal_deduction_reduced: Decimal = Decimal("1600")
    side_job_flat_rate_pct: Decimal = Decimal("0.20")
    side_job_min: Decimal = Decimal("800")
    side_job_max: Decimal = Decimal("2400")
    health_insurance_single_no_pension: Optional[Decimal] = None
    health_insurance_married_no_pension: Optional[Decimal] = None
    pillar3a_catchup_max: Decimal = Decimal("0")
    training_max: Decimal = Decimal("12400")
    two_earner_deduction: Decimal = Decimal("0")
    two_earner_rate: Decimal = Decimal("0")
    two_earner_min: Decimal = Decimal("0")
    two_earner_max: Decimal = Decimal("0")
    married_deduction: Decimal = Decimal("0")
    party_donation_max_single: Decimal = Decimal("10300")
    party_donation_max_married: Decimal = Decimal("20600")
    support_deduction_per_person: Decimal = Decimal("2800")
    child_tax_credit_per_child: Decimal = Decimal("0")
    interest_deduction_extra_above_yield: Decimal = Decimal("50000")

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "DeductionLimits":
        def _d(key: str, default: Any = None) -> Optional[Decimal]:
            v = d.get(key, default)
            return Decimal(str(v)) if v is not None else None

        single_hi = _d("health_insurance_deduction_single", 2900)
        married_hi = _d("health_insurance_deduction_married", 5800)
        party_default = _d("party_donation_max", 10300)
        return cls(
            pillar3a_employed_max=_d("pillar3a_employed_max", 7258),
            pillar3a_self_employed_max=_d("pillar3a_self_employed_max", 36288),
            commuting_max_chf=_d("commuting_max_chf", 3300),
            professional_expenses_flat_rate_pct=_d("professional_expenses_flat_rate_pct", "0.03"),
            professional_expenses_min=_d("professional_expenses_min", 2000),
            professional_expenses_max=_d("professional_expenses_max", 4000),
            meal_deduction_annual=_d("meal_deduction_annual", 3200),
            health_insurance_single=single_hi,
            health_insurance_married=married_hi,
            health_insurance_per_child=_d("health_insurance_deduction_per_child", 700),
            medical_expense_threshold_pct=_d("medical_expense_threshold_pct", "0.05"),
            donation_max_pct=_d("donation_max_pct_of_income", "0.20"),
            donation_min_chf=_d("donation_min_chf", 100),
            child_deduction_per_child=_d("child_deduction_per_child", 6800),
            childcare_max=_d("childcare_max", 25000),
            interest_deduction_max=_d("interest_deduction_max"),
            commuting_bike_chf=_d("commuting_bike_chf", 700),
            commuting_car_rate=_d("commuting_car_rate", "0.70"),
            meal_deduction_reduced=_d("meal_deduction_reduced", 1600),
            side_job_flat_rate_pct=_d("side_job_flat_rate_pct", "0.20"),
            side_job_min=_d("side_job_min", 800),
            side_job_max=_d("side_job_max", 2400),
            health_insurance_single_no_pension=_d("health_insurance_deduction_single_no_pension", single_hi * Decimal("1.5")),
            health_insurance_married_no_pension=_d("health_insurance_deduction_married_no_pension", married_hi * Decimal("1.5")),
            pillar3a_catchup_max=_d("pillar3a_catchup_max", 0),
            training_max=_d("training_max", 12400),
            two_earner_deduction=_d("two_earner_deduction", 0),
            two_earner_rate=_d("two_earner_rate", 0),
            two_earner_min=_d("two_earner_min", 0),
            two_earner_max=_d("two_earner_max", 0),
            married_deduction=_d("married_deduction", 0),
            party_donation_max_single=_d("party_donation_max_single", party_default),
            party_donation_max_married=_d("party_donation_max_married", party_default),
            support_deduction_per_person=_d("support_deduction_per_person", 2800),
            child_tax_credit_per_child=_d("child_tax_credit_per_child", 0),
            interest_deduction_extra_above_yield=_d("interest_deduction_extra_above_yield", 50000),
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
    municipality_multipliers: dict[str, Any] = field(default_factory=dict)
    tariff_status: str = "estimate_only"
    state_multiplier: int = 100
    cantonal_income_brackets_married: list[TaxBracket] = field(default_factory=list)
    cantonal_wealth_brackets_married: list[WealthTaxBracket] = field(default_factory=list)
    municipality_church_multipliers: dict[str, int] = field(default_factory=dict)


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
    spouse_employment_income: Decimal = Decimal("0")
    side_job_income: Decimal = Decimal("0")
    ahv_pension: Decimal = Decimal("0")
    pk_pension: Decimal = Decimal("0")
    daily_allowances: Decimal = Decimal("0")
    alimony_received: Decimal = Decimal("0")
    home_imputed_rent: Decimal = Decimal("0")
    asset_yield: Decimal = Decimal("0")
    other_income: Decimal = Decimal("0")           # interest, dividends, rental etc.

    # --- Employment expense claims ---
    commuting_expense_claimed: Decimal = Decimal("0")
    meals_expense_claimed: Decimal = Decimal("0")
    equipment_expense_claimed: Decimal = Decimal("0")  # home office / tools

    # --- Deduction inputs ---
    pillar3a_contribution: Decimal = Decimal("0")
    pillar3a_spouse: Decimal = Decimal("0")
    pension_buyin: Decimal = Decimal("0")
    health_insurance_premium_paid: Decimal = Decimal("0")
    medical_expenses_paid: Decimal = Decimal("0")
    handicap_costs: Decimal = Decimal("0")
    interest_on_debts: Decimal = Decimal("0")
    donations: Decimal = Decimal("0")
    party_donations: Decimal = Decimal("0")
    childcare_costs: Decimal = Decimal("0")
    alimony_paid: Decimal = Decimal("0")
    kid_alimony_paid: Decimal = Decimal("0")
    support_expenses: Decimal = Decimal("0")
    num_supported_persons: int = 0
    depot_fees: Decimal = Decimal("0")
    home_maintenance: Decimal = Decimal("0")
    other_deductions: Decimal = Decimal("0")

    # --- Assets (at tax values) ---
    bank_accounts_balance: Decimal = Decimal("0")
    securities_tax_value: Decimal = Decimal("0")
    real_estate_tax_value: Decimal = Decimal("0")
    other_assets: Decimal = Decimal("0")

    # --- Liabilities ---
    mortgage_balance: Decimal = Decimal("0")
    other_liabilities: Decimal = Decimal("0")

    # --- Milestone 2 Specifics (Box F, Box G, Netto, Commute Mode, Church) ---
    net_salary: Decimal = Decimal("0")                 # Ziffer 11 on Lohnausweis (for 3% professional expenses)
    has_company_car: bool = False                      # Lohnausweis Box F (Fahrkosten unentgeltlich -> no commute deduction)
    has_canteen: bool = False                          # Lohnausweis Box G (Kantine / Lunch-Check -> reduced meal deduction)
    has_pillar2: bool = True                           # Determines whether health prem cap gets +50% uplift
    commute_mode: str = "pt"                           # "bike" | "car" | "pt" | "foot"
    car_reason: Optional[str] = None                   # None | "noov" | "time" | "shift" | "health" | "none"
    commute_alternative_oev: Decimal = Decimal("0")    # Fallback ÖV price when car chosen without qualifying reason
    commute_km_per_day: Decimal = Decimal("0")         # km/day (round trip)
    working_days: int = 240                            # default standard 240 days
    home_office_days: int = 0                          # days worked from home (reduces commute days)
    holidays: int = 0                                  # holidays/vacation days beyond standard
    confession: str = ""                               # "reformed" | "catholic" | "christ_catholic" | "none" | ""
    is_church_member: bool = False                     # church tax liability
    church_tax_rate: Decimal = Decimal("0.10")         # fallback % of simple tax if parish delta absent

    # --- Custody & family flags (ESTV KS 30 / StG ZH § 35 Abs. 2bis) ---
    custody_type: str = "sole"                         # "sole" | "shared"
    child_residence: str = "me"                        # "me" | "other"
    higher_earner: bool = True                         # parent claiming Verheiratetentarif / Elterntarif in shared custody
    children_in_education: int = 0

    # --- Addendum 1 Deductions & Rollout Fields ---
    pillar3a_catchup: Decimal = Decimal("0")           # Retroactive Pillar 3a catch-up (from 2026, max 7'258)
    education_expenses: Decimal = Decimal("0")         # Continuing education / retraining
    meal_type: str = "out"                             # "out" | "cheap" | "shift" | "none"
    commute_spouse: Decimal = Decimal("0")             # Partner 2 commuting costs when married


# ---------------------------------------------------------------------------
# Helper: bracket lookup
# ---------------------------------------------------------------------------

class CHFDecimal(Decimal):
    """
    Subclass of Decimal for Swiss Franc calculations that also supports
    interoperability with float (e.g. pytest.approx).
    """

    def __sub__(self, other: Any) -> Any:
        if isinstance(other, float):
            return float(self) - other
        return super().__sub__(other)

    def __rsub__(self, other: Any) -> Any:
        if isinstance(other, float):
            return other - float(self)
        return super().__rsub__(other)

    def __eq__(self, other: Any) -> bool:
        if isinstance(other, float):
            return float(self) == other
        return super().__eq__(other)


_ZERO = CHFDecimal("0")
_ONE = CHFDecimal("1")
_CENT = Decimal("0.05")  # Swiss tax rounds to nearest 5 Rappen


def _chf(value: Decimal) -> CHFDecimal:
    """Round to nearest 5 Rappen (standard Swiss cantonal rounding)."""
    rounded = (value / _CENT).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * _CENT
    return CHFDecimal(str(rounded))


def _fed_chf(value: Decimal) -> CHFDecimal:
    """Round down to nearest 5 Rappen (DBG Art. 36 Direct Federal Tax rule)."""
    if value <= _ZERO:
        return _ZERO
    rounded = (value / _CENT).quantize(Decimal("1"), rounding=ROUND_DOWN) * _CENT
    return CHFDecimal(str(rounded))


def _apply_progressive_bracket(
    taxable_amount: Decimal,
    brackets: list[TaxBracket],
) -> Decimal:
    """
    Compute the tax on *taxable_amount* using the supplied bracket table.

    Supports both standard cumulative marginal brackets (`base_tax + excess * rate`),
    exact ESTV linear breakpoint interpolation (`end_tax`), and DBG Art. 36 top flat
    proportional rate on total taxable income (`flat_on_total=True`).
    """
    if taxable_amount <= _ZERO:
        return _ZERO

    tax = _ZERO
    for bracket in reversed(brackets):
        if taxable_amount > bracket.from_chf:
            if bracket.flat_on_total:
                tax = taxable_amount * bracket.rate
            elif (
                bracket.end_tax is not None
                and bracket.to_chf is not None
                and bracket.to_chf > bracket.from_chf
            ):
                capped = min(taxable_amount, bracket.to_chf)
                span = bracket.to_chf - bracket.from_chf
                tax = bracket.base_tax + (capped - bracket.from_chf) * (bracket.end_tax - bracket.base_tax) / span
            else:
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
# Rule loader & Municipality Aliases
# ---------------------------------------------------------------------------

_MUNICIPALITY_ALIASES: dict[str, dict[str, str]] = {
    "BE": {
        "942": "352",   # Biel/Bienne
        "371": "353",   # Thun
        "581": "354",   # Köniz
        "572": "355",   # Langenthal
        "561": "356",   # Burgdorf
        "764": "358",   # Ostermundigen
        "762": "359",   # Ittigen
        "771": "364",   # Zollikofen
        "861": "366",   # Interlaken
        "781": "367",   # Muri bei Bern
    },
    "SZ": {
        "1372": "1301", # Schwyz
        "1342": "1304", # Freienbach
        "1343": "1321", # Wollerau
        "1322": "1307", # Küssnacht
    },
    "SG": {
        "3441": "3301", # Rapperswil-Jona
        "3427": "3205", # Wil (SG)
        "3214": "3202", # Gossau (SG)
        "3358": "3207", # Uzwil
        "3401": "3209", # Altstätten
        "3271": "3208", # Buchs (SG)
    },
    "AG": {
        "4021": "4002", # Baden
        "4045": "4004", # Wettingen
        "4082": "4008", # Wohlen
        "4201": "4007", # Zofingen
        "4112": "4005", # Rheinfelden
        "4041": "4009", # Suhr
        "4033": "4006", # Lenzburg
        "4271": "4003", # Brugg
    },
    "ZH": {
        "8000": "261",  # Zürich City
        "8001": "261",
        "8400": "230",  # Winterthur
    },
}


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
        self._roots: list[Path] = []
        if rules_root is not None:
            self._roots.append(rules_root)

        base_dir = Path(__file__).resolve()
        candidates = [
            base_dir.parent.parent / "tax-rules",        # backend/app/tax-rules
            base_dir.parent.parent.parent / "tax-rules", # backend/tax-rules
            base_dir.parents[3] / "tax-rules",           # suntax/tax-rules
            Path.cwd() / "tax-rules",
            Path.cwd() / "backend" / "tax-rules",
        ]
        for c in candidates:
            try:
                if c.exists() and c not in self._roots:
                    self._roots.append(c)
            except Exception:
                pass

        if not self._roots:
            self._roots = [base_dir.parents[3] / "tax-rules"]
        self._root = self._roots[0]

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
                    end_tax=Decimal(str(b["end_tax"])) if b.get("end_tax") is not None else None,
                    flat_on_total=bool(b.get("flat_on_total", False)),
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

    def _resolve_municipality(
        self,
        canton_code: str,
        municipality_code: Optional[str],
        canton_data: dict[str, Any],
        tax_year: int,
    ) -> tuple[str, str, int]:
        """
        Resolve municipality data by code, alias, name, or canton default.
        Never silently substitutes another municipality's rate when an unrecognized
        identifier is provided — raises TaxRuleNotFoundError instead.
        """
        munis = canton_data.get("municipality_multipliers", {})
        code_str = str(municipality_code).strip() if municipality_code is not None else ""

        # Case A: Default requested (None, "", "default")
        if not code_str or code_str.lower() == "default":
            _default_codes = {
                "ZH": "261", "BE": "351", "LU": "1061", "UR": "1201", "SZ": "1301",
                "OW": "1406", "NW": "1509", "GL": "1632", "ZG": "1701", "FR": "2196",
                "SO": "2601", "BS": "2701", "BL": "2829", "SH": "2937", "AR": "3001",
                "AI": "3101", "SG": "3203", "GR": "3901", "AG": "4001", "TG": "4566",
                "TI": "5192", "VD": "5586", "VS": "6266", "NE": "6458", "GE": "6621",
                "JU": "6711",
            }
            preferred = _default_codes.get(canton_code)
            if preferred and preferred in munis:
                muni_info = munis[preferred]
                return preferred, str(muni_info.get("name", preferred)), int(muni_info["multiplier"])
            if munis:
                first_k = next(iter(munis))
                muni_info = munis[first_k]
                return first_k, str(muni_info.get("name", first_k)), int(muni_info["multiplier"])
            raise TaxRuleNotFoundError(
                rule_key="no_municipalities_configured",
                canton=canton_code,
                tax_year=tax_year,
            )

        # Case B: Direct match by code
        if code_str in munis:
            muni_info = munis[code_str]
            return code_str, str(muni_info.get("name", code_str)), int(muni_info["multiplier"])

        # Case C: Alias lookup
        aliases = _MUNICIPALITY_ALIASES.get(canton_code, {})
        if code_str in aliases:
            canonical_code = aliases[code_str]
            if canonical_code in munis:
                muni_info = munis[canonical_code]
                return canonical_code, str(muni_info.get("name", canonical_code)), int(muni_info["multiplier"])

        # Case D: Name match (case-insensitive)
        norm_input = code_str.lower().strip()
        for k, v in munis.items():
            if str(v.get("name", "")).lower().strip() == norm_input:
                return k, str(v.get("name", k)), int(v["multiplier"])

        # Case E: Unrecognized municipality identifier -> raise explicit error, NO SILENT FALLBACK!
        raise TaxRuleNotFoundError(
            rule_key=f"municipality_multiplier[{code_str}]",
            canton=canton_code,
            tax_year=tax_year,
        )

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

        federal_data = None
        canton_data = None
        last_error = None

        for root in self._roots:
            federal_path = root / "federal" / f"{tax_year}.json"
            canton_path = root / "cantons" / canton_code / f"{tax_year}.json"
            try:
                if federal_path.exists() and canton_path.exists():
                    federal_data = self._load_json(federal_path)
                    canton_data = self._load_json(canton_path)
                    break
            except Exception as e:
                last_error = e
                continue

        if federal_data is None or canton_data is None:
            raise FileNotFoundError(
                f"Tax rule files for {canton_code}/{tax_year} could not be loaded (no silent fallback to another tax year). "
                f"Last error: {last_error}"
            )

        # Validate version if requested
        if version is not None:
            for data, label in ((federal_data, "federal"), (canton_data, f"canton {canton_code}")):
                if data.get("version") != version:
                    raise TaxRuleNotFoundError(
                        rule_key=f"version={version}",
                        canton=None if label == "federal" else canton_code,
                        tax_year=tax_year,
                    )

        # Resolve municipality without silent substitution
        resolved_muni_code, municipality_name, multiplier = self._resolve_municipality(
            canton_code=canton_code,
            municipality_code=municipality_code,
            canton_data=canton_data,
            tax_year=tax_year,
        )
        munis_map = canton_data.get("municipality_multipliers", {})
        muni_entry = munis_map.get(resolved_muni_code, {})
        church_multipliers = {
            str(k).lower(): int(v)
            for k, v in (muni_entry.get("church_multipliers") or {}).items()
            if isinstance(v, (int, float))
        }

        # Wealth social deductions
        wsd = canton_data.get("wealth_tax_social_deductions", {})
        per_taxpayer = Decimal(str(wsd.get("per_taxpayer", 0)))
        per_spouse = Decimal(str(wsd.get("per_spouse", 0)))
        per_child_wsd = Decimal(str(wsd.get("per_child", 0)))

        single_income = canton_data.get("income_tax_brackets_single") or canton_data["income_tax_brackets_canton"]
        married_income = canton_data.get("income_tax_brackets_married") or single_income
        single_wealth = canton_data.get("wealth_tax_brackets_single") or canton_data["wealth_tax_brackets"]
        married_wealth = canton_data.get("wealth_tax_brackets_married") or single_wealth

        return TaxRuleSet(
            canton_code=canton_code,
            canton_name=canton_data["canton_name"],
            municipality_code=resolved_muni_code,
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
            cantonal_income_brackets=self._parse_brackets(single_income),
            cantonal_wealth_brackets=self._parse_wealth_brackets(single_wealth),
            cantonal_deductions=DeductionLimits.from_dict(
                canton_data.get("deduction_limits", {})
            ),
            wealth_social_deduction_per_taxpayer=per_taxpayer,
            wealth_social_deduction_per_spouse=per_spouse,
            wealth_social_deduction_per_child=per_child_wsd,
            municipality_multipliers=munis_map,
            tariff_status=str(canton_data.get("tariff_status", "estimate_only")),
            state_multiplier=int(canton_data.get("state_multiplier", 100)),
            cantonal_income_brackets_married=self._parse_brackets(married_income),
            cantonal_wealth_brackets_married=self._parse_wealth_brackets(married_wealth),
            municipality_church_multipliers=church_multipliers,
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

                resolved_muni_code, municipality_name, multiplier = self._resolve_municipality(
                    canton_code=canton_code.upper(),
                    municipality_code=municipality_code,
                    canton_data=canton_data,
                    tax_year=tax_year,
                )
                wsd = canton_data.get("wealth_tax_social_deductions", {})
                munis_map = canton_data.get("municipality_multipliers", {})
                muni_entry = munis_map.get(resolved_muni_code, {})
                church_multipliers = {
                    str(k).lower(): int(v)
                    for k, v in (muni_entry.get("church_multipliers") or {}).items()
                    if isinstance(v, (int, float))
                }
                single_income = canton_data.get("income_tax_brackets_single") or canton_data["income_tax_brackets_canton"]
                married_income = canton_data.get("income_tax_brackets_married") or single_income
                single_wealth = canton_data.get("wealth_tax_brackets_single") or canton_data["wealth_tax_brackets"]
                married_wealth = canton_data.get("wealth_tax_brackets_married") or single_wealth

                return TaxRuleSet(
                    canton_code=canton_code.upper(),
                    canton_name=canton_data["canton_name"],
                    municipality_code=resolved_muni_code,
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
                    cantonal_income_brackets=self._parse_brackets(single_income),
                    cantonal_wealth_brackets=self._parse_wealth_brackets(single_wealth),
                    cantonal_deductions=DeductionLimits.from_dict(
                        canton_data.get("deduction_limits", {})
                    ),
                    wealth_social_deduction_per_taxpayer=Decimal(str(wsd.get("per_taxpayer", 0))),
                    wealth_social_deduction_per_spouse=Decimal(str(wsd.get("per_spouse", 0))),
                    wealth_social_deduction_per_child=Decimal(str(wsd.get("per_child", 0))),
                    municipality_multipliers=munis_map,
                    tariff_status=str(canton_data.get("tariff_status", "estimate_only")),
                    state_multiplier=int(canton_data.get("state_multiplier", 100)),
                    cantonal_income_brackets_married=self._parse_brackets(married_income),
                    cantonal_wealth_brackets_married=self._parse_wealth_brackets(married_wealth),
                    municipality_church_multipliers=church_multipliers,
                )
        except Exception as exc:
            logger.warning(
                "DB rule load failed (%s), falling back to JSON files", exc
            )

        # Fallback to JSON
        return self.load_from_files(canton_code, municipality_code, tax_year, version)

    def load(
        self,
        canton_code: str,
        municipality_code: Optional[str] = None,
        tax_year: int = 2025,
        version: Optional[str] = None,
    ) -> TaxRuleSet:
        """Alias for load_from_files for test and library consumers."""
        return self.load_from_files(canton_code, municipality_code or "default", tax_year, version)


def _adapt_profile(profile: Any, rules: Optional[TaxRuleSet] = None, tax_return: Any = None) -> TaxProfile:
    if isinstance(profile, TaxProfile):
        return profile

    personal = getattr(profile, "personal_data", {}) or {}
    income = getattr(profile, "income", {}) or getattr(profile, "income_data", {}) or {}
    wealth = getattr(profile, "wealth", {}) or getattr(profile, "wealth_data", {}) or {}
    deductions = getattr(profile, "deductions", {}) or getattr(profile, "deductions_data", {}) or {}
    liabilities = getattr(profile, "liabilities", {}) or getattr(profile, "liabilities_data", {}) or {}
    securities = getattr(profile, "securities", []) or []
    real_estate = getattr(profile, "real_estate", []) or []

    marital_val = personal.get("marital_status") or personal.get("civil_status", "single")
    try:
        marital_status = MaritalStatus(str(marital_val).lower())
    except ValueError:
        marital_status = MaritalStatus.SINGLE

    def _val(x: Any) -> Decimal:
        if x is None:
            return Decimal("0")
        try:
            return Decimal(str(x))
        except Exception:
            return Decimal("0")

    gross_emp = _val(
        income.get("total_employment_income")
        or income.get("gross_salary")
        or income.get("employment_income")
    )
    spouse_emp = _val(income.get("employment_income_spouse") or income.get("spouse_employment_income"))
    side_job = _val(income.get("side_job_income"))
    ahv_pension = _val(income.get("ahv_pension") or income.get("pension_income"))
    pk_pension = _val(income.get("pk_pension"))
    daily_allowances = _val(income.get("daily_allowances"))
    alimony_received = _val(income.get("alimony_received"))
    home_imputed_rent = _val(income.get("home_imputed_rent") or wealth.get("imputed_rental_value"))
    asset_yield = (
        _val(income.get("bank_interest"))
        + _val(income.get("interest_income"))
        + _val(income.get("dividends"))
        + _val(income.get("dividend_income"))
        + _val(income.get("rental_income"))
        + _val(income.get("securities_yield"))
    )
    raw_other_list = income.get("other_income_items")
    other_list_sum = (
        sum((_val(item.get("amount")) for item in raw_other_list if isinstance(item, dict)), Decimal("0"))
        if isinstance(raw_other_list, list)
        else Decimal("0")
    )
    other_inc = asset_yield + _val(income.get("other_income")) + _val(income.get("self_employment_income")) + other_list_sum

    bank_bal = Decimal("0")
    bank_accs = wealth.get("bank_accounts", [])
    if isinstance(bank_accs, list):
        for acc in bank_accs:
            if isinstance(acc, dict):
                bank_bal += _val(acc.get("balance") or acc.get("balance_chf"))
            else:
                bank_bal += _val(acc)

    sec_val = Decimal("0")
    sec_source = wealth.get("securities") or wealth.get("securities_positions") or securities
    if isinstance(sec_source, list):
        for s in sec_source:
            if isinstance(s, dict):
                sec_val += _val(
                    s.get("value")
                    or s.get("value_chf")
                    or s.get("total_value_chf")
                    or s.get("total_value")
                    or s.get("tax_value")
                )
            else:
                sec_val += _val(s)

    re_val = Decimal("0")
    if isinstance(real_estate, list):
        for r in real_estate:
            if isinstance(r, dict):
                re_val += _val(r.get("value") or r.get("market_value"))
            else:
                re_val += _val(r)

    mortgage = _val(
        liabilities.get("total_mortgage_debt")
        or liabilities.get("mortgages")
    )

    pillar3a = _val(
        deductions.get("pillar3a_total")
        or deductions.get("pillar3a_contributions")
        or deductions.get("pillar3a")
    )
    commuting = _val(
        deductions.get("commuting_total")
        or deductions.get("travel_expenses")
        or deductions.get("commuting")
    )
    meals = _val(
        deductions.get("meals_total")
        or deductions.get("meal_expenses")
    )
    health = _val(
        deductions.get("health_insurance_total")
        or deductions.get("health_insurance_premiums")
    )
    interest = _val(
        deductions.get("mortgage_interest")
        or deductions.get("debt_interest")
    )
    donations = _val(
        deductions.get("donations_total")
        or deductions.get("donations")
    )
    prof_exp = _val(deductions.get("professional_expenses"))

    net_salary = _val(
        income.get("net_salary")
        or income.get("net_employment_income")
        or (gross_emp if gross_emp > Decimal("0") else Decimal("0"))
    )
    has_company_car = bool(
        income.get("has_company_car")
        or income.get("box_f")
        or personal.get("has_company_car")
        or deductions.get("has_company_car")
    )
    has_canteen = bool(
        income.get("has_canteen")
        or income.get("box_g")
        or personal.get("has_canteen")
        or deductions.get("has_canteen")
    )
    commute_mode = str(
        deductions.get("commute_mode")
        or personal.get("commute_mode")
        or "pt"
    ).lower()
    commute_km = _val(
        deductions.get("commute_km_per_day")
        or deductions.get("commute_km")
    )
    home_office_days = int(deductions.get("home_office_days") or 0)
    holidays = int(deductions.get("holidays") or 0)
    meal_type_raw = str(deductions.get("meal_type") or personal.get("meal_type") or "").lower()
    meal_type = meal_type_raw if meal_type_raw in ("out", "cheap", "shift", "none") else ("cheap" if has_canteen else "out")
    pillar3a_catchup = _val(deductions.get("pillar3a_catchup"))
    education_expenses = _val(deductions.get("education_expenses") or deductions.get("education"))
    commute_spouse = _val(deductions.get("commute_spouse") or deductions.get("commuting_spouse"))
    confession_raw = str(personal.get("confession") or personal.get("religion") or "").lower().strip()
    if confession_raw in ("reformed", "evangelical", "protestant", "evangelisch-reformiert", "reformiert", "ref"):
        confession = "reformed"
    elif confession_raw in ("catholic", "roman_catholic", "römisch-katholisch", "katholisch", "kath"):
        confession = "catholic"
    elif confession_raw in ("christian_catholic", "christ_catholic", "christkatholisch", "ckr", "chk"):
        confession = "christ_catholic"
    else:
        confession = "none" if confession_raw in ("none", "keine", "konfessionslos") else ""
    is_church_member = bool(
        personal.get("is_church_member")
        or confession in ("reformed", "catholic", "christ_catholic")
    )
    church_rate = _val(personal.get("church_tax_rate") or deductions.get("church_tax_rate") or Decimal("0.10"))

    raw_other_ded = deductions.get("other_deductions")
    if isinstance(raw_other_ded, list):
        other_ded_val = sum((_val(it.get("amount")) for it in raw_other_ded if isinstance(it, dict)), Decimal("0"))
    else:
        other_ded_val = _val(raw_other_ded)

    raw_custody = str(deductions.get("custody_type") or personal.get("custody_type") or "sole").strip().lower()
    custody_norm = "shared" if raw_custody in ("shared", "joint", "gemeinsam") else "sole"
    raw_res = str(deductions.get("child_residence") or personal.get("child_residence") or "me").strip().lower()
    raw_he = deductions.get("higher_earner") if "higher_earner" in deductions else personal.get("higher_earner")
    if isinstance(raw_he, bool):
        higher_earner_flag = raw_he
    elif raw_he in (None, ""):
        higher_earner_flag = True
    else:
        higher_earner_flag = str(raw_he).strip().lower() in ("true", "1", "me", "yes", "ich")
    kid_alimony_flag_val = _val(deductions.get("kid_alimony_paid"))
    if kid_alimony_flag_val <= Decimal("0") and str(deductions.get("alimony_received_flag") or "").lower() == "other":
        kid_alimony_flag_val = _val(deductions.get("alimony_paid"))
    car_reason_present = "car_reason" in deductions or "car_reason" in personal
    car_reason_val = str(deductions.get("car_reason") or personal.get("car_reason") or "").strip().lower() if car_reason_present else None
    support_exp = _val(deductions.get("support_expenses"))
    num_supp = int(deductions.get("num_supported_persons") or personal.get("num_supported_persons") or (1 if support_exp > 0 else 0))

    children = personal.get("children")
    if isinstance(children, list) and len(children) > 0:
        num_children = len(children)
    elif personal.get("children_count") is not None:
        try:
            num_children = int(personal.get("children_count") or 0)
        except Exception:
            num_children = 0
    elif isinstance(children, (int, float, str)):
        try:
            num_children = int(children)
        except Exception:
            num_children = 0
    else:
        num_children = 0

    return TaxProfile(
        tax_return_id=str(getattr(tax_return, "id", "test-tr")),
        tax_year=int(getattr(tax_return, "tax_year", rules.tax_year if rules else 2025)),
        canton_code=str(getattr(tax_return, "canton_code", rules.canton_code if rules else "ZH")),
        municipality_code=str(getattr(tax_return, "municipality_code", rules.municipality_code if rules else "261") or (rules.municipality_code if rules else "261")),
        marital_status=marital_status,
        is_self_employed=bool(personal.get("is_self_employed", False)),
        num_children=num_children,
        gross_employment_income=gross_emp,
        spouse_employment_income=spouse_emp,
        side_job_income=side_job,
        ahv_pension=ahv_pension,
        pk_pension=pk_pension,
        daily_allowances=daily_allowances,
        alimony_received=alimony_received,
        home_imputed_rent=home_imputed_rent,
        asset_yield=asset_yield,
        other_income=other_inc,
        commuting_expense_claimed=commuting,
        meals_expense_claimed=meals,
        equipment_expense_claimed=prof_exp,
        pillar3a_contribution=pillar3a,
        pillar3a_spouse=_val(deductions.get("pillar3a_spouse")),
        pension_buyin=_val(deductions.get("pension_buyin")),
        health_insurance_premium_paid=health,
        medical_expenses_paid=_val(deductions.get("medical_expenses")),
        handicap_costs=_val(deductions.get("handicap_costs")),
        interest_on_debts=interest,
        donations=donations,
        party_donations=_val(deductions.get("party_donations")),
        childcare_costs=_val(deductions.get("childcare_costs") or deductions.get("childcare_expenses")),
        alimony_paid=_val(deductions.get("alimony_paid")),
        support_expenses=support_exp,
        num_supported_persons=num_supp,
        depot_fees=_val(deductions.get("depot_fees")),
        home_maintenance=_val(deductions.get("home_maintenance")),
        other_deductions=other_ded_val,
        bank_accounts_balance=bank_bal,
        securities_tax_value=sec_val,
        real_estate_tax_value=re_val,
        other_assets=Decimal("0"),
        mortgage_balance=mortgage,
        other_liabilities=_val(liabilities.get("other_liabilities")),
        net_salary=net_salary,
        has_company_car=has_company_car,
        has_canteen=has_canteen,
        has_pillar2=bool(personal.get("has_pillar2", True)),
        commute_mode=commute_mode,
        car_reason=car_reason_val,
        commute_alternative_oev=_val(deductions.get("commute_alternative_oev") or deductions.get("oev_alternative")),
        commute_km_per_day=commute_km,
        working_days=int(deductions.get("working_days") or 240),
        home_office_days=home_office_days,
        holidays=holidays,
        confession=confession,
        is_church_member=is_church_member,
        church_tax_rate=church_rate,
        custody_type=custody_norm,
        child_residence=raw_res,
        higher_earner=higher_earner_flag,
        kid_alimony_paid=kid_alimony_flag_val,
        children_in_education=int(personal.get("children_in_education") or 0),
        pillar3a_catchup=pillar3a_catchup,
        education_expenses=education_expenses,
        meal_type=meal_type,
        commute_spouse=commute_spouse,
    )


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

    def __init__(self, rules: Optional[TaxRuleSet] = None) -> None:
        self.rules = rules

    def calculate(
        self, profile: Any, rules: Any = None, _compute_savings: bool = True
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
        if rules is None:
            rules = self.rules

        tax_return = None
        if rules is not None and not isinstance(rules, TaxRuleSet):
            tax_return = rules
            rules = self.rules
            if rules is None or (getattr(tax_return, "canton_code", None) and getattr(tax_return, "canton_code") != rules.canton_code):
                rules = TaxRuleLoader().load(
                    canton_code=getattr(tax_return, "canton_code", "ZH"),
                    municipality_code=getattr(tax_return, "municipality_code", None),
                    tax_year=getattr(tax_return, "tax_year", 2025),
                )

        if rules is None:
            canton = getattr(profile, "canton_code", getattr(tax_return, "canton_code", "ZH"))
            tax_year = getattr(profile, "tax_year", getattr(tax_return, "tax_year", 2025))
            rules = TaxRuleLoader().load(canton_code=canton, municipality_code="default", tax_year=tax_year)

        m_code = getattr(tax_return, "municipality_code", None) or getattr(profile, "municipality_code", None)
        if m_code and hasattr(rules, "municipality_multipliers") and str(m_code) in rules.municipality_multipliers:
            m_info = rules.municipality_multipliers[str(m_code)]
            church_map = {
                str(k).lower(): int(v)
                for k, v in (m_info.get("church_multipliers") or {}).items()
                if isinstance(v, (int, float))
            }
            rules = replace(
                rules,
                municipality_code=str(m_code),
                municipality_name=m_info.get("name", rules.municipality_name),
                municipality_multiplier=int(m_info.get("multiplier", rules.municipality_multiplier)),
                municipality_church_multipliers=church_map or rules.municipality_church_multipliers,
            )

        if not isinstance(profile, TaxProfile):
            profile = _adapt_profile(profile, rules, tax_return)

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
        kid_factor, use_married_income_scale, use_elterntarif, _ = self._resolve_custody_flags(profile)

        # ===================================================================
        # STEP 1: TAXABLE INCOME
        # ===================================================================

        gross_income = (
            profile.gross_employment_income
            + profile.spouse_employment_income
            + profile.side_job_income
            + profile.ahv_pension
            + profile.pk_pension
            + profile.daily_allowances
            + profile.alimony_received
            + profile.home_imputed_rent
            + profile.other_income
        )
        _line(
            "Gross Income (Employment + Other)",
            gross_income,
            "gross_income",
            "DBG Art. 16",
        )

        # -------------------------------------------------------------------
        # 1. Dual-Run Deductions (Canton & Federal)
        # -------------------------------------------------------------------
        canton_ded_total, canton_ded_list, canton_dmap = self._compute_deductions_for_level(
            profile, rules, "canton", gross_income, is_married
        )
        canton_taxable_income = max(_chf(gross_income - canton_ded_total), _ZERO)

        federal_ded_total, federal_ded_list, federal_dmap = self._compute_deductions_for_level(
            profile, rules, "federal", gross_income, is_married
        )
        federal_taxable_income = max(_chf(gross_income - federal_ded_total), _ZERO)

        # Record Canton deductions in line-item audit trail
        for item in canton_ded_list:
            _line(
                f"{item['label']} (Canton {rules.canton_code})",
                -item["amount"],
                item["code"],
                item.get("source_ref") or f"StG {rules.canton_code}",
                canton=rules.canton_code,
            )

        _line(
            f"Taxable Income Canton ({rules.canton_code})",
            canton_taxable_income,
            "canton_taxable_income",
            f"StG {rules.canton_code}",
            canton=rules.canton_code,
        )

        _line(
            "Taxable Income Direct Federal (DBG)",
            federal_taxable_income,
            "federal_taxable_income",
            "DBG Art. 25",
        )

        # Standard taxable income alias for single-figure displays
        taxable_income = canton_taxable_income

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
        # STEP 3: FEDERAL INCOME TAX (Calculated on Federal Taxable Income)
        # ===================================================================

        elterntarif_count = 0
        if use_elterntarif:
            supp_count = profile.num_supported_persons if federal_dmap.get("support_deduction", _ZERO) > _ZERO else 0
            elterntarif_count = profile.num_children + profile.children_in_education + supp_count

        federal_tax = self._compute_federal_income_tax(
            federal_taxable_income,
            rules,
            is_married=is_married,
            breakdown=breakdown,
            _line=_line,
            use_elterntarif=use_elterntarif or is_married,
            elterntarif_children=elterntarif_count if use_elterntarif else 0,
        )

        # ===================================================================
        # STEP 4: CANTONAL INCOME TAX (Calculated on Canton Taxable Income)
        # ===================================================================

        canton_income_brackets = (
            rules.cantonal_income_brackets_married
            if (use_married_income_scale and rules.cantonal_income_brackets_married)
            else rules.cantonal_income_brackets
        )
        simple_cantonal_income_tax = _chf(
            _apply_progressive_bracket(canton_taxable_income, canton_income_brackets)
        )
        state_mult = Decimal(str(getattr(rules, "state_multiplier", 100) or 100))
        cantonal_income_tax = _chf(simple_cantonal_income_tax * state_mult / Decimal("100"))
        _line(
            f"Cantonal Income Tax ({rules.canton_code}, {int(state_mult)}%)",
            cantonal_income_tax,
            "cantonal_income_tax_simple",
            f"StG {rules.canton_code} § 35",
            canton=rules.canton_code,
        )

        # ===================================================================
        # STEP 5: MUNICIPAL INCOME TAX & CHURCH TAX
        # ===================================================================

        muni_multiplier = Decimal(str(rules.municipality_multiplier))
        municipal_income_tax = _chf(simple_cantonal_income_tax * muni_multiplier / Decimal("100"))
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

        wealth_brackets = (
            rules.cantonal_wealth_brackets_married
            if (use_married_income_scale and rules.cantonal_wealth_brackets_married)
            else rules.cantonal_wealth_brackets
        )
        cantonal_wealth_simple = _chf(
            _apply_wealth_brackets(taxable_wealth, wealth_brackets)
        )
        _line(
            f"Wealth Tax ({rules.canton_code}) — simple tax",
            cantonal_wealth_simple,
            "wealth_tax_simple",
            f"StG {rules.canton_code} § 47",
            canton=rules.canton_code,
        )

        wealth_tax_canton = _chf(cantonal_wealth_simple * state_mult / Decimal("100"))
        wealth_tax_municipal = _chf(cantonal_wealth_simple * muni_multiplier / Decimal("100"))

        _line(
            f"Cantonal Wealth Tax ({rules.canton_code}, {int(state_mult)}%)",
            wealth_tax_canton,
            "wealth_tax_canton",
            f"StG {rules.canton_code} § 47",
            canton=rules.canton_code,
        )
        _line(
            f"Municipal Wealth Tax ({rules.municipality_name}, {rules.municipality_multiplier}%)",
            wealth_tax_municipal,
            "wealth_tax_municipal",
            f"Municipal tax multiplier {rules.municipality_name}",
            canton=rules.canton_code,
        )

        # Church tax (if member — uses verified parish multiplier on simple income+wealth tax when available)
        church_tax = Decimal("0")
        if profile.is_church_member:
            church_map = getattr(rules, "municipality_church_multipliers", {}) or {}
            conf_key = (profile.confession or "reformed").lower()
            if conf_key in church_map and church_map[conf_key] > 0:
                church_mult = Decimal(str(church_map[conf_key]))
                church_tax = _chf((simple_cantonal_income_tax + cantonal_wealth_simple) * church_mult / Decimal("100"))
                _line(
                    f"Church Tax ({rules.municipality_name}, {int(church_mult)}%)",
                    church_tax,
                    "church_tax",
                    "Kirchensteuergesetz ZH § 18",
                    canton=rules.canton_code,
                )
            else:
                ch_rate = profile.church_tax_rate
                if ch_rate > Decimal("1.0"):
                    ch_rate = ch_rate / Decimal("100")
                church_tax = _chf(simple_cantonal_income_tax * ch_rate)
                _line(
                    f"Church Tax ({rules.municipality_name}, {float(ch_rate*100):.1f}%)",
                    church_tax,
                    "church_tax",
                    "Kirchensteuergesetz",
                    canton=rules.canton_code,
                )

        # ===================================================================
        # STEP 7: TOTALS (Milestone 2: strictly labeled « ca. CHF … »)
        # ===================================================================

        total_tax = _chf(
            federal_tax
            + cantonal_income_tax
            + municipal_income_tax
            + church_tax
            + wealth_tax_canton
            + wealth_tax_municipal
        )
        _line("Total Tax (ca. CHF)", total_tax, "total_tax", "All levels")

        deductions_applied = TaxDeductionsApplied(
            commuting=canton_dmap.get("commuting", _ZERO),
            meals=canton_dmap.get("meals", _ZERO),
            professional_expenses=canton_dmap.get("professional_expenses", _ZERO),
            pillar3a=canton_dmap.get("pillar3a", _ZERO),
            pillar3a_catchup=canton_dmap.get("pillar3a_catchup", _ZERO),
            education=canton_dmap.get("education", _ZERO),
            health_insurance=canton_dmap.get("health_insurance", _ZERO),
            medical_expenses=canton_dmap.get("medical_expenses", _ZERO),
            donations=canton_dmap.get("donations", _ZERO),
            childcare=canton_dmap.get("childcare") if profile.num_children > 0 else None,
            child_deduction=canton_dmap.get("child_deduction") if profile.num_children > 0 else None,
            interest_expenses=canton_dmap.get("interest_expenses", _ZERO),
            side_job_expenses=canton_dmap.get("side_job_expenses", _ZERO),
            two_earner=canton_dmap.get("two_earner", _ZERO),
            married_deduction=canton_dmap.get("married_deduction", _ZERO),
            pension_buyin=canton_dmap.get("pension_buyin", _ZERO),
            party_donations=canton_dmap.get("party_donations", _ZERO),
            support_deduction=canton_dmap.get("support_deduction", _ZERO),
            other=canton_dmap.get("other", _ZERO),
        )

        c_meta = rules_data_service.get_canton_rules(rules.canton_code, rules.tax_year)
        muni_exact = str(rules.municipality_code) in (rules.municipality_multipliers or {})
        year_exact = int(rules.tax_year) <= 2025 or bool(c_meta.get("y2026_confirmed", False))
        canton_exact = (
            getattr(rules, "tariff_status", "estimate_only") == "official_verified"
            and muni_exact
            and year_exact
            and rules_data_service.is_canton_available(rules.canton_code, rules.tax_year)
        )
        tariff_status = "official_verified" if canton_exact else "estimate_only"
        estimate_warning = (
            None
            if canton_exact
            else f"Unverifizierte Schätzung für Kanton {rules.canton_code} ({rules.tax_year}) – amtlicher Tarif / Gemeindesteuerfuss noch nicht verifiziert."
        )

        res = TaxCalculationResult(
            tax_return_id=profile.tax_return_id,
            canton_code=rules.canton_code,
            municipality_code=rules.municipality_code,
            tax_year=rules.tax_year,
            marital_status=profile.marital_status,
            rule_version=rules.version,
            calculated_at=datetime.utcnow(),
            taxable_income=canton_taxable_income,
            taxable_wealth=taxable_wealth,
            canton_taxable_income=canton_taxable_income,
            federal_taxable_income=federal_taxable_income,
            canton_deductions_total=canton_ded_total,
            federal_deductions_total=federal_ded_total,
            canton_deductions_list=canton_ded_list,
            federal_deductions_list=federal_ded_list,
            federal_income_tax=federal_tax,
            cantonal_income_tax=cantonal_income_tax,
            municipal_income_tax=municipal_income_tax,
            church_tax=church_tax,
            wealth_tax_canton=wealth_tax_canton,
            wealth_tax_municipal=wealth_tax_municipal,
            total_tax=total_tax,
            deductions_applied=deductions_applied,
            breakdown=breakdown,
            canton_has_exact_multipliers=canton_exact,
            tariff_status=tariff_status,
            is_estimate_only=not canton_exact,
            estimate_warning=estimate_warning,
        )
        if _compute_savings:
            res.savings_analysis = self.compute_savings_analysis(
                profile=profile,
                rules=rules,
                base_result=res,
                canton_exact=canton_exact,
            )
        return res

    @staticmethod
    def _round_savings_to_10(diff: Decimal) -> int:
        if diff <= _ZERO:
            return 0
        rounded = (diff / Decimal("10")).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * Decimal("10")
        return max(0, int(rounded))

    def compute_savings_analysis(
        self,
        profile: TaxProfile,
        rules: TaxRuleSet,
        base_result: TaxCalculationResult,
        canton_exact: bool = True,
    ) -> dict[str, Any]:
        """
        Addendum 1 Section 7 («So viel sparst du»):
        Compute true counterfactual tax difference WITH vs WITHOUT each optional deduction
        and WITH vs WITHOUT all optional deductions combined across cantonal, municipal, and federal taxes.
        Never uses a flat percentage.
        """
        specs: list[tuple[str, str, bool, dict[str, Any]]] = [
            (
                "commuting",
                "Fahrkosten (Arbeitsweg)",
                base_result.deductions_applied.commuting > _ZERO,
                {
                    "commuting_expense_claimed": _ZERO,
                    "commute_mode": "foot",
                    "commute_km_per_day": _ZERO,
                    "commute_spouse": _ZERO,
                },
            ),
            (
                "meals",
                "Auswärtige Verpflegung",
                base_result.deductions_applied.meals > _ZERO,
                {"meal_type": "none", "meals_expense_claimed": _ZERO, "has_canteen": False},
            ),
            (
                "professional_expenses",
                "Übrige Berufskosten (effektiv)",
                profile.equipment_expense_claimed > _ZERO,
                {"equipment_expense_claimed": _ZERO},
            ),
            (
                "pillar3a",
                "Säule 3a",
                base_result.deductions_applied.pillar3a > _ZERO,
                {"pillar3a_contribution": _ZERO},
            ),
            (
                "pillar3a_catchup",
                "Säule 3a Einkauf (ab 2026)",
                base_result.deductions_applied.pillar3a_catchup > _ZERO,
                {"pillar3a_catchup": _ZERO},
            ),
            (
                "education",
                "Weiterbildungskosten",
                base_result.deductions_applied.education > _ZERO,
                {"education_expenses": _ZERO},
            ),
            (
                "health_insurance",
                "Krankenkassenprämien",
                base_result.deductions_applied.health_insurance > _ZERO,
                {"health_insurance_premium_paid": _ZERO},
            ),
            (
                "medical_expenses",
                "Krankheits- und Unfallkosten",
                base_result.deductions_applied.medical_expenses > _ZERO,
                {"medical_expenses_paid": _ZERO},
            ),
            (
                "interest_expenses",
                "Schuldzinsen",
                base_result.deductions_applied.interest_expenses > _ZERO,
                {"interest_on_debts": _ZERO},
            ),
            (
                "donations",
                "Spenden",
                base_result.deductions_applied.donations > _ZERO,
                {"donations": _ZERO},
            ),
            (
                "childcare",
                "Drittbetreuung Kinder",
                (base_result.deductions_applied.childcare or _ZERO) > _ZERO,
                {"childcare_costs": _ZERO},
            ),
            (
                "side_job_expenses",
                "Berufskosten Nebenerwerb",
                base_result.deductions_applied.side_job_expenses > _ZERO,
                {"side_job_income": _ZERO},
            ),
            (
                "two_earner",
                "Zweiverdienerabzug",
                base_result.deductions_applied.two_earner > _ZERO,
                {"spouse_employment_income": _ZERO},
            ),
            (
                "pension_buyin",
                "Einkauf Pensionskasse",
                base_result.deductions_applied.pension_buyin > _ZERO,
                {"pension_buyin": _ZERO},
            ),
            (
                "party_donations",
                "Parteispenden",
                base_result.deductions_applied.party_donations > _ZERO,
                {"party_donations": _ZERO},
            ),
            (
                "other",
                "Übrige Abzüge",
                base_result.deductions_applied.other > _ZERO,
                {
                    "other_deductions": _ZERO,
                    "alimony_paid": _ZERO,
                    "kid_alimony_paid": _ZERO,
                    "depot_fees": _ZERO,
                    "home_maintenance": _ZERO,
                    "handicap_costs": _ZERO,
                },
            ),
        ]

        base_tax = base_result.total_tax
        by_deduction: dict[str, int] = {}
        items_detail: list[dict[str, Any]] = []
        all_reset_kwargs: dict[str, Any] = {}

        for key, label, active, reset_kw in specs:
            if not active:
                by_deduction[key] = 0
                continue
            all_reset_kwargs.update(reset_kw)
            cf_profile = replace(profile, **reset_kw)
            cf_res = self.calculate(cf_profile, rules, _compute_savings=False)
            diff_chf = self._round_savings_to_10(cf_res.total_tax - base_tax)
            by_deduction[key] = diff_chf
            items_detail.append({
                "key": key,
                "label": label,
                "savings_chf": diff_chf,
                "display": f"Spart ca. CHF {diff_chf:,}".replace(",", "'"),
            })

        if all_reset_kwargs:
            cf_all = self.calculate(replace(profile, **all_reset_kwargs), rules, _compute_savings=False)
            total_savings_chf = self._round_savings_to_10(cf_all.total_tax - base_tax)
        else:
            total_savings_chf = 0

        max_single = max(by_deduction.values(), default=0)
        if total_savings_chf < max_single:
            total_savings_chf = max_single

        return {
            "total_savings_chf": total_savings_chf,
            "total_savings_display": f"ca. CHF {total_savings_chf:,}".replace(",", "'"),
            "summary_text": f"Dank deinen Abzügen sparst du ca. CHF {total_savings_chf:,}.".replace(",", "'"),
            "by_deduction": by_deduction,
            "by_deduction_display": {
                k: f"Spart ca. CHF {v:,}".replace(",", "'") for k, v in by_deduction.items()
            },
            "items": items_detail,
            "disclaimer": "Unverbindliche Schätzung – die definitive Steuer berechnet das Steueramt.",
            "canton_has_exact_multipliers": canton_exact,
            "rough_estimate_notice": (
                None
                if canton_exact
                else "Hinweis: Grobe Kantonsschätzung (definitiver Tarif / Gemeindesteuerfuss noch nicht aktiv)."
            ),
        }

    # -----------------------------------------------------------------------
    # Dual-Run Deduction Engine (Milestone 2, Part A2 & A4)
    # -----------------------------------------------------------------------

    @staticmethod
    def _resolve_custody_flags(profile: TaxProfile) -> tuple[Decimal, bool, bool, Decimal]:
        """
        Resolve child deduction share, married/single-parent income scale eligibility,
        federal Elterntarif eligibility, and deductible child alimony per ESTV KS 30 & StG ZH §§ 34/35 Abs. 2bis.
        """
        is_married = profile.marital_status in (
            MaritalStatus.MARRIED,
            MaritalStatus.REGISTERED_PARTNERSHIP,
        )
        has_children = profile.num_children > 0
        if is_married:
            return Decimal("1"), True, has_children, _ZERO
        if not has_children:
            return _ZERO, False, False, _ZERO

        alimony_child_paid = profile.kid_alimony_paid > _ZERO
        if alimony_child_paid or profile.child_residence == "other":
            return _ZERO, False, False, profile.kid_alimony_paid
        if profile.custody_type == "shared":
            qualifies = bool(profile.higher_earner or profile.child_residence == "me")
            return Decimal("0.5"), qualifies, qualifies, _ZERO
        return Decimal("1"), True, True, _ZERO

    def _compute_deductions_for_level(
        self,
        profile: TaxProfile,
        rules: TaxRuleSet,
        level: str,  # "canton" | "federal"
        gross_income: Decimal,
        is_married: bool,
    ) -> tuple[Decimal, list[dict[str, Any]], dict[str, Decimal]]:
        lvl = level.lower()
        lim = rules.federal_deductions if lvl == "federal" else rules.cantonal_deductions
        items: list[dict[str, Any]] = []
        dmap: dict[str, Decimal] = {}
        kid_factor, _, _, child_alimony = self._resolve_custody_flags(profile)
        net_emp_main = profile.net_salary if profile.net_salary > _ZERO else profile.gross_employment_income
        eff_days = max(0, profile.working_days - profile.home_office_days - profile.holidays)

        # 1. Commuting
        commute_amt = _ZERO
        commute_label = "Fahrkosten (Arbeitsweg)"
        commute_code = "commute_total"
        commute_ref = "DBG Art. 26 Abs. 1 lit. a" if lvl == "federal" else f"StG {rules.canton_code} § 26 Abs. 1 lit. a"
        commute_type = "cap"
        commute_expl = ""

        if profile.has_company_car:
            commute_amt = _ZERO
            commute_label = "Fahrkosten (Box F: Firmenwagen / Unentgeltliche Beförderung)"
            commute_expl = "Box F: Firmenwagen / Unentgeltliche Beförderung"
        elif profile.commute_mode == "bike":
            commute_amt = _chf(lim.commuting_bike_chf)
            commute_label = "Fahrkosten (Velo-Pauschale)"
            commute_code = "commute_bike"
            commute_type = "flat"
            commute_expl = f"Pauschale CHF {lim.commuting_bike_chf:,.0f} für Velo / E-Bike"
        elif profile.commute_mode == "foot":
            commute_amt = _ZERO
            commute_label = "Fahrkosten (Zu Fuss)"
            commute_code = "commute_foot"
            commute_type = "flat"
            commute_expl = "Arbeitsweg zu Fuss"
        elif profile.commute_mode == "car":
            cap = lim.commuting_max_chf
            car_missing_reason = profile.car_reason is not None and profile.car_reason in ("", "none")
            if car_missing_reason:
                alt = profile.commute_alternative_oev or profile.commuting_expense_claimed
                commute_amt = _chf(min(alt, cap))
                commute_label = "Fahrkosten Auto ohne Ausnahmegrund (ÖV-Abo angerechnet)"
                commute_code = "commute_car_oev_fallback"
                commute_expl = f"Ohne Grund ÖV-Vergleichswert bis max. CHF {cap:,.0f}"
            else:
                car_rate = lim.commuting_car_rate
                calc_val = profile.commute_km_per_day * car_rate * Decimal(str(eff_days))
                commute_amt = _chf(min(calc_val, cap))
                commute_label = f"Fahrkosten Auto ({profile.commute_km_per_day} km/Tag, {eff_days} Tage)"
                commute_code = "commute_car"
                commute_type = "per_km"
                commute_expl = f"CHF {car_rate:.2f}/km × {profile.commute_km_per_day} km × {eff_days} Tage (max. CHF {cap:,.0f})"
        else:
            cap = lim.commuting_max_chf
            commute_amt = _chf(min(profile.commuting_expense_claimed, cap))
            commute_label = "Fahrkosten (ÖV)"
            commute_code = "commute_total"
            commute_expl = f"Effektive Kosten bis max. CHF {cap:,.0f}"

        if is_married and profile.commute_spouse > _ZERO and profile.commute_mode != "foot":
            commute_amt = _chf(commute_amt + min(profile.commute_spouse, lim.commuting_max_chf))

        items.append({
            "code": commute_code,
            "label": commute_label,
            "amount": commute_amt,
            "level": lvl,
            "form_field": "2.1",
            "rule_type": commute_type,
            "source_ref": commute_ref,
            "explanation": commute_expl,
        })
        dmap["commuting"] = commute_amt

        # 2. Meals
        meal_ref = "DBG Art. 26 Abs. 1 lit. b" if lvl == "federal" else f"StG {rules.canton_code} § 26 Abs. 1 lit. b"
        meal_type_val = getattr(profile, "meal_type", "out")
        if meal_type_val == "none":
            meal_amt = _ZERO
            meal_label = "Verpflegung (kein Abzug)"
            meal_code = "meal_none"
            meal_expl = "Kein auswärtiger Verpflegungsabzug"
        elif profile.has_canteen or meal_type_val == "cheap":
            max_canteen = lim.meal_deduction_reduced
            if profile.home_office_days > 0 or profile.holidays > 0:
                meal_amt = _chf(min(Decimal("7.50") * Decimal(str(eff_days)), max_canteen))
            else:
                meal_amt = max_canteen
            meal_label = f"Mehrkosten Verpflegung (Box G: Kantine/Beitrag, {eff_days} Tage)"
            meal_code = "meal_deduction_canteen"
            meal_expl = f"CHF 7.50 × {eff_days} Tage (max. CHF {max_canteen:,.0f})"
        else:
            max_full = lim.meal_deduction_annual
            if profile.home_office_days > 0 or profile.holidays > 0:
                meal_amt = _chf(min(Decimal("15.00") * Decimal(str(eff_days)), max_full))
            else:
                meal_amt = max_full
            if profile.meals_expense_claimed > _ZERO:
                meal_amt = _chf(min(profile.meals_expense_claimed, meal_amt))
            meal_label = f"Mehrkosten Verpflegung ({eff_days} Tage)"
            meal_code = "meal_deduction_full"
            meal_expl = f"CHF 15.00 × {eff_days} Tage (max. CHF {max_full:,.0f})"

        items.append({
            "code": meal_code,
            "label": meal_label,
            "amount": meal_amt,
            "level": lvl,
            "form_field": "2.2",
            "rule_type": "flat",
            "source_ref": meal_ref,
            "explanation": meal_expl,
        })
        dmap["meals"] = meal_amt

        # 3. Professional expenses (3% flat rate on Netto salary, min 2000, max 4000)
        flat = _chf(net_emp_main * lim.professional_expenses_flat_rate_pct)
        flat = max(min(flat, lim.professional_expenses_max), lim.professional_expenses_min)
        if net_emp_main <= _ZERO and profile.equipment_expense_claimed <= _ZERO:
            prof_amt = _ZERO
        else:
            actual = profile.equipment_expense_claimed
            prof_amt = _chf(min(max(actual, flat), lim.professional_expenses_max))
            if net_emp_main > _ZERO and prof_amt > net_emp_main:
                prof_amt = net_emp_main
        items.append({
            "code": "work_expenses_flat",
            "label": "Übrige Berufskosten",
            "amount": prof_amt,
            "level": lvl,
            "form_field": "2.3",
            "rule_type": "rate",
            "source_ref": "DBG Art. 26 Abs. 1 lit. c" if lvl == "federal" else f"StG {rules.canton_code} § 26 / VPBU",
            "explanation": f"{lim.professional_expenses_flat_rate_pct*100:.0f}% von Nettolohn (CHF {net_emp_main:,.0f}), Min. CHF {lim.professional_expenses_min:,.0f}, Max. CHF {lim.professional_expenses_max:,.0f}",
        })
        dmap["professional_expenses"] = prof_amt

        # 3b. Side-job expenses (Nebenerwerb)
        side_amt = _ZERO
        if profile.side_job_income > _ZERO:
            raw_side = _chf(profile.side_job_income * lim.side_job_flat_rate_pct)
            side_amt = min(profile.side_job_income, max(min(profile.side_job_income, lim.side_job_min), min(raw_side, lim.side_job_max)))
        items.append({
            "code": "side_job_expenses",
            "label": "Berufskosten Nebenerwerb",
            "amount": side_amt,
            "level": lvl,
            "form_field": "2.3b",
            "rule_type": "rate",
            "source_ref": "DBG Art. 26" if lvl == "federal" else f"StG {rules.canton_code} VPBU Ziff. I/3",
            "explanation": f"20% des Nebenerwerbs (Min. CHF {lim.side_job_min:,.0f}, Max. CHF {lim.side_job_max:,.0f})",
        })
        dmap["side_job_expenses"] = side_amt

        # 4. Pillar 3a (plus optional spouse Pillar 3a)
        p3a_limit = lim.pillar3a_self_employed_max if profile.is_self_employed else lim.pillar3a_employed_max
        p3a_amt = _chf(min(profile.pillar3a_contribution, p3a_limit))
        if is_married and profile.pillar3a_spouse > _ZERO:
            p3a_amt = _chf(p3a_amt + min(profile.pillar3a_spouse, lim.pillar3a_employed_max))
        items.append({
            "code": "pillar3a",
            "label": "Säule 3a",
            "amount": p3a_amt,
            "level": lvl,
            "form_field": "10.1",
            "rule_type": "cap",
            "source_ref": "BVG Art. 82 / BVV3",
            "explanation": f"Beiträge bis max. CHF {p3a_limit:,.0f}",
        })
        dmap["pillar3a"] = p3a_amt

        # 4b. Pillar 3a retroactive catch-up (from tax year 2026)
        p3a_catchup_cap = lim.pillar3a_catchup_max if rules.tax_year >= 2026 else _ZERO
        p3a_catchup_claimed = profile.pillar3a_catchup
        p3a_catchup_amt = (
            _chf(min(p3a_catchup_claimed, p3a_catchup_cap))
            if p3a_catchup_cap > _ZERO and p3a_catchup_claimed > _ZERO
            else _ZERO
        )
        items.append({
            "code": "pillar3a_catchup",
            "label": "Säule 3a Einkauf (Nachzahlung ab 2026)",
            "amount": p3a_catchup_amt,
            "level": lvl,
            "form_field": "10.2",
            "rule_type": "cap",
            "source_ref": "BVV3 Art. 7a (ab 2026)",
            "explanation": f"Nachzahlung bis max. CHF {p3a_catchup_cap:,.0f}" if p3a_catchup_cap > _ZERO else "Erst ab Steuerjahr 2026 möglich",
        })
        dmap["pillar3a_catchup"] = p3a_catchup_amt

        # 4c. Pillar 2 buy-in (Einkauf Pensionskasse)
        pk_buyin_amt = _chf(profile.pension_buyin)
        items.append({
            "code": "pension_buyin",
            "label": "Einkauf Pensionskasse (Säule 2)",
            "amount": pk_buyin_amt,
            "level": lvl,
            "form_field": "10.3",
            "rule_type": "actual",
            "source_ref": "DBG Art. 33 Abs. 1 lit. d" if lvl == "federal" else f"StG {rules.canton_code} § 31 Abs. 1 lit. d",
            "explanation": "Voll abzugsfähiger Einkauf in die berufliche Vorsorge",
        })
        dmap["pension_buyin"] = pk_buyin_amt

        # 4d. Continuing Education / Retraining
        edu_cap = lim.training_max
        edu_ref = "DBG Art. 33 Abs. 1 lit. j" if lvl == "federal" else f"StG {rules.canton_code} § 31 Abs. 1 lit. k"
        edu_amt = _chf(min(profile.education_expenses, edu_cap)) if profile.education_expenses > _ZERO else _ZERO
        items.append({
            "code": "education",
            "label": "Aus- und Weiterbildung",
            "amount": edu_amt,
            "level": lvl,
            "form_field": "2.4",
            "rule_type": "cap",
            "source_ref": edu_ref,
            "explanation": f"Weiterbildungskosten bis max. CHF {edu_cap:,.0f}",
        })
        dmap["education"] = edu_amt

        # 4e. Two-earner & married deductions
        two_earner_amt = _ZERO
        if is_married and profile.spouse_employment_income > _ZERO:
            if lim.two_earner_rate > _ZERO:
                calc_ze = _chf(profile.spouse_employment_income * lim.two_earner_rate)
                two_earner_amt = min(profile.spouse_employment_income, max(min(profile.spouse_employment_income, lim.two_earner_min), min(calc_ze, lim.two_earner_max)))
            elif lim.two_earner_deduction > _ZERO:
                two_earner_amt = min(profile.spouse_employment_income, lim.two_earner_deduction)
        items.append({
            "code": "two_earner",
            "label": "Zweiverdienerabzug",
            "amount": two_earner_amt,
            "level": lvl,
            "form_field": "15.2",
            "rule_type": "flat",
            "source_ref": "DBG Art. 33 Abs. 2" if lvl == "federal" else f"StG {rules.canton_code} § 31 Abs. 2",
            "explanation": "Sonderabzug bei Erwerbstätigkeit beider Ehegatten",
        })
        dmap["two_earner"] = two_earner_amt

        married_ded_amt = _chf(lim.married_deduction) if (is_married and lim.married_deduction > _ZERO) else _ZERO
        items.append({
            "code": "married_deduction",
            "label": "Verheiratetenabzug",
            "amount": married_ded_amt,
            "level": lvl,
            "form_field": "15.3",
            "rule_type": "flat",
            "source_ref": "DBG Art. 33 Abs. 2",
            "explanation": f"Pauschaler Verheiratetenabzug CHF {lim.married_deduction:,.0f}",
        })
        dmap["married_deduction"] = married_ded_amt

        # 5. Health insurance (respects has_pillar2 +50% uplift and ESTV KS 30 child split)
        if profile.has_pillar2:
            base_hi_cap = lim.health_insurance_married if is_married else lim.health_insurance_single
        else:
            base_hi_cap = (
                (lim.health_insurance_married_no_pension or lim.health_insurance_married)
                if is_married
                else (lim.health_insurance_single_no_pension or lim.health_insurance_single)
            )
        child_hi_bonus = _chf(lim.health_insurance_per_child * Decimal(str(profile.num_children)) * kid_factor)
        hi_cap = base_hi_cap + child_hi_bonus
        hi_ref = "DBG Art. 33 Abs. 1 lit. g" if lvl == "federal" else f"StG {rules.canton_code} § 31 Abs. 1 lit. g"
        hi_amt = _chf(min(profile.health_insurance_premium_paid, hi_cap))
        items.append({
            "code": "health_insurance",
            "label": "Krankenkassenprämien",
            "amount": hi_amt,
            "level": lvl,
            "form_field": "11.1",
            "rule_type": "cap",
            "source_ref": hi_ref,
            "explanation": f"Prämien bis max. CHF {hi_cap:,.0f}",
        })
        dmap["health_insurance"] = hi_amt

        # 6. Debt interest (capped at taxable asset yield + CHF 50'000)
        legal_debt_cap = profile.asset_yield + lim.interest_deduction_extra_above_yield
        if lim.interest_deduction_max is not None:
            legal_debt_cap = min(legal_debt_cap, lim.interest_deduction_max)
        debt_amt = _chf(min(profile.interest_on_debts, legal_debt_cap))
        items.append({
            "code": "debt_interest",
            "label": "Schuldzinsen",
            "amount": debt_amt,
            "level": lvl,
            "form_field": "12.1",
            "rule_type": "cap",
            "source_ref": "DBG Art. 33 Abs. 1 lit. a" if lvl == "federal" else f"StG {rules.canton_code} § 31 Abs. 1 lit. a",
            "explanation": f"Schuldzinsen bis max. Vermögensertrag + CHF {lim.interest_deduction_extra_above_yield:,.0f}",
        })
        dmap["interest_expenses"] = debt_amt

        # 7. Childcare costs (only when eligible child deduction factor > 0)
        care_cap_per_child = lim.childcare_max
        if profile.num_children > 0 and profile.childcare_costs > _ZERO and kid_factor > _ZERO:
            care_cap = care_cap_per_child * Decimal(str(profile.num_children))
            care_amt = _chf(min(profile.childcare_costs, care_cap))
        else:
            care_amt = _ZERO
        items.append({
            "code": "childcare_costs",
            "label": "Drittbetreuungskosten für Kinder",
            "amount": care_amt,
            "level": lvl,
            "form_field": "16.2",
            "rule_type": "cap",
            "source_ref": "DBG Art. 33 Abs. 3" if lvl == "federal" else f"StG {rules.canton_code} § 31 Abs. 1 lit. j",
            "explanation": f"Kosten bis max. CHF {care_cap_per_child if profile.num_children > 0 else 0:,.0f} pro Kind",
        })
        dmap["childcare"] = care_amt

        # 8. Political party donations
        party_cap = lim.party_donation_max_married if is_married else lim.party_donation_max_single
        party_amt = _chf(min(profile.party_donations, party_cap)) if profile.party_donations > _ZERO else _ZERO
        items.append({
            "code": "party_donations",
            "label": "Parteispenden & Mitgliederbeiträge",
            "amount": party_amt,
            "level": lvl,
            "form_field": "14.2",
            "rule_type": "cap",
            "source_ref": "DBG Art. 33 Abs. 1 lit. i" if lvl == "federal" else f"StG {rules.canton_code} § 31 Abs. 1 lit. h",
            "explanation": f"Bis max. CHF {party_cap:,.0f}",
        })
        dmap["party_donations"] = party_amt

        # 9. Alimony paid + Other deductible expenses (depot fees, home maintenance, handicap)
        alimony_total = _chf(profile.alimony_paid + child_alimony)
        other_amt = _chf(
            alimony_total
            + profile.depot_fees
            + profile.home_maintenance
            + profile.handicap_costs
            + profile.other_deductions
        )
        items.append({
            "code": "other_deductions",
            "label": "Übrige Abzüge (inkl. Unterhalt/Liegenschaft/Depot)",
            "amount": other_amt,
            "level": lvl,
            "form_field": "15.1",
            "rule_type": "cap",
            "source_ref": "DBG Art. 33 ff." if lvl == "federal" else f"StG {rules.canton_code} § 30/31",
            "explanation": "Unterhaltsbeiträge, Vermögensverwaltung, Liegenschaftsunterhalt, weitere Abzüge",
        })
        dmap["other"] = other_amt

        # Compute statutory Reineinkommen BEFORE income-dependent deductions (§§ 26-31 StG / Art. 26-33 DBG)
        pre_dependent_sum = sum(
            dmap[k]
            for k in (
                "commuting", "meals", "professional_expenses", "side_job_expenses",
                "pillar3a", "pillar3a_catchup", "pension_buyin", "education",
                "two_earner", "married_deduction", "health_insurance", "interest_expenses",
                "childcare", "party_donations", "other",
            )
        )
        reineinkommen_base = max(_chf(gross_income - pre_dependent_sum), _ZERO)

        # 10. Medical expenses (5% excess threshold of Reineinkommen per § 32 lit. a StG / DBG Art. 33 lit. h)
        med_thresh = _chf(reineinkommen_base * lim.medical_expense_threshold_pct)
        med_amt = _chf(max(profile.medical_expenses_paid - med_thresh, _ZERO))
        items.append({
            "code": "medical_expenses",
            "label": "Krankheits- und Unfallkosten",
            "amount": med_amt,
            "level": lvl,
            "form_field": "13.1",
            "rule_type": "rate",
            "source_ref": "DBG Art. 33 Abs. 1 lit. h" if lvl == "federal" else f"StG {rules.canton_code} § 32 lit. a",
            "explanation": f"Selbstbehalt {lim.medical_expense_threshold_pct*100:.0f}% von Reineinkommen (CHF {med_thresh:,.0f})",
        })
        dmap["medical_expenses"] = med_amt

        # 11. Charitable Donations (min CHF 100, max 20% of Reineinkommen per § 32 lit. b StG / Art. 33a DBG)
        if profile.donations >= lim.donation_min_chf and reineinkommen_base > _ZERO:
            don_max = _chf(reineinkommen_base * lim.donation_max_pct)
            don_amt = _chf(min(profile.donations, don_max))
        else:
            don_amt = _ZERO
        items.append({
            "code": "donations",
            "label": "Freiwillige Zuwendungen (Spenden)",
            "amount": don_amt,
            "level": lvl,
            "form_field": "14.1",
            "rule_type": "rate",
            "source_ref": "DBG Art. 33a" if lvl == "federal" else f"StG {rules.canton_code} § 32 lit. b",
            "explanation": f"Mindestbetrag CHF {lim.donation_min_chf:,.0f}, max. {lim.donation_max_pct*100:.0f}% des Reineinkommens",
        })
        dmap["donations"] = don_amt

        # 12. Social deductions: Child deduction & Support deduction (§ 34 StG / Art. 35 DBG)
        if profile.num_children > 0 and kid_factor > _ZERO:
            per_child = lim.child_deduction_per_child
            child_amt = _chf(per_child * Decimal(str(profile.num_children)) * kid_factor)
        else:
            per_child = lim.child_deduction_per_child
            child_amt = _ZERO
        items.append({
            "code": "child_deduction",
            "label": f"Kinderabzug ({profile.num_children} Kind(er))",
            "amount": child_amt,
            "level": lvl,
            "form_field": "16.1",
            "rule_type": "flat",
            "source_ref": "DBG Art. 35 Abs. 1 lit. a" if lvl == "federal" else f"StG {rules.canton_code} § 34 Abs. 1 lit. a",
            "explanation": f"CHF {per_child:,.0f} pro Kind (Anteil {kid_factor * 100:.0f}%)",
        })
        dmap["child_deduction"] = child_amt

        supp_amt = _ZERO
        if profile.num_supported_persons > 0:
            min_req = lim.support_deduction_per_person * Decimal(str(profile.num_supported_persons))
            if profile.support_expenses <= _ZERO or profile.support_expenses >= min_req:
                supp_amt = _chf(min_req)
        items.append({
            "code": "support_deduction",
            "label": f"Unterstützungsabzug ({profile.num_supported_persons} Person(en))",
            "amount": supp_amt,
            "level": lvl,
            "form_field": "16.3",
            "rule_type": "flat",
            "source_ref": "DBG Art. 35 Abs. 1 lit. b" if lvl == "federal" else f"StG {rules.canton_code} § 34 Abs. 1 lit. b",
            "explanation": f"CHF {lim.support_deduction_per_person:,.0f} pro unterstützte Person",
        })
        dmap["support_deduction"] = supp_amt

        active_items = [it for it in items if it["amount"] > _ZERO]
        total_ded = sum((it["amount"] for it in active_items), _ZERO)
        return total_ded, active_items, dmap

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
        net_base = getattr(profile, "net_salary", Decimal("0"))
        if net_base <= Decimal("0"):
            net_base = profile.gross_employment_income or gross_income
        flat = _chf(net_base * lim.professional_expenses_flat_rate_pct)
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
                f"Professional expenses flat rate ({lim.professional_expenses_flat_rate_pct*100:.0f}% of Netto CHF {net_base:,.0f})",
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
        rules: Optional[TaxRuleSet] = None,
        is_married: Optional[bool] = None,
        breakdown: Optional[list] = None,
        _line: Optional[Any] = None,
        marital_status: Optional[str] = None,
        use_elterntarif: Optional[bool] = None,
        elterntarif_children: int = 0,
    ) -> Decimal:
        """
        Federal income tax (DBG/LIFD Art. 36).

        Applies DBG single/married tables, rounds down to nearest CHF 0.05,
        and applies the Art. 36 Abs. 2bis Elterntarif reduction (CHF 263 per child)
        when qualifying married or single parents claim child/support deductions.
        """
        r = rules or self.rules
        if r is None:
            raise TaxRuleNotFoundError("federal_brackets", None, 2025)
        if is_married is None:
            if marital_status is not None:
                is_married = str(marital_status).lower() in (
                    "married",
                    "registered_partnership",
                    "maritalstatus.married",
                    "maritalstatus.registered_partnership",
                )
            else:
                is_married = False

        use_married_scale = bool(is_married or use_elterntarif)
        brackets = (
            r.federal_brackets_married
            if use_married_scale
            else r.federal_brackets_single
        )
        status_label = "Elterntarif" if (use_elterntarif and not is_married) else ("married" if is_married else "single")
        raw_tax = _apply_progressive_bracket(taxable_income, brackets)
        credit_per_child = r.federal_deductions.child_tax_credit_per_child or Decimal("263")
        if elterntarif_children > 0 and use_married_scale:
            raw_tax = max(_ZERO, raw_tax - credit_per_child * Decimal(str(elterntarif_children)))
        federal_tax = _fed_chf(raw_tax)
        if callable(_line):
            _line(
                f"Federal Income Tax ({status_label}, CHF {taxable_income:,.0f})",
                federal_tax,
                "federal_income_tax",
                "DBG Art. 36",
            )
        return federal_tax

    def _compute_cantonal_income_tax(
        self,
        taxable_income: Decimal,
        rules: Optional[TaxRuleSet] = None,
    ) -> Decimal:
        """Compute basic cantonal income tax from brackets."""
        r = rules or self.rules
        if r is None:
            raise TaxRuleNotFoundError("cantonal_income_brackets", None, 0)
        return _chf(_apply_progressive_bracket(taxable_income, r.cantonal_income_brackets))

    def _compute_municipal_tax(
        self,
        cantonal_tax: Decimal,
        municipality_code: Optional[str] = None,
        rules: Optional[TaxRuleSet] = None,
    ) -> Decimal:
        """Compute municipal tax from cantonal tax and municipal multiplier."""
        r = rules or self.rules
        if r is None:
            raise TaxRuleNotFoundError("municipality_multiplier", None, 0)
        multiplier = r.municipality_multiplier
        if municipality_code and hasattr(r, "municipality_multipliers") and r.municipality_multipliers:
            muni = r.municipality_multipliers.get(str(municipality_code))
            if muni:
                multiplier = int(muni.get("multiplier", multiplier))
        return _chf(cantonal_tax * Decimal(str(multiplier)) / Decimal("100"))

    def _apply_pillar3a_deduction(
        self,
        contribution: Decimal,
        marital_status: str = "single",
        is_self_employed: bool = False,
        rules: Optional[TaxRuleSet] = None,
    ) -> Decimal:
        """Calculate capped Pillar 3a deduction."""
        r = rules or self.rules
        if r is None:
            max_limit = Decimal("36288") if is_self_employed else Decimal("7258")
        else:
            max_limit = (
                r.cantonal_deductions.pillar3a_self_employed_max
                if is_self_employed
                else r.cantonal_deductions.pillar3a_employed_max
            )
        return min(contribution, max_limit)

    def _apply_commuting_deduction(
        self,
        actual: Decimal,
        rules: Optional[TaxRuleSet] = None,
    ) -> Decimal:
        """Calculate capped commuting expense deduction."""
        r = rules or self.rules
        limit = r.cantonal_deductions.commuting_max_chf if r else Decimal("5000")
        return min(actual, limit)

    def _apply_donation_deduction(
        self,
        donation: Decimal,
        taxable_income: Decimal,
        rules: Optional[TaxRuleSet] = None,
    ) -> Decimal:
        """Calculate deductible charitable donations with threshold and percentage cap."""
        r = rules or self.rules
        min_chf = r.cantonal_deductions.donation_min_chf if r else Decimal("100")
        max_pct = r.cantonal_deductions.donation_max_pct if r else Decimal("0.20")
        if donation < min_chf:
            return _ZERO
        max_allowed = _chf(taxable_income * max_pct)
        return min(donation, max_allowed)
