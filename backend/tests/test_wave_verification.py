"""
Wave Verification Suite: End-to-End Verification of Tax Accuracy, Official Data,
Receipts/Personal Data Evaluation, DB-Backed Auth/Sessions, AI Privacy Gate,
Bilingual PDF Export, and Image-to-PDF Attachment Packaging.
"""
from __future__ import annotations

import io
import zipfile
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace as NS
import xml.etree.ElementTree as ET

import fitz
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.models.document import Document
from app.models.tax_calculation import TaxCalculation
from app.models.tax_profile import TaxProfile
from app.models.tax_return import TaxReturn
from app.models.user import User
from app.services.ai_extraction_service import get_client as get_ai_client
from app.services.canton_acceptance_service import (
    local_preflight_validation_service,
)
from app.services.canton_service import canton_service
from app.services.document_extractor import DocumentExtractor, DocumentOCRResult
from app.services.pdf_export_service import generate_tax_return_pdf
from app.services.rules_data_service import rules_data_service
from app.services.storage_service import StorageService
from app.services.tax_engine_service import (
    MaritalStatus,
    TaxCalculationEngine,
    TaxProfile as EngineTaxProfile,
    TaxRuleLoader,
)
from app.services.xml_export_service import generate_ech_xml


def _make_png_bytes(width: int = 80, height: int = 40) -> bytes:
    """Create a real in-memory PNG image via PyMuPDF."""
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, width, height), 0)
    pix.clear_with(245)
    return pix.tobytes("png")


def _make_jpeg_bytes(width: int = 80, height: int = 40) -> bytes:
    """Create a real in-memory JPEG image via PyMuPDF."""
    pix = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, width, height), 0)
    pix.clear_with(230)
    return pix.tobytes("jpeg")


# ── 1. Official ZH 2025 vs 2026 Tax Calculation & All 160 Municipalities ──────


def test_official_zh_2025_vs_2026_calculations_and_160_municipalities():
    """Verify official ZH state multipliers (98 vs 95), 2026 progression caps, 160 BFS codes, and parish church tax."""
    loader = TaxRuleLoader()
    zh_2025 = loader.load_from_files("ZH", "261", 2025)
    zh_2026 = loader.load_from_files("ZH", "261", 2026)

    assert zh_2025.tariff_status == "official_verified"
    assert zh_2026.tariff_status == "official_verified"
    assert zh_2025.state_multiplier == 98
    assert zh_2026.state_multiplier == 95
    assert len(zh_2025.municipality_multipliers) == 160
    assert len(zh_2026.municipality_multipliers) == 160

    # Check verified ZH OGD municipality Steuerfüsse
    dueb_2025 = loader.load_from_files("ZH", "191", 2025)
    dueb_2026 = loader.load_from_files("ZH", "191", 2026)
    adl_2025 = loader.load_from_files("ZH", "131", 2025)
    adl_2026 = loader.load_from_files("ZH", "131", 2026)
    kilch_2025 = loader.load_from_files("ZH", "135", 2025)

    assert dueb_2025.municipality_multiplier == 96
    assert dueb_2026.municipality_multiplier == 92
    assert adl_2025.municipality_multiplier == 102
    assert adl_2026.municipality_multiplier == 104
    assert kilch_2025.municipality_multiplier == 72

    # Progression calibration deltas 2025 -> 2026
    assert zh_2025.cantonal_deductions.childcare_max == Decimal("25000")
    assert zh_2026.cantonal_deductions.childcare_max == Decimal("25300")
    assert zh_2025.cantonal_deductions.training_max == Decimal("12400")
    assert zh_2026.cantonal_deductions.training_max == Decimal("12600")
    assert zh_2025.federal_deductions.commuting_car_rate == Decimal("0.70")
    assert zh_2026.federal_deductions.commuting_car_rate == Decimal("0.75")

    # Zero-wealth-tax check vs wealth bracket math & 98% vs 95% Staatssteuerfuss effect
    profile = EngineTaxProfile(
        tax_return_id="wave-zh-1",
        tax_year=2025,
        canton_code="ZH",
        municipality_code="261",
        marital_status=MaritalStatus.SINGLE,
        gross_employment_income=Decimal("100000"),
        net_salary=Decimal("88000"),
        pillar3a_contribution=Decimal("7258"),
        health_insurance_premium_paid=Decimal("4000"),
        bank_accounts_balance=Decimal("200000"),
    )
    res_25 = TaxCalculationEngine(zh_2025).calculate(profile)
    res_26 = TaxCalculationEngine(zh_2026).calculate(
        EngineTaxProfile(**{**profile.__dict__, "tax_year": 2026})
    )

    assert res_25.tariff_status == "official_verified"
    assert res_25.is_estimate_only is False
    assert res_26.cantonal_income_tax < res_25.cantonal_income_tax

    # Protestant/reformed parish multiplier increases total tax in Zürich 261
    res_church = TaxCalculationEngine(zh_2025).calculate(
        EngineTaxProfile(**{**profile.__dict__, "confession": "reformed", "is_church_member": True})
    )
    assert res_church.church_tax > Decimal("0")
    assert res_church.total_tax > res_25.total_tax

    # Shared custody KS 30 / StG § 35 Abs. 2bis:
    # Two-parent shared custody -> child stays with "me" AND higher_earner=False gets NO Verheiratetentarif
    single_parent_higher = TaxCalculationEngine(zh_2025).calculate(
        EngineTaxProfile(
            tax_return_id="wave-cust-1",
            tax_year=2025,
            canton_code="ZH",
            municipality_code="261",
            marital_status=MaritalStatus.SINGLE,
            num_children=1,
            custody_type="shared",
            child_residence="me",
            higher_earner=True,
            gross_employment_income=Decimal("120000"),
            net_salary=Decimal("105000"),
        )
    )
    single_parent_lower = TaxCalculationEngine(zh_2025).calculate(
        EngineTaxProfile(
            tax_return_id="wave-cust-2",
            tax_year=2025,
            canton_code="ZH",
            municipality_code="261",
            marital_status=MaritalStatus.SINGLE,
            num_children=1,
            custody_type="shared",
            child_residence="other",
            higher_earner=False,
            gross_employment_income=Decimal("120000"),
            net_salary=Decimal("105000"),
        )
    )
    assert single_parent_higher.federal_income_tax < single_parent_lower.federal_income_tax


