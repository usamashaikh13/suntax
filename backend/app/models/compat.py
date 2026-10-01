"""
Database type compatibility shim for SunTax.
Provides JSONB and UUIDType that work with both PostgreSQL and SQLite.
"""
from app.core.database import _is_sqlite

if _is_sqlite:
    from sqlalchemy import JSON as JSONB  # noqa: F401
    from sqlalchemy import String

    class UUIDType(String):
        """UUID stored as 36-char string in SQLite."""
        def __init__(self, as_uuid=True, **kw):
            super().__init__(length=36, **kw)
else:
    from sqlalchemy.dialects.postgresql import JSONB  # noqa: F401
    from sqlalchemy.dialects.postgresql import UUID as UUIDType  # noqa: F401
