"""
Celery task workers for document OCR and AI extraction.
"""
from __future__ import annotations

import hashlib
import io
import logging
from datetime import datetime, timezone
from typing import Optional
import json

from celery import chain

from app.tasks.celery_app import celery_app
from app.services import ai_extraction_service

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers – import heavy deps lazily to keep startup fast
# ---------------------------------------------------------------------------
def _get_db_sync():
    """Return a synchronous psycopg2 connection for use in Celery workers."""
    import psycopg2
    import os
    # Build a sync URL from the async one
    db_url = os.environ.get("DATABASE_URL", "").replace("postgresql+asyncpg://", "postgresql://")
    return psycopg2.connect(db_url)


def _download_from_storage(storage_key: str) -> bytes:
    """Download file bytes from MinIO."""
    import boto3, os
    s3 = boto3.client(
        "s3",
        endpoint_url=f"http{'s' if os.environ.get('MINIO_USE_SSL','false')=='true' else ''}://{os.environ.get('MINIO_ENDPOINT','localhost:9000')}",
        aws_access_key_id=os.environ.get("MINIO_ACCESS_KEY", "minioadmin"),
        aws_secret_access_key=os.environ.get("MINIO_SECRET_KEY", "minioadmin"),
    )
    bucket = os.environ.get("MINIO_BUCKET_NAME", "suntax-documents")
    obj = s3.get_object(Bucket=bucket, Key=storage_key)
    return obj["Body"].read()


def _extract_text_from_pdf(file_bytes: bytes) -> str:
    """Extract text from PDF using PyMuPDF (fitz)."""
    import fitz  # PyMuPDF
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    texts = []
    for page in doc:
        texts.append(page.get_text())
    return "\n".join(texts)


def _is_text_sparse(text: str, min_chars: int = 100) -> bool:
    """Return True if extracted text is too sparse (scanned PDF)."""
    return len(text.strip()) < min_chars


# ---------------------------------------------------------------------------
# Task: process_document
# ---------------------------------------------------------------------------
@celery_app.task(bind=True, max_retries=3, default_retry_delay=10)
def process_document(self, document_id: str):
    """
    Step 1: Download document, extract text/OCR, update DB.
    Then chain to extract_document_data.
    """
    conn = None
    try:
        conn = _get_db_sync()
        cur = conn.cursor()

        # Fetch document record
        cur.execute(
            "SELECT storage_key, mime_type, tax_return_id FROM documents WHERE id = %s",
            (document_id,)
        )
        row = cur.fetchone()
        if not row:
            logger.error("Document %s not found", document_id)
            return

        storage_key, mime_type, tax_return_id = row

        # Update status to processing
        cur.execute(
            "UPDATE documents SET processing_status = 'processing' WHERE id = %s",
            (document_id,)
        )
        conn.commit()

        # Download file
        file_bytes = _download_from_storage(storage_key)

        # Extract text
        ocr_text = ""
        if "pdf" in mime_type.lower():
            ocr_text = _extract_text_from_pdf(file_bytes)
            if _is_text_sparse(ocr_text):
                # Scanned PDF – we'll rely on Gemini Vision for extraction
                logger.info("Document %s is a scanned PDF, will use vision extraction", document_id)
                ocr_text = "[scanned-pdf]"
        else:
            # Image – OCR via pytesseract as fallback text
            try:
                from PIL import Image
                import pytesseract
                img = Image.open(io.BytesIO(file_bytes))
                ocr_text = pytesseract.image_to_string(img, lang="deu+eng")
            except Exception as e:
                logger.warning("OCR fallback failed: %s", e)
                ocr_text = ""

        # Save OCR text
        cur.execute(
            "UPDATE documents SET ocr_text = %s WHERE id = %s",
            (ocr_text, document_id)
        )
        conn.commit()

        # Chain to AI extraction
        extract_document_data.delay(document_id)

    except Exception as exc:
        logger.exception("process_document failed for %s", document_id)
        if conn:
            try:
                conn.execute(
                    "UPDATE documents SET processing_status = 'failed' WHERE id = %s",
                    (document_id,)
                )
                conn.commit()
            except Exception:
                pass
        raise self.retry(exc=exc)
    finally:
        if conn:
            conn.close()


