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
        self._resend_api_key = settings.RESEND_API_KEY
        self._sendgrid_api_key = settings.TWILIO_SENDGRID_API_KEY
        self._from_address = settings.EMAIL_FROM
        self._is_dev = settings.ENVIRONMENT in ("development", "test")

    def _should_use_console(self) -> bool:
        """Return True when we should print to console instead of external APIs."""
        if self._is_dev:
            return True
        has_sendgrid = bool(self._sendgrid_api_key and not self._sendgrid_api_key.startswith("SG.your_"))
        has_resend = bool(self._resend_api_key and not self._resend_api_key.startswith("re_your_"))
        return not (has_sendgrid or has_resend)

    async def _send(self, to: str, subject: str, html: str) -> bool:
        """
        Send an email via Twilio SendGrid or Resend API.

        In development mode, or when no API key is configured, prints the
        email details to the console and returns True immediately.
        """
        if self._should_use_console():
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

        # 1. Try Twilio SendGrid if configured
        if self._sendgrid_api_key and not self._sendgrid_api_key.startswith("SG.your_"):
            try:
                # Extract clean email address if in "Name <email@domain>" format
                import re
                match = re.search(r"<([^>]+)>", self._from_address)
                from_email = match.group(1) if match else self._from_address.strip()
                brand_cfg = settings.get_brand_config()
                from_name = self._from_address.split("<")[0].strip() or brand_cfg["brand_name"]

                sg_payload = {
                    "personalizations": [{"to": [{"email": to}]}],
                    "from": {"email": from_email, "name": from_name},
                    "subject": subject,
                    "content": [{"type": "text/html", "value": html}],
                }
                sg_headers = {
                    "Authorization": f"Bearer {self._sendgrid_api_key}",
                    "Content-Type": "application/json",
                }
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post(
                        "https://api.sendgrid.com/v3/mail/send",
                        json=sg_payload,
                        headers=sg_headers,
                    )
                    if resp.status_code in (200, 202):
                        logger.info("Email sent via Twilio SendGrid to %s", to)
                        return True
                    else:
                        logger.error("Twilio SendGrid error %d: %s", resp.status_code, resp.text)
            except Exception as exc:
                logger.error("Twilio SendGrid dispatch failed: %s", exc)

        # 2. Fallback to Resend API
        payload = {
            "from": self._from_address,
            "to": [to],
            "subject": subject,
            "html": html,
        }
        headers = {"Authorization": f"Bearer {self._resend_api_key}"}

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

    async def send_email(self, to_email: str, subject: str, body: str) -> bool:
        """Send a generic plain text or HTML email."""
        html = f"""<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 20px; color: #111827;">
  <p>{body.replace(chr(10), '<br>')}</p>
</body>
</html>"""
        return await self._send(to_email, subject, html)

    async def send_verification_email(self, to_email: str, token: str) -> bool:
        """Send an email-verification link."""
        brand = settings.get_brand_config()
        b_name = brand["brand_name"]
        b_color = brand["primary_color"]
        b_support = brand["support_email"]
        verify_url = f"{settings.FRONTEND_URL}/auth/verify-email?token={token}"
        html = f"""
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{b_name} – E-Mail bestätigen</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
             background-color: #f5f5f5; margin: 0; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff;
              border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="background: {b_color};
                padding: 32px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">{b_name}</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">Schweizer Steuerplattform</p>
    </div>
    <div style="padding: 40px 32px;">
      <h2 style="color: #1a1a1a; margin-top: 0;">Bestätige deine E-Mail-Adresse</h2>
      <p style="color: #4b5563; line-height: 1.6;">
        Willkommen bei {b_name}! Bitte klicke auf den Button unten, um deine E-Mail-Adresse
        zu bestätigen und dein Konto zu aktivieren. Dieser Link ist 24 Stunden gültig.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="{verify_url}"
           style="display: inline-block; background: {b_color}; color: #ffffff;
                  text-decoration: none; padding: 14px 32px; border-radius: 6px;
                  font-weight: 600; font-size: 16px;">
          E-Mail bestätigen
        </a>
      </div>
      <p style="color: #6b7280; font-size: 14px;">
        Falls du kein {b_name}-Konto erstellt hast, kannst du diese E-Mail ignorieren.
      </p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        Oder kopiere diese URL in deinen Browser:<br>
        <a href="{verify_url}" style="color: {b_color}; word-break: break-all;">{verify_url}</a>
      </p>
    </div>
    <div style="background: #f9fafb; padding: 20px 32px; text-align: center;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        {b_name} · Kontakt: {b_support} · Server in der Schweiz
      </p>
    </div>
  </div>
</body>
</html>
"""
        return await self._send(
            to_email,
            f"Bestätige deine {b_name} E-Mail-Adresse",
            html,
        )

    async def send_password_reset_email(self, to_email: str, token: str) -> bool:
        """Send a password-reset link."""
        brand = settings.get_brand_config()
        b_name = brand["brand_name"]
        b_color = brand["primary_color"]
        b_support = brand["support_email"]
        reset_url = f"{settings.FRONTEND_URL}/auth/reset-password?token={token}"
        html = f"""
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{b_name} – Passwort zurücksetzen</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
             background-color: #f5f5f5; margin: 0; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff;
              border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="background: {b_color};
                padding: 32px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">{b_name}</h1>
    </div>
    <div style="padding: 40px 32px;">
      <h2 style="color: #1a1a1a; margin-top: 0;">Passwort zurücksetzen</h2>
      <p style="color: #4b5563; line-height: 1.6;">
        Wir haben eine Anfrage zum Zurücksetzen deines Passworts für dein {b_name}-Konto erhalten.
        Klicke unten, um ein neues Passwort zu wählen. Der Link ist 24 Stunden gültig.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="{reset_url}"
           style="display: inline-block; background: {b_color}; color: #ffffff;
                  text-decoration: none; padding: 14px 32px; border-radius: 6px;
                  font-weight: 600; font-size: 16px;">
          Passwort zurücksetzen
        </a>
      </div>
      <p style="color: #6b7280; font-size: 14px;">
        Falls du dies nicht angefragt hast, kannst du diese E-Mail ignorieren.
      </p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        Oder kopiere diese URL in deinen Browser:<br>
        <a href="{reset_url}" style="color: {b_color}; word-break: break-all;">{reset_url}</a>
      </p>
    </div>
    <div style="background: #f9fafb; padding: 20px 32px; text-align: center;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        {b_name} · Kontakt: {b_support} · Server in der Schweiz
      </p>
    </div>
  </div>
</body>
</html>
"""
        return await self._send(
            to_email,
            f"Passwort für {b_name} zurücksetzen",
            html,
        )

    async def send_welcome_email(self, to_email: str, name: Optional[str] = None) -> bool:
        """Send a welcome email after email verification."""
        brand = settings.get_brand_config()
        b_name = brand["brand_name"]
        b_color = brand["primary_color"]
        b_support = brand["support_email"]
        display_name = name or "du"
        html = f"""
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Willkommen bei {b_name}!</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
             background-color: #f5f5f5; margin: 0; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff;
              border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <div style="background: {b_color};
                padding: 32px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700;">{b_name}</h1>
      <p style="color: rgba(255,255,255,0.9); margin: 8px 0 0;">Schweizer Steuerplattform</p>
    </div>
    <div style="padding: 40px 32px;">
      <h2 style="color: #1a1a1a; margin-top: 0;">Willkommen bei {b_name}, {display_name}!</h2>
      <p style="color: #4b5563; line-height: 1.6;">
        Dein Konto ist jetzt aktiv. {b_name} hilft dir, deine Schweizer Steuererklärung
        einfach, sicher und verständlich in wenigen Minuten vorzubereiten.
      </p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="{settings.FRONTEND_URL}/dashboard"
           style="display: inline-block; background: {b_color}; color: #ffffff;
                  text-decoration: none; padding: 14px 32px; border-radius: 6px;
                  font-weight: 600; font-size: 16px;">
          Zur Übersicht
        </a>
      </div>
    </div>
    <div style="background: #f9fafb; padding: 20px 32px; text-align: center;">
      <p style="color: #9ca3af; font-size: 12px; margin: 0;">
        {b_name} · Kontakt: {b_support} · Server in der Schweiz
      </p>
    </div>
  </div>
</body>
</html>
"""
        return await self._send(to_email, f"Willkommen bei {b_name}!", html)


# Default singleton instance
email_service = EmailService()
