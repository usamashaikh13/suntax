"""
Comprehensive Verification Tests for SunTax Secure Backup, Cross-User Isolation,
Document Storage Resilience, and Production Hardening.
"""
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.main import app
from app.core.config import settings
from app.core.database import get_db, Base
from app.core.security import hash_password, create_access_token, verify_totp_code_async
from app.models.user import User
from app.models.tax_return import TaxReturn
from app.models.tax_profile import TaxProfile
from app.models.tax_calculation import TaxCalculation
from app.models.document import Document
from app.models.document_blob import DocumentBlob
from app.services.envelope_encryption import envelope_service
from app.services.secure_backup_service import secure_backup_service, _derive_backup_key


@pytest.fixture(scope="module")
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def isolated_db_session():
    """Create an in-memory SQLite database for test isolation."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session
    await engine.dispose()


@pytest.mark.asyncio
async def test_production_2fa_bypass_is_strictly_rejected(isolated_db_session):
    """In production mode, test bypass codes (123456, 000000) must be rejected even if forced."""
    with patch("app.core.config.settings.ENVIRONMENT", "production"):
        with patch("app.core.config.settings.ALLOW_TEST_2FA_BYPASS", False):
            # Attempt to verify fixed codes
            res1 = await verify_totp_code_async("JBSWY3DPEHPK3PXP", "123456", db=isolated_db_session)
            res2 = await verify_totp_code_async("JBSWY3DPEHPK3PXP", "000000", db=isolated_db_session)
            assert res1 is False
            assert res2 is False


@pytest.mark.asyncio
async def test_cross_account_isolation(tmp_path):
    """Verify User B cannot access, stream, download, or delete User A's documents or returns."""
    test_db_file = tmp_path / "test_isolation.db"
    test_db_url = f"sqlite+aiosqlite:///{test_db_file}"
    engine = create_async_engine(test_db_url, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    user_a_id = "user-a-1111-uuid"
    user_b_id = "user-b-2222-uuid"

    async with session_factory() as db:
        user_a = User(
            id=user_a_id,
            email="usera@example.ch",
            hashed_password=hash_password("Password123!"),
            full_name="User Alpha",
            is_active=True,
            is_verified=True,
        )
        user_b = User(
            id=user_b_id,
            email="userb@example.ch",
            hashed_password=hash_password("Password123!"),
            full_name="User Beta",
            is_active=True,
            is_verified=True,
        )
        db.add_all([user_a, user_b])

        tr_a = TaxReturn(
            id="return-a-uuid",
            user_id=user_a_id,
            canton_code="ZH",
            tax_year=2024,
            status="draft",
        )
        db.add(tr_a)

        doc_a = Document(
            id="doc-a-uuid",
            user_id=user_a_id,
            tax_return_id="return-a-uuid",
            original_filename="salary_usera.pdf",
            storage_key=f"users/{user_a_id}/doc-a-uuid/salary_usera.pdf",
            mime_type="application/pdf",
            file_size_bytes=100,
            processing_status="completed",
        )
        db.add(doc_a)
        await db.commit()

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    token_b = create_access_token(data={"sub": user_b_id})
    headers_b = {"Authorization": f"Bearer {token_b}"}

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # User B attempts to access User A's document metadata
        resp_doc = await client.get("/api/v1/documents/doc-a-uuid", headers=headers_b)
        assert resp_doc.status_code == 404

        # User B attempts to get download URL for User A's document
        resp_url = await client.get("/api/v1/documents/doc-a-uuid/download-url", headers=headers_b)
        assert resp_url.status_code == 404

        # User B attempts to stream file bytes for User A's document
        resp_stream = await client.get("/api/v1/documents/doc-a-uuid/file", headers=headers_b)
        assert resp_stream.status_code == 404

        # User B attempts to delete User A's document
        resp_del = await client.delete("/api/v1/documents/doc-a-uuid", headers=headers_b)
        assert resp_del.status_code == 404

        # User B attempts to access User A's tax return
        resp_tr = await client.get("/api/v1/tax-returns/return-a-uuid", headers=headers_b)
        assert resp_tr.status_code == 404

        # User B attempts to access preflight on User A's tax return
        resp_pref = await client.get("/api/v1/tax-returns/return-a-uuid/preflight", headers=headers_b)
        assert resp_pref.status_code == 404

    app.dependency_overrides.clear()
    await engine.dispose()


@pytest.mark.asyncio
async def test_encrypted_backup_and_isolated_restore_roundtrip(tmp_path):
    """
    Test end-to-end backup and restore:
    1. Seed source DB with synthetic user, return, and envelope-encrypted document.
    2. Create AES-256-GCM encrypted backup archive.
    3. Assert no plaintext PII or unencrypted strings in archive.
    4. Guard check: Restoring without confirmation must fail.
    5. Restore into isolated test database.
    6. Decrypt restored DocumentBlob and verify contents match original synthetic PDF.
    """
    source_db_file = tmp_path / "source.db"
    source_db_url = f"sqlite+aiosqlite:///{source_db_file}"
    source_engine = create_async_engine(source_db_url, echo=False)
    async with source_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    source_session_factory = async_sessionmaker(source_engine, expire_on_commit=False)

    synthetic_pdf_bytes = b"%PDF-1.4 synthetic Swiss salary declaration for Hans Muster CHF 120'000"
    envelope_encrypted_pdf = envelope_service.encrypt_document(synthetic_pdf_bytes)

    user_id = "test-user-synth-uuid"
    doc_id = "test-doc-synth-uuid"
    doc_key = f"users_{user_id}_{doc_id}_lohnausweis.pdf"

    async with source_session_factory() as db:
        user = User(
            id=user_id,
            email="hans.muster@synthetic-test.ch",
            hashed_password=hash_password("SuperSecret10#"),
            full_name="Hans Muster",
            is_active=True,
            is_verified=True,
        )
        db.add(user)

        tr = TaxReturn(
            id="synth-tr-uuid",
            user_id=user_id,
            canton_code="ZH",
            tax_year=2024,
            status="draft",
        )
        db.add(tr)

        doc = Document(
            id=doc_id,
            user_id=user_id,
            tax_return_id="synth-tr-uuid",
            original_filename="lohnausweis.pdf",
            storage_key=doc_key,
            mime_type="application/pdf",
            file_size_bytes=len(synthetic_pdf_bytes),
            processing_status="completed",
        )
        db.add(doc)

        blob = DocumentBlob(
            key=doc_key,
            payload=envelope_encrypted_pdf,
        )
        db.add(blob)
        await db.commit()

        # Step 2: Create encrypted backup
        backup_out_dir = tmp_path / "backups"
        backup_key = "TestBackupKey-AtLeast32CharsLongForTesting!!"
        res = await secure_backup_service.create_encrypted_backup(
            db=db,
            operator="qa-tester@suntax.ch",
            out_dir=backup_out_dir,
            explicit_key=backup_key,
        )
        assert res["status"] == "success"
        backup_file = Path(res["path"])
        assert backup_file.exists()

    # Step 3: Verify archive is ciphertext and contains NO plaintext PII
    raw_archive_bytes = backup_file.read_bytes()
    assert raw_archive_bytes.startswith(b"SUNTAX_ENC_V1")
    assert b"hans.muster@synthetic-test.ch" not in raw_archive_bytes
    assert b"SuperSecret10#" not in raw_archive_bytes
    assert b"synthetic Swiss salary declaration" not in raw_archive_bytes

    # Step 4: Safety guard check - restore without explicit confirmation flag MUST raise ValueError
    target_db_file = tmp_path / "isolated_target.db"
    target_db_url = f"sqlite+aiosqlite:///{target_db_file}"

    with pytest.raises(ValueError, match="RESTORE BLOCKED"):
        await secure_backup_service.restore_backup(
            backup_path=backup_file,
            target_db_url=target_db_url,
            confirm_isolated_test_db=False,  # Should fail
            explicit_key=backup_key,
        )

    # Step 5: Restore into isolated test database with confirmation
    rehydrate_dir = tmp_path / "rehydrated_docs"
    restore_res = await secure_backup_service.restore_backup(
        backup_path=backup_file,
        target_db_url=target_db_url,
        confirm_isolated_test_db=True,
        explicit_key=backup_key,
        rehydrate_storage_dir=rehydrate_dir,
    )
    assert restore_res["status"] == "success"
    assert restore_res["records_restored"]["users"] == 1
    assert restore_res["records_restored"]["documents"] == 1
    assert restore_res["records_restored"]["document_blobs"] == 1

    # Step 6: Verify restored records and decrypt restored document payload
    target_engine = create_async_engine(target_db_url, echo=False)
    target_session_factory = async_sessionmaker(target_engine, expire_on_commit=False)

    async with target_session_factory() as target_db:
        restored_user = (await target_db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
        assert restored_user is not None
        assert restored_user.email == "hans.muster@synthetic-test.ch"

        restored_blob = (await target_db.execute(select(DocumentBlob).where(DocumentBlob.key == doc_key))).scalar_one_or_none()
        assert restored_blob is not None
        assert restored_blob.payload is not None

        # Decrypt restored envelope with KMS
        decrypted_doc = envelope_service.decrypt_document(bytes(restored_blob.payload))
        assert decrypted_doc == synthetic_pdf_bytes

    await target_engine.dispose()
    await source_engine.dispose()


@pytest.mark.asyncio
async def test_user_hard_delete_purges_documents_and_blobs(tmp_path):
    """Under Swiss nDSG Art. 32, delete_me(hard_delete=True) must purge documents from DB and storage."""
    test_db_file = tmp_path / "test_hard_delete.db"
    test_db_url = f"sqlite+aiosqlite:///{test_db_file}"
    engine = create_async_engine(test_db_url, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    user_id = "user-delete-test-uuid"
    doc_key = f"users_{user_id}_doc-del-uuid_test.pdf"

    async with session_factory() as db:
        user = User(
            id=user_id,
            email="delete.me@suntax.ch",
            hashed_password=hash_password("Password123!"),
            full_name="Erasure Subject",
            is_active=True,
            is_verified=True,
        )
        db.add(user)

        doc = Document(
            id="doc-del-uuid",
            user_id=user_id,
            original_filename="test.pdf",
            storage_key=doc_key,
            mime_type="application/pdf",
            file_size_bytes=50,
            processing_status="completed",
        )
        db.add(doc)

        blob = DocumentBlob(
            key=doc_key,
            payload=b"encrypted_content_here",
        )
        db.add(blob)
        await db.commit()

    async def override_get_db():
        async with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    token = create_access_token(data={"sub": user_id})
    headers = {"Authorization": f"Bearer {token}"}

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.delete("/api/v1/auth/me?hard_delete=true", headers=headers)
        assert resp.status_code == 200
        assert "permanently erased" in resp.json()["message"]

    async with session_factory() as db:
        u_check = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
        assert u_check is None

        d_check = (await db.execute(select(Document).where(Document.user_id == user_id))).scalars().all()
        assert len(d_check) == 0

        b_check = (await db.execute(select(DocumentBlob).where(DocumentBlob.key == doc_key))).scalar_one_or_none()
        assert b_check is None

    app.dependency_overrides.clear()
    await engine.dispose()