# ---------------------------------------------------------------------------
# Task: extract_document_data
# ---------------------------------------------------------------------------
@celery_app.task(bind=True, max_retries=2, default_retry_delay=15)
def extract_document_data(self, document_id: str):
    """
    Step 2: Classify and extract structured data from document using Gemini.
    """
    conn = None
    try:
        conn = _get_db_sync()
        cur = conn.cursor()

        cur.execute(
            "SELECT storage_key, mime_type, tax_return_id FROM documents WHERE id = %s",
            (document_id,)
        )
        row = cur.fetchone()
        if not row:
            return

        storage_key, mime_type, tax_return_id = row
        file_bytes = _download_from_storage(storage_key)

        # Classify
        doc_type, confidence = ai_extraction_service.classify_document(file_bytes, mime_type)
        logger.info("Document %s classified as %s (%.2f)", document_id, doc_type, confidence)

        # Extract
        extracted = ai_extraction_service.extract_document((file_bytes), mime_type, doc_type)

        # Compute per-field confidence summary
        extraction_confidence = extracted.pop("confidence_scores", {})

        # Update document record
        cur.execute(
            """UPDATE documents SET
                document_type = %s,
                classification_confidence = %s,
                extracted_data = %s,
                extraction_confidence = %s,
                processing_status = 'done',
                processed_at = %s
            WHERE id = %s""",
            (
                doc_type.value,
                confidence,
                json.dumps(extracted),
                json.dumps(extraction_confidence),
                datetime.now(timezone.utc),
                document_id,
            )
        )
        conn.commit()

        # If attached to a tax return, merge into profile
        if tax_return_id:
            merge_document_into_profile.delay(str(tax_return_id))

    except Exception as exc:
        logger.exception("extract_document_data failed for %s", document_id)
        if conn:
            try:
                cur.execute(
                    "UPDATE documents SET processing_status = 'failed' WHERE id = %s",
                    (document_id,)
                )
                conn.commit()
            except Exception:
                pass
        raise self.retry(exc=exc)
    finally:
        if conn:
            conn.close()


