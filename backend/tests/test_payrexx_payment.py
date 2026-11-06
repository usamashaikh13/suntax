"""
Tests for Swiss Payrexx Payment Service & Payment Endpoints (Milestone 2, Part B6).
Verifies:
- Payrexx gateway creation for CHF 39.00 flat fee.
- Rejection of unverified/unpaid confirmations.
- HMAC-SHA256 webhook signature validation and tampering detection.
- Idempotent payment processing.
- Integration boundary for live merchant credentials vs secure sandbox fallback.
"""

import hashlib
import hmac
import json
import uuid
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.config import settings
from app.models.tax_return import TaxReturn
from app.models.user import User
from app.services.payrexx_service import PayrexxService, payrexx_service


@pytest.fixture
def test_payrexx():
    svc = PayrexxService()
    svc.webhook_secret = "test_webhook_secret_key_12345"
    return svc


# ── 1. Unit Tests for PayrexxService ──────────────────────────────────────────

@pytest.mark.asyncio
async def test_create_gateway_sandbox(test_payrexx):
    ret_id = str(uuid.uuid4())
    gw = await test_payrexx.create_gateway(
        tax_return_id=ret_id,
        amount_chf=39.00,
        currency="CHF",
        payment_methods=["twint"],
    )

    assert gw["gateway_id"].startswith("gw_sandbox_")
    assert gw["amount_chf"] == 39.00
    assert gw["currency"] == "CHF"
    assert gw["reference_id"] == ret_id
    assert gw["is_sandbox"] is True
    assert "payrexx.com" in gw["checkout_url"]


@pytest.mark.asyncio
async def test_verify_transaction_missing_details(test_payrexx):
    res = await test_payrexx.verify_transaction(tax_return_id="test_return_123")
    assert res["verified"] is False
    assert "Weder Transaktions-ID" in res["error"]


@pytest.mark.asyncio
async def test_verify_transaction_sandbox_mismatched_reference(test_payrexx):
    gw = await test_payrexx.create_gateway(tax_return_id="real_return_id")
    # Attempt to verify with a different return id
    res = await test_payrexx.verify_transaction(
        tax_return_id="attacker_return_id",
        gateway_id=gw["gateway_id"],
    )
    assert res["verified"] is False
    assert "nicht mit der Steuererklärung überein" in res["error"]


@pytest.mark.asyncio
async def test_verify_transaction_sandbox_rejects_waiting_gateway(test_payrexx):
    """A freshly created gateway is in 'waiting' status and must NOT be marked verified."""
    ret_id = str(uuid.uuid4())
    gw = await test_payrexx.create_gateway(tax_return_id=ret_id)
    assert gw["status"] == "waiting"

    # Verifying without external payment must fail
    res = await test_payrexx.verify_transaction(
        tax_return_id=ret_id,
        gateway_id=gw["gateway_id"],
    )
    assert res["verified"] is False
    assert "noch nicht bestätigt" in res["error"]
    assert res["status"] == "waiting"


@pytest.mark.asyncio
async def test_verify_transaction_sandbox_success_after_provider_confirmation(test_payrexx):
    """Simulating provider confirmation enables verified transaction status."""
    ret_id = str(uuid.uuid4())
    gw = await test_payrexx.create_gateway(tax_return_id=ret_id)

    # Provider confirms transaction
    test_payrexx.simulate_provider_payment(
        gateway_id=gw["gateway_id"],
        transaction_id="tx_sandbox_test_12345",
        payment_method="twint",
        status="confirmed",
    )

    res = await test_payrexx.verify_transaction(
        tax_return_id=ret_id,
        gateway_id=gw["gateway_id"],
    )
    assert res["verified"] is True
    assert res["amount_chf"] == 39.00
    assert res["status"] == "confirmed"
    assert res["transaction_id"] == "tx_sandbox_test_12345"


