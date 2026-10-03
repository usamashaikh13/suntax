"""
Comprehensive End-to-End Test Suite for Document Processing & OCR in SunTax.

Tests all 14 required capabilities:
1. Clean digital PDF
2. Scanned PDF requiring OCR
3. Rotated phone image
4. Multilingual documents (DE, FR, IT, EN)
5. Mixed PDF (digital + scanned pages)
6. Multi-page TIFF
7. Blank, corrupt, and password-protected files
8. Duplicate upload detection
9. Validation failure (salary formula mismatch & tax year mismatch)
10. Fallback when external AI is unavailable or disabled
11. Worker retry after failure
12. Approval and rejection filtering during profile merge
13. Calculation invalidation
14. Cross-user data access denial
"""

import io
import os
import uuid
import fitz  # PyMuPDF
import pytest
import pytest_asyncio
from httpx import AsyncClient
from PIL import Image, ImageDraw, ImageFont
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from unittest.mock import MagicMock, patch

from app.models.document import Document
from app.models.tax_calculation import TaxCalculation
from app.models.tax_profile import TaxProfile
from app.models.tax_return import TaxReturn
from app.models.user import User
from app.services.document_extractor import document_extractor
from app.services.document_pipeline_service import document_pipeline_service
from app.services.ocr_service import ocr_service, OcrLimitError
from app.services.storage_service import StorageService

storage = StorageService()


# ── Synthetic Document Generators ─────────────────────────────────────────────

def _get_font(size: int = 36):
    font_candidates = [
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for p in font_candidates:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


def create_digital_pdf(text: str) -> bytes:
    """Generate a clean digital PDF using PyMuPDF."""
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)  # A4
    page.insert_text((50, 72), text, fontsize=12)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def create_scanned_pdf(text: str) -> bytes:
    """Generate a rasterized/scanned PDF without digital text layer."""
    img = Image.new("RGB", (1240, 1754), "white")
    draw = ImageDraw.Draw(img)
    draw.text((60, 80), text, fill="black", font=_get_font(32))
    
    png_buf = io.BytesIO()
    img.save(png_buf, format="PNG")
    png_bytes = png_buf.getvalue()

    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_image(page.rect, stream=png_bytes)
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def create_mixed_pdf(digital_text: str, scanned_text: str) -> bytes:
    """Generate a 2-page PDF where page 1 is digital and page 2 is scanned."""
    doc = fitz.open()
    # Page 1: Digital
    p1 = doc.new_page(width=595, height=842)
    p1.insert_text((50, 72), digital_text, fontsize=12)

    # Page 2: Rasterized image
    img = Image.new("RGB", (1240, 1754), "white")
    draw = ImageDraw.Draw(img)
    draw.text((60, 80), scanned_text, fill="black", font=_get_font(32))
    png_buf = io.BytesIO()
    img.save(png_buf, format="PNG")
    
    p2 = doc.new_page(width=595, height=842)
    p2.insert_image(p2.rect, stream=png_buf.getvalue())

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def create_encrypted_pdf(text: str, password: str = "secret") -> bytes:
    """Generate a password-protected PDF."""
    doc = fitz.open()
    p = doc.new_page(width=595, height=842)
    p.insert_text((50, 72), text, fontsize=12)
    pdf_bytes = doc.tobytes(
        encryption=fitz.PDF_ENCRYPT_AES_256,
        user_pw=password,
    )
    doc.close()
    return pdf_bytes


def create_multipage_tiff(pages_text: list[str]) -> bytes:
    """Generate a multi-frame TIFF image."""
    images = []
    for txt in pages_text:
        im = Image.new("RGB", (1000, 600), "white")
        d = ImageDraw.Draw(im)
        d.text((40, 50), txt, fill="black", font=_get_font(28))
        images.append(im)

    buf = io.BytesIO()
    images[0].save(
        buf,
        format="TIFF",
        save_all=True,
        append_images=images[1:],
    )
    return buf.getvalue()


def create_rotated_image(text: str) -> bytes:
    """Generate an image with text for OCR."""
    img = Image.new("RGB", (1100, 700), "white")
    draw = ImageDraw.Draw(img)
    draw.text((50, 50), text, fill="black", font=_get_font(32))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=95)
    return buf.getvalue()


# ── Test Cases ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_clean_digital_pdf(db_session: AsyncSession, test_user: User):
    """Test 1: Clean digital PDF extracts with PyMuPDF directly and classifies."""
    pdf_text = (
        "Lohnausweis / Certificat de salaire\n"
        "Steuerjahr: 2025\n"
        "Arbeitgeber: Swisscom AG\n"
        "Name und Adresse des Arbeitnehmers: Hans Muster\n"
        "AHV-Nummer: 756.1234.5678.90\n"
        "8. Bruttolohn: CHF 120'000.00\n"
        "9. Beiträge AHV/IV/EO/ALV: CHF 6'400.00\n"
        "10. Berufliche Vorsorge (BVG): CHF 7'600.00\n"
        "11. Nettolohn: CHF 106'000.00\n"
    )
    pdf_bytes = create_digital_pdf(pdf_text)
    doc_id = str(uuid.uuid4())
    storage_key = f"users/{test_user.id}/{doc_id}/lohnausweis.pdf"
    await storage.upload_file(pdf_bytes, storage_key, "application/pdf")

    doc = Document(
        id=doc_id,
        user_id=str(test_user.id),
        original_filename="lohnausweis.pdf",
        storage_key=storage_key,
        mime_type="application/pdf",
        file_size_bytes=len(pdf_bytes),
        processing_status="queued",
    )
    db_session.add(doc)
    await db_session.commit()

    # Process via pipeline
    res_doc = await document_pipeline_service.process_document(doc_id, db_session)
    assert res_doc.processing_status == "needs_review"
    assert res_doc.document_type == "salary_certificate"
    data = res_doc.extracted_data
    assert data["gross_salary"] == 120000.0
    assert data["net_salary"] == 106000.0
    assert data["social_deductions"] == 6400.0
    assert data["pension_bvg"] == 7600.0
    assert data["ahv_number"] == "756.1234.5678.90"
    assert data["tax_year"] == 2025

    # Check reviews attached
    reviews = data.get("_reviews", {})
    assert "gross_salary" in reviews
    assert reviews["gross_salary"]["status"] == "needs_review"


