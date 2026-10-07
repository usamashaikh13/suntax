"""
Documents API router for SunTax.

Endpoints:
  POST   /documents/upload          – upload one or more documents
  GET    /documents                 – list user's documents
  GET    /documents/{id}            – get document metadata
  GET    /documents/{id}/download   – presigned URL
  GET    /documents/{id}/download-url – presigned download/preview URL
  GET    /documents/{id}/status     – lightweight processing status
  PUT    /documents/{id}            – update document_type / tax_return_id
  PUT    /documents/{id}/review     – review, edit, approve/reject extracted fields
  POST   /documents/{id}/apply      – apply approved extracted fields to tax profile
  POST   /documents/{id}/retry      – retry OCR and extraction for a document
  DELETE /documents/{id}            – delete document
"""

from __future__ import annotations

import hashlib
import json
import logging
import mimetypes
import re
import uuid as uuid_mod
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db, set_rls_user_id
from app.core.security import get_current_user
from app.models.audit_log import AuditLog
from app.models.document import Document
from app.models.tax_return import TaxReturn
from app.models.tax_profile import TaxProfile
from app.models.tax_calculation import TaxCalculation
from app.models.user import User
from app.schemas.document import (
    DocumentListResponse,
    DocumentResponse,
    DocumentRetryResponse,
    DocumentReviewRequest,
    DocumentStatusResponse,
    DocumentUpdateRequest,
    DocumentUploadResponse,
    PresignedUrlResponse,
)
from app.services.document_pipeline_service import document_pipeline_service
from app.services.storage_service import StorageService
from app.tasks.ocr_tasks import process_document

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Documents"])
storage = StorageService()

SUPPORTED_CATEGORIES = [
    "salary_certificate",
    "bank_statement",
    "securities_statement",
    "pillar3a",
    "insurance",
    "mortgage",
    "donation",
    "medical",
    "commuting",
    "education",
    "childcare",
    "property",
    "self_employment",
    "foreign_income",
    "previous_tax_return",
    "tax_assessment",
    "other",
]


# ── Helpers ───────────────────────────────────────────────────────────────────


def _compute_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def detect_mime(data: bytes, filename: str = "", content_type: str = "") -> str:
    """Accurately identify MIME type from magic bytes, filename, or content-type."""
    if data.startswith(b"%PDF-"):
        return "application/pdf"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith((b"II*\x00", b"MM\x00*")):
        return "image/tiff"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if len(data) >= 12 and data[4:8] == b"ftyp":
        brand = data[8:12]
        if brand in (b"heic", b"heix", b"hevc", b"heim", b"heis", b"mif1", b"msf1"):
            return "image/heic"
        return "image/heif"

    # Try libmagic if installed
    try:
        import magic as _magic_lib
        detected = _magic_lib.from_buffer(data, mime=True)
        if detected in settings.ALLOWED_MIME_TYPES:
            return detected
    except Exception:
        pass

    # Extension check
    fn = filename.lower()
    if fn.endswith((".jpg", ".jpeg")):
        return "image/jpeg"
    if fn.endswith(".png"):
        return "image/png"
    if fn.endswith(".pdf"):
        return "application/pdf"
    if fn.endswith(".webp"):
        return "image/webp"
    if fn.endswith((".tif", ".tiff")):
        return "image/tiff"
    if fn.endswith(".heic"):
        return "image/heic"
    if fn.endswith(".heif"):
        return "image/heif"

    ct = (content_type or "").lower()
    if ct in settings.ALLOWED_MIME_TYPES:
        return ct

    return "application/octet-stream"


def _extract_local_text(file_bytes: bytes, mime_type: str) -> str:
    """Best-effort OCR for development and worker-less deployments."""
    try:
        if mime_type == "application/pdf":
            import fitz
            pdf = fitz.open(stream=file_bytes, filetype="pdf")
            return "\n".join(page.get_text() for page in pdf)
        from PIL import Image
        import pytesseract
        import io
        return pytesseract.image_to_string(Image.open(io.BytesIO(file_bytes)), lang="deu+eng")
    except Exception as exc:
        logger.warning("Local OCR unavailable: %s", exc)
        return ""


