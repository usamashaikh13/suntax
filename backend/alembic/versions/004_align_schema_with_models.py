"""Align schema with ORM models (2FA, deduction rules, info texts, calculations)."""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"
    insp = sa.inspect(bind)
    json_type = JSONB if is_pg else sa.JSON

    # 1. users table
    user_cols = {c["name"] for c in insp.get_columns("users")}
    if "totp_secret" not in user_cols:
        op.add_column("users", sa.Column("totp_secret", sa.String(64), nullable=True))
    if "totp_enabled" not in user_cols:
        op.add_column("users", sa.Column("totp_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    if "failed_login_attempts" not in user_cols:
        op.add_column("users", sa.Column("failed_login_attempts", sa.Integer(), nullable=False, server_default=sa.text("0")))
    if "locked_until" not in user_cols:
        op.add_column("users", sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True))
    if "known_devices" not in user_cols:
        op.add_column("users", sa.Column("known_devices", sa.Text(), nullable=True))

    # 2. tax_profiles table
    tp_cols = {c["name"] for c in insp.get_columns("tax_profiles")}
    for col_name in ["income_data", "wealth_data", "deductions_data", "liabilities_data", "tax_questions", "tax_flags"]:
        if col_name not in tp_cols:
            op.add_column("tax_profiles", sa.Column(col_name, json_type, nullable=True))
    if "completeness_score" not in tp_cols:
        op.add_column("tax_profiles", sa.Column("completeness_score", sa.Integer(), nullable=True))
    if "notes" not in tp_cols:
        op.add_column("tax_profiles", sa.Column("notes", sa.Text(), nullable=True))

    # 3. tax_calculations table
    tc_cols = {c["name"] for c in insp.get_columns("tax_calculations")}
    for float_col in ["cantonal_income_tax", "federal_income_tax", "municipal_income_tax", "wealth_tax", "total_tax_due", "taxable_income", "taxable_wealth"]:
        if float_col not in tc_cols:
            op.add_column("tax_calculations", sa.Column(float_col, sa.Float(), nullable=True))
    for json_col in ["calculation_details", "optimisation_suggestions"]:
        if json_col not in tc_cols:
            op.add_column("tax_calculations", sa.Column(json_col, json_type, nullable=True))
    if "status" not in tc_cols:
        op.add_column("tax_calculations", sa.Column("status", sa.String(32), nullable=True))
    if "rule_version" not in tc_cols:
        op.add_column("tax_calculations", sa.Column("rule_version", sa.String(64), nullable=True))
    if "version" not in tc_cols:
        op.add_column("tax_calculations", sa.Column("version", sa.Integer(), nullable=True))
    if "created_at" not in tc_cols:
        op.add_column("tax_calculations", sa.Column("created_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.func.now()))

    # 4. audit_logs table
    al_cols = {c["name"] for c in insp.get_columns("audit_logs")}
    if "user_agent" not in al_cols:
        op.add_column("audit_logs", sa.Column("user_agent", sa.Text(), nullable=True))
    if "success" not in al_cols:
        op.add_column("audit_logs", sa.Column("success", sa.Boolean(), nullable=True, server_default=sa.text("true")))
    if "extra_data" not in al_cols:
        op.add_column("audit_logs", sa.Column("extra_data", json_type, nullable=True))
    if "error_message" not in al_cols:
        op.add_column("audit_logs", sa.Column("error_message", sa.Text(), nullable=True))

    # 5. tax_rules table
    tr_cols = {c["name"] for c in insp.get_columns("tax_rules")}
    if "rule_data" not in tr_cols:
        op.add_column("tax_rules", sa.Column("rule_data", json_type, nullable=True))
    if "description" not in tr_cols:
        op.add_column("tax_rules", sa.Column("description", sa.Text(), nullable=True))
    if "applies_to" not in tr_cols:
        op.add_column("tax_rules", sa.Column("applies_to", sa.String(64), nullable=True))
    if "source_url" not in tr_cols:
        op.add_column("tax_rules", sa.Column("source_url", sa.Text(), nullable=True))
    if "updated_at" not in tr_cols:
        op.add_column("tax_rules", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True, server_default=sa.func.now()))

    # 6. Ensure secondary tables exist
    tables = set(insp.get_table_names())
    if "deduction_rules" not in tables:
        op.create_table(
            "deduction_rules",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("canton", sa.String(2), nullable=False, index=True),
            sa.Column("tax_year", sa.SmallInteger(), nullable=False, index=True),
            sa.Column("level", sa.String(16), nullable=False, index=True),
            sa.Column("code", sa.String(64), nullable=False, index=True),
            sa.Column("form_field", sa.String(32), nullable=True),
            sa.Column("type", sa.String(32), nullable=False),
            sa.Column("value", sa.Float(), nullable=True),
            sa.Column("min", sa.Float(), nullable=True),
            sa.Column("max", sa.Float(), nullable=True),
            sa.Column("base", sa.String(64), nullable=True),
            sa.Column("conditions", sa.Text(), nullable=True),
            sa.Column("depends_on", sa.String(64), nullable=True),
            sa.Column("source_url", sa.Text(), nullable=True),
            sa.Column("source_page", sa.String(64), nullable=True),
            sa.Column("status", sa.String(16), nullable=False, server_default="draft"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_deduction_lookup", "deduction_rules", ["canton", "tax_year", "level", "code"])

    if "question_info_texts" not in tables:
        op.create_table(
            "question_info_texts",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("canton", sa.String(2), nullable=False, index=True),
            sa.Column("tax_year", sa.SmallInteger(), nullable=False, index=True),
            sa.Column("question_key", sa.String(64), nullable=False, index=True),
            sa.Column("title_de", sa.String(128), nullable=False),
            sa.Column("why_we_ask", sa.Text(), nullable=False),
            sa.Column("what_counts", sa.Text(), nullable=False),
            sa.Column("example", sa.Text(), nullable=False),
            sa.Column("tip_text", sa.Text(), nullable=True),
            sa.Column("tip_type", sa.String(32), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_question_info_lookup", "question_info_texts", ["canton", "tax_year", "question_key"])

    if "waitlist_entries" not in tables:
        op.create_table(
            "waitlist_entries",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("email", sa.String(320), nullable=False, index=True),
            sa.Column("canton_code", sa.String(2), nullable=False, index=True),
            sa.Column("tax_year", sa.Integer(), nullable=False, server_default=sa.text("2025")),
            sa.Column("postal_code", sa.String(10), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        )


def downgrade() -> None:
    pass