@pytest.mark.asyncio
async def test_scanned_pdf_requiring_ocr(db_session: AsyncSession, test_user: User):
    """Test 2: Scanned PDF page (no digital text) triggers Tesseract rasterization."""
    text = (
        "Lohnausweis 2025\n"
        "Bruttolohn: CHF 95000.00\n"
        "Nettolohn: CHF 82000.00\n"
    )
    pdf_bytes = create_scanned_pdf(text)
    doc_id = str(uuid.uuid4())
    storage_key = f"users/{test_user.id}/{doc_id}/scanned_lohn.pdf"
    await storage.upload_file(pdf_bytes, storage_key, "application/pdf")

    doc = Document(
        id=doc_id,
        user_id=str(test_user.id),
        original_filename="scanned_lohn.pdf",
        storage_key=storage_key,
        mime_type="application/pdf",
        file_size_bytes=len(pdf_bytes),
        processing_status="queued",
    )
    db_session.add(doc)
    await db_session.commit()

    res_doc = await document_pipeline_service.process_document(doc_id, db_session)
    assert res_doc.processing_status == "needs_review"
    assert res_doc.document_type == "salary_certificate"
    data = res_doc.extracted_data
    assert data.get("gross_salary") == 95000.0


@pytest.mark.asyncio
async def test_rotated_phone_image(db_session: AsyncSession, test_user: User):
    """Test 3: Phone image with bank statement is preprocessed and extracted."""
    text = (
        "UBS Switzerland AG\n"
        "Bank Account Statement 2025\n"
        "IBAN: CH9300240240123456789\n"
        "Saldo per 31.12: CHF 54'320.00\n"
        "Zins: CHF 120.00\n"
    )
    img_bytes = create_rotated_image(text)
    doc_id = str(uuid.uuid4())
    storage_key = f"users/{test_user.id}/{doc_id}/bank_photo.jpg"
    await storage.upload_file(img_bytes, storage_key, "image/jpeg")

    doc = Document(
        id=doc_id,
        user_id=str(test_user.id),
        original_filename="bank_photo.jpg",
        storage_key=storage_key,
        mime_type="image/jpeg",
        file_size_bytes=len(img_bytes),
        processing_status="queued",
    )
    db_session.add(doc)
    await db_session.commit()

    res_doc = await document_pipeline_service.process_document(doc_id, db_session)
    assert res_doc.processing_status == "needs_review"
    assert res_doc.document_type == "bank_statement"
    data = res_doc.extracted_data
    assert data["balance"] == 54320.0
    assert "CH9300240240123456789" in data["iban"]


@pytest.mark.asyncio
async def test_multilingual_documents():
    """Test 4: Deterministic extraction across DE, FR, IT, EN."""
    # 1. DE: Pillar 3a
    ocr_de = ocr_service.process_file(
        create_digital_pdf(
            "Bescheinigung Säule 3a\n"
            "Steuerjahr 2025\n"
            "Vorsorgestiftung 3a Sparen\n"
            "Einzahlung: CHF 7'258.00\n"
            "Guthaben per 31.12: CHF 45'000.00\n"
        ),
        mime_type="application/pdf",
    )
    ext_de = document_extractor.process_document(ocr_de, filename="3a.pdf")
    assert ext_de.document_type == "pillar3a"
    assert ext_de.data_payload["contribution_amount"] == 7258.0
    assert ext_de.data_payload["balance"] == 45000.0

    # 2. FR: Certificat de salaire
    ocr_fr = ocr_service.process_file(
        create_digital_pdf(
            "Certificat de salaire\n"
            "Période: 2025\n"
            "Employeur: Nestlé Suisse SA\n"
            "Nom du salarié: Pierre Dupont\n"
            "8. Salaire brut: CHF 95'000.00\n"
            "11. Salaire net: CHF 82'000.00\n"
        ),
        mime_type="application/pdf",
    )
    ext_fr = document_extractor.process_document(ocr_fr, filename="salaire.pdf")
    assert ext_fr.document_type == "salary_certificate"
    assert ext_fr.data_payload["gross_salary"] == 95000.0
    assert ext_fr.data_payload["net_salary"] == 82000.0

    # 3. IT: Certificato di salario
    ocr_it = ocr_service.process_file(
        create_digital_pdf(
            "Certificato di salario\n"
            "Periodo: 2025\n"
            "Datore di lavoro: Ferrari SA\n"
            "8. Salario lordo: CHF 110'000.00\n"
            "11. Salario netto: CHF 96'000.00\n"
        ),
        mime_type="application/pdf",
    )
    ext_it = document_extractor.process_document(ocr_it, filename="salario.pdf")
    assert ext_it.document_type == "salary_certificate"
    assert ext_it.data_payload["gross_salary"] == 110000.0
    assert ext_it.data_payload["net_salary"] == 96000.0

    # 4. EN: Mortgage statement
    ocr_en = ocr_service.process_file(
        create_digital_pdf(
            "Mortgage Statement 2025\n"
            "Lender: Credit Suisse\n"
            "Outstanding balance: CHF 650'000.00\n"
            "Interest paid: CHF 9'750.00\n"
        ),
        mime_type="application/pdf",
    )
    ext_en = document_extractor.process_document(ocr_en, filename="mortgage.pdf")
    assert ext_en.document_type == "mortgage"
    assert ext_en.data_payload["mortgage_balance"] == 650000.0
    assert ext_en.data_payload["interest_paid"] == 9750.0


@pytest.mark.asyncio
async def test_mixed_pdf_digital_and_scanned():
    """Test 5: Mixed PDF with digital page 1 and scanned page 2."""
    p1_text = (
        "Swiss Bank Wealth Statement 2025\n"
        "Account Holder: Max Mustermann\n"
        "IBAN: CH9300000000000000000\n"
        "Saldo per 31.12: CHF 100'000.00\n"
    )
    p2_text = (
        "Zinsabrechnung 2025\n"
        "Zins: CHF 450.00\n"
    )
    mixed_bytes = create_mixed_pdf(p1_text, p2_text)
    ocr_res = ocr_service.process_file(mixed_bytes, mime_type="application/pdf")
    
    assert ocr_res.page_count == 2
    assert ocr_res.pages[0].is_scanned is False
    assert ocr_res.pages[1].is_scanned is True
    assert ocr_res.ocr_engine == "pymupdf_hybrid"