def _parse_currency_amount(raw: str) -> Optional[float]:
    """Parse Swiss and international currency formats (95'000.00, 95,000.00, 95.000,00, 95000)."""
    if not raw:
        return None
    val_str = raw.strip().rstrip(".,-")
    val_str = re.sub(r"[^\d.,' ]", "", val_str).strip()
    val_str = val_str.replace("'", "").replace(" ", "")
    if not val_str:
        return None
    if "," in val_str and "." in val_str:
        if val_str.rfind(".") > val_str.rfind(","):
            val_str = val_str.replace(",", "")
        else:
            val_str = val_str.replace(".", "").replace(",", ".")
    elif "," in val_str:
        parts = val_str.split(",")
        if len(parts) == 2 and len(parts[1]) in (1, 2):
            val_str = parts[0] + "." + parts[1]
        else:
            val_str = val_str.replace(",", "")
    elif "." in val_str:
        parts = val_str.split(".")
        if len(parts) > 2:
            val_str = "".join(parts[:-1]) + "." + parts[-1]
    try:
        return float(val_str)
    except (ValueError, TypeError):
        return None


def _number_after(labels: tuple[str, ...], text: str) -> Optional[float]:
    date_regex = re.compile(r"\b\d{1,2}\.\d{1,2}\.\d{2,4}\b")
    for label in labels:
        for line in text.splitlines():
            if re.search(rf"\b{re.escape(label)}\b", line, re.I) or (len(label) > 4 and label.lower() in line.lower()):
                cleaned_line = date_regex.sub(" ", line)
                cur_match = re.search(r"(?:CHF|EUR|USD|Fr\.)\s*[:]?\s*([0-9][0-9'., ]*)", cleaned_line, re.I)
                if cur_match:
                    val = _parse_currency_amount(cur_match.group(1))
                    if val is not None:
                        return val

                m = re.search(rf"{re.escape(label)}[^0-9\n]{{0,40}}([0-9][0-9'., ]*)", cleaned_line, re.I)
                if m:
                    val = _parse_currency_amount(m.group(1))
                    if val is not None:
                        if 1990 <= val <= 2099 and any(y in line.lower() for y in ("jahr", "année", "anno", "periode")):
                            continue
                        return val

        match_next = re.search(rf"{re.escape(label)}\s*[\n\r]+\s*(?:CHF|EUR|Fr\.)?\s*([0-9][0-9'., ]*)", text, re.I)
        if match_next:
            val = _parse_currency_amount(match_next.group(1))
            if val is not None:
                return val
    return None


def _text_after(labels: tuple[str, ...], text: str) -> Optional[str]:
    header_words = {"name", "employee", "employer", "address", "adresse", "mitarbeiter", "arbeitgeber", "chf"}
    for label in labels:
        match = re.search(rf"{label}\s*[:]\s*([^\n\r]+)", text, re.I)
        if match:
            val = match.group(1).strip()
            if val and val.lower() not in header_words and not any(skip in val.lower() for skip in ("fictional test", "tax year")):
                return val

        match_lines = re.search(rf"{label}\s*[\n\r]+\s*([^\n\r]+)(?:[\n\r]+\s*([^\n\r]+))?", text, re.I)
        if match_lines:
            line1 = match_lines.group(1).strip() if match_lines.group(1) else ""
            line2 = match_lines.group(2).strip() if match_lines.group(2) else ""
            if line1 and line1.lower() not in header_words and not any(skip in line1.lower() for skip in ("fictional test", "tax year")):
                return line1
            if line2 and line2.lower() not in header_words and not any(skip in line2.lower() for skip in ("fictional test", "tax year")):
                return line2
    return None