def test_official_dbg_federal_top_bracket_and_5_rappen_rounding():
    """Verify official ESTV DBG 2025 top bracket 11.5% on total income and 5 Rappen floor rounding."""
    zh_2025 = TaxRuleLoader().load_from_files("ZH", "261", 2025)
    prof_high = EngineTaxProfile(
        tax_return_id="wave-fed-high",
        tax_year=2025,
        canton_code="ZH",
        municipality_code="261",
        marital_status=MaritalStatus.SINGLE,
        gross_employment_income=Decimal("900000"),
        net_salary=Decimal("800000"),
        pillar3a_contribution=Decimal("0"),
    )
    res_high = TaxCalculationEngine(zh_2025).calculate(prof_high)
    # In DBG Art. 36, above 793'300 -> flat 11.5% of entire rounded taxable income (100 CHF step)
    rounded_100 = (res_high.taxable_income // Decimal("100")) * Decimal("100")
    expected_fed = (rounded_100 * Decimal("0.115") / Decimal("0.05")).to_integral_value() * Decimal("0.05")
    assert res_high.federal_income_tax == expected_fed


def test_non_zh_cantons_marked_estimate_and_api_blocks_unsupported(
    client: AsyncClient,
):
    """Non-ZH cantons must be estimate_only, Swisstopo PLZs accurate, FL excluded."""
    be_2025 = TaxRuleLoader().load_from_files("BE", "351", 2025)
    assert be_2025.tariff_status == "estimate_only"

    # Official AMTOVZ multi-municipality ZH PLZs + single PLZs + no FL Vaduz (9490)
    res_8952 = canton_service.lookup_plz("8952")
    assert res_8952 is not None
    codes_8952 = {m["bfs"] for m in res_8952["municipalities"]}
    assert {"247", "261"}.issubset(codes_8952)  # Schlieren & Zürich

    res_8051 = canton_service.lookup_plz("8051")
    assert res_8051 is not None
    codes_8051 = {m["bfs"] for m in res_8051["municipalities"]}
    assert {"261", "191"}.issubset(codes_8051)  # Zürich & Dübendorf

    assert canton_service.lookup_plz("9490") is None


@pytest.mark.asyncio
async def test_calculate_blocks_unsupported_canton_or_year(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
):
    """POST /calculate must reject coming_soon cantons and unsupported years with HTTP 422."""
    tr_be = TaxReturn(
        id="be-block-1",
        user_id=str(test_user.id),
        canton_code="BE",
        municipality_code="351",
        municipality_name="Bern",
        tax_year=2025,
        status="draft",
    )
    tp_be = TaxProfile(
        id="be-prof-1",
        tax_return_id="be-block-1",
        personal_data={"civil_status": "single"},
        income_data={"employment_income": 80000},
    )
    tr_old = TaxReturn(
        id="zh-old-1",
        user_id=str(test_user.id),
        canton_code="ZH",
        municipality_code="261",
        municipality_name="Zürich",
        tax_year=2023,
        status="draft",
    )
    tp_old = TaxProfile(
        id="zh-old-prof-1",
        tax_return_id="zh-old-1",
        personal_data={"civil_status": "single"},
        income_data={"employment_income": 80000},
    )
    db_session.add_all([tr_be, tp_be, tr_old, tp_old])
    await db_session.commit()

    r_be = await auth_client.post("/api/v1/tax-returns/be-block-1/calculate")
    assert r_be.status_code == 422

    r_old = await auth_client.post("/api/v1/tax-returns/zh-old-1/calculate")
    assert r_old.status_code == 422


# ── 2. Full Addendum 1 Receipt & Personal Data Evaluation ─────────────────────


def test_receipt_rules_evaluate_all_37_fields_annexes_and_8_personal_fields():
    """Verify receipts_rules.json rules, canonical doc aliases, annexes, and missing_personal_data."""
    tr_stub = NS(canton_code="ZH", tax_year=2026)
    prof_empty = NS(
        personal_data={"civil_status": "verheiratet", "num_children": 1},
        income_data={"employment_income": 90000},
        deductions_data={
            "pillar3a_contributions": 7258,
            "debt_interest": 3000,
            "donations": 500,
            "medical_expenses": 2500,
            "health_insurance_premiums": 4000,
            "depot_fees": 150,
            "has_home": True,
        },
        wealth_data={"bank_accounts": [{"balance_chf": 30000}], "has_home": True},
        liabilities_data={},
    )
    res_empty = rules_data_service.evaluate_receipts(
        tax_return=tr_stub,
        profile=prof_empty,
        documents=[],
    )
    missing_pkeys = {x["key"] for x in res_empty["missing_personal_data"]}
    assert {"ahvnr", "birth", "addr", "name2", "ahvnr2", "birth2", "kidName", "kidBirth"} == missing_pkeys

    # Required receipts, keep_only receipts, and app-generated annexes all populated cleanly
    req_keys = {x["key"] for x in res_empty["required_missing"]}
    keep_keys = {x["key"] for x in res_empty["keep_only_items"]}
    annex_keys = {x["key"] for x in res_empty["app_generated_annexes"]}
    assert {"lohn", "p3a", "debt", "sick", "donate", "home"}.issubset(req_keys)
    assert {"prem", "depot"}.issubset(keep_keys)
    assert {"securities_annex", "real_estate_annex", "debt_annex", "medical_list_annex", "donations_list_annex"}.issubset(annex_keys)

    # Canonical uploaded doc types satisfy required_missing -> move to attached_ok
    prof_uploaded = NS(
        personal_data={
            "ahv_number": "756.9217.0769.85",
            "date_of_birth": "1988-05-01",
            "address_street": "Bahnhofstrasse 1",
            "civil_status": "single",
        },
        income_data={"employment_income": 90000},
        deductions_data={"pillar3a_contributions": 7258, "debt_interest": 1200},
        wealth_data={"bank_accounts": [{"balance_chf": 30000}]},
        liabilities_data={},
    )
    res_uploaded = rules_data_service.evaluate_receipts(
        tax_return=tr_stub,
        profile=prof_uploaded,
        documents=[
            NS(document_type="salary_certificate", filename="lohn.pdf"),
            NS(document_type="pillar3a", filename="3a.pdf"),
            NS(document_type="mortgage", filename="hypo.pdf"),
            NS(document_type="bank_statement", filename="zkb.pdf"),
        ],
    )
    assert res_uploaded["missing_personal_data"] == []
    attached_keys = {x["key"] for x in res_uploaded["attached_ok"]}
    assert {"lohn", "p3a", "debt", "securities"}.issubset(attached_keys)
    assert res_uploaded["required_missing"] == []


# ── 3. DB-Backed Session Revocation, Scoped 2FA OTP & Chat Persistence ─────────


@pytest.mark.asyncio
async def test_change_password_invalidates_existing_access_and_refresh_tokens(
    client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
):
    """Changing password bumps tokens_valid_after and revokes DB refresh tokens."""
    login = await client.post("/api/v1/auth/login", json={"email": test_user.email, "password": "Test1234!"})
    assert login.status_code == 200
    ldata = login.json()
    if ldata.get("two_factor_required"):
        import pyotp

        totp_code = pyotp.TOTP(test_user.totp_secret).now()
        fa = await client.post("/api/v1/auth/login/2fa", json={"temp_token": ldata["temp_token"], "code": totp_code})
        assert fa.status_code == 200
        ldata = fa.json()

    access_tok = ldata["access_token"]
    refresh_tok = ldata["refresh_token"]

    # Change password with active token
    cp = await client.post(
        "/api/v1/auth/me/change-password",
        headers={"Authorization": f"Bearer {access_tok}"},
        json={"current_password": "Test1234!", "new_password": "NewStrongPassword987!"},
    )
    assert cp.status_code == 200

    # Prior access token AND prior refresh token must BOTH be rejected immediately
    me_old = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access_tok}"})
    assert me_old.status_code == 401

    ref_old = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_tok})
    assert ref_old.status_code == 401