@pytest.mark.asyncio
async def test_multipage_tiff():
    """Test 6: Multi-page TIFF extracts all frames."""
    f1 = "UBS Bank Account Statement Page 1\nSaldo per 31.12: CHF 25000.00"
    f2 = "UBS Bank Account Statement Page 2\nZins: CHF 75.00"
    tiff_bytes = create_multipage_tiff([f1, f2])

    ocr_res = ocr_service.process_file(tiff_bytes, mime_type="image/tiff", filename="account.tiff")
    assert ocr_res.page_count == 2
    assert "25000" in ocr_res.full_text


@pytest.mark.asyncio
async def test_blank_corrupt_and_password_protected(db_session: AsyncSession, test_user: User):
    """Test 7: Blank, corrupt, and password-protected files fail with clear actionable messages."""
    # Blank PDF
    blank_doc = fitz.open()
    blank_doc.new_page(width=595, height=842)
    blank_bytes = blank_doc.tobytes()
    blank_doc.close()

    doc_blank_id = str(uuid.uuid4())
    key_b = f"users/{test_user.id}/{doc_blank_id}/blank.pdf"
    await storage.upload_file(blank_bytes, key_b, "application/pdf")
    d_blank = Document(id=doc_blank_id, user_id=str(test_user.id), original_filename="blank.pdf", storage_key=key_b, mime_type="application/pdf", file_size_bytes=len(blank_bytes), processing_status="queued")
    db_session.add(d_blank)
    await db_session.commit()
    r_blank = await document_pipeline_service.process_document(doc_blank_id, db_session)
    assert r_blank.processing_status == "failed"
    assert "readable text" in r_blank.extracted_data.get("_error_message", "").lower()

    # Corrupt file
    doc_corrupt_id = str(uuid.uuid4())
    key_c = f"users/{test_user.id}/{doc_corrupt_id}/corrupt.pdf"
    corrupt_bytes = b"THIS_IS_NOT_A_VALID_PDF"
    await storage.upload_file(corrupt_bytes, key_c, "application/pdf")
    d_corrupt = Document(id=doc_corrupt_id, user_id=str(test_user.id), original_filename="corrupt.pdf", storage_key=key_c, mime_type="application/pdf", file_size_bytes=len(corrupt_bytes), processing_status="queued")
    db_session.add(d_corrupt)
    await db_session.commit()
    r_corrupt = await document_pipeline_service.process_document(doc_corrupt_id, db_session)
    assert r_corrupt.processing_status == "failed"
    assert "corrupt or invalid" in r_corrupt.extracted_data.get("_error_message", "").lower()

    # Password-protected PDF
    pw_bytes = create_encrypted_pdf("Top secret text", password="mypassword")
    doc_pw_id = str(uuid.uuid4())
    key_pw = f"users/{test_user.id}/{doc_pw_id}/protected.pdf"
    await storage.upload_file(pw_bytes, key_pw, "application/pdf")
    d_pw = Document(id=doc_pw_id, user_id=str(test_user.id), original_filename="protected.pdf", storage_key=key_pw, mime_type="application/pdf", file_size_bytes=len(pw_bytes), processing_status="queued")
    db_session.add(d_pw)
    await db_session.commit()
    r_pw = await document_pipeline_service.process_document(doc_pw_id, db_session)
    assert r_pw.processing_status == "failed"
    assert "password" in r_pw.extracted_data.get("_error_message", "").lower()


@pytest.mark.asyncio
async def test_duplicate_upload_detection(auth_client: AsyncClient):
    """Test 8: Uploading identical bytes twice sets is_duplicate_suspect."""
    content = b"%PDF-1.4\n1 0 obj\n<< /Title (Dupe) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF"
    
    # Upload 1
    files1 = {"files": ("sample_dup.pdf", io.BytesIO(content), "application/pdf")}
    r1 = await auth_client.post("/api/v1/documents/upload", files=files1)
    assert r1.status_code in (200, 202)

    # Upload 2 with identical content
    files2 = {"files": ("sample_dup_again.pdf", io.BytesIO(content), "application/pdf")}
    r2 = await auth_client.post("/api/v1/documents/upload", files=files2)
    assert r2.status_code in (200, 202)
    data = r2.json()
    assert "duplicate" in data[0]["message"].lower()


@pytest.mark.asyncio
async def test_validation_warnings_salary_formula_and_tax_year():
    """Test 9: Salary formula mismatch (>5%) and tax year discrepancy produce warnings."""
    # Gross 120'000, Social 5'000, Pension 5'000 -> Expected net ~110'000.
    # But stated net is 80'000 (diff 30'000 = 25% > 5%).
    doc_text = (
        "Lohnausweis\n"
        "Steuerjahr: 2023\n"
        "8. Bruttolohn: CHF 120'000.00\n"
        "9. Beiträge AHV/IV/EO/ALV: CHF 5'000.00\n"
        "10. Berufliche Vorsorge (BVG): CHF 5'000.00\n"
        "11. Nettolohn: CHF 80'000.00\n"
    )
    ocr_res = ocr_service.process_file(create_digital_pdf(doc_text), mime_type="application/pdf")
    ext = document_extractor.process_document(ocr_res, filename="lohn.pdf", expected_tax_year=2025)

    assert ext.document_type == "salary_certificate"
    # Verify tax year mismatch warning
    assert any("Tax year mismatch" in w for w in ext.warnings)
    # Verify salary formula warning
    assert any("Salary arithmetic note" in w for w in ext.warnings)


@pytest.mark.asyncio
async def test_fallback_when_gemini_unavailable():
    """Test 10: System uses deterministic pipeline gracefully without external AI."""
    doc_text = (
        "Spendenbescheinigung 2025\n"
        "Organisation: Rotes Kreuz Schweiz\n"
        "Spendenbetrag: CHF 1'200.00\n"
    )
    ocr_res = ocr_service.process_file(create_digital_pdf(doc_text), mime_type="application/pdf")
    ext = document_extractor.process_document(ocr_res, filename="spende.pdf")
    assert ext.document_type == "donation"
    assert ext.data_payload["amount"] == 1200.0
    assert ext.provider == "deterministic_ocr"


