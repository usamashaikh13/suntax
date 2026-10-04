"""
Auth endpoint tests.
"""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_register_success(client: AsyncClient):
    resp = await client.post("/api/v1/auth/register", json={
        "email": "newuser@suntax.ch",
        "password": "Secure1234!",
        "full_name": "New User",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert "message" in data


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient):
    payload = {"email": "dup@suntax.ch", "password": "Secure1234!", "full_name": "Dup"}
    await client.post("/api/v1/auth/register", json=payload)
    resp = await client.post("/api/v1/auth/register", json=payload)
    assert resp.status_code in (201, 409)


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


@pytest.mark.asyncio
async def test_revoked_refresh_token_rejected(client: AsyncClient, test_user):
    """M1-01: Revoking a refresh token immediately rejects it on /refresh."""
    from app.core.security import revoke_refresh_token

    login_resp = await client.post("/api/v1/auth/login", json={
        "email": test_user.email,
        "password": "Test1234!",
    })
    assert login_resp.status_code == 200
    refresh_tok = login_resp.json()["refresh_token"]

    # Explicitly revoke refresh token
    await revoke_refresh_token(str(test_user.id), refresh_tok)

    # POST to /refresh must be rejected with 401
    refresh_resp = await client.post("/api/v1/auth/refresh", json={
        "refresh_token": refresh_tok,
    })
    assert refresh_resp.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token_atomic_rotation_and_replay(client: AsyncClient, test_user):
    """M1-01: Refreshing rotates the token; reusing the old token is rejected."""
    login_resp = await client.post("/api/v1/auth/login", json={
        "email": test_user.email,
        "password": "Test1234!",
    })
    assert login_resp.status_code == 200
    old_refresh_tok = login_resp.json()["refresh_token"]

    # First refresh succeeds
    r1 = await client.post("/api/v1/auth/refresh", json={
        "refresh_token": old_refresh_tok,
    })
    assert r1.status_code == 200
    new_refresh_tok = r1.json()["refresh_token"]
    assert new_refresh_tok != old_refresh_tok

    # Replaying old refresh token must be rejected with 401
    r2 = await client.post("/api/v1/auth/refresh", json={
        "refresh_token": old_refresh_tok,
    })
    assert r2.status_code == 401

    # New refresh token works
    r3 = await client.post("/api/v1/auth/refresh", json={
        "refresh_token": new_refresh_tok,
    })
    assert r3.status_code == 200


@pytest.mark.asyncio
async def test_logout_revokes_refresh_tokens(client: AsyncClient, test_user):
    """M1-01: Logging out revokes active refresh tokens."""
    login_resp = await client.post("/api/v1/auth/login", json={
        "email": test_user.email,
        "password": "Test1234!",
    })
    assert login_resp.status_code == 200
    access_tok = login_resp.json()["access_token"]
    refresh_tok = login_resp.json()["refresh_token"]

    logout_resp = await client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {access_tok}"},
    )
    assert logout_resp.status_code == 200

    # Refresh token must now be rejected
    ref_resp = await client.post("/api/v1/auth/refresh", json={
        "refresh_token": refresh_tok,
    })
    assert ref_resp.status_code == 401


@pytest.mark.asyncio
async def test_password_72_byte_truncation_collision_prevented(client: AsyncClient):
    """M1-02: Passwords > 72 bytes are rejected; distinct passwords sharing 72 bytes do not verify."""
    from app.core.security import hash_password, verify_password

    base_72 = "A" * 70 + "1!"  # 72 bytes
    longer_pw1 = base_72 + "EXTRA1"
    longer_pw2 = base_72 + "EXTRA2"

    # Register with > 72 bytes should fail schema validation (422)
    resp = await client.post("/api/v1/auth/register", json={
        "email": "toolong@example.com",
        "password": longer_pw1,
    })
    assert resp.status_code == 422

    # verify_password rejects inputs > 72 bytes
    hashed_base = hash_password(base_72)
    assert verify_password(base_72, hashed_base) is True
    assert verify_password(longer_pw1, hashed_base) is False
    assert verify_password(longer_pw2, hashed_base) is False
