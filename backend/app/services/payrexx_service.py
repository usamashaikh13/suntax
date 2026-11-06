"""
Payrexx Swiss Payment Gateway Service.
Handles CHF 39.00 payment processing for Swiss tax returns via Payrexx.
Supports TWINT, PostFinance, and Credit Card payments.
Complies with Swiss data residency: zero credit card numbers stored on SunTax servers.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import urllib.parse

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


class PayrexxService:
    """
    Client for the Swiss Payrexx Gateway API (v1.0).
    Manages payment checkout session creation, transaction verification,
    and HMAC-SHA256 webhook validation.
    """

    FIXED_PRICE_CHF = 39.00
    FIXED_PRICE_CENTS = 3900

    def __init__(self) -> None:
        self.instance_name = settings.PAYREXX_INSTANCE_NAME
        self.api_secret = settings.PAYREXX_API_SECRET
        self.api_url = (settings.PAYREXX_API_URL or "https://api.payrexx.com/v1.0").rstrip("/")
        self.webhook_secret = settings.PAYREXX_WEBHOOK_SECRET or settings.PAYREXX_API_SECRET
        # In-memory sandbox gateway registry for testing / local execution without live credentials
        self._sandbox_gateways: Dict[str, Dict[str, Any]] = {}

    @property
    def is_configured(self) -> bool:
        """Checks if live Payrexx merchant credentials are configured."""
        return bool(
            self.instance_name
            and self.api_secret
            and not self.api_secret.startswith("your-")
            and not self.api_secret.startswith("CHANGE-ME")
        )

    def _build_signature(self, params: Dict[str, Any]) -> str:
        """
        Builds HMAC-SHA256 signature for Payrexx API calls if required.
        """
        if not self.api_secret:
            return ""
        sorted_params = urllib.parse.urlencode(sorted(params.items()))
        return base64.b64encode(
            hmac.new(self.api_secret.encode("utf-8"), sorted_params.encode("utf-8"), hashlib.sha256).digest()
        ).decode("utf-8")

    async def create_gateway(
        self,
        tax_return_id: str,
        amount_chf: float = 39.00,
        currency: str = "CHF",
        payment_methods: Optional[List[str]] = None,
        success_redirect_url: Optional[str] = None,
        failed_redirect_url: Optional[str] = None,
        cancel_redirect_url: Optional[str] = None,
        user_email: Optional[str] = None,
        user_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Creates a new Payrexx payment gateway for the CHF 39.00 filing fee.
        """
        amount_cents = int(round(amount_chf * 100))
        valid_methods = payment_methods or ["twint", "mastercard", "visa", "postfinance_card"]

        # ── 1. Live Payrexx Gateway Creation ──────────────────────────────────
        if self.is_configured:
            url = f"{self.api_url}/Gateway/?apiKey={self.api_secret}"
            payload = {
                "instance": self.instance_name,
                "amount": amount_cents,
                "currency": currency,
                "referenceId": tax_return_id,
                "purpose": f"SunTax Steuererklärung {tax_return_id[:8]}",
                "pm": valid_methods,
                "preAuth": 0,
                "reservation": 0,
            }
            if success_redirect_url:
                payload["successRedirectUrl"] = success_redirect_url
            if failed_redirect_url:
                payload["failedRedirectUrl"] = failed_redirect_url
            if cancel_redirect_url:
                payload["cancelRedirectUrl"] = cancel_redirect_url
            if user_email:
                payload["fields"] = {"email": {"value": user_email}}

            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    resp = await client.post(url, data=payload)
                    resp.raise_for_status()
                    data = resp.json()
                    if data.get("status") == "success" and data.get("data"):
                        gw_info = data["data"][0]
                        gateway_id = str(gw_info.get("id"))
                        checkout_url = gw_info.get("link")
                        logger.info("Created Payrexx Gateway ID %s for tax return %s", gateway_id, tax_return_id)
                        return {
                            "gateway_id": gateway_id,
                            "checkout_url": checkout_url,
                            "amount_chf": amount_chf,
                            "currency": currency,
                            "reference_id": tax_return_id,
                            "status": "waiting",
                            "is_sandbox": False,
                            "provider": "payrexx",
                        }
                    else:
                        logger.error("Payrexx gateway response error: %s", data)
                        raise ValueError(f"Payrexx error: {data.get('message', 'Unknown error')}")
            except Exception as exc:
                logger.error("Failed to connect to Payrexx API: %s", exc)
                raise RuntimeError(f"Payrexx-Zahlung konnte nicht initiiert werden: {exc}") from exc

        # ── 2. Sandbox / Test Gateway Fallback ────────────────────────────────
        gateway_id = f"gw_sandbox_{uuid.uuid4().hex[:12]}"
        checkout_url = f"https://suntax-sandbox.payrexx.com/pay/{gateway_id}"
        record = {
            "gateway_id": gateway_id,
            "reference_id": tax_return_id,
            "amount_chf": amount_chf,
            "amount_cents": amount_cents,
            "currency": currency,
            "status": "waiting",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "payment_methods": valid_methods,
            "is_sandbox": True,
        }
        self._sandbox_gateways[gateway_id] = record
        logger.info(
            "Payrexx credentials not configured. Created sandbox gateway %s for tax return %s",
            gateway_id,
            tax_return_id,
        )
        return {
            "gateway_id": gateway_id,
            "checkout_url": checkout_url,
            "amount_chf": amount_chf,
            "currency": currency,
            "reference_id": tax_return_id,
            "status": "waiting",
            "is_sandbox": True,
            "provider": "payrexx",
        }

    def simulate_provider_payment(
        self,
        gateway_id: str,
        transaction_id: Optional[str] = None,
        payment_method: str = "twint",
        status: str = "confirmed",
    ) -> Dict[str, Any]:
        """
        Simulates the external payment provider (Payrexx) callback or status update.
        Used strictly in sandbox test scenarios to transition a gateway from 'waiting' to 'confirmed'.
        Never marks paid automatically without this explicit provider transition.
        """
        if gateway_id not in self._sandbox_gateways:
            raise KeyError(f"Sandbox gateway {gateway_id} nicht gefunden.")
        gw = self._sandbox_gateways[gateway_id]
        gw["status"] = status
        gw["payment_method"] = payment_method
        gw["transaction_id"] = transaction_id or f"tx_sandbox_{uuid.uuid4().hex[:10]}"
        gw["confirmed_at"] = datetime.now(timezone.utc).isoformat()
        return gw

    async def verify_transaction(
        self,
        tax_return_id: str,
        transaction_id: Optional[str] = None,
        gateway_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Verifies with Payrexx that a payment was genuinely confirmed.
        Never marks paid without validating provider transaction status, amount, and reference.
        """
        if not transaction_id and not gateway_id:
            return {
                "verified": False,
                "error": "Weder Transaktions-ID noch Gateway-ID übermittelt.",
            }

        # ── 1. Live Payrexx Verification ──────────────────────────────────────
        if self.is_configured:
            check_url = None
            if transaction_id:
                check_url = f"{self.api_url}/Transaction/{transaction_id}/?apiKey={self.api_secret}"
            elif gateway_id:
                check_url = f"{self.api_url}/Gateway/{gateway_id}/?apiKey={self.api_secret}"

            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.get(check_url)
                    resp.raise_for_status()
                    data = resp.json()
                    if data.get("status") == "success" and data.get("data"):
                        record = data["data"][0]
                        pay_status = (record.get("status") or "").lower()
                        ref_id = record.get("referenceId")
                        amount = record.get("amount")

                        # Validate matching return and confirmed status
                        if ref_id != tax_return_id:
                            return {
                                "verified": False,
                                "error": f"Referenznummer stimmt nicht überein ({ref_id} != {tax_return_id})",
                            }
                        if pay_status != "confirmed":
                            return {
                                "verified": False,
                                "status": pay_status,
                                "error": f"Zahlung noch nicht bestätigt (Status: {pay_status})",
                            }
                        if amount != self.FIXED_PRICE_CENTS and amount != self.FIXED_PRICE_CHF:
                            return {
                                "verified": False,
                                "error": f"Zahlungsbetrag ungültig (Erwartet CHF 39.00, erhalten {amount})",
                            }

                        return {
                            "verified": True,
                            "transaction_id": str(record.get("id")),
                            "gateway_id": gateway_id or str(record.get("gatewayId")),
                            "amount_chf": self.FIXED_PRICE_CHF,
                            "currency": "CHF",
                            "status": "confirmed",
                            "method": record.get("payment", {}).get("brand", "twint") if isinstance(record.get("payment"), dict) else "twint",
                            "is_sandbox": False,
                        }
                    else:
                        return {"verified": False, "error": "Payrexx Datensatz nicht gefunden."}
            except Exception as exc:
                logger.error("Payrexx verification network error: %s", exc)
                return {"verified": False, "error": f"Verbindungsfehler zu Payrexx: {exc}"}

        # ── 2. Sandbox Verification (Strict Status Check) ─────────────────────
        target_gw = None
        if gateway_id and gateway_id in self._sandbox_gateways:
            target_gw = self._sandbox_gateways[gateway_id]
        else:
            # Check by reference_id
            for g in self._sandbox_gateways.values():
                if g["reference_id"] == tax_return_id:
                    target_gw = g
                    break

        if not target_gw:
            return {
                "verified": False,
                "error": "Zahlung nicht gefunden. Bitte initiieren Sie zuerst die Zahlung.",
            }

        if target_gw["reference_id"] != tax_return_id:
            return {
                "verified": False,
                "error": "Referenznummer stimmt nicht mit der Steuererklärung überein.",
            }

        # CRITICAL: Verify payment is genuinely confirmed by provider.
        # DO NOT auto-confirm waiting gateways!
        if target_gw.get("status") != "confirmed":
            return {
                "verified": False,
                "status": target_gw.get("status", "waiting"),
                "error": f"Zahlung beim Zahlungsanbieter noch nicht bestätigt (Status: {target_gw.get('status', 'waiting')}). Bitte schliessen Sie den Bezahlvorgang über TWINT oder Kreditkarte ab.",
            }

        return {
            "verified": True,
            "transaction_id": target_gw.get("transaction_id") or transaction_id or f"tx_sandbox_{uuid.uuid4().hex[:10]}",
            "gateway_id": target_gw["gateway_id"],
            "amount_chf": self.FIXED_PRICE_CHF,
            "currency": "CHF",
            "status": "confirmed",
            "method": target_gw.get("payment_method", "twint"),
            "is_sandbox": True,
        }

    def verify_webhook_signature(self, raw_body: bytes, signature_header: Optional[str]) -> bool:
        """
        Validates Payrexx HMAC-SHA256 signature for incoming webhooks.
        """
        if not signature_header:
            return False

        secret = (self.webhook_secret or "").strip()
        if not secret:
            logger.warning("Payrexx webhook secret is not configured; cannot verify signature.")
            return False

        expected_hex = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
        expected_b64 = base64.b64encode(
            hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
        ).decode("utf-8")

        sig_clean = signature_header.strip()
        return (
            hmac.compare_digest(expected_hex.lower(), sig_clean.lower())
            or hmac.compare_digest(expected_b64, sig_clean)
        )

    def process_webhook_payload(
        self,
        payload: Dict[str, Any],
        raw_body: bytes,
        signature: Optional[str] = None,
        enforce_signature: bool = True,
    ) -> Dict[str, Any]:
        """
        Validates webhook payload authenticity and parses confirmed transaction details.
        """
        if enforce_signature and self.is_configured:
            if not self.verify_webhook_signature(raw_body, signature):
                return {
                    "valid": False,
                    "error": "Ungültige Webhook-Signatur (HMAC-SHA256 Prüfsummenfehler).",
                }

        transaction = payload.get("transaction") or payload
        if not transaction or not isinstance(transaction, dict):
            return {"valid": False, "error": "Fehlendes oder ungültiges Transaktionsobjekt."}

        status = (transaction.get("status") or "").lower()
        amount = transaction.get("amount")
        reference_id = transaction.get("referenceId")
        tx_id = str(transaction.get("id") or "")

        payment_info = transaction.get("payment", {})
        method = payment_info.get("brand", "twint") if isinstance(payment_info, dict) else "twint"

        if status != "confirmed":
            return {
                "valid": False,
                "status": status,
                "error": f"Transaktion nicht bestätigt (Status: {status}).",
            }

        # Amount check: Payrexx can send 3900 cents or 39.00
        if amount not in (self.FIXED_PRICE_CENTS, self.FIXED_PRICE_CHF):
            return {
                "valid": False,
                "error": f"Betrag weicht ab: {amount} (erwartet 3900 cents / CHF 39.00).",
            }

        if not reference_id:
            return {"valid": False, "error": "Fehlende referenceId im Webhook."}

        # Update in-memory sandbox gateway status if tracking this return
        for gw in self._sandbox_gateways.values():
            if gw.get("reference_id") == reference_id:
                gw["status"] = "confirmed"
                gw["payment_method"] = method
                gw["transaction_id"] = tx_id
                gw["confirmed_at"] = datetime.now(timezone.utc).isoformat()
                break

        return {
            "valid": True,
            "reference_id": reference_id,
            "transaction_id": tx_id,
            "status": "confirmed",
            "amount_chf": self.FIXED_PRICE_CHF,
            "payment_method": method.lower(),
        }


# Singleton service instance
payrexx_service = PayrexxService()
