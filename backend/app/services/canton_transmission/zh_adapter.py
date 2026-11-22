"""Kanton Zürich eCH-0119 delivery adapter (webservice ready from 1 Jan 2027, zh-tax@zh.ch)."""
from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

from app.services.canton_transmission.base import CantonTransmissionAdapter, TransmissionResult


class ZurichWebserviceAdapter(CantonTransmissionAdapter):
    """Transmission module for Canton Zürich (ZH)."""

    canton_code = "ZH"
    channel_name = "ech0119_webservice_zh"

    async def prepare_or_transmit(
        self,
        tax_return: Any,
        xml_str: str,
        pdf_bytes: bytes,
        attachments: List[Dict[str, Any]],
        access_code: Optional[str] = None,
    ) -> TransmissionResult:
        tax_year = int(getattr(tax_return, "tax_year", 2025) or 2025)
        tx_id = f"ZH-ECH0119-{tax_year}-{str(uuid.uuid4())[:8].upper()}"

        return TransmissionResult(
            accepted=True,
            canton_code="ZH",
            tax_year=tax_year,
            channel="ech0119_dossier_zh",
            status="dossier_ready",
            transmission_id=tx_id,
            message=(
                "Dein vollständiges eCH-0119 Steuerdossier für den Kanton Zürich ist bereit. "
                "Da die direkte elektronische Schnittstelle zum kantonalen Steueramt noch nicht freigegeben ist, "
                "drucke bitte das Hauptformular aus, unterschreibe es handschriftlich und sende es per Post "
                "zusammen mit deinen Original-Lohnausweisen an dein zuständiges Gemeindesteueramt."
            ),
            metadata={
                "xml_bytes": len(xml_str.encode("utf-8")),
                "pdf_bytes": len(pdf_bytes),
                "attachment_count": len(attachments),
                "access_code_supplied": bool(access_code),
                "zh_webservice_target": "zh-tax@zh.ch (planned 2027)",
                "filing_method": "postal_filing_or_zhprivatetax",
                "direct_electronic_transmission_active": False,
            },
        )
