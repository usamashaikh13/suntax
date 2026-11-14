"""
Tests for SunTax storage resilience and download URL handling.
"""

from unittest.mock import patch
import pytest

from app.services.storage_service import _LocalStorageService, _make_storage, _is_s3_reachable


def test_is_s3_reachable_detection():
    # localhost port 9999 is definitely not listening
    assert _is_s3_reachable("localhost:9999", timeout=0.1) is False
    # remote cloud endpoints should be assumed reachable
    assert _is_s3_reachable("s3.eu-central-2.amazonaws.com", timeout=0.1) is True


def test_storage_fallback_in_production_when_endpoint_unreachable():
    with patch("app.core.config.settings.ENVIRONMENT", "production"):
        with patch("app.core.config.settings.MINIO_ENDPOINT", "localhost:9999"):
            storage = _make_storage()
            assert isinstance(storage, _LocalStorageService)


@pytest.mark.asyncio
async def test_local_storage_upload_and_download_roundtrip(tmp_path):
    storage = _LocalStorageService()
    test_key = "test_resilience_doc.pdf"
    content = b"%PDF-1.4 test document content for resilience verification"

    uploaded_key = await storage.upload_file(content, test_key, "application/pdf")
    assert uploaded_key == test_key

    downloaded = await storage.download_file(test_key)
    assert downloaded == content

    url = await storage.generate_presigned_url(test_key)
    assert "dev-files" in url

    deleted = await storage.delete_file(test_key)
    assert deleted is True
