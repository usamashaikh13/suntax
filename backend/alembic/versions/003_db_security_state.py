"""DB-backed security state (tokens, TOTP replay, AI chat) and token cutoff."""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("tokens_valid_after", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "security_tokens",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("token_type", sa.String(32), nullable=False),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("payload", sa.Text, nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_security_tokens_hash", "security_tokens", ["token_hash"])
    op.create_index("ix_security_tokens_type", "security_tokens", ["token_type"])
    op.create_index("ix_security_tokens_user", "security_tokens", ["user_id"])
    op.create_index("ix_security_tokens_exp", "security_tokens", ["expires_at"])

    op.create_table(
        "totp_replay_entries",
        sa.Column("replay_hash", sa.String(64), primary_key=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_totp_replay_entries_exp", "totp_replay_entries", ["expires_at"])

    op.create_table(
        "ai_chat_messages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tax_return_id", sa.String(36), sa.ForeignKey("tax_returns.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_ai_chat_messages_user_tr", "ai_chat_messages", ["user_id", "tax_return_id"])


def downgrade() -> None:
    op.drop_index("ix_ai_chat_messages_user_tr", table_name="ai_chat_messages")
    op.drop_table("ai_chat_messages")
    op.drop_index("ix_totp_replay_entries_exp", table_name="totp_replay_entries")
    op.drop_table("totp_replay_entries")
    op.drop_index("ix_security_tokens_exp", table_name="security_tokens")
    op.drop_index("ix_security_tokens_user", table_name="security_tokens")
    op.drop_index("ix_security_tokens_type", table_name="security_tokens")
    op.drop_index("ix_security_tokens_hash", table_name="security_tokens")
    op.drop_table("security_tokens")
    op.drop_column("users", "tokens_valid_after")
