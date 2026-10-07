"""
SunTax Multi-Layer Envelope Encryption Service.

Complies with Swiss revised Data Protection Act (nDSG) & FDPIC (EDÖB) guidelines:
- At-Rest & File-Level Encryption: Every uploaded tax slip is encrypted with a unique
  per-file Data Encryption Key (DEK) using AES-256-GCM.
- Envelope Architecture: The DEK is encrypted using the separate KMS Key Encryption Key (KEK).
- Tamper-Proof: Authenticated encryption with associated data (AEAD) ensures ciphertext integrity.
"""

from __future__ import annotations

import io
import logging
import os
import struct
from typing import Tuple

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from app.services.kms_service import kms_service

logger = logging.getLogger(__name__)

# Protocol header: "STENC" (SunTax Encrypted) + version 1
MAGIC_HEADER = b"STENC\x01"
ASSOCIATED_DATA = b"SunTax-TaxDocument-v1"


class EnvelopeEncryptionService:
    """Provides AES-256-GCM file-level envelope encryption for all sensitive tax documents."""

    def __init__(self) -> None:
        pass

    def encrypt_document(self, plaintext: bytes) -> bytes:
        """
        Encrypt document bytes using AES-256-GCM envelope encryption.

        Structure:
          [7 bytes: MAGIC_HEADER (STENC\\x01)]
          [2 bytes: big-endian encrypted DEK length (N)]
          [N bytes: encrypted DEK]
          [12 bytes: GCM Nonce]
          [M bytes: AES-256-GCM Ciphertext + 16-byte Tag]
        """
        if not plaintext:
            return b""

        # 1. Generate unique 256-bit DEK & wrapped DEK from KMS
        plaintext_dek, encrypted_dek = kms_service.generate_data_key()

        # 2. Encrypt document body with DEK using AES-256-GCM
        nonce = os.urandom(12)
        dek_cipher = AESGCM(plaintext_dek)
        ciphertext = dek_cipher.encrypt(nonce, plaintext, associated_data=ASSOCIATED_DATA)

        # 3. Assemble binary envelope
        out = io.BytesIO()
        out.write(MAGIC_HEADER)
        out.write(struct.pack(">H", len(encrypted_dek)))
        out.write(encrypted_dek)
        out.write(nonce)
        out.write(ciphertext)

        encrypted_payload = out.getvalue()
        logger.debug(
            "Encrypted document (%d bytes plaintext -> %d bytes envelope)",
            len(plaintext),
            len(encrypted_payload),
        )
        return encrypted_payload

    def decrypt_document(self, payload: bytes) -> bytes:
        """
        Decrypt an envelope-encrypted document payload using KMS-unwrapped DEK.
        If the payload does not have the envelope header (e.g. legacy plain file), returns it as-is.
        """
        if not payload or not payload.startswith(MAGIC_HEADER):
            # Pass-through for unencrypted legacy or raw dev files
            return payload

        try:
            reader = io.BytesIO(payload)
            # Skip magic header (7 bytes)
            reader.seek(len(MAGIC_HEADER))

            # Read encrypted DEK length
            dek_len_bytes = reader.read(2)
            if len(dek_len_bytes) < 2:
                raise ValueError("Truncated envelope header.")
            (dek_len,) = struct.unpack(">H", dek_len_bytes)

            # Read encrypted DEK
            encrypted_dek = reader.read(dek_len)
            if len(encrypted_dek) < dek_len:
                raise ValueError("Truncated encrypted DEK.")

            # Unwrap DEK via KMS
            plaintext_dek = kms_service.decrypt_dek(encrypted_dek)

            # Read 12-byte GCM Nonce
            nonce = reader.read(12)
            if len(nonce) < 12:
                raise ValueError("Truncated GCM nonce.")

            # Read remaining ciphertext + tag
            ciphertext = reader.read()

            # Decrypt with DEK
            dek_cipher = AESGCM(plaintext_dek)
            plaintext = dek_cipher.decrypt(nonce, ciphertext, associated_data=ASSOCIATED_DATA)

            return plaintext
        except Exception as e:
            logger.error("Envelope decryption failed: %s", e)
            raise ValueError(f"Failed to decrypt document envelope: {e}") from e

    def is_envelope_encrypted(self, payload: bytes) -> bool:
        """Check if payload has the SunTax envelope encryption header."""
        return bool(payload and payload.startswith(MAGIC_HEADER))


# Global envelope encryption singleton
envelope_service = EnvelopeEncryptionService()
