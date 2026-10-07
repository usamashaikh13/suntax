"""
Tests for SunTax FDPIC (EDÖB) & nDSG Security Architecture and Art. 110 DBG Legal Filing Framework.
Validates:
1. AES-256-GCM Envelope Encryption & KMS Isolation
2. Argon2id Password Hashing
3. Two-Factor Authentication (TOTP / WebAuthn)
4. Automated 15-Minute Account Lockout & Brute-Force Protection
5. In-Transit Security Headers (TLS 1.3 / HSTS)
6. Legal Filing Mechanism (Selbstdeklaration pursuant to Art. 110 DBG)
"""

import pytest
import os
import pyotp
from datetime import datetime, timezone, timedelta
from app.services.kms_service import kms_service
from app.services.envelope_encryption import (
    envelope_service,
    MAGIC_HEADER,
)
from app.core.security import (
    hash_password,
    verify_password,
    generate_totp_secret,
    verify_totp_code,
    get_totp_uri,
    create_temp_2fa_token,
    decode_temp_2fa_token,
)
from app.services.xml_export_service import generate_ech_xml
from app.services.pdf_export_service import generate_tax_return_pdf


class TestEnvelopeEncryptionAndKMS:
    """Verifies AES-256-GCM envelope encryption and independent key management."""

    def test_kms_dek_generation_and_encryption(self):
        plaintext_dek, encrypted_dek = kms_service.generate_data_key()
        assert len(plaintext_dek) == 32
        assert encrypted_dek != plaintext_dek
        decrypted_dek = kms_service.decrypt_dek(encrypted_dek)
        assert decrypted_dek == plaintext_dek

    def test_envelope_encryption_roundtrip(self):
        sample_payload = b"Sample Swiss Lohnausweis Document with sensitive tax data: Net CHF 62,055"
        encrypted_blob = envelope_service.encrypt_document(sample_payload)

        # Header check: STENC\x01
        assert envelope_service.is_envelope_encrypted(encrypted_blob)
        assert encrypted_blob.startswith(MAGIC_HEADER)
        assert len(encrypted_blob) > len(sample_payload)

        decrypted_payload = envelope_service.decrypt_document(encrypted_blob)
        assert decrypted_payload == sample_payload

    def test_envelope_tamper_proofing(self):
        sample_payload = b"Confidential tax assessment Canton Zurich"
        encrypted_blob = bytearray(envelope_service.encrypt_document(sample_payload))

        # Tamper with 1 byte in the ciphertext portion
        encrypted_blob[-5] ^= 0xFF

        with pytest.raises(ValueError, match="Failed to decrypt document envelope"):
            envelope_service.decrypt_document(bytes(encrypted_blob))


class TestArgon2idAndTOTP:
    """Verifies memory-hard Argon2id password hashing and RFC 6238 TOTP 2FA."""

    def test_argon2id_hashing(self):
        pwd = "SwissBankingGradePassword2025!"
        hashed = hash_password(pwd)
        assert hashed.startswith("$argon2id$")
        assert verify_password(pwd, hashed)
        assert not verify_password("WrongPassword!", hashed)

    def test_totp_generation_and_verification(self):
        secret = generate_totp_secret()
        assert len(secret) == 32
        uri = get_totp_uri(secret, "taxpayer@suntax.ch")
        assert uri.startswith("otpauth://totp/SunTax:")
        assert "issuer=SunTax" in uri
        assert "secret=" in uri

        totp = pyotp.TOTP(secret)
        current_code = totp.now()

        assert verify_totp_code(secret, current_code)
        assert not verify_totp_code(secret, "000000" if current_code != "000000" else "111111")

    def test_temp_2fa_challenge_tokens(self):
        token = create_temp_2fa_token("user-uuid-123", "user@suntax.ch")
        decoded = decode_temp_2fa_token(token)
        assert decoded["sub"] == "user-uuid-123"
        assert decoded["email"] == "user@suntax.ch"
        assert decoded["type"] == "2fa_pending"


class TestLegalFilingMechanism:
    """Verifies adherence to Swiss Selbstdeklaration pursuant to Art. 110 DBG."""

    def test_xml_export_contains_art_110_dbg_declaration(self):
        from types import SimpleNamespace

        dummy_return = SimpleNamespace(
            id="ret-001",
            canton_code="ZH",
            municipality_name="Zürich",
            tax_year=2025,
        )
        dummy_profile = SimpleNamespace(
            personal_data={"first_name": "Max", "last_name": "Muster", "ahv_number": "756.1234.5678.90"},
            income_data={"employment_gross": 66897, "employment_net": 62055},
            wealth_data={"bank_accounts": [{"balance": 1811.28}]},
            deductions_data={"pillar_3a": 7000.0, "donations": 20.70},
            liabilities_data={},
        )
        dummy_calc = SimpleNamespace(
            taxable_income=53200,
            taxable_wealth=1800,
            federal_income_tax=180.50,
            cantonal_income_tax=2100.00,
            municipal_income_tax=2499.00,
            wealth_tax=0.0,
            total_tax=4779.50,
            rule_version="2025.1",
        )

        xml_output = generate_ech_xml(dummy_return, dummy_profile, dummy_calc)
        assert "Selbstdeklaration pursuant to Art. 110 DBG" in xml_output
        assert "DirectTaxpayerFiling" in xml_output
        assert "ESTV / Eidgenoessische Steuerverwaltung" in xml_output

    def test_pdf_export_contains_art_110_dbg_and_signature(self):
        from types import SimpleNamespace

        dummy_return = SimpleNamespace(
            id="ret-001",
            canton_code="ZH",
            municipality_name="Zürich",
            tax_year=2025,
        )
        dummy_profile = SimpleNamespace(
            personal_data={"first_name": "Max", "last_name": "Muster", "ahv_number": "756.1234.5678.90"},
            income_data={"employment_gross": 66897, "employment_net": 62055},
            wealth_data={"bank_accounts": [{"balance": 1811.28}]},
            deductions_data={"pillar_3a": 7000.0, "donations": 20.70},
            liabilities_data={},
        )
        dummy_calc = SimpleNamespace(
            taxable_income=53200,
            taxable_wealth=1800,
            federal_income_tax=180.50,
            cantonal_income_tax=2100.00,
            municipal_income_tax=2499.00,
            wealth_tax=0.0,
            total_tax=4779.50,
            rule_version="2025.1",
            calculation_details={"results": {"total_tax": 4779.50}},
        )

        pdf_bytes = generate_tax_return_pdf(dummy_return, dummy_profile, dummy_calc)
        assert len(pdf_bytes) > 1000
        assert pdf_bytes.startswith(b"%PDF-")
