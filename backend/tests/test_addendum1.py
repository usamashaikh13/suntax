"""
Comprehensive verification tests for SunTax — Developer Guide Addendum 1 (Sections 1–7).
Covers:
  1. Brand name & identity in one centralized config (brand_config.json / Settings / exports / emails)
  2. Canton availability rollout ('available' vs 'coming_soon'), PLZ checks, waitlist & payment block
  3. 2025 + 2026 delta rules (federal car km rate 0.70 -> 0.75, ZH/AG/SZ/SO/VS deltas, Pillar 3a catch-up)
  4. Receipt rules as data (required vs keep_only, annexes, missing personal data)
  5. 14 Step-3 question cards catalogue
  6. Consolidated German i18n dictionary (app_texts_de.json)
  7. «So viel sparst du» true counterfactual savings across cantonal + municipal + federal taxes
"""
from __future__ import annotations

import json
import uuid
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace as NS

import fitz
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.tax_calculation import TaxCalculation
from app.models.tax_profile import TaxProfile
from app.models.tax_return import TaxReturn
from app.models.user import User
from app.services.canton_transmission import get_transmission_adapter
from app.services.pdf_export_service import generate_tax_return_pdf
from app.services.rules_data_service import RulesDataService, rules_data_service
from app.services.tax_engine_service import (
    MaritalStatus,
    TaxCalculationEngine,
    TaxProfile as EngineTaxProfile,
    TaxRuleLoader,
)
from app.services.xml_export_service import generate_ech_xml


# ── § 1 Brand Name Centralization ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_brand_config_centralization_overrides_everywhere(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
):
    """Changing central brand settings updates API config, German UI dict, PDF, and XML cleanly."""
    monkeypatch.setattr(settings, "BRAND_NAME", "HelvetiaSteuer")
    monkeypatch.setattr(settings, "BRAND_SHORT_LEFT", "Helvetia")
    monkeypatch.setattr(settings, "BRAND_SHORT_RIGHT", "Steuer")
    monkeypatch.setattr(settings, "BRAND_DOMAIN", "helvetiasteuer.ch")
    monkeypatch.setattr(settings, "SUPPORT_EMAIL", "support@helvetiasteuer.ch")
    monkeypatch.setattr(settings, "SOURCE_DESCRIPTION", "HelvetiaSteuer 2.0")
    monkeypatch.setattr(settings, "TRANSACTION_PREFIX", "HLV")

    # 1. /config/brand endpoint
    brand_resp = await client.get("/api/v1/config/brand")
    assert brand_resp.status_code == 200
    bdata = brand_resp.json()
    assert bdata["brand_name"] == "HelvetiaSteuer"
    assert bdata["support_email"] == "support@helvetiasteuer.ch"
    assert bdata["source_description"] == "HelvetiaSteuer 2.0"

    # 2. /i18n/de endpoint
    i18n_resp = await client.get("/api/v1/i18n/de")
    assert i18n_resp.status_code == 200
    de_txt = json.dumps(i18n_resp.json())
    assert "HelvetiaSteuer" in de_txt
    assert "SunTax" not in de_txt

    # 3. PDF Export
    tr = NS(id="brand-test-1", canton_code="ZH", tax_year=2025, municipality_name="Zürich")
    prof = NS(
        personal_data={
            "first_name": "Max",
            "last_name": "Muster",
            "ahv_number": "756.9217.0769.85",
            "date_of_birth": "1988-04-10",
            "address_street": "Bahnhofstrasse 1",
            "address_zip": "8001",
            "address_city": "Zürich",
        },
        income_data={"employment_income": 95000},
        deductions_data={"pillar3a_contributions": 7258},
        wealth_data={"bank_accounts": [{"bank_name": "ZKB", "balance_chf": 25000}]},
        liabilities_data={},
    )
    calc = NS(
        calculation_details={
            "taxable_income": 80000,
            "taxable_wealth": 25000,
            "federal_income_tax": 1100,
            "cantonal_income_tax": 4200,
            "municipal_income_tax": 4998,
            "total_tax": 10298,
            "canton_deductions_list": [{"code": "pillar3a", "amount": 7258}],
            "federal_deductions_list": [{"code": "pillar3a", "amount": 7258}],
        }
    )
    pdf_bytes = generate_tax_return_pdf(tr, prof, calc)
    with fitz.open(stream=pdf_bytes, filetype="pdf") as pdf:
        pdf_text = "\n".join(page.get_text() for page in pdf)
    assert "HelvetiaSteuer" in pdf_text
    assert "SunTax" not in pdf_text

    # 4. XML Export
    xml_out = generate_ech_xml(tr, prof, calc)
    assert "<sourceDescription>HelvetiaSteuer 2.0</sourceDescription>" in xml_out
    assert "<transactionNumber>HLV-2025-" in xml_out
    assert "SunTax" not in xml_out
    assert "SUNTAX" not in xml_out


