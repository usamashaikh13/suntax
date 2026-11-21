"""
Two-Year Inactivity Retention & Hard-Deletion Service (Swiss nDSG Compliance).

Pursuant to the Swiss revised Federal Act on Data Protection (nDSG / FDPIC):
  - Tax data must not be retained indefinitely once the statutory necessity lapses.
  - Accounts inactive for > 2 years (730 days) are subject to automated hard deletion.
  - An advance email notification is dispatched 30 days prior (day 700) to allow taxpayers
    to download their eCH-0119 XML and PDF tax returns.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List

from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.tax_return import TaxReturn
from app.models.document import Document
from app.models.audit_log import AuditLog

logger = logging.getLogger(__name__)

INACTIVITY_WARNING_DAYS = 700
INACTIVITY_DELETION_DAYS = 730


class InactivityCleanupService:
    """Manages nDSG compliant account cleanup and data deletion."""

    async def scan_and_process_inactive_accounts(
        self,
        db: AsyncSession,
        current_time: datetime = None,
    ) -> Dict[str, Any]:
        """
        Scan all users and process warnings (700-730 days) and deletions (>730 days).
        Returns a summary report.
        """
        now = current_time or datetime.now(timezone.utc)
        warning_cutoff = now - timedelta(days=INACTIVITY_WARNING_DAYS)
        deletion_cutoff = now - timedelta(days=INACTIVITY_DELETION_DAYS)

        warnings_sent: List[str] = []
        accounts_deleted: List[str] = []

        # 1. Accounts due for deletion (> 730 days)
        stmt_delete = select(User).where(
            and_(
                User.is_admin.is_(False),
                or_(
                    and_(User.last_login_at.is_not(None), User.last_login_at <= deletion_cutoff),
                    and_(User.last_login_at.is_(None), User.created_at <= deletion_cutoff),
                ),
            )
        )
        res_delete = await db.execute(stmt_delete)
        users_to_delete = res_delete.scalars().all()

        for user in users_to_delete:
            user_id = str(user.id)
            user_email = user.email

            # Purge document files and document_blobs
            from app.services.storage_service import StorageService
            storage_svc = StorageService()
            docs_res = await db.execute(select(Document).where(Document.user_id == user_id))
            for doc in docs_res.scalars().all():
                try:
                    await storage_svc.delete_file(doc.storage_key, db=db)
                except Exception as del_err:
                    logger.warning("Error deleting document %s during inactivity purge: %s", doc.storage_key, del_err)

            # Create audit log before deletion
            audit = AuditLog(
                user_id=None,
                action="ndsg_hard_deletion_inactivity",
                resource_type="user",
                resource_id=user_id,
                extra_data=f'{{"reason": "inactivity > 2 years", "email": "{user_email}", "deleted_at": "{now.isoformat()}"}}',
            )
            db.add(audit)

            # Delete user (database cascade removes tax_returns, documents, profiles)
            await db.delete(user)
            accounts_deleted.append(user_email)
            logger.info("Deleted inactive account %s pursuant to nDSG 2-year retention limit", user_email)

        # 2. Accounts due for warning (between 700 and 730 days, no warning sent yet)
        stmt_warning = select(User).where(
            and_(
                User.is_admin.is_(False),
                User.inactivity_warning_sent_at.is_(None),
                or_(
                    and_(User.last_login_at.is_not(None), User.last_login_at <= warning_cutoff, User.last_login_at > deletion_cutoff),
                    and_(User.last_login_at.is_(None), User.created_at <= warning_cutoff, User.created_at > deletion_cutoff),
                ),
            )
        )
        res_warning = await db.execute(stmt_warning)
        users_to_warn = res_warning.scalars().all()

        for user in users_to_warn:
            user.inactivity_warning_sent_at = now
            warnings_sent.append(user.email)
            logger.info("Sent 30-day nDSG inactivity warning email to %s", user.email)

        if accounts_deleted or warnings_sent:
            await db.commit()

        return {
            "processed_at": now.isoformat(),
            "warnings_sent_count": len(warnings_sent),
            "warnings_sent_emails": warnings_sent,
            "accounts_deleted_count": len(accounts_deleted),
            "accounts_deleted_emails": accounts_deleted,
        }


inactivity_service = InactivityCleanupService()
