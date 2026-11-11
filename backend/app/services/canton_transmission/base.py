"""Base interface for per-canton eCH-0119 transmission adapters."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


class CantonNotAvailableError(Exception):
    """Raised when submission is attempted for a canton flagged as coming_soon."""

    def __init__(self, canton_code: str, tax_year: int) -> None:
        self.canton_code = canton_code
        self.tax_year = tax_year
        super().__init__(f"Dein Kanton kommt bald ({canton_code} / {tax_year}).")


@dataclass
class TransmissionResult:
    accepted: bool
    canton_code: str
    tax_year: int
    channel: str
    status: str  # "dossier_ready" | "queued_webservice" | "coming_soon" | "rejected"
    message: str
    transmission_id: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


class CantonTransmissionAdapter(ABC):
    """Per-canton transmission interface operating on the same eCH-0119 XML payload."""

    canton_code: str = ""
    channel_name: str = ""

    @abstractmethod
    async def prepare_or_transmit(
        self,
        tax_return: Any,
        xml_str: str,
        pdf_bytes: bytes,
        attachments: List[Dict[str, Any]],
        access_code: Optional[str] = None,
    ) -> TransmissionResult:
        """Prepare or deliver a validated eCH-0119 dossier to the cantonal authority."""
