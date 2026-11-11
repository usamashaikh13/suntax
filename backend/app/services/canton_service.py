"""
Canton and municipality data service for SunTax.

Provides authoritative data for all 26 Swiss Cantons with official
Swisstopo AMTOVZ PLZ -> BFS municipality mappings and Kanton Zürich OGD
Steuerfüsse municipality lists.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.schemas.tax_return import CantonResponse, MunicipalityResponse
from app.services.rules_data_service import rules_data_service

logger = logging.getLogger(__name__)

# ── All 26 Swiss Cantons ──────────────────────────────────────────────────────

_CANTONS: Dict[str, str] = {
    "ZH": "Zürich",
    "BE": "Bern",
    "LU": "Luzern",
    "UR": "Uri",
    "SZ": "Schwyz",
    "OW": "Obwalden",
    "NW": "Nidwalden",
    "GL": "Glarus",
    "ZG": "Zug",
    "FR": "Fribourg",
    "SO": "Solothurn",
    "BS": "Basel-Stadt",
    "BL": "Basel-Landschaft",
    "SH": "Schaffhausen",
    "AR": "Appenzell Ausserrhoden",
    "AI": "Appenzell Innerrhoden",
    "SG": "St. Gallen",
    "GR": "Graubünden",
    "AG": "Aargau",
    "TG": "Thurgau",
    "TI": "Ticino",
    "VD": "Vaud",
    "VS": "Valais",
    "NE": "Neuchâtel",
    "GE": "Genève",
    "JU": "Jura",
}


def _load_swiss_plz_bfs_data() -> Tuple[
    Dict[str, List[Tuple[str, str]]],
    Dict[str, List[Tuple[str, str, str]]],
]:
    """Load official Swisstopo AMTOVZ + Canton OGD PLZ/municipality data."""
    data_path = Path(__file__).resolve().parents[1] / "data" / "swiss_plz_bfs.json"
    munis: Dict[str, List[Tuple[str, str]]] = {}
    plzs: Dict[str, List[Tuple[str, str, str]]] = {}
    if not data_path.is_file():
        logger.warning("Official PLZ/BFS dataset missing at %s", data_path)
        return munis, plzs

    try:
        with data_path.open("r", encoding="utf-8") as fh:
            payload: Dict[str, Any] = json.load(fh)
        for canton, entries in payload.get("canton_municipalities", {}).items():
            munis[canton.upper()] = [
                (str(item["bfs"]), str(item["name"]))
                for item in entries
                if isinstance(item, dict) and item.get("bfs")
            ]
        for plz, entries in payload.get("plz", {}).items():
            plzs[str(plz)] = [
                (str(item["bfs"]), str(item["name"]), str(item["canton"]).upper())
                for item in entries
                if isinstance(item, dict) and item.get("bfs")
            ]
    except Exception as exc:
        logger.error("Failed loading official PLZ/BFS dataset: %s", exc)
    return munis, plzs


_MUNICIPALITIES, _PLZ_DIRECTORY = _load_swiss_plz_bfs_data()


class CantonService:
    """Service for canton and municipality lookups across all 26 Swiss cantons."""

    def __init__(self, rules_root: Optional[Path] = None):
        if rules_root is not None:
            self._rules_root = rules_root
        else:
            app_rules = Path(__file__).resolve().parents[1] / "tax-rules"
            repo_rules = Path(__file__).resolve().parents[2] / "tax-rules"
            self._rules_root = app_rules if app_rules.is_dir() else repo_rules

    def get_all_cantons(self) -> List[CantonResponse]:
        """Return all 26 Swiss cantons with data-driven rollout availability flags."""
        return [
            CantonResponse(
                code=code,
                name=name,
                availability={
                    "2025": rules_data_service.get_canton_availability(code, 2025),
                    "2026": rules_data_service.get_canton_availability(code, 2026),
                },
            )
            for code, name in sorted(_CANTONS.items())
        ]

    def canton_exists(self, canton_code: str) -> bool:
        """Return True if the canton code is supported."""
        return canton_code.upper() in _CANTONS

    def get_canton_name(self, canton_code: str) -> Optional[str]:
        """Return the display name for a canton code, or None if not found."""
        return _CANTONS.get(canton_code.upper())

    def get_municipalities(self, canton_code: str, tax_year: int = 2025) -> List[MunicipalityResponse]:
        """Return official municipalities for a given canton code without duplicating entries."""
        code = canton_code.upper()
        merged: Dict[str, str] = {}

        # Prefer rule-file municipality list first if present (contains official tax multipliers)
        rule_file = self._rules_root / "cantons" / code / f"{tax_year}.json"
        if not rule_file.is_file():
            rule_file = self._rules_root / "cantons" / code / "2025.json"
        if rule_file.is_file():
            try:
                with open(rule_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                for bfs, m_info in data.get("municipality_multipliers", {}).items():
                    merged[str(bfs)] = str(m_info.get("name", f"Municipality {bfs}"))
            except Exception as exc:
                logger.warning("Could not read municipality list from %s: %s", rule_file, exc)

        # Merge official Swisstopo / BFS dataset
        for bfs, name in _MUNICIPALITIES.get(code, []):
            if str(bfs) not in merged:
                merged[str(bfs)] = name

        return [
            MunicipalityResponse(code=bfs, name=name, canton_code=code)
            for bfs, name in sorted(
                merged.items(),
                key=lambda kv: (kv[1].lower(), int(kv[0]) if kv[0].isdigit() else 99999),
            )
        ]

    def find_municipality(
        self, canton_code: str, bfs_code: str
    ) -> Optional[MunicipalityResponse]:
        """Look up a specific municipality by BFS number."""
        code = canton_code.upper()
        target = str(bfs_code).strip()
        for m in self.get_municipalities(code):
            if m.code == target:
                return m
        return None

    def lookup_plz(self, plz: str) -> Optional[dict]:
        """
        Authoritative lookup of a 4-digit Swiss postal code (PLZ).
        Maps to canton, BFS municipality code, and municipality name.
        If a postal code spans multiple municipalities, is_ambiguous is True
        and all candidate municipalities are returned for user selection.
        """
        clean_plz = str(plz).strip()
        matches = _PLZ_DIRECTORY.get(clean_plz)
        if not matches:
            return None

        primary = matches[0]
        options = [
            {
                "bfs_code": bfs,
                "municipality_name": name,
                "canton": canton,
                "availability": {
                    "2025": rules_data_service.get_canton_availability(canton, 2025),
                    "2026": rules_data_service.get_canton_availability(canton, 2026),
                },
            }
            for bfs, name, canton in matches
        ]
        municipalities = [
            {
                "bfs": bfs,
                "name": name,
                "canton": canton,
                "availability": {
                    "2025": rules_data_service.get_canton_availability(canton, 2025),
                    "2026": rules_data_service.get_canton_availability(canton, 2026),
                },
            }
            for bfs, name, canton in matches
        ]
        primary_avail = {
            "2025": rules_data_service.get_canton_availability(primary[2], 2025),
            "2026": rules_data_service.get_canton_availability(primary[2], 2026),
        }
        return {
            "plz": clean_plz,
            "canton": primary[2],
            "municipality_name": primary[1],
            "bfs_code": primary[0],
            "availability": primary_avail,
            "is_ambiguous": len(matches) > 1,
            "options": options,
            "default_canton": primary[2],
            "default_name": primary[1],
            "default_bfs": primary[0],
            "municipalities": municipalities,
        }


# Singleton instance
canton_service = CantonService()
