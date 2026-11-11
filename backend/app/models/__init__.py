"""
Models package – imports all ORM models so that SQLAlchemy's mapper
registry and Alembic's autogenerate can discover them.
"""

from app.core.database import Base  # noqa: F401 – re-exported for convenience
from app.models.audit_log import AuditLog
from app.models.deduction_rule import DeductionRule
from app.models.document import Document
from app.models.question_info_text import QuestionInfoText
from app.models.security_state import AiChatMessage, SecurityToken, TotpReplayEntry
from app.models.tax_calculation import TaxCalculation
from app.models.tax_profile import TaxProfile
from app.models.tax_return import TaxReturn
from app.models.tax_rule import TaxRule
from app.models.user import User
from app.models.waitlist import WaitlistEntry

__all__ = [
    "Base",
    "AuditLog",
    "AiChatMessage",
    "DeductionRule",
    "Document",
    "QuestionInfoText",
    "SecurityToken",
    "TaxCalculation",
    "TaxProfile",
    "TaxReturn",
    "TaxRule",
    "TotpReplayEntry",
    "User",
    "WaitlistEntry",
]