# ---------------------------------------------------------------------------
# Task: merge_document_into_profile
# ---------------------------------------------------------------------------
@celery_app.task(bind=True, max_retries=2, default_retry_delay=10)
def merge_document_into_profile(self, tax_return_id: str):
    """
    Step 3: Merge all processed documents into the unified tax profile.
    Detect conflicts, duplicates, and generate questions.
    """
    conn = None
    try:
        conn = _get_db_sync()
        cur = conn.cursor()

        # Fetch all done documents for this tax return
        cur.execute(
            """SELECT id, document_type, extracted_data
               FROM documents
               WHERE tax_return_id = %s AND processing_status = 'done'
               AND extracted_data IS NOT NULL""",
            (tax_return_id,)
        )
        docs = cur.fetchall()

        if not docs:
            return

        # Load or create profile
        cur.execute("SELECT id FROM tax_profiles WHERE tax_return_id = %s", (tax_return_id,))
        profile_row = cur.fetchone()

        profile = {
            "personal_data": {},
            "income": {},
            "wealth": {},
            "deductions": {},
            "liabilities": {},
            "securities": [],
            "real_estate": [],
            "flags": [],
            "questions": [],
        }

        if profile_row:
            cur.execute(
                """SELECT personal_data, income, wealth, deductions, liabilities, securities, real_estate, flags, questions
                   FROM tax_profiles WHERE tax_return_id = %s""",
                (tax_return_id,)
            )
            row = cur.fetchone()
            if row:
                profile = {
                    "personal_data": row[0] or {},
                    "income": row[1] or {},
                    "wealth": row[2] or {},
                    "deductions": row[3] or {},
                    "liabilities": row[4] or {},
                    "securities": row[5] or [],
                    "real_estate": row[6] or [],
                    "flags": row[7] or [],
                    "questions": row[8] or [],
                }

        flags = []
        questions = []

        for doc_id, doc_type, extracted_data in docs:
            if not extracted_data:
                continue

            data = extracted_data if isinstance(extracted_data, dict) else json.loads(extracted_data)

            if doc_type == "salary_certificate":
                _merge_salary(profile, data, flags)
            elif doc_type == "bank_statement":
                _merge_bank(profile, data, flags)
            elif doc_type == "securities_statement":
                _merge_securities(profile, data, flags)
            elif doc_type == "pillar3a":
                _merge_pillar3a(profile, data, flags)
            elif doc_type == "insurance":
                _merge_insurance(profile, data, flags)
            elif doc_type == "mortgage":
                _merge_mortgage(profile, data, flags)
            elif doc_type == "tax_assessment":
                _merge_tax_assessment(profile, data, flags)
            elif doc_type == "donation_receipt":
                _merge_donation(profile, data, flags)

        # Generate questions for missing critical fields
        questions = _generate_questions(profile)

        profile["flags"] = flags
        profile["questions"] = questions

        # Upsert profile
        if profile_row:
            cur.execute(
                """UPDATE tax_profiles SET
                    personal_data = %s, income = %s, wealth = %s,
                    deductions = %s, liabilities = %s, securities = %s,
                    real_estate = %s, flags = %s, questions = %s,
                    updated_at = NOW()
                   WHERE tax_return_id = %s""",
                (
                    json.dumps(profile["personal_data"]),
                    json.dumps(profile["income"]),
                    json.dumps(profile["wealth"]),
                    json.dumps(profile["deductions"]),
                    json.dumps(profile["liabilities"]),
                    json.dumps(profile["securities"]),
                    json.dumps(profile["real_estate"]),
                    json.dumps(flags),
                    json.dumps(questions),
                    tax_return_id,
                )
            )
        else:
            cur.execute(
                """INSERT INTO tax_profiles
                   (tax_return_id, personal_data, income, wealth, deductions, liabilities, securities, real_estate, flags, questions)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    tax_return_id,
                    json.dumps(profile["personal_data"]),
                    json.dumps(profile["income"]),
                    json.dumps(profile["wealth"]),
                    json.dumps(profile["deductions"]),
                    json.dumps(profile["liabilities"]),
                    json.dumps(profile["securities"]),
                    json.dumps(profile["real_estate"]),
                    json.dumps(flags),
                    json.dumps(questions),
                )
            )

        conn.commit()
        logger.info("Profile merged for tax_return %s", tax_return_id)

    except Exception as exc:
        logger.exception("merge_document_into_profile failed for %s", tax_return_id)
        raise self.retry(exc=exc)
    finally:
        if conn:
            conn.close()


# ---------------------------------------------------------------------------
# Merge helpers
# ---------------------------------------------------------------------------
def _flag_conflict(flags: list, field: str, val1, val2, doc_type: str):
    flags.append({
        "type": "conflict",
        "field": field,
        "message": f"Conflicting values for '{field}': '{val1}' vs '{val2}' in {doc_type}",
        "severity": "warning",
    })


def _merge_salary(profile: dict, data: dict, flags: list):
    pd = profile["personal_data"]
    inc = profile["income"]

    if data.get("employee_name"):
        if "name" in pd and pd["name"] != data["employee_name"]:
            _flag_conflict(flags, "name", pd["name"], data["employee_name"], "salary_certificate")
        else:
            pd["name"] = data["employee_name"]

    if data.get("employee_address"):
        pd.setdefault("address", data["employee_address"])

    if data.get("ahv_number"):
        pd.setdefault("ahv_number", data["ahv_number"])

    if data.get("gross_salary") is not None:
        employers = inc.setdefault("employers", [])
        employer_entry = {
            "employer_name": data.get("employer_name"),
            "gross_salary": data.get("gross_salary"),
            "net_salary": data.get("net_salary"),
            "withholding_tax": data.get("withholding_tax"),
            "tax_year": data.get("tax_year"),
            "company_car_benefit": data.get("company_car_benefit"),
            "expense_allowance": data.get("expense_allowance"),
        }
        # Check for duplicate employer entry
        existing = next((e for e in employers if e.get("employer_name") == data.get("employer_name")), None)
        if existing:
            if existing.get("gross_salary") != data.get("gross_salary"):
                _flag_conflict(flags, "gross_salary", existing["gross_salary"], data["gross_salary"], "salary_certificate")
        else:
            employers.append(employer_entry)

    # Total employment income
    employers = inc.get("employers", [])
    inc["total_employment_income"] = sum(e.get("gross_salary") or 0 for e in employers)


def _merge_bank(profile: dict, data: dict, flags: list):
    wealth = profile["wealth"]
    accounts = wealth.setdefault("bank_accounts", [])

    existing = next((a for a in accounts if a.get("iban") == data.get("iban") and data.get("iban")), None)
    if existing:
        if existing.get("balance") != data.get("balance") and data.get("balance") is not None:
            _flag_conflict(flags, "bank_balance", existing["balance"], data["balance"], "bank_statement")
    else:
        accounts.append({
            "bank_name": data.get("bank_name"),
            "iban": data.get("iban"),
            "account_number": data.get("account_number"),
            "balance": data.get("balance"),
            "balance_date": data.get("balance_date"),
            "currency": data.get("currency", "CHF"),
            "interest_earned": data.get("interest_earned"),
        })

    # Accumulate interest
    income = profile["income"]
    if data.get("interest_earned"):
        income["bank_interest"] = (income.get("bank_interest") or 0) + data["interest_earned"]


def _merge_securities(profile: dict, data: dict, flags: list):
    secs = profile["securities"]
    positions = data.get("positions", [])
    for pos in positions:
        existing = next((s for s in secs if s.get("isin") == pos.get("isin") and pos.get("isin")), None)
        if existing:
            if existing.get("value") != pos.get("value") and pos.get("value") is not None:
                _flag_conflict(flags, f"securities_value_{pos.get('isin')}", existing["value"], pos["value"], "securities_statement")
        else:
            secs.append(pos)

    income = profile["income"]
    if data.get("dividends_received"):
        income["dividends"] = (income.get("dividends") or 0) + data["dividends_received"]


def _merge_pillar3a(profile: dict, data: dict, flags: list):
    deductions = profile["deductions"]
    p3a = deductions.setdefault("pillar3a", [])
    p3a.append({
        "provider": data.get("provider_name"),
        "contribution": data.get("contribution_amount"),
        "balance": data.get("balance"),
        "year": data.get("year"),
    })
    deductions["pillar3a_total"] = sum(
        (e.get("contribution") or 0) for e in p3a
    )


def _merge_insurance(profile: dict, data: dict, flags: list):
    deductions = profile["deductions"]
    insurances = deductions.setdefault("insurance_premiums", [])
    insurances.append({
        "insurer": data.get("insurer_name"),
        "type": data.get("policy_type"),
        "annual_premium": data.get("premium_annual"),
    })


def _merge_mortgage(profile: dict, data: dict, flags: list):
    liabilities = profile["liabilities"]
    mortgages = liabilities.setdefault("mortgages", [])
    mortgages.append({
        "bank": data.get("bank_name"),
        "property_address": data.get("property_address"),
        "balance": data.get("mortgage_balance"),
        "interest_rate": data.get("interest_rate"),
        "annual_interest": data.get("annual_interest"),
    })
    liabilities["total_mortgage_debt"] = sum((m.get("balance") or 0) for m in mortgages)
    deductions = profile["deductions"]
    deductions["mortgage_interest"] = sum((m.get("annual_interest") or 0) for m in mortgages)


def _merge_tax_assessment(profile: dict, data: dict, flags: list):
    pd = profile["personal_data"]
    if data.get("taxpayer_name"):
        pd.setdefault("name", data["taxpayer_name"])


def _merge_donation(profile: dict, data: dict, flags: list):
    deductions = profile["deductions"]
    donations = deductions.setdefault("donations", [])
    donations.append({
        "organization": data.get("organization_name"),
        "amount": data.get("amount"),
        "year": data.get("year"),
        "tax_deductible": data.get("is_tax_deductible"),
    })
    deductions["donations_total"] = sum(
        (d.get("amount") or 0) for d in donations if d.get("tax_deductible") is not False
    )


def _generate_questions(profile: dict) -> list:
    questions = []
    pd = profile.get("personal_data", {})

    if not pd.get("name"):
        questions.append({"id": "personal_name", "category": "personal", "question": "Wie lautet Ihr vollständiger Name?", "answer": None, "is_answered": False})
    if not pd.get("address"):
        questions.append({"id": "personal_address", "category": "personal", "question": "Wie lautet Ihre Wohnadresse per 31. Dezember?", "answer": None, "is_answered": False})
    if not pd.get("date_of_birth"):
        questions.append({"id": "personal_dob", "category": "personal", "question": "Was ist Ihr Geburtsdatum?", "answer": None, "is_answered": False})
    if not pd.get("marital_status"):
        questions.append({"id": "personal_marital", "category": "personal", "question": "Was ist Ihr Zivilstand? (ledig, verheiratet, geschieden, verwitwet)", "answer": None, "is_answered": False})

    inc = profile.get("income", {})
    if not inc.get("employers") and not inc.get("total_employment_income"):
        questions.append({"id": "income_employment", "category": "income", "question": "Haben Sie im Steuerjahr Erwerbseinkommen erzielt? Falls ja, laden Sie bitte Ihren Lohnausweis hoch.", "answer": None, "is_answered": False})

    ded = profile.get("deductions", {})
    if not ded.get("pillar3a") and not ded.get("pillar3a_total"):
        questions.append({"id": "deduction_3a", "category": "deductions", "question": "Haben Sie Beiträge in die Säule 3a einbezahlt?", "answer": None, "is_answered": False})

    return questions
