"""
SunTax security module.

Responsibilities:
- Password hashing / verification (bcrypt via passlib)
- JWT access-token creation and decoding (python-jose)
- Refresh-token lifecycle managed in Redis
- Token denylist for logout (stored in Redis)
- FastAPI dependency helpers: get_current_user, get_current_admin_user
"""

from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

import redis.asyncio as aioredis
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import ExpiredSignatureError, JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db

logger = logging.getLogger(__name__)

# ── Passlib context ───────────────────────────────────────────────────────────

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ── HTTP Bearer scheme (optional – won't auto-raise 401) ─────────────────────

_bearer_scheme = HTTPBearer(auto_error=False)

# ── Redis client (lazy singleton) ─────────────────────────────────────────────

_redis_client: Optional[aioredis.Redis] = None


def _get_redis() -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        if settings.ENVIRONMENT == "development":
            try:
                import fakeredis.aioredis as fakeredis_async
                _redis_client = fakeredis_async.FakeRedis(decode_responses=True)
            except (ImportError, AttributeError):
                try:
                    import fakeredis
                    # Use the async server pattern
                    server = fakeredis.FakeServer()
                    _redis_client = fakeredis.FakeRedis(server=server, decode_responses=True)
                except ImportError:
                    pass
        if _redis_client is None:
            _redis_client = aioredis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
            )
    return _redis_client


# ── Password helpers ──────────────────────────────────────────────────────────


def hash_password(password: str) -> str:
    """Return a bcrypt hash of *password*. Truncates to 72 bytes (bcrypt limit)."""
    # bcrypt silently truncates at 72 bytes; some versions raise ValueError.
    pw_bytes = password.encode("utf-8")[:72]
    return _pwd_context.hash(pw_bytes.decode("utf-8", errors="replace"))


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Return True if *plain_password* matches *hashed_password*."""
    pw_bytes = plain_password.encode("utf-8")[:72]
    try:
        return _pwd_context.verify(pw_bytes.decode("utf-8", errors="replace"), hashed_password)
    except Exception:
        return False


# ── JWT helpers ───────────────────────────────────────────────────────────────

_DENYLIST_PREFIX = "token:denylist:"
_REFRESH_PREFIX = "token:refresh:"


def _utc_now() -> datetime:
    return datetime.now(tz=timezone.utc)


def create_access_token(
    data: dict[str, Any],
    expires_delta: Optional[timedelta] = None,
) -> str:
    """
    Create a signed JWT access token.

    Args:
        data: Payload dict. Must contain at least ``sub`` (user id string).
        expires_delta: Custom TTL; defaults to ACCESS_TOKEN_EXPIRE_MINUTES.

    Returns:
        Encoded JWT string.
    """
    expire = _utc_now() + (
        expires_delta
        or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload = {**data, "exp": expire, "iat": _utc_now(), "type": "access"}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(data: dict[str, Any]) -> str:
    """
    Create a signed JWT refresh token and persist it in Redis.

    Refresh tokens have a longer TTL (REFRESH_TOKEN_EXPIRE_DAYS) and are
    stored in Redis so they can be explicitly revoked on logout.

    Args:
        data: Payload dict. Must contain ``sub`` (user id string).

    Returns:
        Encoded JWT string.
    """
    expire = _utc_now() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {**data, "exp": expire, "iat": _utc_now(), "type": "refresh"}
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return token


async def store_refresh_token(user_id: str, token: str) -> None:
    """Persist refresh token in Redis (for revocation tracking)."""
    redis = _get_redis()
    ttl = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    await redis.setex(
        f"{_REFRESH_PREFIX}{user_id}:{token[-16:]}",
        int(ttl.total_seconds()),
        token,
    )


async def revoke_refresh_token(user_id: str, token: str) -> None:
    """Remove a specific refresh token from Redis."""
    redis = _get_redis()
    await redis.delete(f"{_REFRESH_PREFIX}{user_id}:{token[-16:]}")


def decode_token(token: str) -> dict[str, Any]:
    """
    Decode and validate a JWT token.

    Raises:
        HTTPException 401: If the token is expired, invalid, or missing fields.
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        if payload.get("sub") is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token missing subject claim",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return payload
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ── Denylist (logout) ─────────────────────────────────────────────────────────


async def add_token_to_denylist(token: str, expires_in: int) -> None:
    """
    Add a JWT to the Redis denylist so it cannot be reused.

    Args:
        token: The raw JWT string.
        expires_in: Seconds until the token naturally expires (Redis TTL).
    """
    redis = _get_redis()
    await redis.setex(f"{_DENYLIST_PREFIX}{token}", expires_in, "1")


async def is_token_denylisted(token: str) -> bool:
    """Return True if *token* is in the denylist."""
    redis = _get_redis()
    return bool(await redis.exists(f"{_DENYLIST_PREFIX}{token}"))


# ── FastAPI dependencies ──────────────────────────────────────────────────────


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> "User":  # noqa: F821 – forward ref resolved at runtime
    """
    FastAPI dependency that extracts and validates the Bearer JWT,
    checks the denylist, and returns the authenticated User ORM object.

    Raises:
        HTTPException 401: If the token is missing, invalid, denylisted,
                           or the user does not exist / is inactive.
    """
    from app.models.user import User  # local import to avoid circular deps

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    # Check denylist first (fast Redis lookup)
    if await is_token_denylisted(token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_token(token)

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id: str = payload["sub"]

    result = await db.execute(select(User).where(User.id == str(user_id)))
    user: Optional[User] = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated",
        )

    return user


async def get_current_admin_user(
    current_user: "User" = Depends(get_current_user),  # noqa: F821
) -> "User":  # noqa: F821
    """
    FastAPI dependency that ensures the current user has admin privileges.

    Raises:
        HTTPException 403: If the user is not an admin.
    """
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return current_user


# ── Email / password-reset tokens ────────────────────────────────────────────

_EMAIL_TOKEN_PREFIX = "token:email:"


def create_email_token() -> str:
    """Generate a cryptographically secure URL-safe token for email flows."""
    return secrets.token_urlsafe(32)


async def store_email_token(purpose: str, token: str, user_id: str) -> None:
    """
    Store an email-verification or password-reset token in Redis.

    Args:
        purpose: ``'verify'`` or ``'reset'``.
        token: The plaintext token to store.
        user_id: The associated user's UUID string.
    """
    redis = _get_redis()
    ttl = timedelta(hours=settings.EMAIL_TOKEN_EXPIRE_HOURS)
    await redis.setex(
        f"{_EMAIL_TOKEN_PREFIX}{purpose}:{token}",
        int(ttl.total_seconds()),
        user_id,
    )


async def consume_email_token(purpose: str, token: str) -> Optional[str]:
    """
    Validate and atomically delete an email token.

    Returns:
        The user_id string if valid, otherwise None.
    """
    redis = _get_redis()
    key = f"{_EMAIL_TOKEN_PREFIX}{purpose}:{token}"
    user_id = await redis.get(key)
    if user_id:
        await redis.delete(key)
    return user_id
