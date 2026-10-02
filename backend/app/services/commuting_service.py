"""
Swiss Commuting Expenses Calculation Service.

Implements automatic Swiss commuting deduction calculation based on:
- Home and workplace locations / postal codes
- Commuting method: Public Transport, Car, Bicycle / E-Bike
- Working days per year minus home-office days
- Federal and cantonal statutory maximum deduction caps (DBG Art. 26, StG)
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from decimal import Decimal
from typing import Optional


# Statutory cantonal commuting deduction caps (in CHF)
CANTONAL_COMMUTING_CAPS: dict[str, float] = {
    "ZH": 5000.0,
    "BE": 6700.0,
    "LU": 6000.0,
    "UR": 6000.0,
    "SZ": 6000.0,
    "OW": 6000.0,
    "NW": 6000.0,
    "GL": 6000.0,
    "ZG": 6000.0,
    "FR": 6000.0,
    "SO": 7000.0,
    "BS": 3000.0,  # Basel-Stadt applies federal cap
    "BL": 6000.0,
    "SH": 6000.0,
    "AR": 6000.0,
    "AI": 6000.0,
    "SG": 4500.0,
    "GR": 6000.0,
    "AG": 7000.0,
    "TG": 6000.0,
    "TI": 6000.0,
    "VD": 3000.0,
    "VS": 6000.0,
    "NE": 6000.0,
    "GE": 500.0,   # Geneva flat deduction
    "JU": 6000.0,
}

FEDERAL_COMMUTING_CAP = 3000.0  # Max CHF 3,000 for direct federal tax (DBG)


@dataclass
class CommutingCalculationResult:
    home_address: str
    work_address: str
    transport_method: str
    distance_km_one_way: float
    effective_working_days: int
    raw_annual_expense_chf: float
    cantonal_deduction_chf: float
    federal_deduction_chf: float
    canton_cap_chf: float
    federal_cap_chf: float
    notes: str


class CommutingService:
    """Service for estimating Swiss commuting distances and tax deductions."""

    # Approximate coordinates for Swiss major regions / cantons to calculate geodesic distances
    SWISS_REGION_COORDS: dict[str, tuple[float, float]] = {
        "ZH": (47.3769, 8.5417),
        "BE": (46.9480, 7.4474),
        "LU": (47.0502, 8.3093),
        "UR": (46.8804, 8.6444),
        "SZ": (47.0207, 8.6531),
        "OW": (46.8961, 8.2458),
        "NW": (46.9581, 8.3661),
        "GL": (47.0406, 9.0680),
        "ZG": (47.1662, 8.5155),
        "FR": (46.8065, 7.1620),
        "SO": (47.2088, 7.5375),
        "BS": (47.5596, 7.5886),
        "BL": (47.4842, 7.7340),
        "SH": (47.6959, 8.6380),
        "AR": (47.3861, 9.2792),
        "AI": (47.3315, 9.4093),
        "SG": (47.4245, 9.3767),
        "GR": (46.8508, 9.5320),
        "AG": (47.3925, 8.0442),
        "TG": (47.5574, 8.8989),
        "TI": (46.1950, 9.0253),
        "VD": (46.5197, 6.6323),
        "VS": (46.2331, 7.3606),
        "NE": (46.9929, 6.9319),
        "GE": (46.2044, 6.1432),
        "JU": (47.3653, 7.3444),
    }

    def estimate_distance_km(
        self,
        home_address: str,
        work_address: str,
        home_canton: str = "ZH",
        work_canton: Optional[str] = None,
    ) -> float:
        """
        Estimate one-way commuting distance in kilometers between two Swiss points.
        If street addresses are provided within the same municipality, returns reasonable local commute.
        If different cantons, calculates geodesic distance with road curvature factor (1.3).
        """
        home_c = home_canton.upper()
        work_c = (work_canton or home_canton).upper()

        if home_c == work_c:
            # Same canton commute: average local Swiss commute is ~12-18 km
            return 14.5

        # Cross-canton commute: compute coordinate distance
        coord1 = self.SWISS_REGION_COORDS.get(home_c, (47.3769, 8.5417))
        coord2 = self.SWISS_REGION_COORDS.get(work_c, (46.9480, 7.4474))

        lat1, lon1 = math.radians(coord1[0]), math.radians(coord1[1])
        lat2, lon2 = math.radians(coord2[0]), math.radians(coord2[1])

        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        km = 6371.0 * c * 1.3  # road winding factor

        return round(max(km, 5.0), 1)

    def calculate_deduction(
        self,
        canton_code: str,
        transport_method: str = "public_transport",  # public_transport, car, bicycle
        distance_km_one_way: float = 15.0,
        working_days: int = 220,
        home_office_days: int = 40,
        public_transport_subscription_chf: Optional[float] = None,
        home_address: str = "Home",
        work_address: str = "Work",
    ) -> CommutingCalculationResult:
        """
        Calculate both Federal and Cantonal allowed commuting deductions according to Swiss tax law.
        """
        code = canton_code.upper()
        canton_cap = CANTONAL_COMMUTING_CAPS.get(code, 6000.0)
        federal_cap = FEDERAL_COMMUTING_CAP

        effective_days = max(working_days - home_office_days, 0)
        round_trip_km = distance_km_one_way * 2

        method = transport_method.lower()
        if "car" in method:
            # Swiss standard rate for justifiable car commute: CHF 0.70/km
            raw_annual = round_trip_km * effective_days * 0.70
            notes = f"Car commute calculated at CHF 0.70/km for {effective_days} days ({round_trip_km} km/day)."
        elif "bike" in method or "velo" in method:
            # Swiss standard flat-rate for bicycle / e-bike
            raw_annual = 700.0
            notes = "Standard Swiss bicycle flat-rate deduction of CHF 700/year."
        else:
            # Public transport: use actual GA / annual pass if provided, otherwise compute standard tariff
            if public_transport_subscription_chf and public_transport_subscription_chf > 0:
                raw_annual = public_transport_subscription_chf
                notes = f"Actual public transport subscription: CHF {public_transport_subscription_chf:,.2f}."
            else:
                # Estimate public transit pass (SBB GA 2nd class is ~CHF 3,995; local regional pass ~CHF 1,800-2,500)
                if distance_km_one_way > 35:
                    raw_annual = 3995.0  # SBB Generalabonnement (GA)
                    notes = "Estimated Generalabonnement (GA) 2nd class for long-distance commute."
                else:
                    raw_annual = min(round_trip_km * effective_days * 0.35, 2600.0)
                    notes = f"Estimated regional public transport annual pass for {distance_km_one_way} km commute."

        canton_allowed = min(raw_annual, canton_cap)
        federal_allowed = min(raw_annual, federal_cap)

        return CommutingCalculationResult(
            home_address=home_address,
            work_address=work_address,
            transport_method=transport_method,
            distance_km_one_way=distance_km_one_way,
            effective_working_days=effective_days,
            raw_annual_expense_chf=round(raw_annual, 2),
            cantonal_deduction_chf=round(canton_allowed, 2),
            federal_deduction_chf=round(federal_allowed, 2),
            canton_cap_chf=canton_cap,
            federal_cap_chf=federal_cap,
            notes=notes,
        )
