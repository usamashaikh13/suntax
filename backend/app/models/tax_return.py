"""SQLAlchemy TaxReturn model — SQLite + PostgreSQL compatible."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import DateTime, ForeignKey, SmallInteger, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base

if TYPE_CHECKING:
    from app.models.document import Document
    from app.models.tax_calculation import TaxCalculation
    from app.models.tax_profile import TaxProfile
    from app.models.user import User


class TaxReturn(Base):
    """One annual tax return filing for a user in a specific canton/municipality."""

    __tablename__ = "tax_returns"
    __table_args__ = (
        UniqueConstraint("user_id", "tax_year", "canton_code", name="uq_user_year_canton"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    canton_code: Mapped[str] = mapped_column(String(2), nullable=False, index=True)
    municipality_code: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    municipality_name: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    tax_year: Mapped[int] = mapped_column(SmallInteger, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    confirmed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship("User", back_populates="tax_returns")
    tax_profile: Mapped[Optional["TaxProfile"]] = relationship(
        "TaxProfile", back_populates="tax_return", uselist=False, cascade="all, delete-orphan", lazy="select"
    )
    documents: Mapped[List["Document"]] = relationship("Document", back_populates="tax_return", lazy="select")
    tax_calculations: Mapped[List["TaxCalculation"]] = relationship(
        "TaxCalculation", back_populates="tax_return", cascade="all, delete-orphan", lazy="select"
    )

    def __repr__(self) -> str:
        return f"<TaxReturn id={self.id} year={self.tax_year} canton={self.canton_code} status={self.status!r}>"
