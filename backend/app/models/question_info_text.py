"""SQLAlchemy QuestionInfoText model — Part B5 requirement."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Index, SmallInteger, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class QuestionInfoText(Base):
    """
    Contextual info texts and tips stored per canton and tax year in the database.
    
    Contains 3 standardized parts for the «i» helper:
    1. why_we_ask: Warum wir fragen
    2. what_counts: Was zählt und was nicht
    3. example: Ein Beispiel
    Plus optional tips (missed deductions / warnings).
    """

    __tablename__ = "question_info_texts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    canton: Mapped[str] = mapped_column(String(2), nullable=False, index=True)  # "ZH" or "*" for default
    tax_year: Mapped[int] = mapped_column(SmallInteger, nullable=False, index=True)  # 2025
    question_key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)  # e.g. "commute_transport"

    title_de: Mapped[str] = mapped_column(String(128), nullable=False)
    why_we_ask: Mapped[str] = mapped_column(Text, nullable=False)  # 1. Warum wir fragen
    what_counts: Mapped[str] = mapped_column(Text, nullable=False)  # 2. Was zählt und was nicht
    example: Mapped[str] = mapped_column(Text, nullable=False)  # 3. Ein Beispiel

    tip_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # e.g. "Tipp: ..." or warning
    tip_type: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)  # "missed_deduction" | "warning"

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("ix_question_info_lookup", "canton", "tax_year", "question_key"),
    )

    def __repr__(self) -> str:
        return f"<QuestionInfoText {self.canton} {self.tax_year} {self.question_key}>"
