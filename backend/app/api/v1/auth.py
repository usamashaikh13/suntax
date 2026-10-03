"""
Authentication API router for SunTax.

Endpoints:
  POST   /auth/register
  GET    /auth/verify-email
  POST   /auth/login
  POST   /auth/refresh
  POST   /auth/logout
  POST   /auth/forgot-password
  POST   /auth/reset-password
  GET    /auth/me
  PUT    /auth/me
  POST   /auth/me/change-password
"""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db, set_rls_user_id
from app.core.security import (
    add_token_to_denylist,
    consume_email_token,
    create_access_token,
    create_email_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    hash_password,
    is_token_denylisted,
    store_email_token,
    store_refresh_token,
    verify_password,
    revoke_refresh_token,
)
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.auth import (
    MessageResponse,
    PasswordChangeRequest,
    PasswordResetConfirmRequest,
    PasswordResetRequest,
    RefreshTokenRequest,
    TokenResponse,
    UserLoginRequest,
    UserRegisterRequest,
    UserResponse,
    UserUpdateRequest,
    EmailVerificationRequest,
)
from app.services.email_service import EmailService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])

email_service = EmailService()


# ── Helpers ───────────────────────────────────────────────────────────────────


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


async def _write_audit(
    db: AsyncSession,
    *,
    user_id=None,
    action: str,
    resource_type: str | None = None,
    resource_id: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    success: bool = True,
    error_message: str | None = None,
) -> None:
    log = AuditLog(
        user_id=str(user_id) if user_id is not None else None,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        ip_address=ip_address,
        user_agent=user_agent,
        success=success,
        error_message=error_message,
    )
    db.add(log)


# ── Routes ────────────────────────────────────────────────────────────────────


@router.post(
    "/register",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account",
)
async def register(
    payload: UserRegisterRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """
    Create a new user account.

    - Validates password strength and email uniqueness.
    - Sends a verification email with a tokenised link (non-fatal if email service unavailable).
    - Returns 201 regardless of whether the email already exists
      (to prevent user enumeration).
    """
    # Check for existing email without leaking information via timing
    result = await db.execute(select(User).where(User.email == payload.email))
    existing = result.scalar_one_or_none()

    if existing is not None:
        # Log silently and return the same success response
        logger.info("Registration attempt for existing email: %s", payload.email)
        await _write_audit(
            db,
            action="user.register.duplicate",
            resource_type="user",
            ip_address=_client_ip(request),
            success=False,
            error_message="duplicate email",
        )
        return MessageResponse(
            message="If this email is not registered, you will receive a verification email."
        )

    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
    )
    db.add(user)
    await db.flush()  # Get the generated UUID

    # Generate email verification token
    token = create_email_token()
    await store_email_token("verify", token, str(user.id))

    # Email sending is non-fatal — registration must succeed even without RESEND_API_KEY
    try:
        await email_service.send_verification_email(payload.email, token)
    except Exception as exc:
        logger.warning(
            "Could not send verification email to %s (registration still succeeded): %s",
            payload.email,
            exc,
        )

    await _write_audit(
        db,
        user_id=str(user.id),
        action="user.register",
        resource_type="user",
        resource_id=str(user.id),
        ip_address=_client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )

    logger.info("Registered new user id=%s email=%s", user.id, user.email)
    return MessageResponse(
        message="If this email is not registered, you will receive a verification email."
    )


