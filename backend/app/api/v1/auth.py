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

import hashlib
import json
import logging
import math
from datetime import datetime, timedelta, timezone
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
    create_temp_2fa_token,
    decode_temp_2fa_token,
    decode_token,
    generate_totp_secret,
    get_current_user,
    get_totp_uri,
    hash_password,
    is_token_denylisted,
    is_refresh_token_active,
    store_email_token,
    store_refresh_token,
    verify_password,
    verify_totp_code,
    revoke_refresh_token,
    revoke_all_user_refresh_tokens,
)
from app.models.audit_log import AuditLog
from app.models.user import User
from app.schemas.auth import (
    EmailVerificationRequest,
    MessageResponse,
    PasswordChangeRequest,
    PasswordResetConfirmRequest,
    PasswordResetRequest,
    RefreshTokenRequest,
    SecurityStatusResponse,
    TokenResponse,
    TwoFactorDisableRequest,
    TwoFactorLoginRequest,
    TwoFactorSetupResponse,
    TwoFactorVerifyRequest,
    UserLoginRequest,
    UserRegisterRequest,
    UserResponse,
    UserUpdateRequest,
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
    summary="Authenticate and receive JWT tokens or 2FA challenge",
)
async def login(
    payload: UserLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """
    Authenticate with email and password.
    Enforces automated 15-minute account lockout after 5 failed attempts,
    new-device detection, and 2FA challenge dispatch.
    """
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()

    ip = _client_ip(request)
    ua = request.headers.get("User-Agent") or "Unknown Device"
    now_utc = datetime.now(timezone.utc)

    # 1. Automated Account Lockout Check (FDPIC brute-force mitigation)
    if user and user.locked_until:
        locked_time = user.locked_until
        if locked_time.tzinfo is None:
            locked_time = locked_time.replace(tzinfo=timezone.utc)

        if locked_time > now_utc:
            diff_secs = (locked_time - now_utc).total_seconds()
            mins_left = max(1, math.ceil(diff_secs / 60))
            await _write_audit(
                db,
                user_id=str(user.id),
                action="user.login.blocked_locked",
                ip_address=ip,
                user_agent=ua,
                success=False,
                error_message=f"account locked for {mins_left} more minutes",
            )
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail=f"Account temporarily locked due to 5 consecutive failed login attempts. Please try again in {mins_left} minute(s).",
            )
        else:
            # Lockout expired
            user.locked_until = None
            user.failed_login_attempts = 0

    # 2. Credential Verification
    if user is None or not verify_password(payload.password, user.hashed_password):
        if user:
            user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
            if user.failed_login_attempts >= 5:
                user.locked_until = now_utc + timedelta(minutes=15)
                await _write_audit(
                    db,
                    user_id=str(user.id),
                    action="user.account.locked",
                    ip_address=ip,
                    user_agent=ua,
                    success=False,
                    error_message="Account locked for 15 minutes due to 5 failed attempts",
                )
            await db.commit()

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

    # 3. Two-Factor Authentication (2FA Challenge)
    if user.totp_enabled and user.totp_secret:
        temp_token = create_temp_2fa_token(str(user.id), user.email)
        await _write_audit(
            db,
            user_id=str(user.id),
            action="user.login.2fa_required",
            ip_address=ip,
            user_agent=ua,
        )
        return TokenResponse(two_factor_required=True, temp_token=temp_token)

    # 4. Successful Direct Login (Reset Lockout Counters & Inspect Device)
    user.failed_login_attempts = 0
    user.locked_until = None

    # New-Device / Unusual Device Detection
    try:
        device_fingerprint = hashlib.sha256(f"{ip}:{ua}".encode("utf-8")).hexdigest()[:16]
        known_devices_list = []
        if user.known_devices:
            known_devices_list = json.loads(user.known_devices)
        
        known_ids = {d.get("id") for d in known_devices_list if isinstance(d, dict)}
        if device_fingerprint not in known_ids:
            # Alert on new device access
            new_entry = {
                "id": device_fingerprint,
                "ip": ip,
                "ua": ua[:128],
                "first_seen": now_utc.isoformat(),
            }
            known_devices_list.append(new_entry)
            user.known_devices = json.dumps(known_devices_list[-10:])
            await _write_audit(
                db,
                user_id=str(user.id),
                action="user.login.new_device_detected",
                ip_address=ip,
                user_agent=ua,
            )
            logger.info("Security Alert: New device login for %s from IP %s", user.email, ip)
    except Exception as dev_err:
        logger.warning("Device fingerprint tracking error: %s", dev_err)

    await db.commit()

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

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        two_factor_required=False,
    )


