"""
SunTax security module — DB-backed persistence across restarts and workers.

Responsibilities:
- Password hashing / verification (Argon2id primary, bcrypt fallback)
- JWT access/refresh-token creation and decoding (python-jose)
- Refresh-token lifecycle persisted in SQLAlchemy `security_tokens`
- Token denylist for logout persisted in SQLAlchemy `security_tokens`
- Single-use email / 2FA challenge tokens persisted in `security_tokens`
- TOTP replay protection persisted atomically in `totp_replay_entries`
- FastAPI dependency helpers: get_current_user, get_current_admin_user
"""

from __future__ import annotations

import hashlib
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import pyotp
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import ExpiredSignatureError, JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import create_engine, delete, select
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.core.config import settings
import app.core.database as _db_mod
from app.core.database import get_db

logger = logging.getLogger(__name__)

# ── Passlib context (Argon2id primary, bcrypt fallback) ───────────────────────

_pwd_context = CryptContext(schemes=["argon2", "bcrypt"], deprecated="auto")

# ── HTTP Bearer scheme (optional – won't auto-raise 401) ─────────────────────

_bearer_scheme = HTTPBearer(auto_error=False)

# Kept exported only for backward compatibility with existing test imports;
# replay protection is strictly persisted in the SQLAlchemy database.
_USED_TOTP_CODES: dict[tuple[str, str], float] = {}

_sync_engine_cache: dict[str, Engine] = {}


def _utc_now() -> datetime:
    return datetime.now(tz=timezone.utc)


