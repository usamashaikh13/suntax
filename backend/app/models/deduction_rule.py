"""SQLAlchemy DeductionRule model — Part A1 requirement."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, Index, SmallInteger, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.compat import JSONB


class DeductionRule(Base):
    """
    A database-driven tax deduction rule for Swiss Canton or Federal level.
    
    Rules are looked up by (canton, tax_year, level).
    Levels: 'canton' or 'federal'.
    Rule types: 'cap', 'flat', 'rate', 'per_day', 'per_km', 'choice'.
    """

    __tablename__ = "deduction_rules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    canton: Mapped[str] = mapped_column(String(2), nullable=False, index=True)  # e.g. "ZH"
    tax_year: Mapped[int] = mapped_column(SmallInteger, nullable=False, index=True)  # e.g. 2025
    level: Mapped[str] = mapped_column(String(16), nullable=False, index=True)  # "canton" | "federal"
    code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)  # e.g. "commute_total"

    form_field: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)  # Ziffer in tax form, e.g. "2.1"
    type: Mapped[str] = mapped_column(String(32), nullable=False)  # cap, flat, rate, per_day, per_km, choice

    value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # fixed amount or rate e.g. 700 or 0.03
    min_val: Mapped[Optional[float]] = mapped_column("min", Float, nullable=True)  # minimum bounded amount
    max_val: Mapped[Optional[float]] = mapped_column("max", Float, nullable=True)  # maximum cap e.g. 5200

    base: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)  # net_salary, actual_costs, km_per_day
    conditions: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON or text e.g. "no company car"
    depends_on: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)  # married, children, pension

    source_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_page: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft")  # draft | checked

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("ix_deduction_lookup", "canton", "tax_year", "level", "code"),
    )

    def __repr__(self) -> str:
        return f"<DeductionRule {self.canton} {self.tax_year} {self.level} {self.code} type={self.type}>"
