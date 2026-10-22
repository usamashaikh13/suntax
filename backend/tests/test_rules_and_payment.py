"""Unit tests for Deduction Rules API, Question Info Texts, and Payment Flow (Milestone 2)."""
import pytest
from httpx import AsyncClient
from app.services.question_info_service import question_info_service


@pytest.mark.asyncio
async def test_question_info_texts_service():
    """Verify QuestionInfoService in-memory fallbacks contain all required keys."""
    texts = await question_info_service.get_info_texts(None, canton="ZH", tax_year=2025)
    assert "commute_transport" in texts
    assert "home_office" in texts
    assert "commute_car" in texts
    assert "meals" in texts
    assert "pillar3a" in texts
    assert "children" in texts

    # Verify 3 parts per Part B5
    commute = texts["commute_transport"]
    assert len(commute["why_we_ask"]) > 10
    assert len(commute["what_counts"]) > 10
    assert len(commute["example"]) > 10
    assert commute["tip_type"] in ("missed_deduction", "warning")


@pytest.mark.asyncio
async def test_rules_endpoints_and_payment_flow(auth_client: AsyncClient):
    """Test rules endpoint and CHF 39 payment checkout & confirmation."""
    # 1. Fetch deduction rules
    res = await auth_client.get("/api/v1/rules/deduction-rules?canton=ZH&tax_year=2025")
    assert res.status_code == 200
    data = res.json()
    assert data["canton"] == "ZH"
    assert "canton_rules" in data
    assert "federal_rules" in data

    # 2. Fetch info texts
    res = await auth_client.get("/api/v1/rules/info-texts?canton=ZH&tax_year=2025")
    assert res.status_code == 200
    info_data = res.json()
    assert "commute_transport" in info_data
    assert "why_we_ask" in info_data["commute_transport"]

    # 3. Create a tax return
    tr_res = await auth_client.post(
        "/api/v1/tax-returns",
        json={
            "canton_code": "ZH",
            "municipality_code": "261",
            "municipality_name": "Zürich",
            "tax_year": 2025,
        },
    )
    assert tr_res.status_code == 201
    tr_id = tr_res.json()["id"]

    # 4. Check initial payment status
    status_res = await auth_client.get(f"/api/v1/tax-returns/{tr_id}/payment/status")
    assert status_res.status_code == 200
    assert status_res.json()["payment_status"] == "pending"
    assert status_res.json()["is_paid"] is False

    # 5. Initiate checkout for CHF 39
    checkout_res = await auth_client.post(
        f"/api/v1/tax-returns/{tr_id}/payment/checkout",
        json={"method": "twint"},
    )
    assert checkout_res.status_code == 200
    assert checkout_res.json()["amount_chf"] == 39.0
    assert checkout_res.json()["method"] == "twint"

    # 6. Confirm payment
    confirm_res = await auth_client.post(
        f"/api/v1/tax-returns/{tr_id}/payment/confirm",
        json={"method": "twint"},
    )
    assert confirm_res.status_code == 200
    assert confirm_res.json()["status"] == "paid"
    assert confirm_res.json()["amount_chf"] == 39.0

    # 7. Check final payment status
    final_status = await auth_client.get(f"/api/v1/tax-returns/{tr_id}/payment/status")
    assert final_status.json()["is_paid"] is True
    assert final_status.json()["payment_method"] == "twint"
