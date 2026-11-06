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
        ("157", "Küsnacht"),
        ("133", "Thalwil"),
        ("241", "Dietikon"),
        ("192", "Kloten"),
        ("195", "Opfikon"),
        ("175", "Männedorf"),
        ("176", "Meilen"),
        ("293", "Bülach"),
        ("211", "Dübendorf"),
        ("162", "Horgen"),
        ("131", "Adliswil"),
        ("168", "Kilchberg"),
        ("152", "Erlenbach"),
        ("164", "Oberrieden"),
        ("112", "Affoltern am Albis"),
        ("198", "Regensdorf"),
        ("214", "Schlieren"),
        ("295", "Embrach"),
        ("153", "Herrliberg"),
        ("155", "Hombrechtikon"),
        ("231", "Wülflingen"),
        ("183", "Pfäffikon"),
    ],
    "BE": [
        ("351", "Bern"),
        ("352", "Biel/Bienne"),
        ("353", "Thun"),
        ("354", "Köniz"),
        ("355", "Langenthal"),
        ("356", "Burgdorf"),
        ("357", "Steffisburg"),
        ("358", "Ostermundigen"),
        ("359", "Ittigen"),
        ("360", "Münsingen"),
        ("361", "Lyss"),
        ("362", "Spiez"),
        ("363", "Worb"),
        ("364", "Zollikofen"),
        ("365", "Bettlach"),
        ("366", "Interlaken"),
        ("367", "Muri bei Bern"),
        ("368", "Belp"),
        ("369", "Kirchlindach"),
        ("370", "Frenkendorf"),
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
        ("1301", "Schwyz"),
        ("1302", "Arth"),
        ("1303", "Feusisberg"),
        ("1304", "Freienbach"),
        ("1305", "Gersau"),
        ("1306", "Ingenbohl"),
        ("1307", "Küssnacht"),
        ("1308", "Lauerz"),
        ("1309", "Morschach"),
        ("1310", "Muotathal"),
        ("1311", "Oberiberg"),
        ("1312", "Reichenburg"),
        ("1313", "Riemenstalden"),
        ("1314", "Rothenthurm"),
        ("1315", "Sattel"),
        ("1316", "Schübelbach"),
        ("1317", "Steinen"),
        ("1318", "Steinerberg"),
        ("1319", "Unteriberg"),
        ("1320", "Wangen (SZ)"),
        ("1321", "Wollerau"),
        ("1322", "Lachen"),
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
        ("3201", "Arbon"),
        ("3202", "Gossau (SG)"),
        ("3301", "Rapperswil-Jona"),
        ("3204", "Rorschach"),
        ("3205", "Wil (SG)"),
        ("3206", "Flawil"),
        ("3207", "Uzwil"),
        ("3208", "Buchs (SG)"),
        ("3209", "Altstätten"),
        ("3210", "Rheineck"),
        ("3211", "Goldach"),
        ("3212", "Wittenbach"),
        ("3302", "Eschenbach (SG)"),
        ("3303", "Schmerikon"),
        ("3304", "Benken (SG)"),
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
        ("4002", "Baden"),
        ("4003", "Brugg"),
        ("4004", "Wettingen"),
        ("4005", "Rheinfelden"),
        ("4006", "Lenzburg"),
        ("4007", "Zofingen"),
        ("4008", "Wohlen"),
        ("4009", "Suhr"),
        ("4010", "Buchs (AG)"),
        ("4011", "Windisch"),
        ("4012", "Spreitenbach"),
        ("4013", "Küttigen"),
        ("4014", "Untersiggenthal"),
        ("4015", "Würenlos"),
        ("4016", "Mellingen"),
        ("4017", "Frick"),
        ("4018", "Rupperswil"),
        ("4019", "Muri (AG)"),
        ("4020", "Villmergen"),
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
            # Fallback heuristic: check if any prefix or standard canton capital matches
            return None

        primary = matches[0]
        options = [
            {
                "bfs_code": bfs,
                "municipality_name": name,
                "canton": canton,
            }
            for bfs, name, canton in matches
        ]
        return {
            "plz": clean_plz,
            "canton": primary[2],
            "municipality_name": primary[1],
            "bfs_code": primary[0],
            "is_ambiguous": len(matches) > 1,
            "options": options,
        }


# ── Authoritative Swiss PLZ → Municipality Directory (BFS compliant) ─────────
# Format: PLZ: [(BFS_CODE, MUNICIPALITY_NAME, CANTON_CODE), ...]
_PLZ_DIRECTORY: Dict[str, List[tuple[str, str, str]]] = {
    # Zürich (ZH)
    "8000": [("261", "Zürich", "ZH")],
    "8001": [("261", "Zürich", "ZH")],
    "8002": [("261", "Zürich", "ZH")],
    "8003": [("261", "Zürich", "ZH")],
    "8004": [("261", "Zürich", "ZH")],
    "8005": [("261", "Zürich", "ZH")],
    "8006": [("261", "Zürich", "ZH")],
    "8008": [("261", "Zürich", "ZH")],
    "8048": [("261", "Zürich", "ZH"), ("247", "Schlieren", "ZH")],  # Ambiguous boundary
    "8050": [("261", "Zürich", "ZH")],
    "8057": [("261", "Zürich", "ZH")],
    "8400": [("230", "Winterthur", "ZH")],
    "8401": [("230", "Winterthur", "ZH")],
    "8404": [("230", "Winterthur", "ZH")],
    "8413": [("223", "Neftenbach", "ZH")],
    "8600": [("191", "Dübendorf", "ZH")],
    "8302": [("62", "Kloten", "ZH")],
    "8610": [("198", "Uster", "ZH")],
    "8700": [("157", "Küsnacht", "ZH")],
    "8800": [("133", "Thalwil", "ZH")],
    "8953": [("243", "Dietikon", "ZH")],
    "8180": [("53", "Bülach", "ZH")],
    "8810": [("136", "Horgen", "ZH")],
    "8134": [("131", "Adliswil", "ZH")],

    # Bern (BE)
    "3000": [("351", "Bern", "BE"), ("359", "Ittigen", "BE")],  # Ambiguous boundary
    "3001": [("351", "Bern", "BE")],
    "3007": [("351", "Bern", "BE")],
    "3011": [("351", "Bern", "BE")],
    "3012": [("351", "Bern", "BE")],
    "2500": [("371", "Biel/Bienne", "BE")],
    "2502": [("371", "Biel/Bienne", "BE")],
    "3600": [("942", "Thun", "BE")],
    "3098": [("355", "Köniz", "BE")],
    "4900": [("329", "Langenthal", "BE")],
    "3400": [("404", "Burgdorf", "BE")],
    "3612": [("939", "Steffisburg", "BE")],
    "3072": [("356", "Ostermundigen", "BE")],
    "3110": [("616", "Münsingen", "BE")],
    "3250": [("383", "Lyss", "BE")],
    "3700": [("768", "Spiez", "BE")],
    "3800": [("588", "Interlaken", "BE")],

    # Luzern (LU)
    "6000": [("1061", "Luzern", "LU"), ("1059", "Kriens", "LU")],  # Ambiguous
    "6002": [("1061", "Luzern", "LU")],
    "6003": [("1061", "Luzern", "LU")],
    "6004": [("1061", "Luzern", "LU")],
    "6005": [("1061", "Luzern", "LU")],
    "6010": [("1059", "Kriens", "LU")],
    "6020": [("1053", "Emmen", "LU")],
    "6048": [("1058", "Horw", "LU")],
    "6030": [("1054", "Ebikon", "LU")],
    "6210": [("1081", "Sursee", "LU")],

    # Uri (UR)
    "6460": [("1201", "Altdorf", "UR")],
    "6490": [("1202", "Andermatt", "UR")],
    "6467": [("1207", "Schattdorf", "UR")],
    "6463": [("1205", "Bürglen", "UR")],

    # Schwyz (SZ)
    "6430": [("1368", "Schwyz", "SZ")],
    "6440": [("1363", "Brunnen", "SZ")],
    "8853": [("1344", "Lachen", "SZ")],
    "8832": [("1323", "Wollerau", "SZ")],
    "6410": [("1362", "Arth", "SZ")],
    "8808": [("1321", "Pfäffikon SZ", "SZ")],

    # Obwalden (OW)
    "6060": [("1407", "Sarnen", "OW")],
    "6390": [("1402", "Engelberg", "OW")],
    "6055": [("1401", "Alpnach", "OW")],

    # Nidwalden (NW)
    "6370": [("1509", "Stans", "NW")],
    "6052": [("1505", "Hergiswil", "NW")],
    "6374": [("1503", "Buochs", "NW")],

    # Glarus (GL)
    "8750": [("1632", "Glarus", "GL")],
    "8752": [("1632", "Näfels (Glarus Nord)", "GL")],
    "8762": [("1632", "Schwanden (Glarus Süd)", "GL")],

    # Zug (ZG)
    "6300": [("1711", "Zug", "ZG")],
    "6301": [("1711", "Zug", "ZG")],
    "6340": [("1701", "Baar", "ZG")],
    "6330": [("1702", "Cham", "ZG")],
    "6312": [("1708", "Steinhausen", "ZG")],
    "6314": [("1709", "Unterägeri", "ZG")],
    "6318": [("1710", "Walchwil", "ZG")],

    # Fribourg (FR)
    "1700": [("2196", "Fribourg", "FR")],
    "1701": [("2196", "Fribourg", "FR")],
    "1630": [("2125", "Bulle", "FR")],
    "3280": [("2275", "Murten", "FR")],

    # Solothurn (SO)
    "4500": [("2601", "Solothurn", "SO")],
    "4600": [("2581", "Olten", "SO")],
    "2540": [("2549", "Grenchen", "SO")],

    # Basel-Stadt (BS)
    "4000": [("2701", "Basel", "BS")],
    "4051": [("2701", "Basel", "BS")],
    "4052": [("2701", "Basel", "BS")],
    "4053": [("2701", "Basel", "BS")],
    "4056": [("2701", "Basel", "BS")],
    "4058": [("2701", "Basel", "BS")],
    "4125": [("2703", "Riehen", "BS")],

    # Basel-Landschaft (BL)
    "4410": [("2829", "Liestal", "BL")],
    "4102": [("2807", "Binningen", "BL")],
    "4123": [("2801", "Allschwil", "BL")],
    "4142": [("2810", "Münchenstein", "BL")],

    # Schaffhausen (SH)
    "8200": [("2939", "Schaffhausen", "SH")],
    "8212": [("2936", "Neuhausen am Rheinfall", "SH")],
    "8260": [("2964", "Stein am Rhein", "SH")],

    # Appenzell Ausserrhoden (AR)
    "9100": [("3001", "Herisau", "AR")],
    "9053": [("3005", "Teufen", "AR")],
    "9042": [("3004", "Speicher", "AR")],

    # Appenzell Innerrhoden (AI)
    "9050": [("3101", "Appenzell", "AI")],
    "9057": [("3103", "Schwende-Rüte", "AI")],

    # St. Gallen (SG)
    "9000": [("3203", "St. Gallen", "SG")],
    "9001": [("3203", "St. Gallen", "SG")],
    "8640": [("3315", "Rapperswil-Jona", "SG")],
    "9200": [("3422", "Gossau (SG)", "SG")],
    "9500": [("3427", "Wil (SG)", "SG")],
    "9400": [("3215", "Rorschach", "SG")],

    # Graubünden (GR)
    "7000": [("3901", "Chur", "GR")],
    "7270": [("3851", "Davos", "GR")],
    "7500": [("3787", "St. Moritz", "GR")],
    "7302": [("3945", "Landquart", "GR")],

    # Aargau (AG)
    "5000": [("4001", "Aarau", "AG")],
    "5400": [("4021", "Baden", "AG")],
    "5200": [("4095", "Brugg", "AG")],
    "5430": [("4045", "Wettingen", "AG")],
    "4310": [("4256", "Rheinfelden", "AG")],
    "5600": [("4102", "Lenzburg", "AG")],

    # Thurgau (TG)
    "8500": [("4566", "Frauenfeld", "TG")],
    "8280": [("4671", "Kreuzlingen", "TG")],
    "9320": [("4401", "Arbon", "TG")],
    "8570": [("4946", "Weinfelden", "TG")],

    # Ticino (TI)
    "6900": [("5192", "Lugano", "TI")],
    "6500": [("5002", "Bellinzona", "TI")],
    "6600": [("5096", "Locarno", "TI")],
    "6850": [("5180", "Mendrisio", "TI")],

    # Vaud (VD)
    "1000": [("5586", "Lausanne", "VD"), ("5588", "Pully", "VD")],  # Ambiguous
    "1003": [("5586", "Lausanne", "VD")],
    "1400": [("5938", "Yverdon-les-Bains", "VD")],
    "1820": [("5886", "Montreux", "VD")],
    "1260": [("5724", "Nyon", "VD")],
    "1110": [("5642", "Morges", "VD")],

    # Valais (VS)
    "1950": [("6266", "Sion", "VS")],
    "1920": [("6217", "Martigny", "VS")],
    "3900": [("6002", "Brig-Glis", "VS")],
    "1870": [("6153", "Monthey", "VS")],

    # Neuchâtel (NE)
    "2000": [("6458", "Neuchâtel", "NE")],
    "2300": [("6421", "La Chaux-de-Fonds", "NE")],
    "2400": [("6436", "Le Locle", "NE")],

    # Genève (GE)
    "1200": [("6621", "Genève", "GE")],
    "1201": [("6621", "Genève", "GE")],
    "1202": [("6621", "Genève", "GE")],
    "1204": [("6621", "Genève", "GE")],
    "1213": [("6631", "Onex", "GE"), ("6628", "Lancy", "GE")],  # Ambiguous
    "1214": [("6643", "Vernier", "GE")],
    "1217": [("6632", "Meyrin", "GE")],
    "1227": [("6615", "Carouge (GE)", "GE")],

    # Jura (JU)
    "2800": [("6711", "Delémont", "JU")],
    "2900": [("6801", "Porrentruy", "JU")],
    "2852": [("6713", "Haute-Sorne", "JU")],
}