def _hash_value(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _sync_database_url() -> str:
    url = str(settings.DATABASE_URL)
    if url.startswith("postgresql+asyncpg://"):
        return url.replace("postgresql+asyncpg://", "postgresql://", 1)
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    if url.startswith("sqlite+aiosqlite://"):
        return url.replace("sqlite+aiosqlite://", "sqlite://", 1)
    return url


def _get_sync_security_engine() -> Optional[Engine]:
    """Return a cached synchronous SQLAlchemy engine for sync TOTP replay checks."""
    url = _sync_database_url()
    eng = _sync_engine_cache.get(url)
    if eng is not None:
        return eng
    try:
        kwargs: dict[str, Any] = {"pool_pre_ping": True}
        if url.startswith("sqlite"):
            kwargs["connect_args"] = {"check_same_thread": False}
        eng = create_engine(url, **kwargs)
        is_prod = str(getattr(settings, "ENVIRONMENT", "")).lower() in ("production", "prod")
        if not is_prod:
            from app.models.security_state import SecurityToken, TotpReplayEntry
            TotpReplayEntry.__table__.create(bind=eng, checkfirst=True)
            SecurityToken.__table__.create(bind=eng, checkfirst=True)
        _sync_engine_cache[url] = eng
        return eng
    except Exception as exc:
        logger.error("Sync security DB engine initialization failed: %s", type(exc).__name__)
        return None


# ── Password helpers (Argon2id / FDPIC-compliant memory-hard hashing) ─────────


def hash_password(password: str) -> str:
    """Return an Argon2id memory-hard hash of *password*."""
    pw_bytes = password.encode("utf-8")
    if len(pw_bytes) > 256:
        raise ValueError("Password exceeds maximum allowed length.")
    return _pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Return True if *plain_password* matches *hashed_password*."""
    pw_bytes = plain_password.encode("utf-8")
    if len(pw_bytes) > 256:
        return False
    try:
        return _pwd_context.verify(plain_password, hashed_password)
    except Exception:
        return False


# ── TOTP Two-Factor Authentication (2FA) ──────────────────────────────────────


def generate_totp_secret() -> str:
    """Generate a random Base32 TOTP secret for authenticator apps."""
    return pyotp.random_base32()


def get_totp_uri(secret: str, email: str) -> str:
    """Return otpauth:// URI for QR code provisioning in Google/Microsoft Authenticator."""
    return pyotp.totp.TOTP(secret).provisioning_uri(name=email, issuer_name="SunTax")


def _totp_replay_hash(secret: str, clean_code: str) -> str:
    secret_hash = _hash_value(secret)
    return _hash_value(f"{secret_hash}:{clean_code}")


def verify_totp_code(secret: str, code: str) -> bool:
    """
    Synchronously verify a 6-digit TOTP code with DB-backed replay prevention.

    Security invariants:
      - Fixed test bypass codes ('123456', '000000') are strictly forbidden in production.
      - In non-production, bypass codes are permitted ONLY when settings.ALLOW_TEST_2FA_BYPASS is explicitly True.
      - Replay prevention writes atomically to `totp_replay_entries` (survives restarts & shared across workers).
      - In production/staging or on DB error, TOTP verification FAILS CLOSED (never falls back to process memory).
    """
    if not secret or not code:
        return False
    clean_code = str(code).strip().replace(" ", "")
    if len(clean_code) != 6 or not clean_code.isdigit():
        return False

    env = str(getattr(settings, "ENVIRONMENT", "")).lower()
    is_prod = env in ("production", "prod")
    allow_test_bypass = getattr(settings, "ALLOW_TEST_2FA_BYPASS", False)

    if not is_prod and allow_test_bypass and clean_code in ("123456", "000000"):
        return True

    try:
        if not pyotp.TOTP(secret).verify(clean_code, valid_window=1):
            return False
    except Exception as exc:
        logger.warning("TOTP verification internal error: %s", type(exc).__name__)
        return False

    eng = _get_sync_security_engine()
    if eng is None:
        logger.error("Rejecting TOTP verification: DB replay protection unavailable")
        return False

    from app.models.security_state import TotpReplayEntry

    replay_key = _totp_replay_hash(secret, clean_code)
    now = _utc_now()
    expires = now + timedelta(seconds=120)

    try:
        with Session(eng) as session:
            session.execute(delete(TotpReplayEntry).where(TotpReplayEntry.expires_at <= now))
            session.add(TotpReplayEntry(replay_hash=replay_key, expires_at=expires))
            session.commit()
            return True
    except IntegrityError:
        logger.warning("TOTP replay detected via shared DB table: code already consumed.")
        return False
    except Exception as exc:
        logger.error("TOTP DB replay persistence failed (%s) — failing closed.", type(exc).__name__)
        return False


async def verify_totp_code_async(secret: str, code: str, db: Optional[AsyncSession] = None) -> bool:
    """Asynchronously verify a 6-digit TOTP code inside the active DB session (works across workers & tests)."""
    if not secret or not code:
        return False
    clean_code = str(code).strip().replace(" ", "")
    if len(clean_code) != 6 or not clean_code.isdigit():
        return False

    env = str(getattr(settings, "ENVIRONMENT", "")).lower()
    is_prod = env in ("production", "prod")
    allow_test_bypass = getattr(settings, "ALLOW_TEST_2FA_BYPASS", False)

    if not is_prod and allow_test_bypass and clean_code in ("123456", "000000"):
        return True

    try:
        if not pyotp.TOTP(secret).verify(clean_code, valid_window=1):
            return False
    except Exception:
        return False

    if db is None:
        return verify_totp_code(secret, clean_code)

    from app.models.security_state import TotpReplayEntry

    replay_key = _totp_replay_hash(secret, clean_code)
    now = _utc_now()
    expires = now + timedelta(seconds=120)

    try:
        await db.execute(delete(TotpReplayEntry).where(TotpReplayEntry.expires_at <= now))
        async with db.begin_nested():
            db.add(TotpReplayEntry(replay_hash=replay_key, expires_at=expires))
            await db.flush()
        return True
    except IntegrityError:
        logger.warning("TOTP replay detected via shared DB table: code already consumed.")
        return False
    except Exception as exc:
        logger.error("Async TOTP DB replay persistence failed (%s) — failing closed.", type(exc).__name__)
        return False


def create_temp_2fa_token(user_id: str, email: str) -> str:
    """Create a 5-minute temporary JWT token for completing the 2FA login challenge."""
    now = _utc_now()
    expire = now + timedelta(minutes=5)
    payload = {
        "sub": user_id,
        "email": email,
        "type": "2fa_pending",
        "exp": expire,
        "iat": now,
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_temp_2fa_token(token: str) -> dict[str, Any]:
    """Decode and validate a 2FA challenge token."""
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        if payload.get("type") != "2fa_pending":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid 2FA challenge token",
            )
        return payload
    except ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="2FA challenge token expired. Please log in again.",
        )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid 2FA challenge token",
        )


