"""Add document_blobs table for persistent encrypted document storage.

Revision ID: 005
Revises: 004
Create Date: 2026-11-21
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = insp.get_table_names()
    if "document_blobs" not in tables:
        op.create_table(
            "document_blobs",
            sa.Column("key", sa.String(512), primary_key=True),
            sa.Column("payload", sa.LargeBinary(), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()" if bind.dialect.name == "postgresql" else "CURRENT_TIMESTAMP"),
                nullable=False,
            ),
        )
        op.create_index("ix_document_blobs_key", "document_blobs", ["key"])


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = insp.get_table_names()
    if "document_blobs" in tables:
        try:
            op.drop_index("ix_document_blobs_key", table_name="document_blobs")
        except Exception:
            pass
        op.drop_table("document_blobs")
