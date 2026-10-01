"""SQLAlchemy TaxRule model — SQLite + PostgreSQL compatible."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, SmallInteger, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.compat import JSONB


class TaxRule(Base):
    """A canton/year-specific tax rule or rate table entry."""

    __tablename__ = "tax_rules"
    __table_args__ = (
        UniqueConstraint("canton_code", "tax_year", "rule_type", name="uq_rule_canton_year_type"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    canton_code: Mapped[str] = mapped_column(String(2), nullable=False, index=True)
    tax_year: Mapped[int] = mapped_column(SmallInteger, nullable=False, index=True)
    rule_type: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    rule_data: Mapped[Optional[str]] = mapped_column(JSONB, nullable=True)
    applies_to: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    source_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    effective_from: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    effective_to: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    def __repr__(self) -> str:
        return f"<TaxRule canton={self.canton_code} year={self.tax_year} type={self.rule_type!r}>"
