"""
SQLAlchemy async AuditLog model for SunTax.
Immutable append-only table recording all security-relevant actions.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, _is_sqlite


if _is_sqlite:
    from sqlalchemy import JSON as JSONB
    from sqlalchemy import String as UUID_TYPE

    def _uuid_col(**kw):
        return mapped_column(String(36), **kw)
else:
    from sqlalchemy.dialects.postgresql import JSONB  # type: ignore
    from sqlalchemy.dialects.postgresql import UUID as UUID_TYPE  # type: ignore

    def _uuid_col(**kw):
        return mapped_column(UUID_TYPE(as_uuid=True), **kw)


class AuditLog(Base):
    """Immutable audit trail entry. Append-only."""

    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid.uuid4()),
    )

    user_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    action: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    resource_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    resource_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    success: Mapped[bool] = mapped_column(nullable=False, default=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    extra_data: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON string

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True,
    )

    def __repr__(self) -> str:
        return (
            f"<AuditLog id={self.id} action={self.action!r} "
            f"user={self.user_id} success={self.success}>"
        )
