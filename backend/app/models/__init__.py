"""
Models package – imports all ORM models so that SQLAlchemy's mapper
registry and Alembic's autogenerate can discover them.
"""

from app.core.database import Base  # noqa: F401 – re-exported for convenience
from app.models.audit_log import AuditLog
from app.models.document import Document
from app.models.tax_calculation import TaxCalculation
from app.models.tax_profile import TaxProfile
from app.models.tax_return import TaxReturn
from app.models.tax_rule import TaxRule
from app.models.user import User

__all__ = [
    "Base",
    "AuditLog",
    "Document",
    "TaxCalculation",
    "TaxProfile",
    "TaxReturn",
    "TaxRule",
    "User",
]
