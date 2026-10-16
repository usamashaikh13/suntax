"""
SMS and text message service for SunTax using the Twilio API.

Supports sending 2FA security codes, login verification alerts,
and tax return status notifications to Swiss and international mobile numbers.

In development mode (or when Twilio credentials are not set), SMS messages
are logged to the console so the application remains fully testable without
an active Twilio subscription.
"""

from __future__ import annotations

import logging
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


class SMSService:
    """
    Async SMS delivery via Twilio REST API (https://www.twilio.com).

    Falls back to console output in development/test environments or when no
    Twilio credentials are configured.
    """

    def __init__(self) -> None:
        self._account_sid = settings.TWILIO_ACCOUNT_SID
        self._auth_token = settings.TWILIO_AUTH_TOKEN
        self._from_number = settings.TWILIO_FROM_PHONE_NUMBER
        self._is_dev = settings.ENVIRONMENT in ("development", "test")

    def _should_use_console(self) -> bool:
        """Return True when we should print to console instead of calling Twilio."""
        if self._is_dev:
            return True
        if not self._account_sid or not self._auth_token or not self._from_number:
            return True
        if "your_twilio" in self._account_sid.lower():
            return True
        return False

    async def send_sms(self, to_phone: str, message: str) -> bool:
        """
        Send an SMS message to a mobile phone number using Twilio.

        Args:
            to_phone: Target phone number in E.164 format (e.g. +41791234567)
            message: Text message content

        Returns:
            True on success, False on failure.
        """
        if self._should_use_console():
            logger.info(
                "\n" + "=" * 60 + "\n"
                f"[DEV SMS — TWILIO SIMULATION]\n"
                f"To:      {to_phone}\n"
                f"From:    {self._from_number or '+41 79 000 00 00'}\n"
                f"Message: {message}\n"
                + "=" * 60
            )
            return True

        url = f"https://api.twilio.com/2010-04-01/Accounts/{self._account_sid}/Messages.json"
        data = {
            "To": to_phone,
            "From": self._from_number,
            "Body": message,
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    url,
                    data=data,
                    auth=(self._account_sid, self._auth_token),
                )

            if response.status_code in (200, 201):
                logger.info("Twilio SMS successfully dispatched to %s", to_phone)
                return True
            else:
                logger.error(
                    "Twilio SMS delivery failed: HTTP %s – %s",
                    response.status_code,
                    response.text,
                )
                return False

        except Exception as exc:
            logger.error("Exception during Twilio SMS send: %s", exc)
            return False

    async def send_2fa_code(self, to_phone: str, code: str) -> bool:
        """Send a 6-digit security code for two-factor authentication."""
        message = (
            f"SunTax Security Code: {code}. "
            "Valid for 5 minutes. Do not share this code with anyone."
        )
        return await self.send_sms(to_phone, message)

    async def send_status_update(
        self, to_phone: str, canton: str, year: int, status: str
    ) -> bool:
        """Send a tax declaration status update notification."""
        status_labels = {
            "draft": "Draft created",
            "review": "Under review",
            "confirmed": "Confirmed & finalized",
            "exported": "Official PDF generated",
        }
        human_status = status_labels.get(status.lower(), status)
        message = (
            f"SunTax Update: Your {year} tax return for Canton {canton} "
            f"is now {human_status}. Sign in to review: {settings.FRONTEND_URL}"
        )
        return await self.send_sms(to_phone, message)


# Module-level singleton
sms_service = SMSService()