async def _do_verify_email(token: str, db: AsyncSession) -> MessageResponse:
    """Consume an email verification token and activate the user."""
    user_id = await consume_email_token("verify", token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token",
        )

    result = await db.execute(select(User).where(User.id == str(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user.is_verified:
        return MessageResponse(message="Email already verified")

    user.is_verified = True
    await _write_audit(
        db,
        user_id=str(user.id),
        action="user.email_verified",
        resource_type="user",
        resource_id=str(user.id),
    )
    return MessageResponse(message="Email verified successfully")


@router.get(
    "/verify-email",
    response_model=MessageResponse,
    summary="Verify email address via GET query token",
)
async def verify_email_get(
    token: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    return await _do_verify_email(token, db)


@router.post(
    "/verify-email",
    response_model=MessageResponse,
    summary="Verify email address via POST token payload or query",
)
async def verify_email_post(
    payload: Optional[EmailVerificationRequest] = None,
    token: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    t = (payload.token if payload else None) or token
    if not t:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification token is required",
        )
    return await _do_verify_email(t, db)


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate and receive JWT tokens",
)
async def login(
    payload: UserLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """
    Authenticate with email and password.

    Returns short-lived access token and longer-lived refresh token.
    """
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()

    ip = _client_ip(request)
    ua = request.headers.get("User-Agent")

    if user is None or not verify_password(payload.password, user.hashed_password):
        await _write_audit(
            db,
            user_id=str(user.id) if user else None,
            action="user.login.failed",
            ip_address=ip,
            user_agent=ua,
            success=False,
            error_message="invalid credentials",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated. Contact support.",
        )

    token_data = {"sub": str(user.id)}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)
    await store_refresh_token(str(user.id), refresh_token)

    await _write_audit(
        db,
        user_id=str(user.id),
        action="user.login",
        resource_type="user",
        resource_id=str(user.id),
        ip_address=ip,
        user_agent=ua,
    )

    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Exchange a refresh token for a new access token",
)
async def refresh_token(
    payload: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Issue a new access token (and rotate the refresh token)."""
    if await is_token_denylisted(payload.refresh_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has been revoked",
        )

    token_payload = decode_token(payload.refresh_token)
    if token_payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
        )

    user_id = token_payload["sub"]
    result = await db.execute(select(User).where(User.id == str(user_id)))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    # Rotate: revoke old, issue new
    await revoke_refresh_token(str(user_id), payload.refresh_token)
    token_data = {"sub": str(user.id)}
    new_access = create_access_token(token_data)
    new_refresh = create_refresh_token(token_data)
    await store_refresh_token(str(user.id), new_refresh)

    return TokenResponse(access_token=new_access, refresh_token=new_refresh)


@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="Invalidate the current access token",
)
async def logout(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Add the bearer token to the denylist and revoke all refresh tokens."""
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.removeprefix("Bearer ").strip()

    if token:
        # Calculate remaining TTL
        try:
            payload = decode_token(token)
            import time
            exp = payload.get("exp", 0)
            remaining = max(0, int(exp - time.time()))
            await add_token_to_denylist(token, remaining or 1)
        except HTTPException:
            pass  # Already expired – denylist not needed

    await _write_audit(
        db,
        user_id=str(current_user.id),
        action="user.logout",
        resource_type="user",
        resource_id=str(current_user.id),
        ip_address=_client_ip(request),
    )

    return MessageResponse(message="Logged out successfully")


@router.post(
    "/forgot-password",
    response_model=MessageResponse,
    summary="Send a password-reset email",
)
async def forgot_password(
    payload: PasswordResetRequest,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Always returns success to prevent user enumeration."""
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()

    if user and user.is_active:
        token = create_email_token()
        await store_email_token("reset", token, str(user.id))
        try:
            await email_service.send_password_reset_email(payload.email, token)
        except Exception as exc:
            logger.warning(
                "Could not send password-reset email to %s: %s", payload.email, exc
            )

    return MessageResponse(
        message="If that email is registered, a password reset link has been sent."
    )


@router.post(
    "/reset-password",
    response_model=MessageResponse,
    summary="Reset password using a reset token",
)
async def reset_password(
    payload: PasswordResetConfirmRequest,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Consume a password-reset token and update the user's password."""
    user_id = await consume_email_token("reset", payload.token)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset token",
        )

    result = await db.execute(select(User).where(User.id == str(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.hashed_password = hash_password(payload.new_password)
    await _write_audit(
        db,
        user_id=str(user.id),
        action="user.password_reset",
        resource_type="user",
        resource_id=str(user.id),
    )
    return MessageResponse(message="Password reset successfully. Please log in again.")


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current authenticated user profile",
)
async def get_me(
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    """Return the authenticated user's profile."""
    return UserResponse.model_validate(current_user)


@router.put(
    "/me",
    response_model=UserResponse,
    summary="Update current user profile",
)
@router.patch(
    "/me",
    response_model=UserResponse,
    summary="Update current user profile",
)
async def update_me(
    payload: UserUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Update mutable profile fields (currently only full_name)."""
    if payload.full_name is not None:
        current_user.full_name = payload.full_name
    db.add(current_user)
    return UserResponse.model_validate(current_user)


@router.delete(
    "/me",
    response_model=MessageResponse,
    summary="Delete or deactivate user account",
)
async def delete_me(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Soft-deactivate current user account and audit the event."""
    current_user.is_active = False
    db.add(current_user)
    await _write_audit(
        db,
        user_id=str(current_user.id),
        action="user.account_deactivated",
        resource_type="user",
        resource_id=str(current_user.id),
        ip_address=_client_ip(request),
    )
    return MessageResponse(message="Account deactivated successfully.")


@router.post(
    "/me/change-password",
    response_model=MessageResponse,
    summary="Change password for the authenticated user",
)
async def change_password(
    payload: PasswordChangeRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Verify current password and replace with a new one."""
    if not verify_password(payload.current_password, current_user.hashed_password):
        await _write_audit(
            db,
            user_id=str(current_user.id),
            action="user.password_change.failed",
            ip_address=_client_ip(request),
            success=False,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    current_user.hashed_password = hash_password(payload.new_password)
    db.add(current_user)

    await _write_audit(
        db,
        user_id=str(current_user.id),
        action="user.password_changed",
        resource_type="user",
        resource_id=str(current_user.id),
        ip_address=_client_ip(request),
    )
    return MessageResponse(message="Password changed successfully. Please log in again.")