def _local_extract(text: str, filename: str) -> tuple[str, float, dict, dict]:
    """
    Extract verified financial and identity fields without hallucinating fake data.
    Only fields actually detected in the document are returned.
    """
    haystack = f"{filename}\n{text}".lower()

    # 1. Salary Certificate (Lohnausweis / Certificat de salaire)
    if any(term in haystack for term in (
        "lohnausweis", "salary certificate", "gross salary", "bruttolohn", "annual salary",
        "certificat de salaire", "salaire brut", "salaire net", "certificat de travail",
        "attestation de rentes", "certificato di salario"
    )):
        gross = _number_after((
            "gross annual salary", "gross salary", "8. salaire brut", "8. bruttolohn",
            "salaire brut", "bruttolohn", "1. salaire", "1. lohn", "salaire", "lohn", "salary"
        ), text)
        net = _number_after((
            "net salary paid", "net salary", "11. salaire net", "11. nettolohn",
            "salaire net", "nettolohn"
        ), text)
        social_ded = _number_after((
            "9. beiträge ahv", "beiträge ahv", "cotisations avs", "9. cotisations",
            "ahv/iv/eo/alv", "social deductions"
        ), text)
        bvg = _number_after((
            "10. berufliche vorsorge", "berufliche vorsorge (bvg)", "prévoyance professionnelle (lpp)",
            "bvg", "lpp", "pension fund"
        ), text)
        emp_name = _text_after((
            "name und adresse des arbeitnehmers", "salarié", "arbeitnehmer", "employee",
            "mitarbeiter", "nom du salarié", "name"
        ), text)
        address = _text_after(("adresse", "address", "wohnort", "domicile"), text)
        ahv = _text_after(("ahv-nummer", "n° avs", "no avs", "avs-nr", "ahv", "avs"), text)
        employer = _text_after(("employeur", "arbeitgeber", "employer"), text)

        data = {}
        conf = {}
        if gross is not None:
            data["gross_salary"] = gross
            conf["gross_salary"] = 0.90
        if net is not None:
            data["net_salary"] = net
            conf["net_salary"] = 0.90
        if social_ded is not None:
            data["social_deductions"] = social_ded
            conf["social_deductions"] = 0.85
        if bvg is not None:
            data["pension_bvg"] = bvg
            conf["pension_bvg"] = 0.85
        if emp_name:
            data["employee_name"] = emp_name
            conf["employee_name"] = 0.85
        if address:
            data["employee_address"] = address
            conf["employee_address"] = 0.80
        if ahv:
            data["ahv_number"] = ahv
            conf["ahv_number"] = 0.95
        if employer:
            data["employer_name"] = employer
            conf["employer_name"] = 0.85

        _attach_reviews(data, conf)
        return "salary_certificate", 0.90, data, conf

    # 2. Pillar 3a (Säule 3a / 3e pilier)
    if any(term in haystack for term in (
        "pillar 3a", "säule 3a", "saeule 3a", "pilier 3a", "3e pilier", "terzo pilastro", "3a"
    )):
        amount = _number_after((
            "einzahlungsbetrag", "montant versé", "contribution amount", "cotisation",
            "contribution", "jahresbeitrag", "einzahlung", "betrag"
        ), text)
        balance = _number_after(("guthaben per", "saldo per", "avoir au", "capital"), text)
        provider = _text_after(("stiftung", "vorsorgestiftung", "bank", "institution", "provider"), text)

        data = {}
        conf = {}
        if amount is not None:
            data["contribution_amount"] = amount
            conf["contribution_amount"] = 0.90
        if balance is not None:
            data["balance"] = balance
            conf["balance"] = 0.85
        if provider:
            data["provider_name"] = provider
            conf["provider_name"] = 0.80

        _attach_reviews(data, conf)
        return "pillar3a", 0.88, data, conf

    # 3. Bank Statement (Kontoauszug / Relevé bancaire)
    if any(term in haystack for term in (
        "bank statement", "kontoauszug", "vermögensausweis", "depotauszug", "steuerausweis",
        "relevé de compte", "relevé bancaire", "extrait de compte", "estratto conto"
    )):
        balance = _number_after((
            "saldo per 31.12", "saldo per", "solde au 31.12", "solde au",
            "balance", "saldo", "solde", "guthaben", "schlussbestand"
        ), text)
        interest = _number_after((
            "habenzins brutto", "habenzins", "intérêts bruts", "intérêts",
            "interest", "zins"
        ), text)
        iban_match = re.search(r"\b(CH[0-9]{2}[0-9A-Z ]{15,26})\b", text)
        bank_name = _text_after(("bank", "institut", "finanzinstitut"), text)

        data = {}
        conf = {}
        if balance is not None:
            data["balance"] = balance
            conf["balance"] = 0.85
        if interest is not None:
            data["interest_earned"] = interest
            conf["interest_earned"] = 0.80
        if iban_match:
            data["iban"] = iban_match.group(1).replace(" ", "")
            conf["iban"] = 0.95
        if bank_name:
            data["bank_name"] = bank_name
            conf["bank_name"] = 0.80

        _attach_reviews(data, conf)
        return "bank_statement", 0.85, data, conf

    # 4. Securities Statement (Wertschriftenverzeichnis / Depotauszug)
    if any(term in haystack for term in (
        "securities", "wertschriften", "depot", "titres", "shares", "portfolio", "aktien"
    )):
        val = _number_after(("steuerwert", "total depotwert", "valeur fiscale", "total value", "depotwert"), text)
        div = _number_after(("dividenden", "ertrag", "rendement", "dividends"), text)
        isin_match = re.search(r"\b([A-Z]{2}[A-Z0-9]{9}[0-9])\b", text)

        data = {}
        conf = {}
        if val is not None:
            data["total_value"] = val
            conf["total_value"] = 0.85
        if div is not None:
            data["dividends_received"] = div
            conf["dividends_received"] = 0.80
        if isin_match:
            data["isin"] = isin_match.group(1)
            conf["isin"] = 0.95

        _attach_reviews(data, conf)
        return "securities_statement", 0.85, data, conf

    # 5. Mortgage Statement (Hypothekarausweis)
    if any(term in haystack for term in ("mortgage", "hypothek", "hypothèque", "schulden")):
        bal = _number_after(("schuldsaldo", "hypothekarsaldo", "solde dette", "outstanding balance", "saldo"), text)
        interest = _number_after(("schuldzins", "hypothekarzins", "intérêts payés", "interest paid"), text)
        lender = _text_after(("bank", "gläubiger", "créancier", "lender"), text)

        data = {}
        conf = {}
        if bal is not None:
            data["mortgage_balance"] = bal
            conf["mortgage_balance"] = 0.85
        if interest is not None:
            data["interest_paid"] = interest
            conf["interest_paid"] = 0.85
        if lender:
            data["lender_name"] = lender
            conf["lender_name"] = 0.80

        _attach_reviews(data, conf)
        return "mortgage", 0.85, data, conf

    # 6. Donations (Spendenbescheinigung)
    if any(term in haystack for term in ("spende", "donation", "don", "zuwendung")):
        amt = _number_after(("spendenbetrag", "montant du don", "betrag", "amount"), text)
        org = _text_after(("organisation", "empfänger", "beneficiary", "verein", "stiftung"), text)

        data = {}
        conf = {}
        if amt is not None:
            data["amount"] = amt
            conf["amount"] = 0.90
        if org:
            data["organisation_name"] = org
            conf["organisation_name"] = 0.85

        _attach_reviews(data, conf)
        return "donation", 0.85, data, conf

    # 7. Health / Life Insurance
    if any(term in haystack for term in ("versicherung", "assurance", "insurance", "krankenkasse", "police")):
        prem = _number_after(("prämie", "prime", "premium", "jahresprämie"), text)
        insurer = _text_after(("versicherer", "assurance", "insurer", "gesellschaft"), text)

        data = {}
        conf = {}
        if prem is not None:
            data["premium_amount"] = prem
            conf["premium_amount"] = 0.85
        if insurer:
            data["insurer_name"] = insurer
            conf["insurer_name"] = 0.80

        _attach_reviews(data, conf)
        return "insurance", 0.80, data, conf

    # Fallback to Other
    data = {"extraction_note": "Document successfully stored and OCR indexed."}
    _attach_reviews(data, {})
    return "other", 0.50, data, {}


