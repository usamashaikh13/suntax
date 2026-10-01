"""SQLAlchemy TaxProfile model — SQLite + PostgreSQL compatible."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.compat import JSONB

if TYPE_CHECKING:
    from app.models.tax_return import TaxReturn


class TaxProfile(Base):
    """Aggregated tax-relevant data for one TaxReturn."""

    __tablename__ = "tax_profiles"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    tax_return_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tax_returns.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )

    personal_data: Mapped[Optional[str]] = mapped_column(JSONB, nullable=True)
    income_data: Mapped[Optional[str]] = mapped_column(JSONB, nullable=True)
    wealth_data: Mapped[Optional[str]] = mapped_column(JSONB, nullable=True)
    deductions_data: Mapped[Optional[str]] = mapped_column(JSONB, nullable=True)
    liabilities_data: Mapped[Optional[str]] = mapped_column(JSONB, nullable=True)
    tax_questions: Mapped[Optional[str]] = mapped_column(JSONB, nullable=True)
    tax_flags: Mapped[Optional[str]] = mapped_column(JSONB, nullable=True)
    completeness_score: Mapped[Optional[int]] = mapped_column(nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    tax_return: Mapped["TaxReturn"] = relationship("TaxReturn", back_populates="tax_profile")

    def __repr__(self) -> str:
        return f"<TaxProfile id={self.id} tax_return={self.tax_return_id}>"
