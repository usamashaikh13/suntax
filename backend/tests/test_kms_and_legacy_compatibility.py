"""
Tests for SunTax KMS Key Management and Legacy Document Compatibility.

Verifies:
1. KMSService initializes without PermissionError when SUNTAX_KMS_MASTER_KEY is not set.
2. Production mode derives a stable, deterministic KEK from SECRET_KEY when master key is absent.
3. Legacy unencrypted documents (from commit 83862f0) pass through decrypt_document() intact.
4. Encrypted documents (with STENC\x01 header) round-trip encrypt and decrypt successfully.
"""

import os
from unittest.mock import patch

import pytest
from app.services.envelope_encryption import MAGIC_HEADER, EnvelopeEncryptionService
from app.services.kms_service import KMSService


def test_kms_initialization_with_explicit_key():
    kms = KMSService(master_key_raw="my-super-secret-kms-master-key-32ch")
    plain, enc = kms.generate_data_key()
    assert len(plain) == 32
    decrypted = kms.decrypt_dek(enc)
    assert decrypted == plain


def test_kms_fallback_to_secret_key_in_production():
    with patch.dict(os.environ, {}, clear=True):
        # Remove SUNTAX_KMS_MASTER_KEY
        os.environ.pop("SUNTAX_KMS_MASTER_KEY", None)
        with patch("app.core.config.settings.ENVIRONMENT", "production"):
            with patch("app.core.config.settings.SECRET_KEY", "prod-secret-key-12345"):
                kms = KMSService()
                plain, enc = kms.generate_data_key()
                assert kms.decrypt_dek(enc) == plain


def test_legacy_documents_compatibility_pass_through():
    """
    Documents uploaded in earlier commits (e.g. 83862f0) are raw bytes without STENC header.
    Verify that decrypt_document passes them through unchanged.
    """
    envelope = EnvelopeEncryptionService()

    # Raw PDF bytes (typical Lohnausweis uploaded before KMS was introduced)
    raw_pdf_bytes = b"%PDF-1.4\n%Some test Lohnausweis content from commit 83862f0..."
    decrypted = envelope.decrypt_document(raw_pdf_bytes)
    assert decrypted == raw_pdf_bytes

    # Raw image bytes
    raw_png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR..."
    assert envelope.decrypt_document(raw_png_bytes) == raw_png_bytes

    # Empty payload
    assert envelope.decrypt_document(b"") == b""


def test_new_document_encryption_roundtrip():
    """
    Verify that newly uploaded documents are encrypted with STENC header and decrypted cleanly.
    """
    envelope = EnvelopeEncryptionService()
    test_data = b"Sensitive Swiss Tax Document Data: salary CHF 120'000"

    encrypted = envelope.encrypt_document(test_data)
    assert encrypted.startswith(MAGIC_HEADER)
    assert encrypted != test_data

    decrypted = envelope.decrypt_document(encrypted)
    assert decrypted == test_data