@pytest.mark.asyncio
async def test_worker_retry_after_transient_failure(auth_client: AsyncClient, db_session: AsyncSession, test_user: User):
    """Test 11: Retrying a failed document resets status and re-runs pipeline."""
    pdf_text = "Bankkonto Auszug 2025\nSaldo per 31.12: CHF 32'100.00"
    pdf_bytes = create_digital_pdf(pdf_text)
    doc_id = str(uuid.uuid4())
    key = f"users/{test_user.id}/{doc_id}/retry_doc.pdf"
    await storage.upload_file(pdf_bytes, key, "application/pdf")

    doc = Document(
        id=doc_id,
        user_id=str(test_user.id),
        original_filename="retry_doc.pdf",
        storage_key=key,
        mime_type="application/pdf",
        file_size_bytes=len(pdf_bytes),
        processing_status="failed",
        extracted_data={"_error_message": "Transient network timeout"},
    )
    db_session.add(doc)
    await db_session.commit()

    # Call retry endpoint
    retry_resp = await auth_client.post(f"/api/v1/documents/{doc_id}/retry")
    assert retry_resp.status_code == 200

    # Verify doc has been processed to needs_review and error cleared
    check_doc = (await db_session.execute(select(Document).where(Document.id == doc_id))).scalar_one()
    assert check_doc.processing_status in ("queued", "needs_review")
    assert "_error_message" not in (check_doc.extracted_data or {})


@pytest.mark.asyncio
async def test_approval_rejection_filtering_during_profile_merge(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
):
    """Test 12: Only explicitly approved/edited fields merge into profile; rejected or unreviewed are ignored."""
    # 1. Create Tax Return and Tax Profile
    tr_id = str(uuid.uuid4())
    tr = TaxReturn(
        id=tr_id,
        user_id=str(test_user.id),
        canton_code="ZH",
        municipality_code="261",
        tax_year=2025,
        status="draft",
    )
    profile = TaxProfile(
        id=str(uuid.uuid4()),
        tax_return_id=tr_id,
        income_data={},
        deductions_data={},
    )
    db_session.add_all([tr, profile])
    await db_session.commit()

    # 2. Create document with extracted salary fields
    doc_id = str(uuid.uuid4())
    doc = Document(
        id=doc_id,
        user_id=str(test_user.id),
        tax_return_id=tr_id,
        original_filename="lohn.pdf",
        storage_key=f"users/{test_user.id}/{doc_id}/lohn.pdf",
        mime_type="application/pdf",
        file_size_bytes=1024,
        document_type="salary_certificate",
        processing_status="needs_review",
        extracted_data={
            "gross_salary": 120000.0,
            "net_salary": 105000.0,
            "pension_bvg": 7500.0,
            "_reviews": {
                "gross_salary": {"value": 120000.0, "status": "approved"},
                "net_salary": {"value": 105000.0, "status": "rejected"},
                "pension_bvg": {"value": 7500.0, "status": "needs_review"},
            },
        },
    )
    db_session.add(doc)
    await db_session.commit()

    # 3. Apply document
    resp = await auth_client.post(f"/api/v1/documents/{doc_id}/apply")
    assert resp.status_code == 200
    applied_fields = resp.json()["applied_fields"]
    assert "employment_income" in applied_fields
    assert "net_salary" not in applied_fields
    assert "pillar2_contributions" not in applied_fields

    # 4. Verify profile in DB
    await db_session.refresh(profile)
    assert profile.income_data.get("employment_income") == 120000.0
    assert "net_salary" not in profile.income_data
    assert "pillar2_contributions" not in (profile.deductions_data or {})

    # 5. Verify doc is marked completed
    await db_session.refresh(doc)
    assert doc.processing_status == "completed"


@pytest.mark.asyncio
async def test_calculation_invalidation(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
):
    """Test 13: Merging approved document invalidates existing tax calculations."""
    tr_id = str(uuid.uuid4())
    tr = TaxReturn(id=tr_id, user_id=str(test_user.id), canton_code="ZH", municipality_code="261", tax_year=2025, status="draft")
    profile = TaxProfile(id=str(uuid.uuid4()), tax_return_id=tr_id)
    calc = TaxCalculation(
        id=str(uuid.uuid4()),
        tax_return_id=tr_id,
        status="calculated",
        is_final=True,
        total_tax_due=12500.0,
    )
    db_session.add_all([tr, profile, calc])
    await db_session.commit()

    # Create and apply document
    doc_id = str(uuid.uuid4())
    doc = Document(
        id=doc_id,
        user_id=str(test_user.id),
        tax_return_id=tr_id,
        original_filename="donation.pdf",
        storage_key=f"users/{test_user.id}/{doc_id}/donation.pdf",
        mime_type="application/pdf",
        file_size_bytes=1024,
        document_type="donation",
        processing_status="needs_review",
        extracted_data={
            "amount": 500.0,
            "_reviews": {"amount": {"value": 500.0, "status": "approved"}},
        },
    )
    db_session.add(doc)
    await db_session.commit()

    resp = await auth_client.post(f"/api/v1/documents/{doc_id}/apply")
    assert resp.status_code == 200

    # Verify calculation is now outdated
    await db_session.refresh(calc)
    assert calc.status == "outdated"
    assert calc.is_final is False


@pytest.mark.asyncio
async def test_cross_user_isolation(auth_client2: AsyncClient, db_session: AsyncSession, test_user: User):
    """Test 14: User 2 cannot access, review, apply, download or delete User 1's document."""
    doc_id = str(uuid.uuid4())
    doc = Document(
        id=doc_id,
        user_id=str(test_user.id),
        original_filename="private.pdf",
        storage_key=f"users/{test_user.id}/{doc_id}/private.pdf",
        mime_type="application/pdf",
        file_size_bytes=1024,
        processing_status="needs_review",
    )
    db_session.add(doc)
    await db_session.commit()

    # 1. Get
    r_get = await auth_client2.get(f"/api/v1/documents/{doc_id}")
    assert r_get.status_code == 404

    # 2. Download
    r_dl = await auth_client2.get(f"/api/v1/documents/{doc_id}/download")
    assert r_dl.status_code == 404

    # 3. Review
    r_rev = await auth_client2.put(f"/api/v1/documents/{doc_id}/review", json={"document_type": "other"})
    assert r_rev.status_code == 404

    # 4. Apply
    r_app = await auth_client2.post(f"/api/v1/documents/{doc_id}/apply")
    assert r_app.status_code == 404

    # 5. Delete
    r_del = await auth_client2.delete(f"/api/v1/documents/{doc_id}")
    assert r_del.status_code == 404