def test_webhook_signature_verification(test_payrexx):
    secret = "test_webhook_secret_key_12345"
    payload = json.dumps({"transaction": {"id": 123, "status": "confirmed"}}).encode("utf-8")

    # Generate genuine HMAC-SHA256 signature
    valid_sig = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()

    # 1. Valid signature passes
    assert test_payrexx.verify_webhook_signature(payload, valid_sig) is True

    # 2. Tampered signature fails
    tampered_sig = valid_sig[:-4] + "dead"
    assert test_payrexx.verify_webhook_signature(payload, tampered_sig) is False

    # 3. Missing or empty signature fails
    assert test_payrexx.verify_webhook_signature(payload, None) is False
    assert test_payrexx.verify_webhook_signature(payload, "") is False


def test_process_webhook_payload_validation(test_payrexx):
    payload_valid = {
        "transaction": {
            "id": 998877,
            "status": "confirmed",
            "amount": 3900,
            "referenceId": "tax_ret_12345",
            "payment": {"brand": "twint"},
        }
    }
    raw_body = json.dumps(payload_valid).encode("utf-8")
    sig = hmac.new(test_payrexx.webhook_secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()

    result = test_payrexx.process_webhook_payload(payload_valid, raw_body, sig)
    assert result["valid"] is True
    assert result["reference_id"] == "tax_ret_12345"
    assert result["amount_chf"] == 39.00
    assert result["payment_method"] == "twint"

    # Status not confirmed -> rejected
    payload_waiting = {
        "transaction": {
            "id": 998877,
            "status": "waiting",
            "amount": 3900,
            "referenceId": "tax_ret_12345",
        }
    }
    res_waiting = test_payrexx.process_webhook_payload(payload_waiting, b"{}", None, enforce_signature=False)
    assert res_waiting["valid"] is False
    assert "nicht bestätigt" in res_waiting["error"]

    # Wrong amount -> rejected
    payload_wrong_amt = {
        "transaction": {
            "id": 998877,
            "status": "confirmed",
            "amount": 1000,
            "referenceId": "tax_ret_12345",
        }
    }
    res_amt = test_payrexx.process_webhook_payload(payload_wrong_amt, b"{}", None, enforce_signature=False)
    assert res_amt["valid"] is False
    assert "Betrag weicht ab" in res_amt["error"]


# ── 2. Integration Tests with FastAPI TestClient ──────────────────────────────

@pytest.mark.asyncio
async def test_payment_checkout_endpoint(auth_client: AsyncClient, test_user: User, db_session):
    # Create test tax return
    tr = TaxReturn(
        id=str(uuid.uuid4()),
        user_id=str(test_user.id),
        canton_code="ZH",
        tax_year=2025,
        payment_status="pending",
    )
    db_session.add(tr)
    await db_session.commit()

    resp = await auth_client.post(
        f"/api/v1/tax-returns/{tr.id}/payment/checkout",
        json={"method": "twint"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["amount_chf"] == 39.00
    assert data["currency"] == "CHF"
    assert data["method"] == "twint"
    assert data["provider"] == "payrexx"
    assert data["gateway_id"].startswith("gw_")
    assert "checkout_url" in data


@pytest.mark.asyncio
async def test_payment_confirm_endpoint_rejects_unverified(auth_client: AsyncClient, test_user: User, db_session):
    tr = TaxReturn(
        id=str(uuid.uuid4()),
        user_id=str(test_user.id),
        canton_code="ZH",
        tax_year=2025,
        payment_status="pending",
    )
    db_session.add(tr)
    await db_session.commit()

    # Attempt to confirm without a genuine gateway / transaction ID -> must be rejected (400)
    resp = await auth_client.post(
        f"/api/v1/tax-returns/{tr.id}/payment/confirm",
        json={"method": "twint", "gateway_id": "non_existent_gateway_id"},
    )
    assert resp.status_code == 400
    assert "Zahlung nicht gefunden" in resp.json()["detail"] or "nicht verifiziert" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_payment_confirm_endpoint_rejects_unpaid_gateway(auth_client: AsyncClient, test_user: User, db_session):
    """Calling confirm on a pending checkout without provider payment must be rejected."""
    tr = TaxReturn(
        id=str(uuid.uuid4()),
        user_id=str(test_user.id),
        canton_code="ZH",
        tax_year=2025,
        payment_status="pending",
    )
    db_session.add(tr)
    await db_session.commit()

    # 1. Initiate checkout to register gateway (status = waiting)
    checkout_resp = await auth_client.post(
        f"/api/v1/tax-returns/{tr.id}/payment/checkout",
        json={"method": "twint"},
    )
    assert checkout_resp.status_code == 200
    gw_id = checkout_resp.json()["gateway_id"]

    # 2. Attempt confirm without payment -> must return HTTP 400 Bad Request
    confirm_resp = await auth_client.post(
        f"/api/v1/tax-returns/{tr.id}/payment/confirm",
        json={"method": "twint", "gateway_id": gw_id},
    )
    assert confirm_resp.status_code == 400
    assert "noch nicht bestätigt" in confirm_resp.json()["detail"]


@pytest.mark.asyncio
async def test_payment_confirm_endpoint_accepts_verified_sandbox(auth_client: AsyncClient, test_user: User, db_session):
    """Calling confirm after payment is confirmed by provider succeeds."""
    tr = TaxReturn(
        id=str(uuid.uuid4()),
        user_id=str(test_user.id),
        canton_code="ZH",
        tax_year=2025,
        payment_status="pending",
    )
    db_session.add(tr)
    await db_session.commit()

    # 1. Initiate checkout to register gateway
    checkout_resp = await auth_client.post(
        f"/api/v1/tax-returns/{tr.id}/payment/checkout",
        json={"method": "twint"},
    )
    assert checkout_resp.status_code == 200
    gw_id = checkout_resp.json()["gateway_id"]

    # 2. Simulate user completing payment at Payrexx provider
    payrexx_service.simulate_provider_payment(
        gateway_id=gw_id,
        transaction_id="tx_test_verified_9988",
        payment_method="twint",
        status="confirmed",
    )

    # 3. Confirm payment referencing the verified gateway -> succeeds 200 OK
    confirm_resp = await auth_client.post(
        f"/api/v1/tax-returns/{tr.id}/payment/confirm",
        json={"method": "twint", "gateway_id": gw_id},
    )
    assert confirm_resp.status_code == 200
    cdata = confirm_resp.json()
    assert cdata["status"] == "paid"
    assert cdata["amount_chf"] == 39.00
    assert cdata["transaction_id"] == "tx_test_verified_9988"

    # 4. Check status endpoint confirms return is paid
    status_resp = await auth_client.get(
        f"/api/v1/tax-returns/{tr.id}/payment/status",
    )
    assert status_resp.status_code == 200
    assert status_resp.json()["is_paid"] is True


@pytest.mark.asyncio
async def test_payrexx_webhook_endpoint(client: AsyncClient, db_session):
    # Setup test tax return
    tr_id = str(uuid.uuid4())
    usr_id = str(uuid.uuid4())
    user = User(id=usr_id, email=f"user_{uuid.uuid4().hex[:6]}@suntax.ch", hashed_password="fake")
    tr = TaxReturn(id=tr_id, user_id=usr_id, canton_code="ZH", tax_year=2025, payment_status="pending")
    db_session.add(user)
    db_session.add(tr)
    await db_session.commit()

    payload = {
        "transaction": {
            "id": 883344,
            "status": "confirmed",
            "amount": 3900,
            "referenceId": tr_id,
            "payment": {"brand": "twint"},
        }
    }
    raw_body = json.dumps(payload).encode("utf-8")

    # Call webhook endpoint
    resp = await client.post(
        "/api/v1/tax-returns/payment/webhook",
        content=raw_body,
        headers={"Content-Type": "application/json"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "success"

    # Verify DB record updated
    res = await db_session.execute(select(TaxReturn).where(TaxReturn.id == tr_id))
    updated_tr = res.scalar_one()
    assert updated_tr.payment_status == "paid"
    assert updated_tr.payment_method == "twint"
    assert updated_tr.paid_at is not None

    # Idempotent call -> returns already_processed without error
    resp_repeat = await client.post(
        "/api/v1/tax-returns/payment/webhook",
        content=raw_body,
        headers={"Content-Type": "application/json"},
    )
    assert resp_repeat.status_code == 200
    assert resp_repeat.json()["status"] == "already_processed"
