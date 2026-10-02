"""
Email service for SunTax using the Resend API.

All emails are sent as HTML with inline templates. The service
uses httpx for async HTTP requests to the Resend REST API.

In development mode (ENVIRONMENT=development or ENVIRONMENT=test), or when
no RESEND_API_KEY is configured, emails are printed to the console instead of
being sent via the API, so the full application works without any email setup.
"""

from __future__ import annotations

import logging
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"


class EmailService:
    """
    Async email delivery via Resend (https://resend.com).

    Falls back to console output in development/test environments or when no
    API key is configured, ensuring the app is fully functional without email.
    """

    def __init__(self) -> None:
        self._api_key = settings.RESEND_API_KEY
        self._from_address = settings.EMAIL_FROM
        self._is_dev = settings.ENVIRONMENT in ("development", "test")

    def _should_use_console(self) -> bool:
        """Return True when we should print to console instead of calling Resend."""
        if self._is_dev:
            return True
        if not self._api_key or self._api_key.startswith("re_your_"):
            return True
        return False

    async def _send(self, to: str, subject: str, html: str) -> bool:
        """
        Send an email via the Resend API.

        In development mode, or when no API key is configured, prints the
        email details to the console and returns True immediately.

        Returns True on success, False on failure (non-raising).
        """
        if self._should_use_console():
            # Extract a plain-text preview from HTML (very rough)
            import re
            plain = re.sub(r"<[^>]+>", "", html).strip()
            plain_preview = " ".join(plain.split())[:300]
            logger.info(
                "[DEV EMAIL] ─────────────────────────────────────────\n"
                "  To:      %s\n"
                "  Subject: %s\n"
                "  Preview: %s…\n"
                "─────────────────────────────────────────────────────",
                to,
                subject,
                plain_preview,
            )
            print(
                f"\n[DEV EMAIL] To: {to} | Subject: {subject}\n"
                f"  Preview: {plain_preview[:120]}…\n"
            )
            return True

        payload = {
            "from": self._from_address,
            "to": [to],
            "subject": subject,
            "html": html,
        }
        headers = {"Authorization": f"Bearer {self._api_key}"}

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                try:
                    response = await client.post(RESEND_API_URL, json=payload, headers=headers)
                    response.raise_for_status()
                    logger.info("Email sent to %s (subject: %s)", to, subject)
                    return True
                except httpx.HTTPStatusError as exc:
                    logger.error(
                        "Resend API error %d for %s: %s",
                        exc.response.status_code,
                        to,
                        exc.response.text,
                    )
                    return False
                except httpx.RequestError as exc:
                    logger.error("Network error sending email to %s: %s", to, exc)
                    return False
        except Exception as exc:
            logger.exception("Unexpected error in email delivery to %s: %s", to, exc)
            return False

    # ── Email templates ───────────────────────────────────────────────────────

    async def send_verification_email(self, to_email: str, token: str) -> bool:
        """Send an email-verification link."""
        verify_url = f"{settings.FRONTEND_URL}/auth/verify-email?token={token}"
        html = f"""
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Verify your SunTax email</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
             background-color: #f5f5f5; margin: 0; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff;
              border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="background: linear-gradient(135deg, #f97316, #ea580c);
                padding: 32px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">☀️ SunTax</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">Swiss Tax, Simplified</p>
    </div>
    <div style="padding: 40px 32px;">
      <h2 style="color: #1a1a1a; margin-top: 0;">Verify your email address</h2>
      <p style="color: #4b5563; line-height: 1.6;">
        Welcome to SunTax! Please click the button below to verify your email address
        and activate your account. This link expires in 24 hours.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="{verify_url}"
           style="display: inline-block; background: #f97316; color: #ffffff;
                  text-decoration: none; padding: 14px 32px; border-radius: 6px;
                  font-weight: 600; font-size: 16px;">
          Verify Email Address
        </a>
      </div>
      <p style="color: #6b7280; font-size: 14px;">
        If you didn't create a SunTax account, you can safely ignore this email.
      </p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        Or copy this URL into your browser:<br>
        <a href="{verify_url}" style="color: #f97316; word-break: break-all;">{verify_url}</a>
      </p>
    </div>
    <div style="background: #f9fafb; padding: 20px 32px; text-align: center;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        © 2025 SunTax GmbH · Bahnhofstrasse 1 · 8001 Zürich, Switzerland
      </p>
    </div>
  </div>
</body>
</html>
"""
        return await self._send(
            to_email,
            "Verify your SunTax email address",
            html,
        )

    async def send_password_reset_email(self, to_email: str, token: str) -> bool:
        """Send a password-reset link."""
        reset_url = f"{settings.FRONTEND_URL}/auth/reset-password?token={token}"
        html = f"""
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Reset your SunTax password</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
             background-color: #f5f5f5; margin: 0; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff;
              border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="background: linear-gradient(135deg, #f97316, #ea580c);
                padding: 32px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">☀️ SunTax</h1>
    </div>
    <div style="padding: 40px 32px;">
      <h2 style="color: #1a1a1a; margin-top: 0;">Reset your password</h2>
      <p style="color: #4b5563; line-height: 1.6;">
        We received a request to reset your SunTax account password.
        Click the button below to choose a new password. This link expires in 24 hours.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="{reset_url}"
           style="display: inline-block; background: #f97316; color: #ffffff;
                  text-decoration: none; padding: 14px 32px; border-radius: 6px;
                  font-weight: 600; font-size: 16px;">
          Reset Password
        </a>
      </div>
      <p style="color: #6b7280; font-size: 14px;">
        If you didn't request a password reset, you can safely ignore this email.
        Your password will not be changed.
      </p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        Or copy this URL into your browser:<br>
        <a href="{reset_url}" style="color: #f97316; word-break: break-all;">{reset_url}</a>
      </p>
    </div>
    <div style="background: #f9fafb; padding: 20px 32px; text-align: center;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        © 2025 SunTax GmbH · Bahnhofstrasse 1 · 8001 Zürich, Switzerland
      </p>
    </div>
  </div>
</body>
</html>
"""
        return await self._send(
            to_email,
            "Reset your SunTax password",
            html,
        )

    async def send_welcome_email(self, to_email: str, name: Optional[str] = None) -> bool:
        """Send a welcome email after email verification."""
        display_name = name or "there"
        html = f"""
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Welcome to SunTax!</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
             background-color: #f5f5f5; margin: 0; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff;
              border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="background: linear-gradient(135deg, #f97316, #ea580c);
                padding: 32px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">☀️ SunTax</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">Swiss Tax, Simplified</p>
    </div>
    <div style="padding: 40px 32px;">
      <h2 style="color: #1a1a1a; margin-top: 0;">Welcome to SunTax, {display_name}! 🎉</h2>
      <p style="color: #4b5563; line-height: 1.6;">
        Your account is now verified and ready to use. SunTax uses AI to extract information
        from your tax documents and helps you complete your Swiss tax return in minutes,
        not hours.
      </p>
      <div style="background: #fff7ed; border-left: 4px solid #f97316;
                  padding: 16px 20px; border-radius: 4px; margin: 24px 0;">
        <p style="margin: 0; color: #9a3412; font-weight: 500;">Get started in 3 steps:</p>
        <ol style="color: #9a3412; margin: 8px 0 0; padding-left: 20px; line-height: 1.8;">
          <li>Create a new tax return for your canton</li>
          <li>Upload your documents (salary certificates, bank statements…)</li>
          <li>Review the AI-extracted data and confirm</li>
        </ol>
      </div>
      <div style="text-align: center; margin: 32px 0;">
        <a href="{settings.FRONTEND_URL}/dashboard"
           style="display: inline-block; background: #f97316; color: #ffffff;
                  text-decoration: none; padding: 14px 32px; border-radius: 6px;
                  font-weight: 600; font-size: 16px;">
          Go to Dashboard
        </a>
      </div>
    </div>
    <div style="background: #f9fafb; padding: 20px 32px; text-align: center;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        © 2025 SunTax GmbH · Bahnhofstrasse 1 · 8001 Zürich, Switzerland
      </p>
    </div>
  </div>
</body>
</html>
"""
        return await self._send(to_email, "Welcome to SunTax! 🎉", html)
