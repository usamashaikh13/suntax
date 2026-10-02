"""
Pydantic v2 schemas for authentication and user management.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


# ── Validators ────────────────────────────────────────────────────────────────

def _validate_password(v: str) -> str:
    """Enforce password complexity: 8-128 chars, at least one uppercase letter and one digit."""
    if len(v) < 8 or len(v) > 128:
        raise ValueError("Password must be between 8 and 128 characters.")
    if not any(c.isupper() for c in v):
        raise ValueError("Password must contain at least one uppercase letter.")
    if not any(c.isdigit() for c in v):
        raise ValueError("Password must contain at least one digit.")
    return v


# ── Request schemas ───────────────────────────────────────────────────────────


class UserRegisterRequest(BaseModel):
    """Payload for POST /auth/register."""

    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    full_name: Optional[str] = Field(None, max_length=255)

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        return _validate_password(v)


class UserLoginRequest(BaseModel):
    """Payload for POST /auth/login."""

    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)


class RefreshTokenRequest(BaseModel):
    """Payload for POST /auth/refresh."""

    refresh_token: str


class PasswordChangeRequest(BaseModel):
    """Payload for POST /auth/me/change-password."""

    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def new_password_strength(cls, v: str) -> str:
        return _validate_password(v)


class PasswordResetRequest(BaseModel):
    """Payload for POST /auth/forgot-password."""

    email: EmailStr


class PasswordResetConfirmRequest(BaseModel):
    """Payload for POST /auth/reset-password."""

    token: str
    new_password: str = Field(..., min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def new_password_strength(cls, v: str) -> str:
        return _validate_password(v)


class UserUpdateRequest(BaseModel):
    """Payload for PUT /auth/me."""

    full_name: Optional[str] = Field(None, max_length=255)


# ── Response schemas ──────────────────────────────────────────────────────────


class TokenResponse(BaseModel):
    """Returned after a successful login or token refresh."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    """Public user representation (never includes password hash)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    full_name: Optional[str]
    is_verified: bool
    is_active: bool
    is_admin: bool
    created_at: datetime
    updated_at: datetime


class MessageResponse(BaseModel):
    """Generic success message envelope."""

    message: str