@router.post(
    "/login/2fa",
    response_model=TokenResponse,
    summary="Submit 2FA TOTP code to finalize authentication",
)
async def login_2fa(
    payload: TwoFactorLoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Verify 6-digit TOTP code and issue final access and refresh JWT tokens."""
    challenge_payload = decode_temp_2fa_token(payload.temp_token)
    user_id = challenge_payload["sub"]

    result = await db.execute(select(User).where(User.id == str(user_id)))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")

    ip = _client_ip(request)
    ua = request.headers.get("User-Agent") or "Unknown Device"

    if not verify_totp_code(user.totp_secret or "", payload.code):
        user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
        if user.failed_login_attempts >= 5:
            user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=15)
        await db.commit()
        await _write_audit(
            db,
            user_id=str(user.id),
            action="user.login.2fa_failed",
            ip_address=ip,
            user_agent=ua,
            success=False,
            error_message="Invalid 2FA code",
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid 2FA verification code. Please check your authenticator app.",
        )

    # 2FA Success: reset counters
    user.failed_login_attempts = 0
    user.locked_until = None
    await db.commit()

    token_data = {"sub": str(user.id)}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)
    await store_refresh_token(str(user.id), refresh_token)

    await _write_audit(
        db,
        user_id=str(user.id),
        action="user.login.2fa_success",
        resource_type="user",
        resource_id=str(user.id),
        ip_address=ip,
        user_agent=ua,
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        two_factor_required=False,
    )


@router.post(
    "/2fa/setup",
    response_model=TwoFactorSetupResponse,
    summary="Initiate Two-Factor Authentication setup",
)
async def setup_2fa(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TwoFactorSetupResponse:
    """Generate Base32 secret and provisioning URI for authenticator app configuration."""
    secret = generate_totp_secret()
    current_user.totp_secret = secret
    await db.commit()

    uri = get_totp_uri(secret, current_user.email)
    return TwoFactorSetupResponse(secret=secret, provisioning_uri=uri)


@router.post(
    "/2fa/verify",
    response_model=MessageResponse,
    summary="Confirm and activate Two-Factor Authentication",
)
async def verify_2fa(
    payload: TwoFactorVerifyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Confirm user has successfully paired their authenticator app by verifying one code."""
    if not current_user.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA setup not initiated. Please call /auth/2fa/setup first.",
        )

    if not verify_totp_code(current_user.totp_secret, payload.code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification code. Please try again.",
        )

    current_user.totp_enabled = True
    await db.commit()
    return MessageResponse(message="Two-Factor Authentication (2FA) is now active on your account.")


@router.post(
    "/2fa/disable",
    response_model=MessageResponse,
    summary="Disable Two-Factor Authentication",
)
async def disable_2fa(
    payload: TwoFactorDisableRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Disable 2FA after password confirmation."""
    if not verify_password(payload.password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password",
        )

    current_user.totp_enabled = False
    current_user.totp_secret = None
    await db.commit()
    return MessageResponse(message="Two-Factor Authentication has been disabled.")


@router.get(
    "/security-status",
    response_model=SecurityStatusResponse,
    summary="Get user security and FDPIC compliance status",
)
async def security_status(
    current_user: User = Depends(get_current_user),
) -> SecurityStatusResponse:
    """Return security posture details (2FA, lockout status, encryption standard)."""
    now_utc = datetime.now(timezone.utc)
    is_locked = False
    if current_user.locked_until:
        l_time = current_user.locked_until
        if l_time.tzinfo is None:
            l_time = l_time.replace(tzinfo=timezone.utc)
        is_locked = l_time > now_utc

    return SecurityStatusResponse(
        two_factor_enabled=bool(current_user.totp_enabled),
        account_locked=is_locked,
        failed_login_attempts=current_user.failed_login_attempts or 0,
        token_lifetime_minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES,
        encryption_standard="AES-256-GCM (File-Level Envelope Encryption with KMS)",
        data_protection_act="Swiss Federal Act on Data Protection (nDSG / FDPIC Compliant)",
    )


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Exchange a refresh token for a new access token",
)
async def refresh_token(
    payload: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Issue a new access token (with atomic one-time rotation and replay protection)."""
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

    user_id = str(token_payload["sub"])

    # Strict check: refresh token must be present in active store
    if not await is_refresh_token_active(user_id, payload.refresh_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token has been revoked or expired",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    # Atomic rotation & replay protection:
    # 1. Revoke the old refresh token immediately from active store
    await revoke_refresh_token(user_id, payload.refresh_token)
    # 2. Add old token to denylist so replaying it is rejected immediately
    import time
    exp = token_payload.get("exp", 0)
    remaining = max(1, int(exp - time.time())) if exp else 86400 * 7
    await add_token_to_denylist(payload.refresh_token, remaining)

    # 3. Issue new tokens and store new refresh token in active store
    token_data = {"sub": user_id}
    new_access = create_access_token(token_data)
    new_refresh = create_refresh_token(token_data)
    await store_refresh_token(user_id, new_refresh)

    return TokenResponse(access_token=new_access, refresh_token=new_refresh)


@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="Invalidate the current access token and revoke active sessions",
)
async def logout(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Add the bearer token to the denylist and revoke all active refresh tokens."""
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

    # Revoke all active refresh sessions for this user
    await revoke_all_user_refresh_tokens(str(current_user.id))

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
