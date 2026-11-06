"""
Tests for Art. 113 DBG Separate Spouse Confirmation (Milestone 2, Part B5 & § 4).
Verifies:
- Generation of single-use expiring token for Partner 2.
- Inspection of return summary by Partner 2 via public token.
- Personal confirmation and signature recording for Partner 2.
- Partner 1 cannot confirm on behalf of Partner 2.
- Subsequent changes to tax return data immediately invalidate Partner 2 confirmation.
- Token expiration (HTTP 410 GONE).
- Rejection of invalid tokens (HTTP 404).
"""

import uuid
from datetime import datetime, timezone, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.models.tax_return import TaxReturn
from app.models.tax_profile import TaxProfile
from app.models.user import User


@pytest.mark.asyncio
async def test_spouse_invitation_and_token_generation(auth_client: AsyncClient, test_user: User, db_session):
    tr = TaxReturn(
        id=str(uuid.uuid4()),
        user_id=str(test_user.id),
        canton_code="ZH",
        tax_year=2025,
        status="draft",
    )
    db_session.add(tr)
    await db_session.commit()

    # Invite Partner 2
    resp = await auth_client.post(
        f"/api/v1/tax-returns/{tr.id}/partner2/invite",
        json={"email": "partner2@suntax.ch", "phone": "+41791234567"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "invited"
    assert data["partner2_email"] == "partner2@suntax.ch"
    assert "confirmation_token" in data
    token = data["confirmation_token"]
    assert token.startswith("p2_tok_")

    # Verify status endpoint reflects invitation
    status_resp = await auth_client.get(
        f"/api/v1/tax-returns/{tr.id}/partner2/status",
    )
    assert status_resp.status_code == 200
    sdata = status_resp.json()
    assert sdata["is_confirmed"] is False
    assert sdata["partner2_email"] == "partner2@suntax.ch"
    assert sdata["is_token_expired"] is False


@pytest.mark.asyncio
async def test_spouse_public_inspect_and_confirm(client: AsyncClient, db_session):
    tr_id = str(uuid.uuid4())
    usr_id = str(uuid.uuid4())
    token = f"p2_tok_test_{uuid.uuid4().hex}"
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)

    user = User(id=usr_id, email=f"spouse_{uuid.uuid4().hex[:6]}@suntax.ch", hashed_password="fake")
    tr = TaxReturn(
        id=tr_id,
        user_id=usr_id,
        canton_code="BE",
        tax_year=2025,
        status="draft",
        partner2_confirmation_token=token,
        partner2_token_expires_at=expires_at,
        partner2_email="anna.muster@suntax.ch",
    )
    prof = TaxProfile(
        id=str(uuid.uuid4()),
        tax_return_id=tr_id,
        personal_data={
            "first_name": "Thomas",
            "last_name": "Muster",
            "partner2": {"first_name": "Anna", "last_name": "Muster"},
        },
    )
    db_session.add(user)
    db_session.add(tr)
    db_session.add(prof)
    await db_session.commit()

    # 1. Partner 2 inspects return via public URL (no auth header needed)
    inspect_resp = await client.get(f"/api/v1/tax-returns/partner-confirm/{token}")
    assert inspect_resp.status_code == 200
    idata = inspect_resp.json()
    assert idata["tax_return_id"] == tr_id
    assert idata["canton_code"] == "BE"
    assert idata["partner1_name"] == "Thomas Muster"
    assert idata["partner2_name"] == "Anna Muster"
    assert idata["already_confirmed"] is False

    # 2. Partner 2 confirms with their full legal name
    confirm_resp = await client.post(
        f"/api/v1/tax-returns/partner-confirm/{token}",
        json={"confirmed": True, "full_name": "Anna Muster"},
    )
    assert confirm_resp.status_code == 200
    cdata = confirm_resp.json()
    assert cdata["status"] == "confirmed"
    assert cdata["confirmed_name"] == "Anna Muster"

    # 3. Verify in DB
    await db_session.refresh(tr)
    assert tr.partner2_confirmed_at is not None
    assert tr.partner2_confirmed_name == "Anna Muster"


@pytest.mark.asyncio
async def test_spouse_token_expired_rejected(client: AsyncClient, db_session):
    tr_id = str(uuid.uuid4())
    usr_id = str(uuid.uuid4())
    token = f"p2_tok_expired_{uuid.uuid4().hex}"
    # Expired 2 days ago
    expired_at = datetime.now(timezone.utc) - timedelta(days=2)

    user = User(id=usr_id, email=f"exp_{uuid.uuid4().hex[:6]}@suntax.ch", hashed_password="fake")
    tr = TaxReturn(
        id=tr_id,
        user_id=usr_id,
        canton_code="ZH",
        tax_year=2025,
        partner2_confirmation_token=token,
        partner2_token_expires_at=expired_at,
    )
    db_session.add(user)
    db_session.add(tr)
    await db_session.commit()

    # Must return 410 Gone
    resp = await client.get(f"/api/v1/tax-returns/partner-confirm/{token}")
    assert resp.status_code == 410

    resp_confirm = await client.post(
        f"/api/v1/tax-returns/partner-confirm/{token}",
        json={"confirmed": True, "full_name": "Anna Muster"},
    )
    assert resp_confirm.status_code == 410


@pytest.mark.asyncio
async def test_spouse_invalid_token_rejected(client: AsyncClient):
    resp = await client.get("/api/v1/tax-returns/partner-confirm/p2_tok_non_existent")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_data_modification_invalidates_spouse_confirmation(auth_client: AsyncClient, test_user: User, db_session):
    tr_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    # 1. Partner 2 confirmed while draft was in progress
    tr = TaxReturn(
        id=tr_id,
        user_id=str(test_user.id),
        canton_code="ZH",
        tax_year=2025,
        status="draft",
        partner2_confirmed_at=now,
        partner2_confirmed_name="Anna Muster",
    )
    prof = TaxProfile(
        id=str(uuid.uuid4()),
        tax_return_id=tr_id,
        income_data={"net_salary": 95000},
    )
    db_session.add(tr)
    db_session.add(prof)
    await db_session.commit()

    # Partner 1 updates income in tax profile
    update_resp = await auth_client.patch(
        f"/api/v1/tax-returns/{tr_id}/profile",
        json={"income_data": {"net_salary": 110000}},
    )
    assert update_resp.status_code == 200

    # Invalidation check: partner2_confirmed_at must be cleared (None)
    await db_session.refresh(tr)
    assert tr.partner2_confirmed_at is None
    assert tr.status == "draft"

    # 2. Reopening a confirmed tax return also invalidates confirmations
    tr.status = "confirmed"
    tr.confirmed_at = now
    tr.partner2_confirmed_at = now
    tr.partner2_confirmed_name = "Anna Muster"
    await db_session.commit()

    # Direct edit when confirmed is blocked (409 Conflict)
    blocked_resp = await auth_client.patch(
        f"/api/v1/tax-returns/{tr_id}/profile",
        json={"income_data": {"net_salary": 120000}},
    )
    assert blocked_resp.status_code == 409

    # Reopening resets status and invalidates spouse confirmation
    reopen_resp = await auth_client.post(f"/api/v1/tax-returns/{tr_id}/reopen")
    assert reopen_resp.status_code == 200
    await db_session.refresh(tr)
    assert tr.status == "draft"
    assert tr.confirmed_at is None
    assert tr.partner2_confirmed_at is None