# ── JWT helpers ───────────────────────────────────────────────────────────────


def create_access_token(
    data: dict[str, Any],
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create a signed JWT access token with unique jti and microsecond issued timestamp."""
    now = _utc_now()
    expire = now + (
        expires_delta
        or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload = {
        **data,
        "exp": expire,
        "iat": now,
        "iat_us": int(now.timestamp() * 1_000_000),
        "jti": str(uuid.uuid4()),
        "type": "access",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(data: dict[str, Any]) -> str:
    """Create a signed JWT refresh token (persisted via store_refresh_token)."""
    now = _utc_now()
    expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        **data,
        "exp": expire,
        "iat": now,
        "type": "refresh",
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


async def _run_db(db: Optional[AsyncSession], fn):
    if db is not None:
        return await fn(db, own=False)
    async with _db_mod.AsyncSessionLocal() as session:
        res = await fn(session, own=True)
        await session.commit()
        return res


async def store_refresh_token(user_id: str, token: str, db: Optional[AsyncSession] = None) -> None:
    """Persist hashed refresh token in SQLAlchemy security_tokens table."""
    from app.models.security_state import SecurityToken

    thash = _hash_value(f"refresh:{user_id}:{token}")
    expires = _utc_now() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)

    async def _op(session: AsyncSession, own: bool) -> None:
        session.add(
            SecurityToken(
                token_hash=thash,
                token_type="refresh",
                user_id=str(user_id),
                expires_at=expires,
            )
        )
        await session.flush()

    await _run_db(db, _op)


async def is_refresh_token_active(user_id: str, token: str, db: Optional[AsyncSession] = None) -> bool:
    """Return True if *token* is currently present and unexpired in security_tokens."""
    from app.models.security_state import SecurityToken

    thash = _hash_value(f"refresh:{user_id}:{token}")
    now = _utc_now()

    async def _op(session: AsyncSession, own: bool) -> bool:
        res = await session.execute(
            select(SecurityToken.id).where(
                SecurityToken.token_hash == thash,
                SecurityToken.token_type == "refresh",
                SecurityToken.user_id == str(user_id),
                SecurityToken.expires_at > now,
            )
        )
        return res.scalar_one_or_none() is not None

    return await _run_db(db, _op)


async def revoke_refresh_token(user_id: str, token: str, db: Optional[AsyncSession] = None) -> None:
    """Delete a specific refresh token from security_tokens."""
    from app.models.security_state import SecurityToken

    thash = _hash_value(f"refresh:{user_id}:{token}")

    async def _op(session: AsyncSession, own: bool) -> None:
        await session.execute(
            delete(SecurityToken).where(
                SecurityToken.token_hash == thash,
                SecurityToken.token_type == "refresh",
            )
        )
        await session.flush()

    await _run_db(db, _op)


async def revoke_all_user_refresh_tokens(user_id: str, db: Optional[AsyncSession] = None) -> None:
    """Revoke all active refresh tokens for *user_id* across workers and restarts."""
    from app.models.security_state import SecurityToken

    async def _op(session: AsyncSession, own: bool) -> None:
        await session.execute(
            delete(SecurityToken).where(
                SecurityToken.user_id == str(user_id),
                SecurityToken.token_type == "refresh",
            )
        )
        await session.flush()

    await _run_db(db, _op)


def decode_token(token: str) -> dict[str, Any]:
    """Decode and validate a JWT token."""
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


# ── Denylist (logout & token rotation) ────────────────────────────────────────


async def add_token_to_denylist(
    token: str, expires_in: int, db: Optional[AsyncSession] = None
) -> None:
    """Add a JWT hash to the persistent DB denylist."""
    from app.models.security_state import SecurityToken

    thash = _hash_value(f"deny:{token}")
    expires = _utc_now() + timedelta(seconds=max(1, int(expires_in)))

    async def _op(session: AsyncSession, own: bool) -> None:
        try:
            async with session.begin_nested():
                session.add(
                    SecurityToken(
                        token_hash=thash,
                        token_type="denylist",
                        expires_at=expires,
                    )
                )
                await session.flush()
        except IntegrityError:
            pass

    await _run_db(db, _op)


async def is_token_denylisted(token: str, db: Optional[AsyncSession] = None) -> bool:
    """Return True if *token* has been explicitly denylisted and not yet purged."""
    from app.models.security_state import SecurityToken

    thash = _hash_value(f"deny:{token}")
    now = _utc_now()

    async def _op(session: AsyncSession, own: bool) -> bool:
        res = await session.execute(
            select(SecurityToken.id).where(
                SecurityToken.token_hash == thash,
                SecurityToken.token_type == "denylist",
                SecurityToken.expires_at > now,
            )
        )
        return res.scalar_one_or_none() is not None

    return await _run_db(db, _op)


# ── FastAPI dependencies ──────────────────────────────────────────────────────


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> "User":  # noqa: F821
    """
    Validate Bearer JWT, check persistent DB denylist and user session cutoff,
    and return the active User ORM object.
    """
    from app.models.user import User

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    if await is_token_denylisted(token, db=db):
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

    if getattr(user, "tokens_valid_after", None) is not None:
        cutoff = user.tokens_valid_after
        if cutoff.tzinfo is None:
            cutoff = cutoff.replace(tzinfo=timezone.utc)
        cutoff_us = int(cutoff.timestamp() * 1_000_000)
        tok_iat_us = payload.get("iat_us")
        if tok_iat_us is None:
            raw_iat = payload.get("iat", 0)
            tok_iat_us = int(float(raw_iat) * 1_000_000)
        if int(tok_iat_us) < cutoff_us:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session invalidated after security update. Please log in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )

    return user


async def get_current_admin_user(
    current_user: "User" = Depends(get_current_user),  # noqa: F821
) -> "User":  # noqa: F821
    """Ensure the current user has admin privileges."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return current_user


# ── Email / password-reset / 2FA OTP single-use tokens ────────────────────────


def create_email_token() -> str:
    """Generate a cryptographically secure URL-safe token for email flows."""
    return secrets.token_urlsafe(32)


async def store_email_token(
    purpose: str,
    token: str,
    user_id: str,
    db: Optional[AsyncSession] = None,
    ttl_seconds: Optional[int] = None,
) -> None:
    """Persist a hashed single-use token (verify, reset, 2fa_login) in security_tokens."""
    from app.models.security_state import SecurityToken

    thash = _hash_value(f"email:{purpose}:{token}")
    ttl = ttl_seconds if ttl_seconds is not None else int(timedelta(hours=settings.EMAIL_TOKEN_EXPIRE_HOURS).total_seconds())
    expires = _utc_now() + timedelta(seconds=max(1, ttl))

    async def _op(session: AsyncSession, own: bool) -> None:
        await session.execute(delete(SecurityToken).where(SecurityToken.token_hash == thash))
        session.add(
            SecurityToken(
                token_hash=thash,
                token_type=f"email:{purpose}",
                user_id=str(user_id),
                expires_at=expires,
            )
        )
        await session.flush()

    await _run_db(db, _op)


async def consume_email_token(
    purpose: str, token: str, db: Optional[AsyncSession] = None
) -> Optional[str]:
    """Atomically validate and delete a single-use token from security_tokens."""
    from app.models.security_state import SecurityToken

    thash = _hash_value(f"email:{purpose}:{token}")
    now = _utc_now()

    async def _op(session: AsyncSession, own: bool) -> Optional[str]:
        res = await session.execute(
            select(SecurityToken).where(
                SecurityToken.token_hash == thash,
                SecurityToken.token_type == f"email:{purpose}",
                SecurityToken.expires_at > now,
            )
        )
        row = res.scalar_one_or_none()
        if row is None:
            return None
        uid = row.user_id
        await session.delete(row)
        await session.flush()
        return uid

    return await _run_db(db, _op)
