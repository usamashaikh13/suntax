"""
Unit tests for SunTax Tax Tips Service & Endpoint (Addendum 1 tax_tips_de.json).
Verifies:
  - Max 3 tips displayed
  - Priority + estimated savings sorting
  - Non-guaranteed approximate wording ('ca.' or 'bis zu')
  - Strict gating: 'verify_before_release: true' tips stay hidden
  - Regulatory warnings present (home_office_room, no_receipt, private_costs)
  - English and German language localization
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from types import SimpleNamespace as NS

from app.models.tax_return import TaxReturn
from app.models.tax_profile import TaxProfile
from app.models.user import User
from app.services.tax_tips_service import tax_tips_service


def test_tax_tips_service_strict_display_and_gating_rules():
    """Verify max 3 tips, verify_before_release gating, and savings wording."""
    tr = NS(canton_code="ZH", tax_year=2025)
    prof = NS(
        personal_data={"marital_status": "single", "children_count": 0},
        income_data={"net_salary": 85000, "employment_income": 85000},
        deductions_data={"pillar3a_total": 2000, "commute_mode": "car"},
        wealth_data={"has_home": True, "bank_accounts": [{"balance": 10000}]},
    )
    res_de = tax_tips_service.get_tips_for_tax_return(tr, prof, lang="de")

    # 1. Max 3 tips
    assert len(res_de["tips"]) <= 3

    # 2. verify_before_release: true must NOT be returned
    tip_ids = [t["id"] for t in res_de["tips"]]
    assert "pillar3a_late_payment" not in tip_ids
    assert "property_maintenance" not in tip_ids

    # 3. Sorting: priority 1 should precede priority 2/3
    priorities = [t["priority"] for t in res_de["tips"]]
    assert priorities == sorted(priorities)

    # 4. Approximate wording ('ca.' or 'bis zu')
    for t in res_de["tips"]:
        if t["saving_display"]:
            assert any(w in t["saving_display"] for w in ("ca.", "bis zu"))
            assert "garantiert" not in t["saving_display"].lower()

    # 5. Regulatory warnings present
    assert len(res_de["warnings"]) == 3
    warning_ids = [w["id"] for w in res_de["warnings"]]
    assert "home_office_room" in warning_ids
    assert "no_receipt" in warning_ids
    assert "private_costs" in warning_ids

    # 6. English localization
    res_en = tax_tips_service.get_tips_for_tax_return(tr, prof, lang="en")
    assert res_en["language"] == "en"
    for t in res_en["tips"]:
        if t["id"] == "pillar3a":
            assert t["title"] == "Pillar 3a"
            assert "Pillar 3a" in t["text"] or "December 31" in t["text"]


@pytest.mark.asyncio
async def test_tax_tips_api_endpoint(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
):
    """Verify GET /api/v1/tax-returns/{id}/tax-tips endpoint."""
    import uuid

    tr = TaxReturn(
        id=str(uuid.uuid4()),
        user_id=str(test_user.id),
        canton_code="ZH",
        municipality_code="261",
        municipality_name="Zürich",
        tax_year=2025,
        status="draft",
    )
    db_session.add(tr)

    prof = TaxProfile(
        id=str(uuid.uuid4()),
        tax_return_id=str(tr.id),
        personal_data={"marital_status": "single"},
        income_data={"employment_income": 90000},
        deductions_data={"pillar3a": 3000},
        wealth_data={},
        liabilities_data={},
    )
    db_session.add(prof)
    await db_session.commit()

    resp = await auth_client.get(f"/api/v1/tax-returns/{tr.id}/tax-tips?lang=de")
    assert resp.status_code == 200
    data = resp.json()
    assert "tips" in data
    assert "warnings" in data
    assert len(data["tips"]) <= 3
    assert not any(t.get("verify_before_release") for t in data["tips"])
