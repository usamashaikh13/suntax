"""
Canton and municipality data service for SunTax.

Provides hardcoded data for the 7 initially supported Swiss cantons
with BFS (Bundesamt für Statistik) municipality numbers.

Supported cantons: ZH, BE, VD, GE, BS, AG, LU
"""

from __future__ import annotations

from typing import Dict, List, Optional

from app.schemas.tax_return import CantonResponse, MunicipalityResponse


# ── Canton master data ────────────────────────────────────────────────────────

_CANTONS: Dict[str, str] = {
    "ZH": "Zürich",
    "BE": "Bern",
    "VD": "Vaud",
    "GE": "Genève",
    "BS": "Basel-Stadt",
    "AG": "Aargau",
    "LU": "Luzern",
}

# ── Municipality data: canton_code → list of (bfs_number, name) ───────────────

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
        ("171", "Küsnacht (ZH)"),
        ("173", "Küsnacht (ZH)"),
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
        ("869", "Burgdorf"),
        ("355", "Muri bei Bern"),
        ("362", "Zollikofen"),
        ("731", "Ittigen"),
        ("402", "Münsingen"),
        ("632", "Spiez"),
        ("941", "Nidau"),
        ("606", "Steffisburg"),
        ("761", "Bolligen"),
        ("953", "Port"),
        ("534", "Lyss"),
        ("303", "Grenchen"),
        ("982", "Solothurn"),
        ("572", "Langenthal"),
    ],
    "VD": [
        ("5586", "Lausanne"),
        ("5890", "Yverdon-les-Bains"),
        ("5402", "Montreux"),
        ("5642", "Renens"),
        ("5415", "Aigle"),
        ("5751", "Nyon"),
        ("5591", "Prilly"),
        ("5621", "Chavannes-près-Renens"),
        ("5435", "Bex"),
        ("5716", "Morges"),
        ("5596", "Lutry"),
        ("5401", "Villeneuve (VD)"),
        ("5561", "Orbe"),
        ("5583", "Crissier"),
        ("5729", "Rolle"),
        ("5604", "Pully"),
        ("5634", "Écublens (VD)"),
        ("5407", "Leysin"),
        ("5497", "Payerne"),
        ("5632", "Bussigny"),
    ],
    "GE": [
        ("6621", "Genève"),
        ("6636", "Vernier"),
        ("6625", "Lancy"),
        ("6632", "Meyrin"),
        ("6633", "Onex"),
        ("6637", "Versoix"),
        ("6622", "Carouge"),
        ("6626", "Le Grand-Saconnex"),
        ("6623", "Chêne-Bougeries"),
        ("6627", "Plan-les-Ouates"),
        ("6624", "Confignon"),
        ("6630", "Bernex"),
        ("6635", "Thônex"),
        ("6628", "Satigny"),
        ("6629", "Collonge-Bellerive"),
        ("6631", "Chêne-Bourg"),
        ("6634", "Pregny-Chambésy"),
        ("6638", "Aire-la-Ville"),
        ("6639", "Avully"),
        ("6640", "Avusy"),
    ],
    "BS": [
        ("2701", "Basel"),
        ("2702", "Bettingen"),
        ("2703", "Riehen"),
    ],
    "AG": [
        ("4001", "Aarau"),
        ("4151", "Baden"),
        ("4021", "Brugg"),
        ("4096", "Wettingen"),
        ("4061", "Rheinfelden"),
        ("4131", "Lenzburg"),
        ("4111", "Zofingen"),
        ("4031", "Bremgarten"),
        ("4056", "Kaiseraugst"),
        ("4071", "Frick"),
        ("4136", "Buchs"),
        ("4012", "Buchs (AG)"),
        ("4080", "Stein"),
        ("4051", "Möhlin"),
        ("4162", "Ennetbaden"),
        ("4141", "Suhr"),
        ("4014", "Küttigen"),
        ("4102", "Frenkendorf"),
        ("4161", "Spreitenbach"),
        ("4016", "Rohr"),
    ],
    "LU": [
        ("1061", "Luzern"),
        ("1151", "Emmen"),
        ("1056", "Kriens"),
        ("1108", "Horw"),
        ("1107", "Ebikon"),
        ("1059", "Meggen"),
        ("1063", "Sursee"),
        ("1062", "Schüpfheim"),
        ("1071", "Willisau"),
        ("1111", "Küssnacht"),
        ("1085", "Hochdorf"),
        ("1072", "Wolhusen"),
        ("1082", "Reiden"),
        ("1101", "Adligenswil"),
        ("1055", "Knutwil"),
        ("1076", "Sempach"),
        ("1091", "Beromünster"),
        ("1058", "Malters"),
        ("1053", "Hitzkirch"),
        ("1118", "Weggis"),
    ],
}


class CantonService:
    """
    Service for canton and municipality lookups.

    Data is hardcoded for the 7 initially supported cantons.
    """

    def get_all_cantons(self) -> List[CantonResponse]:
        """Return all supported cantons as CantonResponse objects."""
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
        """
        Return all known municipalities for a given canton code.

        Returns an empty list if the canton code is not supported.
        """
        code = canton_code.upper()
        entries = _MUNICIPALITIES.get(code, [])
        return [
            MunicipalityResponse(code=bfs, name=name, canton_code=code)
            for bfs, name in entries
        ]

    def find_municipality(
        self, canton_code: str, bfs_code: str
    ) -> Optional[MunicipalityResponse]:
        """Look up a specific municipality by BFS number."""
        code = canton_code.upper()
        for bfs, name in _MUNICIPALITIES.get(code, []):
            if bfs == bfs_code:
                return MunicipalityResponse(code=bfs, name=name, canton_code=code)
        return None
