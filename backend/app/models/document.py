"""SQLAlchemy Document model — compatible with both PostgreSQL and SQLite."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import BigInteger, Boolean, DateTime, Float, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.compat import JSONB

if TYPE_CHECKING:
    from app.models.tax_return import TaxReturn
    from app.models.user import User


class Document(Base):
    """Represents an uploaded document (PDF, image) and its processing state."""

    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    tax_return_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("tax_returns.id", ondelete="SET NULL"), nullable=True, index=True)

    original_filename: Mapped[str] = mapped_column(Text, nullable=False)
    storage_key: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    mime_type: Mapped[str] = mapped_column(String(128), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)

    document_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    classification_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    processing_status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending", index=True)

    ocr_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    extracted_data: Mapped[Optional[str]] = mapped_column(JSONB, nullable=True)
    extraction_confidence: Mapped[Optional[str]] = mapped_column(JSONB, nullable=True)

    is_duplicate_suspect: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sha256_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)

    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    processed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="documents")
    tax_return: Mapped[Optional["TaxReturn"]] = relationship("TaxReturn", back_populates="documents")

    @property
    def error_message(self) -> Optional[str]:
        if isinstance(self.extracted_data, dict):
            return self.extracted_data.get("_error_message") or self.extracted_data.get("error")
        return None

    @property
    def provider(self) -> Optional[str]:
        if isinstance(self.extracted_data, dict):
            meta = self.extracted_data.get("_metadata")
            if isinstance(meta, dict):
                return meta.get("provider")
        return None

    def __repr__(self) -> str:
        return f"<Document id={self.id} filename={self.original_filename!r} status={self.processing_status!r}>"
