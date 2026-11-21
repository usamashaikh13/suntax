"""SQLAlchemy model for persistent database document payload storage (Render free tier persistence)."""
from __future__ import annotations

from datetime import datetime
from sqlalchemy import DateTime, LargeBinary, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class DocumentBlob(Base):
    """
    Stores encrypted document bytes in PostgreSQL / SQLite so uploaded tax receipts
    survive container spin-downs, restarts, and redeployments on free-tier hosting (e.g. Render).
    """

    __tablename__ = "document_blobs"

    key: Mapped[str] = mapped_column(String(512), primary_key=True, index=True)
    payload: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    def __repr__(self) -> str:
        return f"<DocumentBlob key={self.key!r} bytes={len(self.payload)}>"
