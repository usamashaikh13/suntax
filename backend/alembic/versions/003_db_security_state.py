"""DB-backed security state (tokens, TOTP replay, AI chat) and token cutoff."""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"
    fk_id_type = sa.dialects.postgresql.UUID(as_uuid=True) if is_pg else sa.String(36)
    insp = sa.inspect(bind)
    user_cols = {c["name"] for c in insp.get_columns("users")}
    if "tokens_valid_after" not in user_cols:
        op.add_column("users", sa.Column("tokens_valid_after", sa.DateTime(timezone=True), nullable=True))

    existing_tables = set(insp.get_table_names())
    if "security_tokens" not in existing_tables:
        op.create_table(
            "security_tokens",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
            sa.Column("token_type", sa.String(32), nullable=False),
            sa.Column("user_id", fk_id_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
            sa.Column("payload", sa.Text, nullable=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_security_tokens_hash", "security_tokens", ["token_hash"])
        op.create_index("ix_security_tokens_type", "security_tokens", ["token_type"])
        op.create_index("ix_security_tokens_user", "security_tokens", ["user_id"])
        op.create_index("ix_security_tokens_exp", "security_tokens", ["expires_at"])

    if "totp_replay_entries" not in existing_tables:
        op.create_table(
            "totp_replay_entries",
            sa.Column("replay_hash", sa.String(64), primary_key=True),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_totp_replay_entries_exp", "totp_replay_entries", ["expires_at"])

    if "ai_chat_messages" not in existing_tables:
        op.create_table(
            "ai_chat_messages",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("user_id", fk_id_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("tax_return_id", fk_id_type, sa.ForeignKey("tax_returns.id", ondelete="CASCADE"), nullable=False),
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
