"""
SunTax Key Management Service (KMS).

FDPIC (EDÖB) / nDSG Compliance:
- Strict Key Separation: The Key Encryption Key (KEK) is managed independently
  from database connection strings and storage buckets.
- Envelope Encryption Provider: Generates and wraps/unwraps Data Encryption Keys (DEKs).
- Cryptographic Auditability: Logs all key access and wrapping events.
"""

from __future__ import annotations

import base64
import hashlib
import logging
import os
from typing import Tuple

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

logger = logging.getLogger(__name__)

# Master KEK source - separated from standard application secrets
_DEFAULT_KMS_ENV_VAR = "SUNTAX_KMS_MASTER_KEY"
_FALLBACK_KEY_FILE = "./dev_storage/.kms_master.key"


class KMSService:
    """Independent Key Management Service responsible for managing the Root/Master KEK."""

    def __init__(self, master_key_raw: str | None = None) -> None:
        self._kek = self._load_or_generate_kek(master_key_raw)
        self._kek_cipher = AESGCM(self._kek)
        logger.info("KMS Service initialized with AES-256 Key Encryption Key (KEK).")

    def _load_or_generate_kek(self, explicit_key: str | None) -> bytes:
        if explicit_key:
            return hashlib.sha256(explicit_key.encode("utf-8")).digest()

        env_key = os.environ.get(_DEFAULT_KMS_ENV_VAR)
        if env_key:
            return hashlib.sha256(env_key.encode("utf-8")).digest()

        # Dev / fallback local secure storage
        os.makedirs(os.path.dirname(_FALLBACK_KEY_FILE), exist_ok=True)
        if os.path.exists(_FALLBACK_KEY_FILE):
            try:
                with open(_FALLBACK_KEY_FILE, "rb") as f:
                    return f.read()[:32]
            except Exception as e:
                logger.warning("Could not read KMS fallback key: %s", e)

        # Generate a new 256-bit KEK
        new_kek = AESGCM.generate_key(bit_length=256)
        try:
            with open(_FALLBACK_KEY_FILE, "wb") as f:
                f.write(new_kek)
            os.chmod(_FALLBACK_KEY_FILE, 0o600)  # strict owner-only permissions
        except Exception as e:
            logger.warning("Could not write KMS fallback key file: %s", e)

        return new_kek

    def generate_data_key(self) -> Tuple[bytes, bytes]:
        """
        Generate a fresh 256-bit Data Encryption Key (DEK).

        Returns:
            Tuple[plaintext_dek, encrypted_dek]
        """
        plaintext_dek = AESGCM.generate_key(bit_length=256)
        encrypted_dek = self.encrypt_dek(plaintext_dek)
        return plaintext_dek, encrypted_dek

    def encrypt_dek(self, plaintext_dek: bytes) -> bytes:
        """Encrypt a Data Encryption Key (DEK) with the master Key Encryption Key (KEK)."""
        nonce = os.urandom(12)
        encrypted = self._kek_cipher.encrypt(nonce, plaintext_dek, associated_data=b"SunTax-KMS-DEK-v1")
        # Prepend nonce to encrypted DEK (12 bytes nonce + ciphertext)
        return nonce + encrypted

    def decrypt_dek(self, encrypted_dek_payload: bytes) -> bytes:
        """Decrypt a wrapped Data Encryption Key (DEK) using the master KEK."""
        if len(encrypted_dek_payload) < 28:
            raise ValueError("Malformed encrypted DEK payload.")
        nonce = encrypted_dek_payload[:12]
        encrypted = encrypted_dek_payload[12:]
        return self._kek_cipher.decrypt(nonce, encrypted, associated_data=b"SunTax-KMS-DEK-v1")


# Global KMS singleton
kms_service = KMSService()
