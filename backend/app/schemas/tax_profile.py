"""
Pydantic v2 schemas for TaxProfile and its nested structures.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Union
from uuid import UUID
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


# ── Nested sub-schemas ────────────────────────────────────────────────────────


class ChildData(BaseModel):
    name: Optional[str] = None
    date_of_birth: Optional[str] = None  # ISO date string
    custody: Optional[str] = None  # joint | full | none


class PersonalData(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    date_of_birth: Optional[str] = None
    civil_status: Optional[str] = None  # single | married | divorced | widowed | separated
    ahv_number: Optional[str] = None  # 756.XXXX.XXXX.XX format
    address_street: Optional[str] = None
    address_zip: Optional[str] = None
    address_city: Optional[str] = None
    nationality: Optional[str] = None
    # Spouse fields (if married)
    spouse_first_name: Optional[str] = None
    spouse_last_name: Optional[str] = None
    spouse_ahv_number: Optional[str] = None
    spouse_date_of_birth: Optional[str] = None
    children: List[ChildData] = Field(default_factory=list)


class OtherIncomeItem(BaseModel):
    description: str
    amount: float


class IncomeData(BaseModel):
    employment_income: Optional[float] = None
    employment_income_spouse: Optional[float] = None
    self_employment_income: Optional[float] = None
    pension_income: Optional[float] = None
    rental_income: Optional[float] = None
    dividend_income: Optional[float] = None
    interest_income: Optional[float] = None
    capital_gains: Optional[float] = None
    alimony_received: Optional[float] = None
    other_income: List[OtherIncomeItem] = Field(default_factory=list)


class BankAccount(BaseModel):
    iban: Optional[str] = None
    bank_name: Optional[str] = None
    balance_chf: Optional[float] = None
    currency: str = "CHF"
    account_type: Optional[str] = None  # savings | current


class SecurityPosition(BaseModel):
    isin: Optional[str] = None
    name: Optional[str] = None
    quantity: Optional[float] = None
    value_chf: Optional[float] = None
    dividend_chf: Optional[float] = None
    asset_class: Optional[str] = None  # equity | bond | fund | crypto | other


class RealEstateProperty(BaseModel):
    address: Optional[str] = None
    canton: Optional[str] = None
    egrid: Optional[str] = None  # Swiss property register number
    ownership_share: Optional[float] = None  # 0.0 to 1.0
    market_value: Optional[float] = None
    rental_value: Optional[float] = None  # Eigenmietwert
    mortgage: Optional[float] = None
    property_type: Optional[str] = None  # apartment | house | commercial | land


class Vehicle(BaseModel):
    vehicle_type: Optional[str] = None  # car | motorcycle | boat | aircraft
    value: Optional[float] = None
    description: Optional[str] = None


class OtherAsset(BaseModel):
    description: str
    value: float


class WealthData(BaseModel):
    bank_accounts: List[BankAccount] = Field(default_factory=list)
    securities: List[SecurityPosition] = Field(default_factory=list)
    real_estate: List[RealEstateProperty] = Field(default_factory=list)
    vehicles: List[Vehicle] = Field(default_factory=list)
    life_insurance_value: Optional[float] = None
    pillar2_capital: Optional[float] = None
    pillar3a_capital: Optional[float] = None
    other_assets: List[OtherAsset] = Field(default_factory=list)


class OtherDeduction(BaseModel):
    description: str
    amount: float


class DeductionsData(BaseModel):
    professional_expenses: Optional[float] = None
    travel_expenses: Optional[float] = None
    meal_expenses: Optional[float] = None
    work_from_home_days: Optional[int] = None
    pillar2_contributions: Optional[float] = None
    pillar3a_contributions: Optional[float] = None
    health_insurance_premiums: Optional[float] = None
    medical_expenses: Optional[float] = None
    alimony_paid: Optional[float] = None
    childcare_expenses: Optional[float] = None
    donations: Optional[float] = None
    debt_interest: Optional[float] = None
    other_deductions: List[OtherDeduction] = Field(default_factory=list)


class Mortgage(BaseModel):
    property_address: Optional[str] = None
    lender: Optional[str] = None
    outstanding_balance: Optional[float] = None
    interest_rate: Optional[float] = None


class Loan(BaseModel):
    lender: Optional[str] = None
    outstanding_balance: Optional[float] = None
    interest_rate: Optional[float] = None
    purpose: Optional[str] = None


class LiabilitiesData(BaseModel):
    mortgages: List[Mortgage] = Field(default_factory=list)
    loans: List[Loan] = Field(default_factory=list)
    other_liabilities: Optional[float] = None


# ── AI-generated advisory structures ─────────────────────────────────────────


class TaxFlag(BaseModel):
    flag_type: str  # error | warning | info | optimisation
    field: Optional[str] = None
    message: str
    severity: Literal["low", "medium", "high", "critical"] = "medium"


class TaxQuestion(BaseModel):
    id: str
    category: str  # personal | income | wealth | deductions | liabilities
    question: str
    answer: Optional[str] = None
    is_answered: bool = False
    field_hint: Optional[str] = None  # dotted path in the profile, e.g. "income.employment_income"


# ── Top-level profile schemas ─────────────────────────────────────────────────


class TaxProfileResponse(BaseModel):
    """Full tax profile returned to the client."""

    model_config = ConfigDict(from_attributes=True)

    id: Union[UUID, str]
    tax_return_id: Union[UUID, str]
    personal_data: Optional[PersonalData] = None
    income_data: Optional[IncomeData] = None
    wealth_data: Optional[WealthData] = None
    deductions_data: Optional[DeductionsData] = None
    liabilities_data: Optional[LiabilitiesData] = None
    tax_questions: Optional[List[TaxQuestion]] = None
    tax_flags: Optional[List[TaxFlag]] = None
    completeness_score: Optional[int] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class TaxProfileUpdateRequest(BaseModel):
    """Payload for PUT /tax-returns/{id}/profile."""

    personal_data: Optional[PersonalData] = None
    income_data: Optional[IncomeData] = None
    wealth_data: Optional[WealthData] = None
    deductions_data: Optional[DeductionsData] = None
    liabilities_data: Optional[LiabilitiesData] = None
    notes: Optional[str] = None