# ── § 2 Canton Rollout Flags, PLZ Check, Waitlist & No Payment ────────────────


@pytest.mark.asyncio
async def test_canton_rollout_plz_waitlist_and_payment_block(
    client: AsyncClient,
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
):
    """Verify ZH is available, BE is coming_soon, waitlist persists, and payment is blocked for coming_soon."""
    # 1. All 26 cantons in list, ZH available, others coming_soon
    c_resp = await client.get("/api/v1/cantons")
    assert c_resp.status_code == 200
    cantons = c_resp.json()
    assert len(cantons) == 26
    by_code = {c["code"]: c for c in cantons}
    assert by_code["ZH"]["availability"]["2025"] == "available"
    assert by_code["ZH"]["availability"]["2026"] == "available"
    assert by_code["BE"]["availability"]["2025"] == "coming_soon"

    # 2. PLZ lookup reflects rollout flags
    plz_zh = await client.get("/api/v1/cantons/plz/8001")
    assert plz_zh.status_code == 200
    assert plz_zh.json()["canton"] == "ZH"
    assert plz_zh.json()["availability"]["2025"] == "available"

    plz_be = await client.get("/api/v1/cantons/plz/3011")
    assert plz_be.status_code == 200
    assert plz_be.json()["canton"] == "BE"
    assert plz_be.json()["availability"]["2025"] == "coming_soon"

    # 3. Waitlist signup stores email + canton
    wl_email = f"waitlist_{uuid.uuid4().hex[:6]}@example.ch"
    wl_resp = await client.post(
        "/api/v1/waitlist",
        json={"email": wl_email, "canton_code": "BE", "tax_year": 2025, "postal_code": "3011"},
    )
    assert wl_resp.status_code == 201
    assert wl_resp.json()["status"] == "subscribed"
    # Second request is idempotent
    wl_resp2 = await client.post(
        "/api/v1/waitlist",
        json={"email": wl_email, "canton_code": "BE", "tax_year": 2025, "postal_code": "3011"},
    )
    assert wl_resp2.status_code == 201
    assert wl_resp2.json()["status"] == "already_registered"

    # 4. Payment endpoints block coming_soon canton (no payment!)
    be_tr = TaxReturn(
        id=str(uuid.uuid4()),
        user_id=str(test_user.id),
        canton_code="BE",
        municipality_code="351",
        municipality_name="Bern",
        tax_year=2025,
        status="draft",
    )
    db_session.add(be_tr)
    await db_session.commit()

    chk = await auth_client.post(f"/api/v1/tax-returns/{be_tr.id}/payment/checkout", json={"method": "twint"})
    assert chk.status_code == 400
    assert "kommt bald" in chk.json()["detail"].lower()

    sim = await auth_client.post(f"/api/v1/tax-returns/{be_tr.id}/payment/sandbox-simulate", json={"method": "twint"})
    assert sim.status_code == 400
    assert "kommt bald" in sim.json()["detail"].lower()


@pytest.mark.asyncio
async def test_canton_data_only_switch_enables_transmission_without_code_change(tmp_path: Path):
    """Switching a canton to 'available' in rules_2025_2026.json enables its adapter automatically."""
    raw = json.loads((Path(__file__).resolve().parents[1] / "app/data/rules_2025_2026.json").read_text(encoding="utf-8"))
    raw["kantone"]["BE"]["availability"] = {"2025": "available", "2026": "available"}
    (tmp_path / "rules_2025_2026.json").write_text(json.dumps(raw), encoding="utf-8")

    custom_svc = RulesDataService(data_dir=tmp_path)
    assert custom_svc.is_canton_available("BE", 2025) is True

    adapter = get_transmission_adapter("BE", 2025, rules_svc=custom_svc)
    tr = NS(id="tr-be", canton_code="BE", tax_year=2025)
    res = await adapter.prepare_or_transmit(tr, "<xml/>", b"%PDF", [])
    assert res.accepted is True
    assert res.canton_code == "BE"
    assert res.channel == "ech0119_portal_be"


# ── § 3 Rules 2025 + 2026 Delta & Pillar 3a Catch-up ──────────────────────────


