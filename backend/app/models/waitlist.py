"""SQLAlchemy model for canton rollout waitlist signups (Addendum 1 Section 2)."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class WaitlistEntry(Base):
    """Stores email waitlist subscriptions for cantons with 'coming_soon' status."""

    __tablename__ = "waitlist_entries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    canton_code: Mapped[str] = mapped_column(String(2), nullable=False, index=True)
    tax_year: Mapped[int] = mapped_column(Integer, nullable=False, default=2025)
    postal_code: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