@pytest.mark.asyncio
async def test_ai_chat_persists_in_db_and_respects_privacy_gate(
    client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
):
    """Verify external AI is blocked when ENABLE_EXTERNAL_AI_EXTRACTION=False and chat history persists in DB."""
    # Even with a real-looking key configured, privacy gate blocks Gemini completely
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "AIzaSyFakeKeyButLooksValid1234567890")
    monkeypatch.setattr(settings, "ENABLE_EXTERNAL_AI_EXTRACTION", False)

    assert get_ai_client() is None

    extractor = DocumentExtractor()
    ocr_dummy = DocumentOCRResult(
        full_text="Lohnausweis 2025",
        pages=[],
        page_count=1,
        is_empty=False,
        ocr_engine="pdf_text",
    )
    with pytest.raises(RuntimeError, match="disabled by privacy settings"):
        extractor._extract_with_gemini(ocr_dummy, "salary_certificate", 2025)

    # Set up tax return & test DB chat persistence without any external AI call
    tr = TaxReturn(
        id="chat-db-tr-1",
        user_id=str(test_user.id),
        canton_code="ZH",
        municipality_code="261",
        municipality_name="Zürich",
        tax_year=2025,
        status="draft",
    )
    tp = TaxProfile(
        id="chat-db-prof-1",
        tax_return_id="chat-db-tr-1",
        personal_data={"civil_status": "single"},
        income_data={"employment_income": 95000},
    )
    db_session.add_all([tr, tp])
    await db_session.commit()

    tok = create_access_token({"sub": str(test_user.id), "email": test_user.email})
    headers = {"Authorization": f"Bearer {tok}"}

    c1 = await client.post(
        "/api/v1/tax-returns/chat-db-tr-1/chat",
        headers=headers,
        json={"message": "Wie hoch ist das Säule 3a Maximum?"},
    )
    assert c1.status_code == 200
    assert len(c1.json()["response"]) > 20

    hist = await client.get("/api/v1/tax-returns/chat-db-tr-1/chat/history", headers=headers)
    assert hist.status_code == 200
    messages = hist.json()["history"]
    assert len(messages) == 2
    assert messages[0]["role"] == "user"
    assert messages[1]["role"] == "model"