def test_rules_2025_2026_deltas_and_car_rate():
    """Verify federal car km rate 0.70 (2025) -> 0.75 (2026), y2026 cantonal changes, and fallback."""
    assert rules_data_service.get_federal_car_rate(2025) == Decimal("0.70")
    assert rules_data_service.get_federal_car_rate(2026) == Decimal("0.75")

    # Confirmed changed in 2026
    assert rules_data_service.get_canton_rules("ZH", 2025)["kid"] == 9300
    assert rules_data_service.get_canton_rules("ZH", 2026)["kid"] == 9400
    assert rules_data_service.get_canton_rules("AG", 2025)["y2026_confirmed"] is True
    # Confirmed unchanged (UR uses 2025 values cleanly)
    assert rules_data_service.get_canton_rules("UR", 2026)["y2026_confirmed"] is True
    # Unconfirmed canton reuses 2025 base cleanly
    assert rules_data_service.get_canton_rules("TG", 2026)["kid"] == rules_data_service.get_canton_rules("TG", 2025)["kid"]

    # Engine applies 0.75/km federal rate in 2026 vs 0.70/km in 2025 and Pillar 3a catch-up only in 2026
    engine = TaxCalculationEngine()
    rules_25 = TaxRuleLoader().load_from_files("ZH", "261", 2025)
    rules_26 = TaxRuleLoader().load_from_files("ZH", "261", 2026)
    base_kwargs = dict(
        tax_return_id="t-26",
        canton_code="ZH",
        municipality_code="261",
        marital_status=MaritalStatus.SINGLE,
        gross_employment_income=Decimal("100000"),
        net_salary=Decimal("90000"),
        commute_mode="car",
        commute_km_per_day=Decimal("15"),
        working_days=220,
        pillar3a_contribution=Decimal("7258"),
        pillar3a_catchup=Decimal("5000"),
    )
    res_25 = engine.calculate(EngineTaxProfile(tax_year=2025, **base_kwargs), rules_25)
    res_26 = engine.calculate(EngineTaxProfile(tax_year=2026, **base_kwargs), rules_26)

    assert res_25.deductions_applied.pillar3a_catchup == Decimal("0")
    assert res_26.deductions_applied.pillar3a_catchup == Decimal("5000")
    # 15 km * 220 days * 0.75 = 2475 vs * 0.70 = 2310 in federal deductions list
    fed_comm_25 = next(d["amount"] for d in res_25.federal_deductions_list if d["code"] == "commute_car")
    fed_comm_26 = next(d["amount"] for d in res_26.federal_deductions_list if d["code"] == "commute_car")
    assert Decimal(str(fed_comm_26)) > Decimal(str(fed_comm_25))


# ── § 4 Receipt Rules, § 5 Questions Catalogue, § 6 Overview ──────────────────


@pytest.mark.asyncio
async def test_receipts_questions_and_overview_endpoints(
    client: AsyncClient,
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
):
    # 1. Overview endpoint (all 26 cantons + 2026 federal car rate)
    ov = await client.get("/api/v1/rules/cantons-overview?tax_year=2026")
    assert ov.status_code == 200
    ov_data = ov.json()
    assert len(ov_data["cantons"]) == 26
    assert ov_data["federal"]["car_rate_per_km"] == 0.75
    assert ov_data["federal"]["pillar3a_catchup_max"] == 7258

    # 2. Questions catalogue (14 Step-3 cards + German missing hints)
    q_resp = await client.get("/api/v1/rules/questions?tax_year=2026&canton=ZH")
    assert q_resp.status_code == 200
    cards = q_resp.json()["cards"]
    assert len(cards) == 14
    assert all(c.get("missing_hint") for c in cards if c["id"] != "q06_partner2_commute")

    # 3. Receipt rules raw + evaluated on tax return
    r_resp = await client.get("/api/v1/rules/receipts?canton=ZH&tax_year=2025")
    assert r_resp.status_code == 200
    r_data = r_resp.json()
    assert r_data["field_rules"]["p3a"]["requirement"] == "required"
    assert r_data["field_rules"]["prem"]["requirement"] == "keep_only"

    tr = TaxReturn(
        id=str(uuid.uuid4()),
        user_id=str(test_user.id),
        canton_code="ZH",
        municipality_code="261",
        municipality_name="Zürich",
        tax_year=2025,
        status="draft",
    )
    prof = TaxProfile(
        id=str(uuid.uuid4()),
        tax_return_id=tr.id,
        personal_data={"first_name": "Max", "last_name": "Muster"},
        income_data={"employment_income": 90000},
        deductions_data={"pillar3a_contributions": 7258, "health_insurance_premiums": 3600},
    )
    db_session.add_all([tr, prof])
    await db_session.commit()

    chk_resp = await auth_client.get(f"/api/v1/tax-returns/{tr.id}/receipt-check")
    assert chk_resp.status_code == 200
    chk = chk_resp.json()
    req_keys = {x["key"] for x in chk["required_missing"]}
    keep_keys = {x["key"] for x in chk["keep_only_items"]}
    assert "p3a" in req_keys
    assert "lohn" in req_keys
    assert "prem" in keep_keys
    assert chk["is_submittable"] is False