def _attach_reviews(data: dict, conf: dict) -> None:
    """Attach structured review state for each detected field."""
    reviews = {}
    for k, v in data.items():
        if not k.startswith("_") and v is not None:
            reviews[k] = {
                "field_name": k,
                "value": v,
                "confidence": conf.get(k, 0.85),
                "status": "needs_review",
            }
    data["_reviews"] = reviews


def _validate_mime(content_type: str, file_bytes: bytes, filename: str = "") -> str:
    """Validate MIME type against allowed list."""
    detected = detect_mime(file_bytes[:4096], filename=filename, content_type=content_type)
    if detected not in settings.ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"File format '{detected}' is not supported. "
                "Accepted formats: PDF, JPG, JPEG, PNG, WEBP, TIFF, HEIC, HEIF."
            ),
        )
    return detected


async def _get_owned_document(
    db: AsyncSession, document_id: str, user_id: str
) -> Document:
    result = await db.execute(
        select(Document).where(
            Document.id == str(document_id),
            Document.user_id == str(user_id),
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found"
        )
    return doc


async def apply_document_to_tax_profile(
    db: AsyncSession, document: Document, profile: TaxProfile
) -> List[str]:
    """
    Merge approved extracted fields from this document into the TaxProfile.
    Enforces human review: only approved or edited fields are merged.
    """
    return await document_pipeline_service.apply_approved_fields_to_profile(document, profile, db)


async def _process_locally(document: Document, db: AsyncSession) -> None:
    """Execute unified document processing pipeline."""
    await document_pipeline_service.process_document(str(document.id), db)


# ── Upload ────────────────────────────────────────────────────────────────────


@router.post(
    "/documents/upload",
    response_model=List[DocumentUploadResponse],
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload one or more documents for processing",
)
async def upload_documents(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(..., description="One or more files to upload"),
    tax_return_id: Optional[str] = Query(
        None, description="Associate uploaded files with a tax return"
    ),
    category: Optional[str] = Query(
        None, description="Pre-assigned document category"
    ),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[DocumentUploadResponse]:
    """Upload documents with file size and format validation."""
    await set_rls_user_id(db, current_user.id)

    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one file must be selected for upload.",
        )

    if tax_return_id:
        tr_result = await db.execute(
            select(TaxReturn).where(
                TaxReturn.id == str(tax_return_id),
                TaxReturn.user_id == str(current_user.id),
            )
        )
        tr = tr_result.scalar_one_or_none()
        if not tr:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tax return not found or access denied.",
            )
        if tr.status == "confirmed":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot upload documents to a confirmed tax return. Reopen the tax return first.",
            )

    responses: List[DocumentUploadResponse] = []
    doc_ids_to_process: List[str] = []

    for file in files:
        file_bytes = await file.read()

        if len(file_bytes) > settings.max_upload_size_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=(
                    f"File '{file.filename}' exceeds the maximum allowed size of {settings.MAX_UPLOAD_SIZE_MB} MB."
                ),
            )

        if len(file_bytes) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File '{file.filename}' is empty.",
            )

        detected_mime = _validate_mime(file.content_type or "", file_bytes, filename=file.filename or "")
        sha256 = _compute_sha256(file_bytes)

        dup_result = await db.execute(
            select(Document.id).where(
                Document.user_id == str(current_user.id),
                Document.sha256_hash == sha256,
            ).limit(1)
        )
        is_dup = dup_result.scalars().first() is not None

        doc_id = str(uuid_mod.uuid4())
        ext = mimetypes.guess_extension(detected_mime) or ""
        storage_key = f"users/{current_user.id}/{doc_id}/{file.filename or f'document{ext}'}"

        try:
            await storage.upload_file(file_bytes, storage_key, detected_mime)
        except Exception as storage_exc:
            logger.error("Storage upload failed: %s", storage_exc)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Document storage service is currently unavailable. Please verify storage configuration.",
            )

        doc_type_val = category if category in SUPPORTED_CATEGORIES else None

        document = Document(
            id=doc_id,
            user_id=str(current_user.id),
            tax_return_id=str(tax_return_id) if tax_return_id else None,
            original_filename=file.filename or f"document{ext}",
            storage_key=storage_key,
            mime_type=detected_mime,
            file_size_bytes=len(file_bytes),
            document_type=doc_type_val,
            sha256_hash=sha256,
            is_duplicate_suspect=is_dup,
            processing_status="queued",
        )
        db.add(document)
        await db.flush()

        db.add(
            AuditLog(
                user_id=str(current_user.id),
                action="document.upload",
                resource_type="document",
                resource_id=str(doc_id),
                extra_data=json.dumps({
                    "filename": document.original_filename,
                    "mime_type": detected_mime,
                    "size_bytes": len(file_bytes),
                    "is_duplicate_suspect": is_dup,
                }),
            )
        )

        doc_ids_to_process.append(str(doc_id))

        responses.append(
            DocumentUploadResponse(
                id=doc_id,
                original_filename=document.original_filename,
                processing_status="queued",
                message="File uploaded and queued for processing"
                + (" (Notice: Possible duplicate document detected)" if is_dup else ""),
            )
        )

    # Invalidate existing tax calculation snapshots since new documents were uploaded
    if tax_return_id:
        await db.execute(
            update(TaxCalculation)
            .where(TaxCalculation.tax_return_id == str(tax_return_id))
            .values(status="stale")
        )

    await db.commit()

    # Dispatch background processing after successful database commit
    for d_id in doc_ids_to_process:
        dispatched = False
        if settings.ENVIRONMENT != "development":
            try:
                process_document.delay(d_id)
                dispatched = True
            except Exception:
                pass
        if not dispatched:
            background_tasks.add_task(document_pipeline_service.process_document_by_id, d_id)

    return responses


