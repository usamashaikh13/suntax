"""
SunTax application configuration.

All settings are loaded from environment variables (or .env file).
Uses pydantic-settings for validation and type coercion.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

from pydantic import AnyHttpUrl, EmailStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _load_brand_defaults() -> Dict[str, Any]:
    """Load centralized brand configuration from app/data/brand_config.json."""
    cfg_path = Path(__file__).resolve().parents[1] / "data" / "brand_config.json"
    if cfg_path.is_file():
        try:
            with open(cfg_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "brand_name": "SunTax",
        "brand_short_left": "Sun",
        "brand_short_right": "Tax",
        "brand_domain": "suntax.ch",
        "support_email": "info@suntax.ch",
        "noreply_email": "noreply@suntax.ch",
        "logo_path": "/brand-logo.svg",
        "logo_badge_bg": "#15181D",
        "primary_color": "#1E7B52",
        "primary_hover_color": "#16603F",
        "source_description": "SunTax 1.0",
        "transaction_prefix": "SUNTAX",
        "company_legal_name": "SunTax AG (Working Name)",
        "hosting_country": "CH",
    }


_BRAND_DEFAULTS = _load_brand_defaults()


class Settings(BaseSettings):
    """Central settings object – instantiated once and cached via get_settings()."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Centralized Brand Configuration (Addendum 1 Section 1) ───────────────
    BRAND_NAME: str = str(_BRAND_DEFAULTS.get("brand_name", "SunTax"))
    BRAND_SHORT_LEFT: str = str(_BRAND_DEFAULTS.get("brand_short_left", "Sun"))
    BRAND_SHORT_RIGHT: str = str(_BRAND_DEFAULTS.get("brand_short_right", "Tax"))
    BRAND_DOMAIN: str = str(_BRAND_DEFAULTS.get("brand_domain", "suntax.ch"))
    SUPPORT_EMAIL: str = str(_BRAND_DEFAULTS.get("support_email", "info@suntax.ch"))
    NOREPLY_EMAIL: str = str(_BRAND_DEFAULTS.get("noreply_email", "noreply@suntax.ch"))
    BRAND_LOGO_PATH: str = str(_BRAND_DEFAULTS.get("logo_path", "/brand-logo.svg"))
    BRAND_PRIMARY_COLOR: str = str(_BRAND_DEFAULTS.get("primary_color", "#1E7B52"))
    SOURCE_DESCRIPTION: str = str(_BRAND_DEFAULTS.get("source_description", "SunTax 1.0"))
    TRANSACTION_PREFIX: str = str(_BRAND_DEFAULTS.get("transaction_prefix", "SUNTAX"))

    # ── Application ──────────────────────────────────────────────────────────
    APP_NAME: str = str(_BRAND_DEFAULTS.get("brand_name", "SunTax"))
    ENVIRONMENT: str = "development"  # development | staging | production | test
    DEBUG: bool = False

    @field_validator("ENVIRONMENT", mode="before")
    @classmethod
    def validate_environment(cls, v: str) -> str:
        val = str(v).lower().strip()
        if val in ("prod", "production"):
            return "production"
        if val in ("stage", "staging"):
            return "staging"
        if val in ("test", "testing"):
            return "test"
        return "development"

    @field_validator("DEBUG", mode="after")
    @classmethod
    def enforce_no_debug_in_production(cls, v: bool, info) -> bool:
        env = (info.data.get("ENVIRONMENT") or "").lower()
        if env == "production":
            return False
        return v

    def get_brand_config(self) -> Dict[str, Any]:
        """Return active brand settings dynamically (reflects any env or runtime override)."""
        effective_name = self.BRAND_NAME or self.APP_NAME
        effective_source = self.SOURCE_DESCRIPTION
        if effective_name != "SunTax" and effective_source == "SunTax 1.0":
            effective_source = f"{effective_name} 1.0"
        default_name = _BRAND_DEFAULTS.get("brand_name", "SunTax")
        left = (
            self.BRAND_SHORT_LEFT
            if self.BRAND_SHORT_LEFT != _BRAND_DEFAULTS.get("brand_short_left", "Sun") or effective_name == default_name
            else effective_name
        )
        right = (
            self.BRAND_SHORT_RIGHT
            if self.BRAND_SHORT_RIGHT != _BRAND_DEFAULTS.get("brand_short_right", "Tax") or effective_name == default_name
            else ""
        )
        tx_prefix = (
            self.TRANSACTION_PREFIX
            if self.TRANSACTION_PREFIX != _BRAND_DEFAULTS.get("transaction_prefix", "SUNTAX") or effective_name == default_name
            else effective_name.upper().replace(" ", "")[:12]
        )
        return {
            "brand_name": effective_name,
            "brand_short_left": left,
            "brand_short_right": right,
            "brand_domain": self.BRAND_DOMAIN,
            "support_email": self.SUPPORT_EMAIL,
            "noreply_email": self.NOREPLY_EMAIL,
            "logo_path": self.BRAND_LOGO_PATH,
            "primary_color": self.BRAND_PRIMARY_COLOR,
            "source_description": effective_source,
            "transaction_prefix": tx_prefix,
        }

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

    @field_validator("SECRET_KEY", mode="after")
    @classmethod
    def enforce_strong_secret_key_in_production(cls, v: str, info) -> str:
        env = (info.data.get("ENVIRONMENT") or "").lower()
        if env == "production":
            if v == "CHANGE-ME-use-at-least-32-random-characters-here!!" or len(v) < 32:
                raise ValueError(
                    "In production, SECRET_KEY must be a cryptographically secure key of at least 32 characters."
                )
        return v

    # ── Encrypted Backup & Disaster Recovery (nDSG / ISO 27001) ───────────────
    BACKUP_ENCRYPTION_KEY: Optional[str] = None
    BACKUP_RETENTION_DAYS: int = 30
    BACKUP_DIR: str = "backups"

    # ── MinIO / S3 ────────────────────────────────────────────────────────────
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_BUCKET_NAME: str = "suntax-documents"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_USE_SSL: bool = False
    STORAGE_REGION: str = "eu-central-2"  # AWS Zurich region for Swiss data residency
    STORAGE_SERVER_SIDE_ENCRYPTION: str = "AES256"  # AES256 or aws:kms
    STORAGE_ENCRYPTION_KEY_ID: Optional[str] = None

    # ── Google Gemini ─────────────────────────────────────────────────────────
    GEMINI_API_KEY: str = "your-gemini-api-key"
    GEMINI_MODEL: str = "gemini-3.8-flash"
    ENABLE_EXTERNAL_AI_EXTRACTION: bool = False  # Privacy safeguard: external AI requires explicit opt-in

    # ── OCR & Document Processing Limits ──────────────────────────────────────
    OCR_MAX_PAGES: int = 50
    OCR_MAX_IMAGE_PIXELS: int = 50_000_000
    OCR_TIMEOUT_SECONDS: int = 120
    TESSDATA_DIR: Optional[str] = "backend/tessdata"

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

    # ── Email (Resend & Twilio SendGrid) ──────────────────────────────────────
    EMAIL_FROM: str = (
        f"{_BRAND_DEFAULTS.get('brand_name', 'SunTax')} "
        f"<{_BRAND_DEFAULTS.get('noreply_email', 'noreply@suntax.ch')}>"
    )
    RESEND_API_KEY: str = "re_your_resend_api_key"
    TWILIO_SENDGRID_API_KEY: Optional[str] = None

    # ── Twilio (SMS & Phone Text Messages) ────────────────────────────────────
    TWILIO_ACCOUNT_SID: Optional[str] = None
    TWILIO_AUTH_TOKEN: Optional[str] = None
    TWILIO_FROM_PHONE_NUMBER: Optional[str] = None  # E.164 format, e.g. +41791234567

    # ── Payrexx (Swiss Payment Provider) ──────────────────────────────────────
    PAYREXX_INSTANCE_NAME: Optional[str] = None  # e.g. "suntax" -> https://suntax.payrexx.com
    PAYREXX_API_SECRET: Optional[str] = None     # Payrexx API secret key
    PAYREXX_API_URL: str = "https://api.payrexx.com/v1.0"
    PAYREXX_WEBHOOK_SECRET: Optional[str] = None # Secret used to verify webhook signatures

    # ── Security & 2FA Test Policy ───────────────────────────────────────────
    # Master bypass codes (123456, 000000) are strictly forbidden in production.
    # In non-production, they are ONLY permitted if ALLOW_TEST_2FA_BYPASS is explicitly True.
    ALLOW_TEST_2FA_BYPASS: bool = False

    @field_validator("ALLOW_TEST_2FA_BYPASS", mode="after")
    @classmethod
    def enforce_no_2fa_bypass_in_production(cls, v: bool, info) -> bool:
        env = (info.data.get("ENVIRONMENT") or "").lower()
        if env in ("production", "staging"):
            return False
        return v

    # ── Rate limiting ─────────────────────────────────────────────────────────
    RATE_LIMIT_LOGIN: str = "10/minute"
    RATE_LIMIT_REGISTER: str = "5/minute"
    RATE_LIMIT_DEFAULT: str = "100/minute"

    # ── Celery ────────────────────────────────────────────────────────────────
    USE_CELERY: bool = False
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached Settings instance. Safe to call many times."""
    return Settings()


# Module-level singleton for convenience imports
settings = get_settings()
