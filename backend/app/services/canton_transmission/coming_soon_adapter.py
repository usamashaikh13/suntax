"""Fallback adapter for cantons marked 'coming_soon' and generic eCH-0119 portal adapter."""
from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

from app.services.canton_transmission.base import (
    CantonNotAvailableError,
    CantonTransmissionAdapter,
    TransmissionResult,
)


class ComingSoonCantonAdapter(CantonTransmissionAdapter):
    """Explicit guard blocking submission for cantons not yet switched on."""

    def __init__(self, canton_code: str) -> None:
        self.canton_code = canton_code.upper()
        self.channel_name = "coming_soon"

    async def prepare_or_transmit(
        self,
        tax_return: Any,
        xml_str: str,
        pdf_bytes: bytes,
        attachments: List[Dict[str, Any]],
        access_code: Optional[str] = None,
    ) -> TransmissionResult:
        tax_year = int(getattr(tax_return, "tax_year", 2025) or 2025)
        raise CantonNotAvailableError(self.canton_code, tax_year)


class GenericEch0119Adapter(CantonTransmissionAdapter):
    """Standard eCH-0119 delivery adapter for newly enabled cantons (e.g. BE, TG, SZ, SO)."""

    def __init__(self, canton_code: str) -> None:
        self.canton_code = canton_code.upper()
        self.channel_name = f"ech0119_portal_{self.canton_code.lower()}"

    async def prepare_or_transmit(
        self,
        tax_return: Any,
        xml_str: str,
        pdf_bytes: bytes,
        attachments: List[Dict[str, Any]],
        access_code: Optional[str] = None,
    ) -> TransmissionResult:
        tax_year = int(getattr(tax_return, "tax_year", 2025) or 2025)
        tx_id = f"{self.canton_code}-ECH0119-{tax_year}-{str(uuid.uuid4())[:8].upper()}"
        return TransmissionResult(
            accepted=True,
            canton_code=self.canton_code,
            tax_year=tax_year,
            channel=self.channel_name,
            status="dossier_ready",
            transmission_id=tx_id,
            message=f"Dein eCH-0119 Dossier für den Kanton {self.canton_code} ist bereit.",
            metadata={
                "xml_bytes": len(xml_str.encode("utf-8")),
                "pdf_bytes": len(pdf_bytes),
                "attachment_count": len(attachments),
                "access_code_supplied": bool(access_code),
            },
        )