# ── List ──────────────────────────────────────────────────────────────────────


@router.get(
    "/documents",
    response_model=DocumentListResponse,
    summary="List current user's documents",
)
async def list_documents(
    tax_return_id: Optional[str] = Query(None),
    processing_status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentListResponse:
    await set_rls_user_id(db, current_user.id)

    base_q = select(Document).where(Document.user_id == str(current_user.id))
    if tax_return_id:
        base_q = base_q.where(Document.tax_return_id == str(tax_return_id))
    if processing_status:
        base_q = base_q.where(Document.processing_status == processing_status)
    if category:
        base_q = base_q.where(Document.document_type == category)

    count_q = select(func.count()).select_from(base_q.subquery())
    total = (await db.execute(count_q)).scalar_one()

    items_q = (
        base_q.order_by(Document.uploaded_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = (await db.execute(items_q)).scalars().all()

    return DocumentListResponse(
        items=[DocumentResponse.model_validate(d) for d in items],
        total=total,
        page=page,
        page_size=page_size,
    )


# ── Get single ────────────────────────────────────────────────────────────────


@router.get(
    "/documents/{document_id}",
    response_model=DocumentResponse,
    summary="Get document details and extracted data",
)
async def get_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentResponse:
    await set_rls_user_id(db, current_user.id)
    doc = await _get_owned_document(db, document_id, str(current_user.id))
    return DocumentResponse.model_validate(doc)


# ── Download URLs ─────────────────────────────────────────────────────────────


@router.get(
    "/documents/{document_id}/download-url",
    response_model=PresignedUrlResponse,
    summary="Get presigned download/preview URL",
)
@router.get(
    "/documents/{document_id}/download",
    response_model=PresignedUrlResponse,
    summary="Get presigned download URL",
)
async def get_download_url(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PresignedUrlResponse:
    await set_rls_user_id(db, current_user.id)
    doc = await _get_owned_document(db, document_id, str(current_user.id))
    try:
        url = await storage.generate_presigned_url(doc.storage_key, expires_seconds=600)
    except Exception as exc:
        logger.error("Presigned URL generation failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Storage service is unavailable for file download.",
        )
    return PresignedUrlResponse(url=url, expires_in_seconds=600)


# ── Processing Status ─────────────────────────────────────────────────────────


@router.get(
    "/documents/{document_id}/status",
    response_model=DocumentStatusResponse,
    summary="Poll processing status",
)
async def get_document_status(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentStatusResponse:
    await set_rls_user_id(db, current_user.id)
    doc = await _get_owned_document(db, document_id, str(current_user.id))
    return DocumentStatusResponse(
        id=doc.id,
        processing_status=doc.processing_status,
        document_type=doc.document_type,
        classification_confidence=doc.classification_confidence,
        processed_at=doc.processed_at,
        is_duplicate_suspect=doc.is_duplicate_suspect,
    )


# ── Review Extracted Fields ───────────────────────────────────────────────────


@router.put(
    "/documents/{document_id}/review",
    response_model=DocumentResponse,
    summary="Edit, approve, reject, or reset extracted fields",
)
async def review_document(
    document_id: str,
    payload: DocumentReviewRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentResponse:
    await set_rls_user_id(db, current_user.id)
    doc = await _get_owned_document(db, document_id, str(current_user.id))

    current_data = dict(doc.extracted_data or {})
    current_reviews = dict(current_data.get("_reviews") or {})

    if payload.document_type:
        doc.document_type = payload.document_type

    if payload.fields:
        for k, v in payload.fields.items():
            current_data[k] = v
            rev = current_reviews.get(k, {})
            rev["value"] = v
            rev["status"] = "edited"
            current_reviews[k] = rev

    if payload.field_statuses:
        for k, st in payload.field_statuses.items():
            rev = current_reviews.get(k, {"value": current_data.get(k)})
            rev["status"] = st
            current_reviews[k] = rev

    current_data["_reviews"] = current_reviews
    doc.extracted_data = current_data
    if not payload.apply_to_profile and doc.processing_status != "completed":
        doc.processing_status = "needs_review"

    if payload.apply_to_profile and doc.tax_return_id:
        profile_res = await db.execute(
            select(TaxProfile).where(TaxProfile.tax_return_id == str(doc.tax_return_id))
        )
        profile = profile_res.scalar_one_or_none()
        if profile:
            await document_pipeline_service.apply_approved_fields_to_profile(doc, profile, db)
    else:
        db.add(doc)
        await db.commit()

    await db.refresh(doc)
    return DocumentResponse.model_validate(doc)


# ── Apply Document to Profile ─────────────────────────────────────────────────


@router.post(
    "/documents/{document_id}/apply",
    summary="Apply approved extracted data to associated tax profile",
)
async def apply_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    await set_rls_user_id(db, current_user.id)
    doc = await _get_owned_document(db, document_id, str(current_user.id))

    if not doc.tax_return_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Document is not associated with a tax return.",
        )

    profile_res = await db.execute(
        select(TaxProfile).where(TaxProfile.tax_return_id == str(doc.tax_return_id))
    )
    profile = profile_res.scalar_one_or_none()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tax profile not found for this return.",
        )

    applied = await document_pipeline_service.apply_approved_fields_to_profile(doc, profile, db)
    return {
        "message": f"Successfully applied {len(applied)} approved fields to tax profile.",
        "applied_fields": applied,
    }


# ── Retry Processing ──────────────────────────────────────────────────────────


@router.post(
    "/documents/{document_id}/retry",
    response_model=DocumentRetryResponse,
    summary="Retry OCR processing for a document",
)
async def retry_document_processing(
    document_id: str,
    background_tasks: BackgroundTasks = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentRetryResponse:
    await set_rls_user_id(db, current_user.id)
    doc = await _get_owned_document(db, document_id, str(current_user.id))

    # Reset status and clear prior error message
    doc.processing_status = "queued"
    payload = dict(doc.extracted_data or {})
    payload.pop("_error_message", None)
    payload.pop("error", None)
    doc.extracted_data = payload
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    try:
        process_document.delay(str(doc.id))
    except Exception:
        if background_tasks is not None:
            background_tasks.add_task(document_pipeline_service.process_document_by_id, str(doc.id))
        else:
            await document_pipeline_service.process_document(str(doc.id), db)

    return DocumentRetryResponse(
        id=doc.id,
        processing_status="queued",
        message="Document processing re-queued successfully.",
    )


# ── Update metadata ───────────────────────────────────────────────────────────


@router.put(
    "/documents/{document_id}",
    response_model=DocumentResponse,
    summary="Update document classification or tax return association",
)
async def update_document(
    document_id: str,
    payload: DocumentUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentResponse:
    await set_rls_user_id(db, current_user.id)
    doc = await _get_owned_document(db, document_id, str(current_user.id))

    if payload.document_type is not None:
        doc.document_type = payload.document_type

    if payload.tax_return_id is not None:
        new_tr_id = str(payload.tax_return_id)
        if new_tr_id != str(doc.tax_return_id):
            tr_result = await db.execute(
                select(TaxReturn).where(
                    TaxReturn.id == new_tr_id,
                    TaxReturn.user_id == str(current_user.id),
                )
            )
            target_tr = tr_result.scalar_one_or_none()
            if not target_tr:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Target tax return not found",
                )
            if target_tr.status == "confirmed":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Cannot assign documents to a confirmed tax return. Reopen the tax return first.",
                )

            # Reconcile: Retract contributions from the previous tax return
            if doc.tax_return_id:
                old_tr_res = await db.execute(
                    select(TaxReturn).where(TaxReturn.id == str(doc.tax_return_id))
                )
                old_tr = old_tr_res.scalar_one_or_none()
                if old_tr and old_tr.status == "confirmed":
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="Cannot reassign documents from a confirmed tax return. Reopen the tax return first.",
                    )
                await document_pipeline_service.retract_document_contributions(
                    document_id=str(doc.id),
                    tax_return_id=str(doc.tax_return_id),
                    db=db,
                )
                await db.execute(
                    update(TaxCalculation)
                    .where(TaxCalculation.tax_return_id == str(doc.tax_return_id))
                    .values(status="stale")
                )

            doc.tax_return_id = new_tr_id
            await db.execute(
                update(TaxCalculation)
                .where(TaxCalculation.tax_return_id == new_tr_id)
                .values(status="stale")
            )

    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return DocumentResponse.model_validate(doc)


# ── Delete ────────────────────────────────────────────────────────────────────


@router.delete(
    "/documents/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
    summary="Delete a document",
)
async def delete_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await set_rls_user_id(db, current_user.id)
    doc = await _get_owned_document(db, document_id, str(current_user.id))

    if doc.tax_return_id:
        tr_res = await db.execute(
            select(TaxReturn).where(TaxReturn.id == str(doc.tax_return_id))
        )
        tr = tr_res.scalar_one_or_none()
        if tr and tr.status == "confirmed":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cannot delete documents associated with a confirmed tax return. Reopen the tax return first.",
            )

        # Retract financial contributions and metadata from tax profile
        await document_pipeline_service.retract_document_contributions(
            document_id=str(doc.id),
            tax_return_id=str(doc.tax_return_id),
            db=db,
        )

        # Invalidate existing calculation snapshots
        await db.execute(
            update(TaxCalculation)
            .where(TaxCalculation.tax_return_id == str(doc.tax_return_id))
            .values(status="stale")
        )

    try:
        await storage.delete_file(doc.storage_key)
    except Exception as exc:
        logger.warning("Could not delete storage file: %s", exc)

    db.add(
        AuditLog(
            user_id=str(current_user.id),
            action="document.deleted",
            resource_type="document",
            resource_id=str(doc.id),
            extra_data=json.dumps({"filename": doc.original_filename}),
        )
    )
    await db.delete(doc)
    await db.commit()
