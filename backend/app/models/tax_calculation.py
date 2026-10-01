"""SQLAlchemy TaxCalculation model — SQLite + PostgreSQL compatible."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, Float, ForeignKey, SmallInteger, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.compat import JSONB

if TYPE_CHECKING:
    from app.models.tax_return import TaxReturn


class TaxCalculation(Base):
    """Stores the output of a tax calculation run for a TaxReturn."""

    __tablename__ = "tax_calculations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tax_return_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tax_returns.id", ondelete="CASCADE"), nullable=False, index=True
    )

    version: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=1)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    is_final: Mapped[bool] = mapped_column(nullable=False, default=False)
    rule_version: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)

    taxable_income: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    taxable_wealth: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    federal_income_tax: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cantonal_income_tax: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    municipal_income_tax: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    wealth_tax: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    total_tax_due: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    calculation_details: Mapped[Optional[str]] = mapped_column(JSONB, nullable=True)
    optimisation_suggestions: Mapped[Optional[str]] = mapped_column(JSONB, nullable=True)

    calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

    tax_return: Mapped["TaxReturn"] = relationship("TaxReturn", back_populates="tax_calculations")

    def __repr__(self) -> str:
        return f"<TaxCalculation id={self.id} return={self.tax_return_id} total={self.total_tax_due}>"
