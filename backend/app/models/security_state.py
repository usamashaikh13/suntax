"""
SQLAlchemy models for persistent DB-backed security state and AI chat history.

Replaces Redis / in-memory dictionaries so refresh tokens, token denylist,
email/2FA single-use tokens, TOTP replay protection, and AI copilot chat history
persist across backend restarts and multiple workers.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SecurityToken(Base):
    """Hashed persistent tokens (refresh sessions, JWT denylist, single-use OTP/email tokens)."""

    __tablename__ = "security_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    token_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    user_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    payload: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class TotpReplayEntry(Base):
    """Consumed TOTP replay hashes ensuring cross-worker / post-restart single-use enforcement."""

    __tablename__ = "totp_replay_entries"

    replay_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class AiChatMessage(Base):
    """Persistent AI Tax Copilot message history scoped to (user_id, tax_return_id)."""

    __tablename__ = "ai_chat_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tax_return_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("tax_returns.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
