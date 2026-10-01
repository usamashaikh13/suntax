"""
Pydantic v2 schemas for the SunTax tax calculation engine.

These schemas are used for API request/response validation, serialisation,
and internal data transfer between the tax engine and downstream services
(PDF export, XML export, AI assistant).
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class MaritalStatus(str, Enum):
    """Marital status affecting tax splitting rules."""

    SINGLE = "single"
    MARRIED = "married"
    REGISTERED_PARTNERSHIP = "registered_partnership"
    DIVORCED = "divorced"
    WIDOWED = "widowed"


class TaxReturnStatus(str, Enum):
    DRAFT = "draft"
    CALCULATED = "calculated"
    CONFIRMED = "confirmed"
    SUBMITTED = "submitted"


# ---------------------------------------------------------------------------
# Line-item breakdown
# ---------------------------------------------------------------------------


class TaxLineItem(BaseModel):
    """
    A single line in the detailed tax calculation breakdown.

    Each line corresponds to a specific rule application (e.g., a bracket
    step, a deduction cap, a multiplier).
    """

    label: str = Field(..., description="Human-readable description of this line item")
    amount: Decimal = Field(..., description="CHF amount (positive = income/tax, negative = deduction/relief)")
    rule_key: str = Field(..., description="Machine-readable key identifying the applied rule (e.g. 'pillar3a_max')")
    rule_reference: str = Field(
        ...,
        description="Legal reference for the rule (e.g. 'DBG Art. 26' or 'StG ZH § 30')",
    )
    canton_code: Optional[str] = Field(None, description="Canton this rule belongs to (None = federal)")
    tax_year: int = Field(..., description="Tax year this rule applies to")

    model_config = {"json_encoders": {Decimal: str}}


# ---------------------------------------------------------------------------
# Deductions breakdown
# ---------------------------------------------------------------------------


class TaxDeductionsApplied(BaseModel):
    """
    Itemised breakdown of every deduction applied during the calculation.

    All amounts are positive numbers representing CHF deducted from gross income.
    A value of 0 means the deduction was not applicable or the claimed amount
    was zero. ``None`` means the deduction category was not evaluated (e.g.
    childcare when no children).
    """

    commuting: Decimal = Field(Decimal("0"), ge=0, description="Commuting expense deduction (capped at canton/federal max)")
    meals: Decimal = Field(Decimal("0"), ge=0, description="Meal expense deduction")
    professional_expenses: Decimal = Field(Decimal("0"), ge=0, description="General professional/work expense deduction")
    pillar3a: Decimal = Field(Decimal("0"), ge=0, description="Pillar 3a contribution deduction")
    health_insurance: Decimal = Field(Decimal("0"), ge=0, description="Health insurance premium deduction")
    medical_expenses: Decimal = Field(Decimal("0"), ge=0, description="Out-of-pocket medical expenses above threshold")
    donations: Decimal = Field(Decimal("0"), ge=0, description="Charitable donation deduction")
    childcare: Optional[Decimal] = Field(None, ge=0, description="Childcare cost deduction (None if no children)")
    child_deduction: Optional[Decimal] = Field(None, ge=0, description="Per-child tax deduction (None if no children)")
    interest_expenses: Decimal = Field(Decimal("0"), ge=0, description="Deductible interest on debts")
    other: Decimal = Field(Decimal("0"), ge=0, description="Catch-all for any other applicable deductions")

    @property
    def total(self) -> Decimal:
        """Sum of all applied deductions."""
        parts = [
            self.commuting,
            self.meals,
            self.professional_expenses,
            self.pillar3a,
            self.health_insurance,
            self.medical_expenses,
            self.donations,
            self.childcare or Decimal("0"),
            self.child_deduction or Decimal("0"),
            self.interest_expenses,
            self.other,
        ]
        return sum(parts, Decimal("0"))

    model_config = {"json_encoders": {Decimal: str}}


# ---------------------------------------------------------------------------
# Main calculation result
# ---------------------------------------------------------------------------


class TaxCalculationResult(BaseModel):
    """
    Complete result of a deterministic Swiss tax calculation.

    Federal, cantonal, and municipal taxes are computed separately so that
    the caller can display itemised breakdowns or build detailed PDF/XML exports.
    """

    # Identifiers / metadata
    tax_return_id: str = Field(..., description="UUID of the parent TaxReturn record")
    canton_code: str = Field(..., min_length=2, max_length=2, description="Two-letter Swiss canton code (e.g. 'ZH')")
    municipality_code: str = Field(..., description="BFS municipality number as string")
    tax_year: int = Field(..., ge=2020, le=2099, description="Tax period year")
    marital_status: MaritalStatus = Field(..., description="Marital status used for the calculation")
    rule_version: str = Field(..., description="Semantic version of the rule set used (e.g. '1.0.0')")
    calculated_at: datetime = Field(default_factory=datetime.utcnow, description="UTC timestamp of the calculation")

    # Tax base
    taxable_income: Decimal = Field(..., ge=0, description="Net taxable income after all deductions (CHF, min 0)")
    taxable_wealth: Decimal = Field(..., ge=0, description="Net taxable wealth after liabilities and social deductions (CHF, min 0)")

    # Income taxes
    federal_income_tax: Decimal = Field(..., ge=0, description="Direct federal tax (DBG) on income (CHF)")
    cantonal_income_tax: Decimal = Field(..., ge=0, description="Cantonal income tax before municipal multiplier (CHF)")
    municipal_income_tax: Decimal = Field(..., ge=0, description="Municipal income tax = cantonal × (multiplier / 100) (CHF)")

    # Wealth taxes
    wealth_tax_canton: Decimal = Field(..., ge=0, description="Cantonal wealth tax (CHF)")
    wealth_tax_municipal: Decimal = Field(..., ge=0, description="Municipal wealth tax = cantonal × (multiplier / 100) (CHF)")

    # Totals
    total_tax: Decimal = Field(..., ge=0, description="Sum of all taxes (income + wealth, federal + canton + municipal)")

    # Detailed breakdowns
    deductions_applied: TaxDeductionsApplied = Field(..., description="Itemised deduction amounts actually applied")
    breakdown: list[TaxLineItem] = Field(default_factory=list, description="Full line-by-line calculation trace")

    @model_validator(mode="after")
    def validate_total_tax(self) -> "TaxCalculationResult":
        """Sanity-check: total_tax must equal the sum of all component taxes."""
        expected = (
            self.federal_income_tax
            + self.cantonal_income_tax
            + self.municipal_income_tax
            + self.wealth_tax_canton
            + self.wealth_tax_municipal
        )
        # Allow for minor rounding (< 1 CHF)
        if abs(self.total_tax - expected) >= Decimal("1"):
            raise ValueError(
                f"total_tax {self.total_tax} does not match component sum {expected}"
            )
        return self

    model_config = {"json_encoders": {Decimal: str}}


# ---------------------------------------------------------------------------
# API request schemas
# ---------------------------------------------------------------------------


class TaxCalculationRequest(BaseModel):
    """Request body for triggering a tax calculation via the API."""

    tax_return_id: str = Field(..., description="UUID of the TaxReturn to calculate")
    force_recalculate: bool = Field(
        False,
        description="If True, discard any cached result and recalculate from scratch",
    )
    rule_version: Optional[str] = Field(
        None,
        description=(
            "Pin to a specific rule version (e.g. '1.0.0'). "
            "If None, the latest published version for the tax_year is used."
        ),
    )


class TaxReturnConfirmRequest(BaseModel):
    """Request body for finalising (confirming) a tax return."""

    confirmation_text: str = Field(
        ...,
        description=(
            "The taxpayer must type the exact phrase "
            "'Ich bestätige die Richtigkeit meiner Angaben' to confirm."
        ),
    )

    REQUIRED_PHRASE: str = "Ich bestätige die Richtigkeit meiner Angaben"

    @field_validator("confirmation_text")
    @classmethod
    def must_match_phrase(cls, v: str) -> str:
        required = "Ich bestätige die Richtigkeit meiner Angaben"
        if v.strip() != required:
            raise ValueError(
                f"Confirmation text must be exactly: '{required}'"
            )
        return v.strip()


# ---------------------------------------------------------------------------
# Chat schemas
# ---------------------------------------------------------------------------


class ChatMessage(BaseModel):
    """A single message in the AI assistant conversation."""

    role: str = Field(..., description="'user' or 'assistant'")
    content: str = Field(..., description="Message text")
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class ChatRequest(BaseModel):
    """Request body for the AI assistant chat endpoint."""

    message: str = Field(..., min_length=1, max_length=4000, description="User's question or message")


class ChatResponse(BaseModel):
    """Response from the AI assistant."""

    reply: str = Field(..., description="Assistant's response")
    tax_return_id: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# Export request schemas
# ---------------------------------------------------------------------------


class PDFExportRequest(BaseModel):
    """Optional parameters for PDF export."""

    language: str = Field("de", description="Language code for the PDF ('de', 'fr', 'it', 'en')")
    include_breakdown: bool = Field(True, description="Include the detailed line-by-line breakdown table")


class XMLExportRequest(BaseModel):
    """Optional parameters for eCH-0196 XML export."""

    schema_version: str = Field("1.0", description="eCH-0196 schema version to target")
