"""
SunTax application configuration.

All settings are loaded from environment variables (or .env file).
Uses pydantic-settings for validation and type coercion.
"""

from __future__ import annotations

from functools import lru_cache
from typing import List, Optional

from pydantic import AnyHttpUrl, EmailStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central settings object – instantiated once and cached via get_settings()."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ──────────────────────────────────────────────────────────
    APP_NAME: str = "SunTax"
    ENVIRONMENT: str = "development"  # development | staging | production
    DEBUG: bool = False

    # ── Database ──────────────────────────────────────────────────────────────
    DATABASE_URL: str = (
        "postgresql+asyncpg://suntax:suntax@localhost:5432/suntax"
    )
    # Sync URL used only by Alembic migrations
    DATABASE_SYNC_URL: str = (
        "postgresql+psycopg2://suntax:suntax@localhost:5432/suntax"
    )
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20

    # ── Redis ─────────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── Security / JWT ────────────────────────────────────────────────────────
    SECRET_KEY: str = "CHANGE-ME-use-at-least-32-random-characters-here!!"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Token for email verification / password-reset (24 h)
    EMAIL_TOKEN_EXPIRE_HOURS: int = 24

    # ── MinIO / S3 ────────────────────────────────────────────────────────────
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_USE_SSL: bool = False
    STORAGE_REGION: str = "eu-central-2"  # AWS Zurich region for Swiss data residency
    STORAGE_SERVER_SIDE_ENCRYPTION: str = "AES256"  # AES256 or aws:kms
    STORAGE_ENCRYPTION_KEY_ID: Optional[str] = None

    # ── Google Gemini ─────────────────────────────────────────────────────────
    GEMINI_API_KEY: str = "your-gemini-api-key"
    GEMINI_MODEL: str = "gemini-3.8-flash"

    # ── Sentry ────────────────────────────────────────────────────────────────
    SENTRY_DSN: Optional[str] = None

    # ── Upload limits ─────────────────────────────────────────────────────────
    MAX_UPLOAD_SIZE_MB: int = 50

    @property
    def max_upload_size_bytes(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    ALLOWED_MIME_TYPES: List[str] = [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/tiff",
        "image/webp",
        "image/heic",
        "image/heif",
    ]

    # ── CORS ──────────────────────────────────────────────────────────────────
    FRONTEND_URL: str = "http://localhost:3000"
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://frontend-ruby-gamma-46.vercel.app",
        "https://frontend-workcoretech-4423.vercel.app",
    ]

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: str | List[str]) -> List[str]:
        if isinstance(v, str):
            v = v.strip()
            if v.startswith("[") and v.endswith("]"):
                import json
                try:
                    return json.loads(v)
                except Exception:
                    pass
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    # ── Email (Resend) ────────────────────────────────────────────────────────
    EMAIL_FROM: str = "SunTax <noreply@suntax.ch>"
    RESEND_API_KEY: str = "re_your_resend_api_key"

    # ── Rate limiting ─────────────────────────────────────────────────────────
    RATE_LIMIT_LOGIN: str = "10/minute"
    RATE_LIMIT_REGISTER: str = "5/minute"
    RATE_LIMIT_DEFAULT: str = "100/minute"

    # ── Celery ────────────────────────────────────────────────────────────────
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached Settings instance. Safe to call many times."""
    return Settings()


# Module-level singleton for convenience imports
settings = get_settings()
