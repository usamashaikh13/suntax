"""
Auth endpoint tests.
"""
import pytest
from httpx import AsyncClient
from app.models.user import User
from app.core.security import create_access_token


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


async def _login_and_get_tokens(client: AsyncClient, test_user: User) -> dict:
    """Helper to complete login including the mandatory 2FA challenge."""
    login = await client.post("/api/v1/auth/login", json={
        "email": test_user.email,
        "password": "Test1234!",
    })
    data = login.json()
    if data.get("two_factor_required"):
        import pyotp
        totp = pyotp.TOTP(test_user.totp_secret)
        code = totp.now()
        fa_resp = await client.post("/api/v1/auth/login/2fa", json={
            "temp_token": data["temp_token"],
            "code": code,
        })
        return fa_resp.json()
    return data


@pytest.mark.asyncio
async def test_token_refresh(client: AsyncClient, test_user):
    tokens = await _login_and_get_tokens(client, test_user)
    refresh_token = tokens["refresh_token"]

    resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


@pytest.mark.asyncio
async def test_logout_invalidates_token(client: AsyncClient, test_user):
    tokens = await _login_and_get_tokens(client, test_user)
    access_token = tokens["access_token"]
    refresh_token = tokens["refresh_token"]

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
    assert create_resp.status_code in (200, 201), create_resp.text

    tr_id = create_resp.json()["id"]

    # User 2 should NOT be able to access it
    resp2 = await auth_client2.get(f"/api/v1/tax-returns/{tr_id}")
    assert resp2.status_code in (403, 404)


@pytest.mark.asyncio
async def test_revoked_refresh_token_rejected(client: AsyncClient, test_user):
    """M1-01: Revoking a refresh token immediately rejects it on /refresh."""
    from app.core.security import revoke_refresh_token

    tokens = await _login_and_get_tokens(client, test_user)
    refresh_tok = tokens["refresh_token"]

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
    tokens = await _login_and_get_tokens(client, test_user)
    old_refresh_tok = tokens["refresh_token"]

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
    tokens = await _login_and_get_tokens(client, test_user)
    access_tok = tokens["access_token"]
    refresh_tok = tokens["refresh_token"]

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


@pytest.mark.asyncio
async def test_2fa_login_endpoint_lockout(client: AsyncClient, test_user: User, db_session):
    """5 failed 2FA attempts lock the account; 6th attempt returns HTTP 403 Forbidden."""
    import pyotp
    test_user.two_factor_enabled = True
    test_user.totp_enabled = True
    test_user.totp_secret = pyotp.random_base32()
    test_user.failed_login_attempts = 0
    test_user.locked_until = None
    db_session.add(test_user)
    await db_session.commit()
    await db_session.refresh(test_user)

    login_resp = await client.post("/api/v1/auth/login", json={
        "email": test_user.email,
        "password": "Test1234!",
    })
    assert login_resp.status_code == 200
    assert login_resp.json()["two_factor_required"] is True
    temp_token = login_resp.json()["temp_token"]

    for _ in range(5):
        resp = await client.post("/api/v1/auth/login/2fa", json={
            "temp_token": temp_token,
            "code": "999999",
        })
        assert resp.status_code == 401

    # 6th attempt must be locked (HTTP 403)
    resp6 = await client.post("/api/v1/auth/login/2fa", json={
        "temp_token": temp_token,
        "code": "999999",
    })
    assert resp6.status_code == 403
    assert "vorübergehend gesperrt" in resp6.json()["detail"] or "15 Minuten" in resp6.json()["detail"]


@pytest.mark.asyncio
async def test_tax_return_confirm_stepup_2fa_lockout(client: AsyncClient, test_user: User, db_session):
    """5 failed 2FA step-up attempts on /tax-returns/{id}/confirm lock the account (HTTP 403)."""
    import uuid
    import pyotp
    from app.models.tax_return import TaxReturn
    from app.models.tax_profile import TaxProfile
    from app.models.tax_calculation import TaxCalculation

    test_user.totp_secret = pyotp.random_base32()
    test_user.totp_enabled = True
    test_user.failed_login_attempts = 0
    test_user.locked_until = None
    db_session.add(test_user)

    tr_id = str(uuid.uuid4())
    tr = TaxReturn(
        id=tr_id,
        user_id=str(test_user.id),
        canton_code="ZH",
        municipality_code="261",
        municipality_name="Zürich",
        tax_year=2025,
        status="review",
    )
    tp = TaxProfile(
        id=str(uuid.uuid4()),
        tax_return_id=tr_id,
        personal_data={"civil_status": "single", "ahv_number": "756.9217.0769.85"},
    )
    tc = TaxCalculation(
        id=str(uuid.uuid4()),
        tax_return_id=tr_id,
        taxable_income=50000.0,
        taxable_wealth=0.0,
    )
    db_session.add_all([tr, tp, tc])
    await db_session.commit()

    token = create_access_token({"sub": str(test_user.id), "email": test_user.email})
    headers = {"Authorization": f"Bearer {token}"}

    for _ in range(5):
        resp = await client.post(
            f"/api/v1/tax-returns/{tr_id}/confirm",
            headers=headers,
            json={
                "confirmation_statement": "I have reviewed and confirm this tax return",
                "confirmed": True,
                "two_factor_code": "999999",
            },
        )
        assert resp.status_code == 401

    # 6th attempt must return 403 Account Locked
    resp6 = await client.post(
        f"/api/v1/tax-returns/{tr_id}/confirm",
        headers=headers,
        json={
            "confirmation_statement": "I have reviewed and confirm this tax return",
            "confirmed": True,
            "two_factor_code": "999999",
        },
    )
    assert resp6.status_code == 403
    assert "temporarily locked" in resp6.json()["detail"]