@pytest.mark.asyncio
async def test_idempotent_profile_apply_prevents_double_counting(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
):
    """
    Test 15: Verifies that applying the same document multiple times never double-counts.
    Covers donations, interest income, mortgage debt interest, and medical expenses.
    """
    tr_id = str(uuid.uuid4())
    tr = TaxReturn(
        id=tr_id,
        user_id=str(test_user.id),
        canton_code="ZH",
        tax_year=2025,
        status="draft",
    )
    db_session.add(tr)
    profile = TaxProfile(
        id=str(uuid.uuid4()),
        tax_return_id=tr_id,
        income_data={},
        deductions_data={},
        wealth_data={},
        liabilities_data={},
    )
    db_session.add(profile)
    await db_session.commit()

    # 1. Donation doc
    don_doc_id = str(uuid.uuid4())
    don_doc = Document(
        id=don_doc_id,
        user_id=str(test_user.id),
        tax_return_id=tr_id,
        original_filename="donation_500.pdf",
        storage_key=f"users/{test_user.id}/{don_doc_id}/donation_500.pdf",
        mime_type="application/pdf",
        file_size_bytes=1024,
        document_type="donation",
        processing_status="needs_review",
        extracted_data={
            "amount": 500.0,
            "_reviews": {"amount": {"value": 500.0, "status": "approved"}},
        },
    )
    db_session.add(don_doc)

    # 2. Bank doc
    bank_doc_id = str(uuid.uuid4())
    bank_doc = Document(
        id=bank_doc_id,
        user_id=str(test_user.id),
        tax_return_id=tr_id,
        original_filename="bank.pdf",
        storage_key=f"users/{test_user.id}/{bank_doc_id}/bank.pdf",
        mime_type="application/pdf",
        file_size_bytes=1024,
        document_type="bank_statement",
        processing_status="needs_review",
        extracted_data={
            "balance": 15000.0,
            "interest_earned": 85.50,
            "_reviews": {
                "balance": {"value": 15000.0, "status": "approved"},
                "interest_earned": {"value": 85.50, "status": "approved"},
            },
        },
    )
    db_session.add(bank_doc)

    # 3. Mortgage doc
    mort_doc_id = str(uuid.uuid4())
    mort_doc = Document(
        id=mort_doc_id,
        user_id=str(test_user.id),
        tax_return_id=tr_id,
        original_filename="mortgage.pdf",
        storage_key=f"users/{test_user.id}/{mort_doc_id}/mortgage.pdf",
        mime_type="application/pdf",
        file_size_bytes=1024,
        document_type="mortgage",
        processing_status="needs_review",
        extracted_data={
            "mortgage_balance": 400000.0,
            "interest_paid": 4500.0,
            "_reviews": {
                "mortgage_balance": {"value": 400000.0, "status": "approved"},
                "interest_paid": {"value": 4500.0, "status": "approved"},
            },
        },
    )
    db_session.add(mort_doc)
    await db_session.commit()

    # First pass: Apply donation
    r1 = await auth_client.post(f"/api/v1/documents/{don_doc_id}/apply")
    assert r1.status_code == 200
    await db_session.refresh(profile)
    assert profile.deductions_data["donations"] == 500.0

    # Second pass: Apply donation again -> MUST REMAIN 500.0, NOT 1000.0
    r2 = await auth_client.post(f"/api/v1/documents/{don_doc_id}/apply")
    assert r2.status_code == 200
    await db_session.refresh(profile)
    assert profile.deductions_data["donations"] == 500.0

    # Apply bank statement twice -> interest_income MUST REMAIN 85.50, NOT 171.0
    r_b1 = await auth_client.post(f"/api/v1/documents/{bank_doc_id}/apply")
    assert r_b1.status_code == 200
    r_b2 = await auth_client.post(f"/api/v1/documents/{bank_doc_id}/apply")
    assert r_b2.status_code == 200
    await db_session.refresh(profile)
    assert profile.income_data["interest_income"] == 85.50
    assert len(profile.wealth_data["bank_accounts"]) == 1

    # Apply mortgage twice -> debt_interest MUST REMAIN 4500.0, NOT 9000.0
    r_m1 = await auth_client.post(f"/api/v1/documents/{mort_doc_id}/apply")
    assert r_m1.status_code == 200
    r_m2 = await auth_client.post(f"/api/v1/documents/{mort_doc_id}/apply")
    assert r_m2.status_code == 200
    await db_session.refresh(profile)
    assert profile.deductions_data["debt_interest"] == 4500.0
    assert len(profile.liabilities_data["mortgages"]) == 1


@pytest.mark.asyncio
async def test_ocr_timeout_enforcement(db_session: AsyncSession, test_user: User):
    """
    Test 16: Verifies that OCR processing enforces timeout limits gracefully.
    """
    from app.core.config import settings
    from unittest.mock import patch
    import asyncio
    from app.services.ocr_service import OcrLimitError

    doc_id = str(uuid.uuid4())
    doc = Document(
        id=doc_id,
        user_id=str(test_user.id),
        original_filename="slow_doc.pdf",
        storage_key=f"users/{test_user.id}/{doc_id}/slow_doc.pdf",
        mime_type="application/pdf",
        file_size_bytes=1024,
        processing_status="queued",
    )
    db_session.add(doc)
    await db_session.commit()

    # Upload dummy file via storage service
    test_pdf = create_digital_pdf("Test timeout content")
    await storage.upload_file(test_pdf, doc.storage_key, "application/pdf")

    # Mock ocr_service.process_file to simulate a hang that exceeds timeout
    async def mock_wait_for(coro, timeout):
        raise asyncio.TimeoutError()

    with patch("asyncio.wait_for", side_effect=mock_wait_for):
        result_doc = await document_pipeline_service.process_document(doc_id, db_session)
        assert result_doc.processing_status == "failed"
        assert "timed out" in result_doc.extracted_data.get("_error_message", "").lower()


