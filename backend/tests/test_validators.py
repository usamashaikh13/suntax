"""
Tests for SunTax Core Validators (AHV, IBAN, Birth Date, PLZ, Amounts).
Corresponds to Developer Guide Section 6 and SunTax_Test_Cases_v2.md (RV-05 to RV-08, PL-06).
"""
import pytest
from app.core.validators import (
    validate_swiss_ahv,
    validate_swiss_iban,
    validate_birth_date,
    validate_swiss_plz,
    validate_amount,
)


def test_ahv_valid_checksums():
    # Valid EAN-13 Swiss AHV numbers
    assert validate_swiss_ahv("756.9217.0769.85") is True
    assert validate_swiss_ahv("756.1234.5678.97") is True
    assert validate_swiss_ahv("7561234567897") is True


def test_ahv_invalid_checksums():
    # Bad checksum
    assert validate_swiss_ahv("756.9217.0769.86") is False
    assert validate_swiss_ahv("756.1234.5678.90") is False
    # Wrong prefix
    assert validate_swiss_ahv("758.1234.5678.97") is False
    # Wrong length
    assert validate_swiss_ahv("756.1234.5678") is False
    assert validate_swiss_ahv("756.1234.5678.999") is False
    # Non-digits / empty
    assert validate_swiss_ahv("") is False
    assert validate_swiss_ahv("756.ABCD.EFGH.IJ") is False


def test_iban_valid_swiss_and_liechtenstein():
    # Valid Swiss IBAN (ZKB)
    assert validate_swiss_iban("CH93 0076 2011 6238 5295 7") is True
    assert validate_swiss_iban("CH9300762011623852957") is True
    # Valid Liechtenstein IBAN
    assert validate_swiss_iban("LI94 0880 0000 0234 5678 9") is True


def test_iban_invalid():
    # Bad checksum (last digit 8 instead of 7) - Test Case RV-08
    assert validate_swiss_iban("CH93 0076 2011 6238 5295 8") is False
    # Non-CH / non-LI IBAN
    assert validate_swiss_iban("DE89 3704 0044 0532 0130 00") is False
    assert validate_swiss_iban("FR14 2004 1010 0505 0001 3M02 606") is False
    # Malformed length
    assert validate_swiss_iban("CH93 0076") is False
    assert validate_swiss_iban("") is False


def test_birth_date_valid():
    assert validate_birth_date("1994-05-17") is True
    assert validate_birth_date("17.05.1994") is True
    assert validate_birth_date("1980-12-31") is True


def test_birth_date_invalid():
    # Invalid calendar day - Test Case RV-07
    assert validate_birth_date("31.02.1990") is False
    # Future date
    assert validate_birth_date("2035-01-01") is False
    # Age under 18
    assert validate_birth_date("2020-01-01") is False
    # Age over 120
    assert validate_birth_date("1890-01-01") is False
    # Malformed format
    assert validate_birth_date("abc") is False
    assert validate_birth_date("") is False


def test_plz_validation():
    # Valid 4-digit Swiss postcodes (1000 - 9999) - Test Case PL-01 / PL-02
    assert validate_swiss_plz("8001") is True
    assert validate_swiss_plz("8004") is True
    assert validate_swiss_plz("8400") is True
    assert validate_swiss_plz(8001) is True

    # Invalid postcodes - Test Case PL-04 / PL-05 / PL-06
    assert validate_swiss_plz("") is False
    assert validate_swiss_plz("0000") is False
    assert validate_swiss_plz("0840") is False
    assert validate_swiss_plz("84") is False
    assert validate_swiss_plz("84000") is False
    assert validate_swiss_plz("abcd") is False
    assert validate_swiss_plz("8 400") is False
    assert validate_swiss_plz("84-00") is False


def test_amount_validation():
    assert validate_amount(1000) is True
    assert validate_amount("105000") is True
    assert validate_amount("1'050.50") is True
    assert validate_amount("1’050.00") is True
    assert validate_amount(0) is True

    # Negative not allowed by default - Test Case Q-10
    assert validate_amount("-500") is False
    assert validate_amount("abc") is False
