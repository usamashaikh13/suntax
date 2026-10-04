"""
Database type compatibility shim for SunTax.
Provides JSONB and UUIDType that work with both PostgreSQL and SQLite.
"""
from sqlalchemy import JSON, String
from sqlalchemy.dialects.postgresql import JSONB as PG_JSONB, UUID as PG_UUID

# Dynamic JSON type that resolves to JSONB on PostgreSQL and JSON on SQLite
JSONB = JSON().with_variant(PG_JSONB, "postgresql")

# Dynamic UUID/String type that resolves to UUID on PostgreSQL and String(36) on SQLite
UUIDType = String(36).with_variant(PG_UUID(as_uuid=False), "postgresql")
