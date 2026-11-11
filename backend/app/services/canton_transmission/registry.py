"""Data-driven registry mapping (canton_code, tax_year) -> transmission adapter."""
from __future__ import annotations

from typing import Dict, Type

from app.services.canton_transmission.base import CantonTransmissionAdapter
from app.services.canton_transmission.coming_soon_adapter import (
    ComingSoonCantonAdapter,
    GenericEch0119Adapter,
)
from app.services.canton_transmission.zh_adapter import ZurichWebserviceAdapter
from app.services.rules_data_service import RulesDataService, rules_data_service

_CANTON_SPECIFIC_ADAPTERS: Dict[str, Type[CantonTransmissionAdapter]] = {
    "ZH": ZurichWebserviceAdapter,
}


def get_transmission_adapter(
    canton_code: str,
    tax_year: int = 2025,
    rules_svc: RulesDataService = rules_data_service,
) -> CantonTransmissionAdapter:
    """
    Resolve transmission adapter strictly from availability flag in rules_2025_2026.json.
    Switching any canton to 'available' in JSON enables it automatically without code change.
    """
    code = str(canton_code or "").upper()
    if not rules_svc.is_canton_available(code, int(tax_year)):
        return ComingSoonCantonAdapter(code)

    adapter_cls = _CANTON_SPECIFIC_ADAPTERS.get(code)
    if adapter_cls is not None:
        return adapter_cls()
    return GenericEch0119Adapter(code)