# ── § 7 «So viel sparst du» Counterfactual Invariants ─────────────────────────


def test_savings_analysis_counterfactual_invariants_and_no_flat_pct():
    """
    Verify Addendum 1 § 7 invariants across cantons and incomes:
      - X >= 0 for every deduction
      - X == 0 when a deduction input is 0
      - Y >= max(X)
      - Savings rate is NOT a fixed flat percentage (higher marginal bracket saves more per CHF)
    """
    engine = TaxCalculationEngine()
    rules_zh = TaxRuleLoader().load_from_files("ZH", "261", 2025)

    p_low = EngineTaxProfile(
        tax_return_id="sav-low",
        tax_year=2025,
        canton_code="ZH",
        municipality_code="261",
        marital_status=MaritalStatus.SINGLE,
        gross_employment_income=Decimal("45000"),
        net_salary=Decimal("40000"),
        pillar3a_contribution=Decimal("7258"),
        health_insurance_premium_paid=Decimal("2600"),
        donations=Decimal("0"),
        medical_expenses_paid=Decimal("0"),
        education_expenses=Decimal("0"),
    )
    p_high = EngineTaxProfile(
        tax_return_id="sav-high",
        tax_year=2025,
        canton_code="ZH",
        municipality_code="261",
        marital_status=MaritalStatus.SINGLE,
        gross_employment_income=Decimal("220000"),
        net_salary=Decimal("200000"),
        pillar3a_contribution=Decimal("7258"),
        health_insurance_premium_paid=Decimal("2600"),
        education_expenses=Decimal("8000"),
        donations=Decimal("3000"),
        interest_on_debts=Decimal("2000"),
        commuting_expense_claimed=Decimal("3000"),
    )

    res_low = engine.calculate(p_low, rules_zh)
    res_high = engine.calculate(p_high, rules_zh)

    sav_low = res_low.savings_analysis
    sav_high = res_high.savings_analysis
    assert sav_low is not None and sav_high is not None

    # Mandatory disclaimers and structure
    assert "ca. CHF" in sav_high["total_savings_display"]
    assert "Dank deinen Abzügen sparst du ca. CHF" in sav_high["summary_text"]
    assert "Unverbindliche Schätzung" in sav_high["disclaimer"]

    # Zero deductions must yield exactly 0 savings
    assert sav_low["by_deduction"]["donations"] == 0
    assert sav_low["by_deduction"]["medical_expenses"] == 0
    assert sav_low["by_deduction"]["education"] == 0

    # All X >= 0 and Y >= max(X)
    for sav in (sav_low, sav_high):
        vals = list(sav["by_deduction"].values())
        assert all(v >= 0 for v in vals)
        assert sav["total_savings_chf"] >= max(vals)

    # True progressive counterfactual check: identical CHF 7'258 Pillar 3a saves strictly more at CHF 220k than CHF 45k
    assert sav_high["by_deduction"]["pillar3a"] > sav_low["by_deduction"]["pillar3a"]

    # Canton ZH 2025 with exact BFS 261 has exact multipliers; coming_soon/fallback yields notice
    assert res_high.canton_has_exact_multipliers is True
    assert sav_high["rough_estimate_notice"] is None

    rules_be = TaxRuleLoader().load_from_files("BE", "351", 2025)
    res_be = engine.calculate(
        EngineTaxProfile(
            tax_return_id="sav-be",
            tax_year=2025,
            canton_code="BE",
            municipality_code="351",
            marital_status=MaritalStatus.SINGLE,
            gross_employment_income=Decimal("100000"),
            pillar3a_contribution=Decimal("7258"),
        ),
        rules_be,
    )
    assert res_be.canton_has_exact_multipliers is False
    assert res_be.savings_analysis["rough_estimate_notice"] is not None
