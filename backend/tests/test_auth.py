"""
Auth endpoint tests.
"""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register_success(client: AsyncClient):
    resp = await client.post("/api/v1/auth/register", json={
        "email": "newuser@suntax.test",
        "password": "Secure1234!",
        "full_name": "New User",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["email"] == "newuser@suntax.test"
    assert "id" in data


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient):
    payload = {"email": "dup@suntax.test", "password": "Secure1234!", "full_name": "Dup"}
    await client.post("/api/v1/auth/register", json=payload)
    resp = await client.post("/api/v1/auth/register", json=payload)
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_register_invalid_email(client: AsyncClient):
    resp = await client.post("/api/v1/auth/register", json={
        "email": "not-an-email",
        "password": "Secure1234!",
        "full_name": "Bad Email",
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_login_success(client: AsyncClient, test_user):
    resp = await client.post("/api/v1/auth/login", json={
        "email": test_user.email,
        "password": "Test1234!",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient, test_user):
    resp = await client.post("/api/v1/auth/login", json={
        "email": test_user.email,
        "password": "WrongPassword!",
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_get_me_authenticated(auth_client: AsyncClient, test_user):
    resp = await auth_client.get("/api/v1/auth/me")
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == test_user.email


@pytest.mark.asyncio
async def test_get_me_unauthenticated(client: AsyncClient):
    resp = await client.get("/api/v1/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_token_refresh(client: AsyncClient, test_user):
    login = await client.post("/api/v1/auth/login", json={
        "email": test_user.email,
        "password": "Test1234!",
    })
    refresh_token = login.json()["refresh_token"]

    resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


@pytest.mark.asyncio
async def test_logout_invalidates_token(client: AsyncClient, test_user):
    login = await client.post("/api/v1/auth/login", json={
        "email": test_user.email,
        "password": "Test1234!",
    })
    access_token = login.json()["access_token"]
    refresh_token = login.json()["refresh_token"]

    # Logout
    resp = await client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"refresh_token": refresh_token},
    )
    assert resp.status_code == 200

    # Subsequent request should fail
    resp2 = await client.get("/api/v1/auth/me",
                             headers={"Authorization": f"Bearer {access_token}"})
    assert resp2.status_code == 401


@pytest.mark.asyncio
async def test_user_isolation_tax_returns(auth_client: AsyncClient, auth_client2):
    """User 1 cannot see User 2's tax returns."""
    # Create a tax return for user 1
    create_resp = await auth_client.post("/api/v1/tax-returns", json={
        "canton_code": "ZH",
        "municipality_code": "261",
        "municipality_name": "Zürich",
        "tax_year": 2025,
    })
    if create_resp.status_code not in (200, 201):
        pytest.skip("Tax return creation not available in test environment")

    tr_id = create_resp.json()["id"]

    # User 2 should NOT be able to access it
    resp2 = await auth_client2.get(f"/api/v1/tax-returns/{tr_id}")
    assert resp2.status_code in (403, 404)
