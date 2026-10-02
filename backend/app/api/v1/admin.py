"""
Admin API router for SunTax.

All endpoints require is_admin = True.

Endpoints:
  GET  /admin/users          – paginated user list
  GET  /admin/users/{id}     – user detail
  PUT  /admin/users/{id}/activate – toggle is_active
  GET  /admin/stats          – aggregate system statistics
  GET  /admin/audit-logs     – paginated audit log
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_admin_user
from app.models.audit_log import AuditLog
from app.models.document import Document
from app.models.tax_return import TaxReturn
from app.models.user import User
from app.schemas.auth import UserResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["Admin"])


# ── Admin-specific response schemas ───────────────────────────────────────────


class PaginatedUsers(BaseModel):
    items: List[UserResponse]
    total: int
    page: int
    page_size: int


class SystemStats(BaseModel):
    total_users: int
    active_users: int
    verified_users: int
    total_documents: int
    pending_documents: int
    failed_documents: int
    total_tax_returns: int
    draft_tax_returns: int


class AuditLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: Optional[str]
    action: str
    resource_type: Optional[str]
    resource_id: Optional[str]
    ip_address: Optional[str]
    success: bool
    error_message: Optional[str]
    metadata: Optional[Dict[str, Any]]
    created_at: datetime


class PaginatedAuditLogs(BaseModel):
    items: List[AuditLogResponse]
    total: int
    page: int
    page_size: int


class ActivationPayload(BaseModel):
    is_active: bool


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get(
    "/users",
    response_model=PaginatedUsers,
    summary="[Admin] List all users",
)
async def admin_list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: Optional[str] = Query(None, description="Filter by email prefix"),
    _admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
) -> PaginatedUsers:
    """Return a paginated list of all registered users."""
    base_q = select(User)
    if search:
        base_q = base_q.where(User.email.ilike(f"{search}%"))

    count_q = select(func.count()).select_from(base_q.subquery())
    total = (await db.execute(count_q)).scalar_one()

    items_q = (
        base_q.order_by(User.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    users = (await db.execute(items_q)).scalars().all()

    return PaginatedUsers(
        items=[UserResponse.model_validate(u) for u in users],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/users/{user_id}",
    response_model=UserResponse,
    summary="[Admin] Get a specific user",
)
async def admin_get_user(
    user_id: str,
    _admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    result = await db.execute(select(User).where(User.id == str(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return UserResponse.model_validate(user)


@router.put(
    "/users/{user_id}/activate",
    response_model=UserResponse,
    summary="[Admin] Activate or deactivate a user",
)
async def admin_toggle_user_activation(
    user_id: str,
    payload: ActivationPayload,
    admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Toggle user.is_active. Deactivating prevents future logins."""
    result = await db.execute(select(User).where(User.id == str(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if str(user.id) == str(admin.id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admins cannot deactivate themselves",
        )

    user.is_active = payload.is_active
    db.add(user)

    db.add(
        AuditLog(
            user_id=str(admin.id),
            action="admin.user_deactivated" if not payload.is_active else "admin.user_activated",
            resource_type="user",
            resource_id=str(user.id),
        )
    )

    logger.info(
        "Admin %s set user %s is_active=%s", admin.id, user.id, payload.is_active
    )
    return UserResponse.model_validate(user)


@router.get(
    "/stats",
    response_model=SystemStats,
    summary="[Admin] System-wide statistics",
)
async def admin_stats(
    _admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
) -> SystemStats:
    """Return aggregate counts across the system."""

    async def count(model, *filters):
        q = select(func.count()).select_from(model)
        if filters:
            q = q.where(*filters)
        return (await db.execute(q)).scalar_one()

    total_users = await count(User)
    active_users = await count(User, User.is_active.is_(True))
    verified_users = await count(User, User.is_verified.is_(True))
    total_documents = await count(Document)
    pending_documents = await count(Document, Document.processing_status == "pending")
    failed_documents = await count(Document, Document.processing_status == "failed")
    total_tax_returns = await count(TaxReturn)
    draft_tax_returns = await count(TaxReturn, TaxReturn.status == "draft")

    return SystemStats(
        total_users=total_users,
        active_users=active_users,
        verified_users=verified_users,
        total_documents=total_documents,
        pending_documents=pending_documents,
        failed_documents=failed_documents,
        total_tax_returns=total_tax_returns,
        draft_tax_returns=draft_tax_returns,
    )


@router.get(
    "/audit-logs",
    response_model=PaginatedAuditLogs,
    summary="[Admin] Paginated audit log",
)
async def admin_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    action: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    _admin: User = Depends(get_current_admin_user),
    db: AsyncSession = Depends(get_db),
) -> PaginatedAuditLogs:
    base_q = select(AuditLog)
    if action:
        base_q = base_q.where(AuditLog.action.ilike(f"%{action}%"))
    if user_id:
        base_q = base_q.where(AuditLog.user_id == str(user_id))

    count_q = select(func.count()).select_from(base_q.subquery())
    total = (await db.execute(count_q)).scalar_one()

    items_q = (
        base_q.order_by(AuditLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    logs = (await db.execute(items_q)).scalars().all()

    return PaginatedAuditLogs(
        items=[AuditLogResponse.model_validate(log) for log in logs],
        total=total,
        page=page,
        page_size=page_size,
    )