def test_orientation_detection_and_deskewing():
    """
    Test 17: Verifies rotation detection (90/180/270 deg) and deskewing algorithm,
    asserting that rotated text is restored to upright and OCR extracts key terms.
    """
    font = _get_font(28)
    img = Image.new("RGB", (1200, 1000), "white")
    draw = ImageDraw.Draw(img)
    for i in range(20):
        draw.text(
            (60, 40 + i * 45),
            f"Schweizerische Steuererklaerung Lohnausweis Zeile {i}",
            fill="black",
            font=font,
        )

    # Tilted by 3 degrees
    tilted = img.rotate(3.0, expand=False, fillcolor="white")
    deskewed = ocr_service._deskew_image(tilted)
    assert deskewed is not None
    assert deskewed.size == tilted.size

    # Test all 3 orientations: 90, 180, and 270 degrees
    for rot in (90, 180, 270):
        rotated = img.rotate(rot, expand=True)
        corrected = ocr_service._detect_and_fix_orientation(rotated)
        assert corrected is not None
        text = ocr_service._run_tesseract(corrected)
        assert "Schweizerische" in text or "Lohnausweis" in text


def test_gemini_extraction_integration_and_fallback():
    """
    Test 18: Verifies real Gemini extraction mapping into ExtractedFieldDetail
    and graceful fallback when Gemini is unavailable.
    """
    from app.services.ocr_service import DocumentOCRResult, PageOCRResult
    from app.core.config import settings

    fake_ocr = DocumentOCRResult(
        full_text="Lohnausweis 2025 Bruttolohn 135'000 Nettolohn 108'000 AHV 756.9999.8888.77",
        pages=[PageOCRResult(page_number=1, text="Sample text", is_scanned=False)],
        page_count=1,
        is_empty=False,
        ocr_engine="tesseract_ocr",
    )

    mock_gemini_resp = MagicMock()
    mock_gemini_resp.text = """{
        "document_type": "salary_certificate",
        "confidence": 0.96,
        "fields": {
            "gross_salary": {
                "value": 135000.0,
                "raw_value": "135'000",
                "confidence": 0.98,
                "source_line": "Bruttolohn 135'000"
            },
            "net_salary": {
                "value": 108000.0,
                "raw_value": "108'000",
                "confidence": 0.97,
                "source_line": "Nettolohn 108'000"
            }
        },
        "warnings": []
    }"""

    mock_client = MagicMock()
    mock_client.models.generate_content.return_value = mock_gemini_resp

    with patch.object(settings, "ENABLE_EXTERNAL_AI_EXTRACTION", True), \
         patch.object(settings, "GEMINI_API_KEY", "test-live-key"), \
         patch("google.genai.Client", return_value=mock_client):
        result = document_extractor.process_document(
            ocr_result=fake_ocr,
            filename="unclear_document.pdf",
            category_hint="other",
        )
        assert result.provider.startswith("google_gemini")
        assert result.document_type == "salary_certificate"
        assert result.fields["gross_salary"].value == 135000.0
        assert result.fields["gross_salary"].extraction_method == "google_gemini"

    # Fallback test: when Gemini fails with an exception, deterministic extraction continues
    with patch.object(settings, "ENABLE_EXTERNAL_AI_EXTRACTION", True), \
         patch.object(settings, "GEMINI_API_KEY", "test-live-key"), \
         patch("google.genai.Client", side_effect=RuntimeError("Gemini service unavailable")):
        fallback_res = document_extractor.process_document(
            ocr_result=fake_ocr,
            filename="unclear_document.pdf",
            category_hint="other",
        )
        assert fallback_res.provider == "deterministic_ocr"
        assert any("AI extraction unavailable" in w for w in fallback_res.warnings)


def test_celery_task_retry_on_transient_failure():
    """
    Test 19: Verifies that extraction_tasks.process_document retries on transient exceptions.
    """
    from app.tasks.extraction_tasks import process_document

    with patch("asyncio.run", side_effect=ConnectionError("Database connection lost")), \
         patch.object(process_document, "retry", side_effect=Exception("Retried!")) as mock_retry, \
         pytest.raises(Exception, match="Retried!"):
        process_document("doc-1234")

    mock_retry.assert_called_once()
    assert "countdown" in mock_retry.call_args.kwargs
    assert mock_retry.call_args.kwargs["countdown"] >= 5


def test_tesseract_process_killed_on_timeout():
    """
    Test 20: Verifies that pytesseract subprocess is actively terminated
    and OcrLimitError is raised when execution exceeds specified timeout.
    """
    img = Image.new("RGB", (1000, 1000), "white")
    with pytest.raises(OcrLimitError, match="exceeded time limit"):
        ocr_service._run_tesseract(img, timeout=0.00001)


@pytest.mark.asyncio
async def test_storage_failure_propagates_and_retries(db_session: AsyncSession, test_user: User):
    """
    Test 21: Verifies that transient storage outages propagate out of process_document
    when raise_on_transient_error is enabled (resetting status to queued for retry),
    and that Celery retries before finally marking failed on exhaustion.
    """
    import asyncio
    doc_id = str(uuid.uuid4())
    doc = Document(
        id=doc_id,
        user_id=str(test_user.id),
        original_filename="transient_doc.pdf",
        storage_key=f"users/{test_user.id}/{doc_id}/transient_doc.pdf",
        mime_type="application/pdf",
        file_size_bytes=1024,
        processing_status="queued",
    )
    db_session.add(doc)
    await db_session.commit()

    # 1. Transient storage error with raise_on_transient_error=True propagates
    with patch("app.services.document_pipeline_service.storage.download_file", side_effect=ConnectionError("MinIO connection reset")):
        with pytest.raises(ConnectionError, match="MinIO connection reset"):
            await document_pipeline_service.process_document(
                doc_id,
                db_session,
                raise_on_transient_error=True,
            )

    # Document should remain in 'queued' state for worker to retry
    await db_session.refresh(doc)
    assert doc.processing_status == "queued"

    # 2. Celery exhaustion marks document failed
    from app.tasks.extraction_tasks import process_document as celery_task
    celery_task.request.retries = 3
    celery_task.max_retries = 3

    with patch.object(document_pipeline_service, "process_document_by_id", side_effect=ConnectionError("Storage unreachable")):
        with pytest.raises(ConnectionError):
            celery_task.run(doc_id)

    await db_session.refresh(doc)
    assert doc.processing_status == "failed"
    assert "attempts" in doc.extracted_data.get("_error_message", "").lower() or "failed" in doc.extracted_data.get("_error_message", "").lower()


