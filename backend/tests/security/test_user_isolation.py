"""
Security isolation tests – verify RLS and API-level enforcement.
"""
import io
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_cannot_access_other_users_tax_return(auth_client: AsyncClient, auth_client2):
    """User 2 cannot read User 1's tax return by guessing the UUID."""
    resp = await auth_client.post("/api/v1/tax-returns", json={
        "canton_code": "ZG",
        "municipality_code": "1701",
        "municipality_name": "Zug",
        "tax_year": 2025,
    })
    if resp.status_code not in (200, 201):
        pytest.skip("Tax return creation not available")

    tr_id = resp.json()["id"]
    resp2 = await auth_client2.get(f"/api/v1/tax-returns/{tr_id}")
    assert resp2.status_code in (403, 404), f"Expected 403/404, got {resp2.status_code}"


@pytest.mark.asyncio
async def test_cannot_delete_other_users_tax_return(auth_client: AsyncClient, auth_client2):
    resp = await auth_client.post("/api/v1/tax-returns", json={
        "canton_code": "BE",
        "municipality_code": "351",
        "municipality_name": "Bern",
        "tax_year": 2025,
    })
    if resp.status_code not in (200, 201):
        pytest.skip("Tax return creation not available")

    tr_id = resp.json()["id"]
    del_resp = await auth_client2.delete(f"/api/v1/tax-returns/{tr_id}")
    assert del_resp.status_code in (403, 404)


@pytest.mark.asyncio
async def test_cannot_access_other_users_document(auth_client: AsyncClient, auth_client2):
    """User 2 cannot download User 1's document."""
    pdf_bytes = b"%PDF-1.4 fake test pdf content"
    files = {"file": ("test.pdf", io.BytesIO(pdf_bytes), "application/pdf")}

    upload_resp = await auth_client.post("/api/v1/documents/upload", files=files)
    if upload_resp.status_code not in (200, 201):
        pytest.skip("Document upload not available in test environment")

    doc_id = upload_resp.json()["id"]

    # User 2 cannot access User 1's document
    resp2 = await auth_client2.get(f"/api/v1/documents/{doc_id}")
    assert resp2.status_code in (403, 404)


@pytest.mark.asyncio
async def test_admin_required_for_admin_endpoints(auth_client: AsyncClient):
    """Non-admin user cannot access admin endpoints."""
    resp = await auth_client.get("/api/v1/admin/users")
    assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_admin_can_access_admin_endpoints(admin_client: AsyncClient):
    """Admin user can access admin endpoints."""
    resp = await admin_client.get("/api/v1/admin/users")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_unauthenticated_cannot_access_protected(client: AsyncClient):
    """No token means no access."""
    for path in ["/api/v1/tax-returns", "/api/v1/documents", "/api/v1/auth/me"]:
        resp = await client.get(path)
        assert resp.status_code == 401, f"Expected 401 for {path}, got {resp.status_code}"
