"""Initial schema – all SunTax tables with RLS."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB, INET

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # users
    # ------------------------------------------------------------------
    op.execute('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')
    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("email", sa.Text(), nullable=False, unique=True),
        sa.Column("hashed_password", sa.Text(), nullable=False),
        sa.Column("full_name", sa.Text(), nullable=True),
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("is_admin", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_users_email", "users", ["email"])

    # ------------------------------------------------------------------
    # tax_returns
    # ------------------------------------------------------------------
    op.create_table(
        "tax_returns",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("canton_code", sa.CHAR(2), nullable=False),
        sa.Column("municipality_code", sa.Text(), nullable=False),
        sa.Column("municipality_name", sa.Text(), nullable=False),
        sa.Column("tax_year", sa.SmallInteger(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="draft"),
        sa.Column("confirmed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "canton_code", "municipality_code", "tax_year", name="uq_tax_return"),
    )
    op.create_index("ix_tax_returns_user_id", "tax_returns", ["user_id"])

    # ------------------------------------------------------------------
    # tax_profiles
    # ------------------------------------------------------------------
    op.create_table(
        "tax_profiles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tax_return_id", UUID(as_uuid=True), sa.ForeignKey("tax_returns.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("personal_data", JSONB, nullable=False, server_default="'{}'"),
        sa.Column("income", JSONB, nullable=False, server_default="'{}'"),
        sa.Column("wealth", JSONB, nullable=False, server_default="'{}'"),
        sa.Column("deductions", JSONB, nullable=False, server_default="'{}'"),
        sa.Column("liabilities", JSONB, nullable=False, server_default="'{}'"),
        sa.Column("securities", JSONB, nullable=False, server_default="'[]'"),
        sa.Column("real_estate", JSONB, nullable=False, server_default="'[]'"),
        sa.Column("flags", JSONB, nullable=False, server_default="'[]'"),
        sa.Column("questions", JSONB, nullable=False, server_default="'[]'"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
    )

    # ------------------------------------------------------------------
    # documents
    # ------------------------------------------------------------------
    op.create_table(
        "documents",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tax_return_id", UUID(as_uuid=True), sa.ForeignKey("tax_returns.id", ondelete="SET NULL"), nullable=True),
        sa.Column("original_filename", sa.Text(), nullable=False),
        sa.Column("storage_key", sa.Text(), nullable=False),
        sa.Column("mime_type", sa.Text(), nullable=False),
        sa.Column("file_size_bytes", sa.Integer(), nullable=False),
        sa.Column("document_type", sa.Text(), nullable=True),
        sa.Column("classification_confidence", sa.Float(), nullable=True),
        sa.Column("processing_status", sa.Text(), nullable=False, server_default="'pending'"),
        sa.Column("ocr_text", sa.Text(), nullable=True),
        sa.Column("extracted_data", JSONB, nullable=True),
        sa.Column("extraction_confidence", JSONB, nullable=True),
        sa.Column("is_duplicate_suspect", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("sha256_hash", sa.Text(), nullable=False),
        sa.Column("uploaded_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column("processed_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.create_index("ix_documents_user_id", "documents", ["user_id"])
    op.create_index("ix_documents_tax_return_id", "documents", ["tax_return_id"])
    op.create_index("ix_documents_sha256", "documents", ["sha256_hash"])
    op.create_index("ix_documents_processing_status", "documents", ["processing_status"])

    # ------------------------------------------------------------------
    # tax_rules
    # ------------------------------------------------------------------
    op.create_table(
        "tax_rules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("canton_code", sa.CHAR(2), nullable=True),
        sa.Column("municipality_code", sa.Text(), nullable=True),
        sa.Column("tax_year", sa.SmallInteger(), nullable=False),
        sa.Column("rule_type", sa.Text(), nullable=False),
        sa.Column("rule_key", sa.Text(), nullable=False),
        sa.Column("rule_value", JSONB, nullable=False),
        sa.Column("version", sa.Text(), nullable=False),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("effective_to", sa.Date(), nullable=True),
        sa.Column("source_reference", sa.Text(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("canton_code", "municipality_code", "tax_year", "rule_type", "rule_key", "version", name="uq_tax_rule"),
    )
    op.create_index("ix_tax_rules_lookup", "tax_rules", ["canton_code", "tax_year", "rule_type", "rule_key"])

    # ------------------------------------------------------------------
    # tax_calculations
    # ------------------------------------------------------------------
    op.create_table(
        "tax_calculations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("tax_return_id", UUID(as_uuid=True), sa.ForeignKey("tax_returns.id", ondelete="CASCADE"), nullable=False),
        sa.Column("calculated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column("tax_rule_version", sa.Text(), nullable=False),
        sa.Column("inputs", JSONB, nullable=False),
        sa.Column("results", JSONB, nullable=False),
        sa.Column("breakdown", JSONB, nullable=False),
        sa.Column("is_final", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.create_index("ix_tax_calculations_tax_return_id", "tax_calculations", ["tax_return_id"])

    # ------------------------------------------------------------------
    # audit_logs
    # ------------------------------------------------------------------
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.BigInteger(), autoincrement=True, primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("resource_type", sa.Text(), nullable=True),
        sa.Column("resource_id", sa.Text(), nullable=True),
        sa.Column("ip_address", sa.Text(), nullable=True),
        sa.Column("metadata", JSONB, nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"])
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])

    # ------------------------------------------------------------------
    # Row Level Security
    # ------------------------------------------------------------------
    for table in ["tax_returns", "tax_profiles", "documents", "tax_calculations"]:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")

    op.execute("""
        CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS UUID AS $$
        BEGIN
            RETURN current_setting('app.current_user_id', true)::UUID;
        EXCEPTION WHEN others THEN
            RETURN NULL;
        END;
        $$ LANGUAGE plpgsql STABLE;
    """)

    op.execute("""
        CREATE POLICY user_isolation_tax_returns ON tax_returns
            USING (user_id = app_current_user_id() OR current_setting('app.is_admin', true) = 'true');
    """)
    op.execute("""
        CREATE POLICY user_isolation_documents ON documents
            USING (user_id = app_current_user_id() OR current_setting('app.is_admin', true) = 'true');
    """)
    op.execute("""
        CREATE POLICY user_isolation_tax_profiles ON tax_profiles
            USING (
                tax_return_id IN (
                    SELECT id FROM tax_returns WHERE user_id = app_current_user_id()
                ) OR current_setting('app.is_admin', true) = 'true'
            );
    """)
    op.execute("""
        CREATE POLICY user_isolation_tax_calculations ON tax_calculations
            USING (
                tax_return_id IN (
                    SELECT id FROM tax_returns WHERE user_id = app_current_user_id()
                ) OR current_setting('app.is_admin', true) = 'true'
            );
    """)

    # Grant app user bypass for superuser (migrations run as superuser)
    op.execute("ALTER TABLE tax_returns FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE documents FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE tax_profiles FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE tax_calculations FORCE ROW LEVEL SECURITY")


def downgrade() -> None:
    for table in ["tax_returns", "tax_profiles", "documents", "tax_calculations"]:
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")

    op.execute("DROP FUNCTION IF EXISTS app_current_user_id()")
    op.drop_table("audit_logs")
    op.drop_table("tax_calculations")
    op.drop_table("tax_rules")
    op.drop_table("documents")
    op.drop_table("tax_profiles")
    op.drop_table("tax_returns")
    op.drop_table("users")
