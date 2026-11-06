"""Add spouse confirmation, payment, access code and retention columns."""
from alembic import op
import sqlalchemy as sa

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Tax returns additions
    op.add_column("tax_returns", sa.Column("payment_status", sa.String(32), nullable=False, server_default="pending"))
    op.add_column("tax_returns", sa.Column("payment_method", sa.String(32), nullable=True))
    op.add_column("tax_returns", sa.Column("payment_amount", sa.Float(), nullable=True, server_default="39.0"))
    op.add_column("tax_returns", sa.Column("paid_at", sa.TIMESTAMP(timezone=True), nullable=True))
    op.add_column("tax_returns", sa.Column("payment_gateway_id", sa.String(64), nullable=True))
    op.add_column("tax_returns", sa.Column("payment_transaction_id", sa.String(64), nullable=True))

    op.add_column("tax_returns", sa.Column("partner2_email", sa.String(255), nullable=True))
    op.add_column("tax_returns", sa.Column("partner2_phone", sa.String(32), nullable=True))
    op.add_column("tax_returns", sa.Column("partner2_confirmation_token", sa.String(128), nullable=True))
    op.add_column("tax_returns", sa.Column("partner2_token_expires_at", sa.TIMESTAMP(timezone=True), nullable=True))
    op.add_column("tax_returns", sa.Column("partner2_confirmed_at", sa.TIMESTAMP(timezone=True), nullable=True))
    op.add_column("tax_returns", sa.Column("partner2_confirmed_name", sa.String(255), nullable=True))
    op.add_column("tax_returns", sa.Column("return_data_hash", sa.String(64), nullable=True))

    op.add_column("tax_returns", sa.Column("canton_access_code", sa.String(64), nullable=True))
    op.add_column("tax_returns", sa.Column("transmission_status", sa.String(32), nullable=True))
    op.add_column("tax_returns", sa.Column("transmission_receipt", sa.String(64), nullable=True))

    # Users additions
    op.add_column("users", sa.Column("last_login_at", sa.TIMESTAMP(timezone=True), nullable=True))
    op.add_column("users", sa.Column("inactivity_warning_sent_at", sa.TIMESTAMP(timezone=True), nullable=True))
    op.add_column("users", sa.Column("terms_accepted_at", sa.TIMESTAMP(timezone=True), nullable=True))
    op.add_column("users", sa.Column("privacy_accepted_at", sa.TIMESTAMP(timezone=True), nullable=True))


def downgrade() -> None:
    pass
