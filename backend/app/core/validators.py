"""
SunTax Core Input Validators.
Authoritative validation routines according to Swiss Federal Tax Administration (ESTV)
and eCH standards (eCH-0119, eCH-0044, eCH-0010, eCH-0011).
"""
from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional


def validate_swiss_ahv(ahv: Any) -> bool:
    """
    Validate Swiss NAVS13 / AHV-13 number according to official EAN-13 algorithm.
    Format must begin with 756 and have 13 digits with valid checksum.
    Example: 756.9217.0769.85 -> True
    """
    digits = re.sub(r"\D", "", str(ahv or ""))
    if len(digits) != 13 or not digits.startswith("756"):
        return False
    total = sum(int(d) * (1 if i % 2 == 0 else 3) for i, d in enumerate(digits[:12]))
    expected_check = (10 - (total % 10)) % 10
    return int(digits[12]) == expected_check


def validate_swiss_iban(iban: Any) -> bool:
    """
    Validate Swiss (CH) or Liechtenstein (LI) IBAN using ISO 7064 Mod 97-10 algorithm.
    Swiss and Liechtenstein IBANs are strictly 21 alphanumeric characters.
    Example: CH93 0076 2011 6238 5295 7 -> True
    """
    clean = re.sub(r"\s+", "", str(iban or "")).upper()
    if len(clean) != 21:
        return False
    if not (clean.startswith("CH") or clean.startswith("LI")):
        return False

    # Rearrange: move first 4 characters to the end
    rearranged = clean[4:] + clean[:4]

    # Convert letters to numbers (A=10, B=11, ..., Z=35)
    numeric_str = ""
    for char in rearranged:
        if char.isdigit():
            numeric_str += char
        elif "A" <= char <= "Z":
            numeric_str += str(ord(char) - ord("A") + 10)
        else:
            return False

    # Compute mod 97
    try:
        return int(numeric_str) % 97 == 1
    except ValueError:
        return False


def validate_birth_date(birth_date_str: Any) -> bool:
    """
    Validate birth date string in ISO (YYYY-MM-DD) or Swiss (DD.MM.YYYY) format.
    Ensures valid calendar date, strictly in the past, and age between 18 and 120.
    """
    if not birth_date_str:
        return False
    s = str(birth_date_str).strip()

    parsed_date: Optional[date] = None
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y"):
        try:
            parsed_date = datetime.strptime(s, fmt).date()
            break
        except ValueError:
            continue

    if not parsed_date:
        return False

    today = date.today()
    if parsed_date >= today:
        return False

    # Calculate age
    age = today.year - parsed_date.year - ((today.month, today.day) < (parsed_date.month, parsed_date.day))
    return 18 <= age <= 120


def validate_swiss_plz(plz: Any) -> bool:
    """
    Validate 4-digit Swiss postal code (PLZ). Valid range: 1000 - 9999.
    """
    s = str(plz or "").strip()
    if not re.fullmatch(r"^[1-9]\d{3}$", s):
        return False
    return 1000 <= int(s) <= 9999


def validate_amount(amt: Any, allow_negative: bool = False) -> bool:
    """
    Validate monetary amount. Must be numeric and optionally non-negative.
    """
    try:
        d = Decimal(str(amt).replace("'", "").replace("’", "").strip())
        if not allow_negative and d < Decimal("0"):
            return False
        return True
    except Exception:
        return False
