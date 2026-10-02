"""
Canton and municipality data service for SunTax.

Provides comprehensive data for all 26 Swiss Cantons with official
BFS (Bundesamt für Statistik) municipality numbers and tax data.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Optional

from app.schemas.tax_return import CantonResponse, MunicipalityResponse


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

# ── Municipalities master table (BFS number → name) ───────────────────────────

_MUNICIPALITIES: Dict[str, List[tuple[str, str]]] = {
    "ZH": [
        ("261", "Zürich"),
        ("230", "Winterthur"),
        ("218", "Uster"),
        ("195", "Dübendorf"),
        ("191", "Dietikon"),
        ("167", "Kloten"),
        ("211", "Regensdorf"),
        ("157", "Bülach"),
        ("135", "Horgen"),
        ("171", "Küsnacht"),
        ("176", "Männedorf"),
        ("182", "Meilen"),
        ("196", "Egg"),
        ("155", "Bassersdorf"),
        ("208", "Opfikon"),
        ("228", "Volketswil"),
        ("066", "Adliswil"),
        ("131", "Langnau am Albis"),
        ("243", "Illnau-Effretikon"),
    ],
    "BE": [
        ("351", "Bern"),
        ("942", "Biel/Bienne"),
        ("371", "Thun"),
        ("581", "Köniz"),
        ("572", "Langenthal"),
        ("764", "Ostermundigen"),
        ("561", "Burgdorf"),
        ("781", "Muri bei Bern"),
        ("861", "Interlaken"),
        ("761", "Bolligen"),
        ("762", "Ittigen"),
        ("771", "Zollikofen"),
    ],
    "LU": [
        ("1061", "Luzern"),
        ("1051", "Emmen"),
        ("1059", "Kriens"),
        ("1058", "Horw"),
        ("1054", "Ebikon"),
        ("1081", "Sursee"),
        ("1058", "Malters"),
        ("1053", "Hitzkirch"),
        ("1118", "Weggis"),
    ],
    "UR": [
        ("1201", "Altdorf"),
        ("1202", "Andermatt"),
        ("1205", "Bürglen"),
        ("1207", "Erstfeld"),
        ("1214", "Schattdorf"),
    ],
    "SZ": [
        ("1372", "Schwyz"),
        ("1342", "Freienbach"),
        ("1341", "Einsiedeln"),
        ("1322", "Küssnacht (SZ)"),
        ("1351", "Lachen"),
        ("1343", "Wollerau"),
        ("1321", "Arth"),
    ],
    "OW": [
        ("1406", "Sarnen"),
        ("1402", "Engelberg"),
        ("1401", "Alpnach"),
        ("1403", "Giswil"),
        ("1404", "Kerns"),
    ],
    "NW": [
        ("1509", "Stans"),
        ("1504", "Hergiswil"),
        ("1501", "Beckenried"),
        ("1503", "Ennetbürgen"),
        ("1508", "Stansstad"),
    ],
    "GL": [
        ("1632", "Glarus"),
        ("1631", "Glarus Nord"),
        ("1630", "Glarus Süd"),
    ],
    "ZG": [
        ("1701", "Zug"),
        ("1702", "Baar"),
        ("1703", "Cham"),
        ("1704", "Hünenberg"),
        ("1705", "Menzingen"),
        ("1706", "Neuheim"),
        ("1707", "Oberägeri"),
        ("1708", "Risch"),
        ("1709", "Steinhausen"),
        ("1710", "Unterägeri"),
        ("1711", "Walchwil"),
    ],
    "FR": [
        ("2196", "Fribourg"),
        ("2173", "Bulle"),
        ("2238", "Villars-sur-Glâne"),
        ("2200", "Marly"),
        ("2189", "Châtel-Saint-Denis"),
    ],
    "SO": [
        ("2601", "Solothurn"),
        ("2581", "Olten"),
        ("2476", "Grenchen"),
        ("2586", "Zuchwil"),
        ("2572", "Däniken"),
    ],
    "BS": [
        ("2701", "Basel"),
        ("2702", "Bettingen"),
        ("2703", "Riehen"),
    ],
    "BL": [
        ("2829", "Liestal"),
        ("2761", "Allschwil"),
        ("2762", "Binningen"),
        ("2763", "Birsfelden"),
        ("2769", "Muttenz"),
        ("2771", "Pratteln"),
        ("2772", "Reinach (BL)"),
    ],
    "SH": [
        ("2937", "Schaffhausen"),
        ("2936", "Neuhausen am Rheinfall"),
        ("2961", "Stein am Rhein"),
        ("2938", "Thayngen"),
    ],
    "AR": [
        ("3001", "Herisau"),
        ("3004", "Teufen"),
        ("3003", "Speicher"),
        ("3002", "Heiden"),
    ],
    "AI": [
        ("3101", "Appenzell"),
        ("3102", "Gonten"),
        ("3104", "Oberegg"),
        ("3105", "Rüte"),
        ("3106", "Schwende"),
    ],
    "SG": [
        ("3203", "St. Gallen"),
        ("3441", "Rapperswil-Jona"),
        ("3427", "Wil (SG)"),
        ("3214", "Gossau (SG)"),
        ("3358", "Uzwil"),
        ("3401", "Altstätten"),
        ("3271", "Buchs (SG)"),
    ],
    "GR": [
        ("3901", "Chur"),
        ("3851", "Davos"),
        ("3787", "St. Moritz"),
        ("3732", "Landquart"),
        ("3572", "Domat/Ems"),
    ],
    "AG": [
        ("4001", "Aarau"),
        ("4021", "Baden"),
        ("4045", "Wettingen"),
        ("4082", "Wohlen (AG)"),
        ("4201", "Zofingen"),
        ("4112", "Rheinfelden"),
        ("4004", "Buchsi"),
        ("4041", "Suhr"),
        ("4033", "Lenzburg"),
        ("4271", "Brugg"),
    ],
    "TG": [
        ("4566", "Frauenfeld"),
        ("4671", "Kreuzlingen"),
        ("4401", "Arbon"),
        ("4411", "Amriswil"),
        ("4946", "Weinfelden"),
    ],
    "TI": [
        ("5192", "Lugano"),
        ("5002", "Bellinzona"),
        ("5096", "Locarno"),
        ("5180", "Mendrisio"),
        ("5032", "Chiasso"),
    ],
    "VD": [
        ("5586", "Lausanne"),
        ("5938", "Yverdon-les-Bains"),
        ("5886", "Montreux"),
        ("5888", "Vevey"),
        ("5643", "Nyon"),
        ("5640", "Morges"),
        ("5588", "Pully"),
        ("5887", "Renens (VD)"),
    ],
    "VS": [
        ("6266", "Sion"),
        ("6217", "Martigny"),
        ("6172", "Brig-Glis"),
        ("6242", "Monthey"),
        ("6218", "Natters"),
    ],
    "NE": [
        ("6458", "Neuchâtel"),
        ("6421", "La Chaux-de-Fonds"),
        ("6436", "Le Locle"),
        ("6455", "Val-de-Travers"),
    ],
    "GE": [
        ("6621", "Genève"),
        ("6643", "Vernier"),
        ("6628", "Lancy"),
        ("6631", "Meyrin"),
        ("6615", "Carouge (GE)"),
        ("6633", "Onex"),
    ],
    "JU": [
        ("6711", "Delémont"),
        ("6801", "Porrentruy"),
        ("6722", "Moutier"),
        ("6713", "Haute-Sorne"),
    ],
}


class CantonService:
    """Service for canton and municipality lookups across all 26 Swiss cantons."""

    def __init__(self, rules_root: Optional[Path] = None):
        self._rules_root = rules_root or Path(__file__).resolve().parents[3] / "tax-rules"

    def get_all_cantons(self) -> List[CantonResponse]:
        """Return all 26 Swiss cantons as CantonResponse objects."""
        return [
            CantonResponse(code=code, name=name)
            for code, name in sorted(_CANTONS.items())
        ]

    def canton_exists(self, canton_code: str) -> bool:
        """Return True if the canton code is supported."""
        return canton_code.upper() in _CANTONS

    def get_canton_name(self, canton_code: str) -> Optional[str]:
        """Return the display name for a canton code, or None if not found."""
        return _CANTONS.get(canton_code.upper())

    def get_municipalities(self, canton_code: str) -> List[MunicipalityResponse]:
        """Return all known municipalities for a given canton code."""
        code = canton_code.upper()
        entries = _MUNICIPALITIES.get(code, [])

        # Also merge any municipalities found in tax-rules JSON if available
        rule_file = self._rules_root / "cantons" / code / "2025.json"
        if rule_file.is_file():
            try:
                with open(rule_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    rule_munis = data.get("municipality_multipliers", {})
                    existing_bfs = {bfs for bfs, _ in entries}
                    for bfs, m_info in rule_munis.items():
                        if bfs not in existing_bfs:
                            entries.append((bfs, m_info.get("name", f"Municipality {bfs}")))
            except Exception:
                pass

        return [
            MunicipalityResponse(code=bfs, name=name, canton_code=code)
            for bfs, name in entries
        ]

    def find_municipality(
        self, canton_code: str, bfs_code: str
    ) -> Optional[MunicipalityResponse]:
        """Look up a specific municipality by BFS number."""
        code = canton_code.upper()
        for m in self.get_municipalities(code):
            if m.code == bfs_code:
                return m
        return None
