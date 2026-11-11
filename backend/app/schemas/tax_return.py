"""
Pydantic v2 schemas for TaxReturn and canton/municipality lookups.
"""

from __future__ import annotations

from datetime import datetime
from typing import Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ── Canton / Municipality ─────────────────────────────────────────────────────


class CantonResponse(BaseModel):
    """ISO 3166-2:CH two-letter canton code and display name."""

    code: str = Field(..., min_length=2, max_length=2, examples=["ZH"])
    name: str = Field(..., examples=["Zürich"])
    availability: Optional[Dict[str, str]] = Field(
        None,
        description="Rollout availability per tax year ('available' or 'coming_soon')",
    )


class WaitlistCreateRequest(BaseModel):
    """Payload for POST /waitlist (Addendum 1 Section 2)."""

    email: EmailStr = Field(..., description="Email address to notify when canton opens")
    canton_code: str = Field(..., min_length=2, max_length=2, examples=["BE"])
    tax_year: int = Field(2025, ge=2024, le=2030)
    postal_code: Optional[str] = Field(None, max_length=10)


class MunicipalityResponse(BaseModel):
    """Swiss municipality (Gemeinde) with BFS number."""

    code: str = Field(..., description="BFS municipality number", examples=["261"])
    name: str = Field(..., examples=["Zürich"])
    canton_code: str = Field(..., min_length=2, max_length=2, examples=["ZH"])


# ── TaxReturn CRUD ────────────────────────────────────────────────────────────


class TaxReturnCreate(BaseModel):
    """Payload for POST /tax-returns."""

    canton_code: str = Field(..., min_length=2, max_length=2, examples=["ZH"])
    municipality_code: Optional[str] = Field(None, examples=["261"])
    municipality_name: Optional[str] = Field(None, examples=["Zürich"])
    tax_year: int = Field(..., ge=2010, le=2030, examples=[2024])


class TaxReturnUpdate(BaseModel):
    """Payload for PATCH /tax-returns/{id}. Only status is user-mutable."""

    status: Optional[str] = Field(
        None,
        pattern="^(draft|processing|review|completed|submitted)$",
        examples=["review"],
    )


class TaxReturnResponse(BaseModel):
    """Full tax return representation returned to the client."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    canton_code: str
    municipality_code: Optional[str]
    municipality_name: Optional[str]
    tax_year: int
    status: str
    confirmed_at: Optional[datetime]
    payment_status: Optional[str] = "pending"
    payment_method: Optional[str] = None
    payment_amount: Optional[float] = 39.0
    paid_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class TaxReturnListResponse(BaseModel):
    """Paginated list of tax returns."""

    items: List[TaxReturnResponse]
    total: int
    page: int
    page_size: int