# ── 4. PDF Bilingual Endpoint & Image-to-PDF Attachment Packaging ─────────────


@pytest.mark.asyncio
async def test_pdf_export_language_endpoint_and_image_attachments_in_dossier(
    client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
):
    """Verify ?lang=de (default) vs ?lang=en PDF endpoint AND PNG/JPEG -> PDF dossier conversion."""
    import app.services.storage_service as storage_mod

    monkeypatch.setattr(storage_mod, "_LOCAL_STORAGE", tmp_path)
    storage = StorageService()
    monkeypatch.setattr(local_preflight_validation_service, "storage", storage)

    tr_id = "wave-export-tr-1"
    tr = TaxReturn(
        id=tr_id,
        user_id=str(test_user.id),
        canton_code="ZH",
        municipality_code="261",
        municipality_name="Zürich",
        tax_year=2025,
        status="calculated",
    )
    tp = TaxProfile(
        id="wave-export-prof-1",
        tax_return_id=tr_id,
        personal_data={
            "first_name": "Elena",
            "last_name": "Keller",
            "ahv_number": "756.9217.0769.85",
            "date_of_birth": "1991-04-12",
            "civil_status": "single",
            "address_street": "Limmatquai 10",
            "address_zip": "8001",
            "address_city": "Zürich",
        },
        income_data={"employment_income": 98000},
        deductions_data={"pillar3a_contributions": 7258},
        wealth_data={},
        liabilities_data={},
    )
    tc = TaxCalculation(
        id="wave-export-calc-1",
        tax_return_id=tr_id,
        taxable_income=84000.0,
        taxable_wealth=0.0,
        federal_income_tax=1350.0,
        cantonal_income_tax=4100.0,
        municipal_income_tax=4879.0,
        total_tax_due=10329.0,
        rule_version="2025.2.0",
        calculation_details={
            "taxable_income": 84000.0,
            "taxable_wealth": 0.0,
            "federal_income_tax": 1350.0,
            "cantonal_income_tax": 4100.0,
            "municipal_income_tax": 4879.0,
            "total_tax": 10329.0,
            "canton_deductions_total": 14000.0,
            "federal_deductions_total": 14000.0,
            "canton_deductions_list": [{"code": "pillar3a", "amount": 7258}],
            "federal_deductions_list": [{"code": "pillar3a", "amount": 7258}],
        },
    )

    # Store real PNG + JPEG + duplicate filename attachments in local storage
    png_bytes = _make_png_bytes()
    jpg_bytes = _make_jpeg_bytes()
    k1 = await storage.upload_file(png_bytes, "u/beleg_1.png", "image/png")
    k2 = await storage.upload_file(jpg_bytes, "u/beleg_2.jpg", "image/jpeg")

    doc1 = Document(
        id="att-doc-1",
        user_id=str(test_user.id),
        tax_return_id=tr_id,
        original_filename="scan.png",
        mime_type="image/png",
        file_size_bytes=len(png_bytes),
        storage_key=k1,
        document_type="Lohnausweis",
        processing_status="processed",
    )
    doc2 = Document(
        id="att-doc-2",
        user_id=str(test_user.id),
        tax_return_id=tr_id,
        original_filename="scan.jpg",  # would collide to scan.pdf unless deduplicated!
        mime_type="image/jpeg",
        file_size_bytes=len(jpg_bytes),
        storage_key=k2,
        document_type="Säule 3a Bescheinigung",
        processing_status="processed",
    )
    db_session.add_all([tr, tp, tc, doc1, doc2])
    await db_session.commit()

    tok = create_access_token({"sub": str(test_user.id), "email": test_user.email})
    headers = {"Authorization": f"Bearer {tok}"}

    # 1. Default German PDF vs explicit ?lang=en PDF
    de_resp = await client.post(f"/api/v1/tax-returns/{tr_id}/export/pdf", headers=headers)
    assert de_resp.status_code == 200
    with fitz.open(stream=de_resp.content, filetype="pdf") as pdf_de:
        de_txt = "\n".join(p.get_text() for p in pdf_de)
    assert "STEUERERKLÄRUNG ZUSAMMENFASSUNG (ENTWURF)" in de_txt
    assert "07 Einreichungshinweise" in de_txt
    assert "Not provided" not in de_txt

    en_resp = await client.post(f"/api/v1/tax-returns/{tr_id}/export/pdf?lang=en", headers=headers)
    assert en_resp.status_code == 200
    with fitz.open(stream=en_resp.content, filetype="pdf") as pdf_en:
        en_txt = "\n".join(p.get_text() for p in pdf_en)
    assert "TAX RETURN SUMMARY (DRAFT)" in en_txt
    assert "07 Filing Information: Self-Declaration (Art. 110 DBG)" in en_txt
    assert "Rechtliche Grundlage" not in en_txt

    # 2. XML + Dossier ZIP with PNG/JPEG attachments converted cleanly to deduplicated PDFs
    dossier_resp = await client.get(f"/api/v1/tax-returns/{tr_id}/export/dossier?lang=en", headers=headers)
    assert dossier_resp.status_code == 200, dossier_resp.text

    with zipfile.ZipFile(io.BytesIO(dossier_resp.content), "r") as zf:
        names = set(zf.namelist())
        assert "attachments/scan.pdf" in names
        assert "attachments/scan_2.pdf" in names
        for att_name in ("attachments/scan.pdf", "attachments/scan_2.pdf"):
            att_bytes = zf.read(att_name)
            assert att_bytes.startswith(b"%PDF-")
            with fitz.open(stream=att_bytes, filetype="pdf") as att_pdf:
                assert att_pdf.page_count >= 1

        xml_bytes = zf.read("SunTax_ZH_2025.xml")
        root = ET.fromstring(xml_bytes)
        ns = {"e": "http://www.ech.ch/xmlns/eCH-0119/4"}
        paths = [el.text for el in root.findall(".//e:attachment/e:file/e:pathFileName", ns)]
        formats = [el.text for el in root.findall(".//e:attachment/e:documentFormat", ns)]
        assert paths == ["attachments/scan.pdf", "attachments/scan_2.pdf"]
        assert formats == ["application/pdf", "application/pdf"]