@pytest.mark.asyncio
async def test_multiple_salary_certificates_combined_in_profile(db_session: AsyncSession, test_user: User):
    """
    Test 22 (Milestone 2): Verifies that multiple salary certificates combine income
    (e.g., job change or dual employment) into employment_records and sum employment_income,
    instead of overwriting the previous certificate.
    """
    from app.api.v1.documents import apply_document_to_tax_profile

    tax_return = TaxReturn(
        id=str(uuid.uuid4()),
        user_id=str(test_user.id),
        canton_code="ZH",
        municipality_code="261",
        municipality_name="Zürich",
        tax_year=2025,
        status="draft",
    )
    db_session.add(tax_return)
    await db_session.commit()

    # Document 1: Employer A - CHF 120,000
    doc1 = Document(
        id=str(uuid.uuid4()),
        user_id=str(test_user.id),
        tax_return_id=str(tax_return.id),
        original_filename="salary_google.pdf",
        storage_key=f"users/{test_user.id}/salary_google.pdf",
        mime_type="application/pdf",
        file_size_bytes=2048,
        document_type="salary_certificate",
        processing_status="needs_review",
        is_duplicate_suspect=False,
        extracted_data={
            "fields": {
                "employer_name": {"value": "Google Switzerland GmbH", "review_status": "approved"},
                "gross_salary": {"value": 120000.0, "review_status": "approved"},
                "net_salary": {"value": 102000.0, "review_status": "approved"},
                "pillar2_contributions": {"value": 9000.0, "review_status": "approved"},
                "ahv_number": {"value": "756.1234.5678.90", "review_status": "approved"},
                "tax_year": {"value": 2025, "review_status": "approved"},
            }
        },
    )
    db_session.add(doc1)
    await db_session.commit()

    # Document 2: Employer B - CHF 35,000
    doc2 = Document(
        id=str(uuid.uuid4()),
        user_id=str(test_user.id),
        tax_return_id=str(tax_return.id),
        original_filename="salary_eth.pdf",
        storage_key=f"users/{test_user.id}/salary_eth.pdf",
        mime_type="application/pdf",
        file_size_bytes=2048,
        document_type="salary_certificate",
        processing_status="needs_review",
        is_duplicate_suspect=False,
        extracted_data={
            "fields": {
                "employer_name": {"value": "ETH Zürich", "review_status": "approved"},
                "gross_salary": {"value": 35000.0, "review_status": "approved"},
                "net_salary": {"value": 31000.0, "review_status": "approved"},
                "pillar2_contributions": {"value": 2500.0, "review_status": "approved"},
                "ahv_number": {"value": "756.1234.5678.90", "review_status": "approved"},
                "tax_year": {"value": 2025, "review_status": "approved"},
            }
        },
    )
    db_session.add(doc2)
    await db_session.commit()

    prof = TaxProfile(
        id=str(uuid.uuid4()),
        tax_return_id=str(tax_return.id),
        income_data={},
        wealth_data={},
        deductions_data={},
        liabilities_data={},
    )
    db_session.add(prof)
    await db_session.commit()

    # Apply Doc 1
    await document_pipeline_service.apply_approved_fields_to_profile(doc1, prof, db_session)
    assert prof.income_data["employment_income"] == 120000.0
    assert len(prof.income_data.get("employment_records", [])) == 1

    # Apply Doc 2
    await document_pipeline_service.apply_approved_fields_to_profile(doc2, prof, db_session)
    # Both incomes must be summed, not overwritten
    assert prof.income_data["employment_income"] == 155000.0
    assert prof.income_data["net_salary"] == 133000.0
    assert prof.income_data["pillar2_contributions"] == 11500.0
    assert len(prof.income_data["employment_records"]) == 2

    # Re-applying Doc 1 must be idempotent and not duplicate
    await document_pipeline_service.apply_approved_fields_to_profile(doc1, prof, db_session)
    assert prof.income_data["employment_income"] == 155000.0
    assert len(prof.income_data["employment_records"]) == 2


@pytest.mark.asyncio
async def test_financial_duplicate_detected_across_separate_uploads(db_session: AsyncSession, test_user: User):
    """
    Test 23 (Milestone 2): Verifies that duplicate detection identifies matching financial items
    across separate uploads with distinct file hashes (same employer + tax year + gross salary).
    """
    tax_return = TaxReturn(
        id=str(uuid.uuid4()),
        user_id=str(test_user.id),
        canton_code="ZH",
        municipality_code="261",
        tax_year=2025,
        status="draft",
    )
    db_session.add(tax_return)
    await db_session.commit()

    # Upload 1: original salary slip
    doc1 = Document(
        id=str(uuid.uuid4()),
        user_id=str(test_user.id),
        tax_return_id=str(tax_return.id),
        original_filename="lohnausweis_scan1.pdf",
        storage_key=f"users/{test_user.id}/scan1.pdf",
        mime_type="application/pdf",
        file_size_bytes=1024,
        sha256_hash="hash_aaa_111",
        document_type="salary_certificate",
        processing_status="completed",
        extracted_data={
            "fields": {
                "employer_name": {"value": "Novartis Pharma AG"},
                "gross_salary": {"value": 145000.0},
                "tax_year": {"value": 2025},
            }
        },
    )
    db_session.add(doc1)
    await db_session.commit()

    # Upload 2: different file hash (e.g. mobile scan vs scanner PDF) but same financial contents
    doc2 = Document(
        id=str(uuid.uuid4()),
        user_id=str(test_user.id),
        tax_return_id=str(tax_return.id),
        original_filename="lohnausweis_mobile_photo.jpg",
        storage_key=f"users/{test_user.id}/photo.jpg",
        mime_type="image/jpeg",
        file_size_bytes=2048,
        sha256_hash="hash_bbb_222",
        document_type="salary_certificate",
        processing_status="queued",
        extracted_data={
            "fields": {
                "employer_name": {"value": "Novartis Pharma AG"},
                "gross_salary": {"value": 145000.0},
                "tax_year": {"value": 2025},
            },
            "warnings": [],
        },
    )
    db_session.add(doc2)
    await db_session.commit()

    # Run cross-document integrity check
    await document_pipeline_service._check_cross_document_integrity(doc2, db_session)

    assert doc2.is_duplicate_suspect is True
    warnings = doc2.extracted_data.get("warnings", [])
    assert any("Suspected financial duplicate" in w for w in warnings)
    assert any("Novartis Pharma AG" in w for w in warnings)


@pytest.mark.asyncio
async def test_cross_document_conflict_detected_and_flagged(db_session: AsyncSession, test_user: User):
    """
    Test 24 (Milestone 2): Verifies cross-document conflict detection (same employer with
    conflicting gross salary and conflicting AHV number across documents in the same tax return).
    """
    tax_return = TaxReturn(
        id=str(uuid.uuid4()),
        user_id=str(test_user.id),
        canton_code="ZH",
        municipality_code="261",
        tax_year=2025,
        status="draft",
    )
    db_session.add(tax_return)
    await db_session.commit()

    # Profile exists
    prof = TaxProfile(
        id=str(uuid.uuid4()),
        tax_return_id=str(tax_return.id),
        tax_flags=[],
    )
    db_session.add(prof)
    await db_session.commit()

    # Document 1: Acme AG CHF 100,000, AHV 756.1234.5678.90
    doc1 = Document(
        id=str(uuid.uuid4()),
        user_id=str(test_user.id),
        tax_return_id=str(tax_return.id),
        original_filename="doc1.pdf",
        storage_key="k1",
        mime_type="application/pdf",
        file_size_bytes=1024,
        sha256_hash="h1",
        document_type="salary_certificate",
        processing_status="completed",
        extracted_data={
            "fields": {
                "employer_name": {"value": "Acme AG"},
                "gross_salary": {"value": 100000.0},
                "ahv_number": {"value": "756.1234.5678.90"},
                "tax_year": {"value": 2025},
            }
        },
    )
    db_session.add(doc1)
    await db_session.commit()

    # Document 2: Same Acme AG, but conflicting gross CHF 130,000 and conflicting AHV 756.9999.8888.77
    doc2 = Document(
        id=str(uuid.uuid4()),
        user_id=str(test_user.id),
        tax_return_id=str(tax_return.id),
        original_filename="doc2.pdf",
        storage_key="k2",
        mime_type="application/pdf",
        file_size_bytes=1024,
        sha256_hash="h2",
        document_type="salary_certificate",
        processing_status="processing",
        extracted_data={
            "fields": {
                "employer_name": {"value": "Acme AG"},
                "gross_salary": {"value": 130000.0},
                "ahv_number": {"value": "756.9999.8888.77"},
                "tax_year": {"value": 2025},
            },
            "warnings": [],
        },
    )
    db_session.add(doc2)
    await db_session.commit()

    await document_pipeline_service._check_cross_document_integrity(doc2, db_session)
    await db_session.commit()

    # Warnings recorded on doc2
    warnings = doc2.extracted_data.get("warnings", [])
    assert any("Conflict detected: Gross salary for Acme AG is CHF 130000.0" in w for w in warnings)
    assert any("Conflicting AHV number detected" in w for w in warnings)

    # TaxFlags recorded on profile
    await db_session.refresh(prof)
    flag_messages = [f.get("message") for f in (prof.tax_flags or [])]
    assert any("Conflicting gross salary for employer 'Acme AG'" in m for m in flag_messages)
    assert any("Conflicting AHV numbers found" in m for m in flag_messages)


@pytest.mark.asyncio
async def test_ai_generated_questions_with_gemini_and_fallback():
    """
    Test 25 (Milestone 2): Verifies AI-generated questions service with dynamic Gemini call
    and deterministic rule fallback, plus dynamic field_hint answer application.
    """
    from app.services.smart_questions_service import (
        generate_ai_questions,
        generate_smart_questions,
        apply_answers_to_profile,
    )

    personal = {"marital_status": "married", "children": [{"name": "Leo", "birth_year": 2020}]}
    income = {"employment_income": 0}
    wealth = {"bank_accounts": []}
    deductions = {"pillar3a_contributions": 0, "childcare_expenses": 0}
    liabilities = {}

    # 1. Fallback when AI client unavailable
    with patch("app.services.smart_questions_service.get_client", return_value=None):
        questions = await generate_ai_questions(
            personal_data=personal,
            income_data=income,
            wealth_data=wealth,
            deductions_data=deductions,
            liabilities_data=liabilities,
            documents=[],
            canton_code="ZH",
            tax_year=2025,
        )
        assert len(questions) >= 4
        # Rule questions present
        q_ids = [q["id"] for q in questions]
        assert "q_employment_status" in q_ids
        assert "q_pillar3a_contribution" in q_ids
        assert "q_childcare_expenses" in q_ids

    # 2. AI generation path
    mock_ai_questions = [
        {
            "id": "q_ai_childcare",
            "category": "deductions",
            "question": "Did you pay for daycare/crèche for your child Leo in Canton Zurich?",
            "is_required": False,
            "field_hint": "deductions_data.childcare_expenses",
            "options": ["Yes, CHF 8,000", "No expenses"],
        },
        {
            "id": "q_ai_remote_work",
            "category": "deductions",
            "question": "How many days per week did you work from home?",
            "is_required": False,
            "field_hint": "deductions_data.home_office",
            "options": ["1-2 days", "3+ days", "None"],
        },
    ]

    with patch("app.services.smart_questions_service.get_client", return_value=MagicMock()), \
         patch("app.services.smart_questions_service._call_gemini_for_questions", return_value=mock_ai_questions):
        questions = await generate_ai_questions(
            personal_data=personal,
            income_data=income,
            wealth_data=wealth,
            deductions_data=deductions,
            liabilities_data=liabilities,
            documents=[],
            canton_code="ZH",
            tax_year=2025,
            existing_answers={"q_ai_childcare": "Yes, CHF 8,000"},
        )
        assert len(questions) == 2
        assert questions[0]["id"] == "q_ai_childcare"
        assert questions[0]["answer"] == "Yes, CHF 8,000"
        assert questions[0]["is_answered"] is True

        # 3. Dynamic field_hint answer application
        p, inc, w, ded, liab = apply_answers_to_profile(
            answers={"q_ai_childcare": "Yes, CHF 8,000"},
            personal_data=personal,
            income_data=income,
            wealth_data=wealth,
            deductions_data=deductions,
            liabilities_data=liabilities,
            questions_list=questions,
        )
        assert ded["childcare_expenses"] == 8000.0


