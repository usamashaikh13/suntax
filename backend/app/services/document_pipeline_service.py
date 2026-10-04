"""
Unified Document Processing Pipeline Service for SunTax.

Implements the single shared background processing pipeline used by:
  - Initial upload background jobs
  - Manual retry endpoint
  - Celery workers (if active)
  - Recovery of stuck/stale jobs

Lifecycle States:
  queued -> processing -> needs_review -> completed
                       -> failed
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.document import Document
from app.models.tax_calculation import TaxCalculation
from app.models.tax_profile import TaxProfile
from app.models.tax_return import TaxReturn
from app.services.document_extractor import document_extractor
from app.services.ocr_service import (
    OcrCorruptError,
    OcrError,
    OcrFormatError,
    OcrLimitError,
    OcrSecurityError,
    ocr_service,
)
from app.services.storage_service import StorageService

logger = logging.getLogger(__name__)
storage = StorageService()


class DocumentPipelineService:
    """Enterprise document processing pipeline ensuring deterministic OCR, safety, and human review."""

    async def process_document_by_id(self, document_id: str, raise_on_failure: bool = False) -> None:
        """Entrypoint for background tasks and Celery workers creating their own session."""
        async with AsyncSessionLocal() as session:
            try:
                await self.process_document(document_id, session, raise_on_transient_error=raise_on_failure)
            except Exception as exc:
                logger.exception("Pipeline fatal error for document %s: %s", document_id, exc)
                if raise_on_failure:
                    raise

    async def mark_document_failed_by_id(self, document_id: str, error_message: str) -> None:
        """Mark a document as failed when worker retries are exhausted or a fatal error occurs."""
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(Document).where(Document.id == document_id))
            doc = result.scalar_one_or_none()
            if doc:
                await self._mark_failed(doc, error_message, session)

    async def process_document(
        self,
        document_id: str,
        db: AsyncSession,
        raise_on_transient_error: bool = False,
    ) -> Document:
        """
        Execute full OCR and structured data extraction for a document.
        Leaves document in 'needs_review' on success or 'failed' on error.
        NEVER automatically merges unreviewed data into the taxpayer's profile.
        """
        result = await db.execute(select(Document).where(Document.id == document_id))
        doc = result.scalar_one_or_none()
        if not doc:
            raise ValueError(f"Document {document_id} not found.")

        # Transition to processing state
        doc.processing_status = "processing"
        await db.commit()

        # Download from storage
        try:
            file_bytes = await storage.download_file(doc.storage_key)
        except Exception as dl_exc:
            logger.error("Download failed for storage key %s: %s", doc.storage_key, dl_exc)
            is_permanent_not_found = (
                isinstance(dl_exc, FileNotFoundError)
                or "nosuchkey" in str(dl_exc).lower()
                or "not found" in str(dl_exc).lower()
            )
            if is_permanent_not_found or not raise_on_transient_error:
                return await self._mark_failed(
                    doc,
                    "Document storage file was not found or is permanently unavailable."
                    if is_permanent_not_found
                    else "Document storage is temporarily unreachable or the file was removed.",
                    db,
                )
            # Transient error and caller requests retry propagation
            doc.processing_status = "queued"
            await db.commit()
            raise dl_exc

        # Execute OCR with timeout in a worker thread
        try:
            ocr_result = await asyncio.wait_for(
                asyncio.to_thread(
                    ocr_service.process_file,
                    file_bytes=file_bytes,
                    mime_type=doc.mime_type,
                    filename=doc.original_filename,
                ),
                timeout=float(settings.OCR_TIMEOUT_SECONDS),
            )
        except asyncio.TimeoutError:
            logger.error("OCR processing timed out after %ds for document %s", settings.OCR_TIMEOUT_SECONDS, doc.id)
            return await self._mark_failed(
                doc,
                f"Document processing timed out after {settings.OCR_TIMEOUT_SECONDS} seconds. Please try again or upload a smaller file.",
                db,
            )
        except OcrSecurityError as sec_exc:
            return await self._mark_failed(doc, str(sec_exc), db)
        except OcrCorruptError as corrupt_exc:
            return await self._mark_failed(doc, str(corrupt_exc), db)
        except OcrLimitError as lim_exc:
            return await self._mark_failed(doc, str(lim_exc), db)
        except OcrFormatError as fmt_exc:
            return await self._mark_failed(doc, str(fmt_exc), db)
        except Exception as ocr_exc:
            logger.exception("OCR exception for document %s", doc.id)
            return await self._mark_failed(
                doc,
                f"Optical recognition failed: {str(ocr_exc)}",
                db,
            )

        # Check if text is completely blank / empty
        if ocr_result.is_empty:
            return await self._mark_failed(
                doc,
                "No readable text or characters could be detected in this document. Please ensure it is legible and well-lit.",
                db,
            )

        # Look up expected tax year from the tax return if attached
        expected_tax_year: Optional[int] = None
        if doc.tax_return_id:
            tr_res = await db.execute(select(TaxReturn).where(TaxReturn.id == str(doc.tax_return_id)))
            tr = tr_res.scalar_one_or_none()
            if tr:
                expected_tax_year = tr.tax_year

        # Classify and extract structured fields
        extraction = document_extractor.process_document(
            ocr_result=ocr_result,
            filename=doc.original_filename,
            expected_tax_year=expected_tax_year,
            category_hint=doc.document_type if doc.document_type and doc.document_type != "other" else None,
        )

        # Persist extracted data and transition to needs_review
        doc.ocr_text = ocr_result.full_text
        doc.document_type = extraction.document_type
        doc.classification_confidence = extraction.classification_confidence
        doc.extracted_data = extraction.data_payload
        doc.extraction_confidence = extraction.confidence_payload
        doc.processing_status = "needs_review"
        doc.processed_at = datetime.now(timezone.utc)

        # Check cross-document conflicts and financial duplicates across separate uploads
        if doc.tax_return_id:
            await self._check_cross_document_integrity(doc, db)

        await db.commit()
        await db.refresh(doc)
        logger.info(
            "Document %s successfully processed. State: needs_review (%d fields extracted)",
            doc.id,
            len(extraction.fields),
        )
        return doc

    async def _check_cross_document_integrity(self, doc: Document, db: AsyncSession) -> None:
        """
        Detect financial duplicates and cross-document conflicts against other documents
        associated with the same tax return.
        """
        try:
            res = await db.execute(
                select(Document).where(
                    Document.tax_return_id == str(doc.tax_return_id),
                    Document.id != str(doc.id),
                    Document.processing_status != "failed",
                )
            )
            other_docs = res.scalars().all()
            if not other_docs:
                return

            doc_data = dict(doc.extracted_data or {})
            warnings = list(doc_data.get("warnings") or [])

            # Fetch tax profile to record tax flags
            prof_res = await db.execute(
                select(TaxProfile).where(TaxProfile.tax_return_id == str(doc.tax_return_id))
            )
            profile = prof_res.scalar_one_or_none()
            flags = list(profile.tax_flags or []) if profile else []

            def _extract_val(d: dict, key: str) -> Any:
                if not d:
                    return None
                val = d.get(key)
                if isinstance(val, dict) and "value" in val:
                    return val["value"]
                if val is not None:
                    return val
                for sub in ("fields", "_fields", "fields_map"):
                    sub_d = d.get(sub)
                    if isinstance(sub_d, dict) and key in sub_d:
                        v = sub_d[key]
                        if isinstance(v, dict) and "value" in v:
                            return v["value"]
                        return v
                return None

            for other in other_docs:
                o_data = dict(other.extracted_data or {})
                if not o_data:
                    continue

                # 1. Salary Certificate Duplicate vs Conflict
                if doc.document_type == "salary_certificate" and other.document_type == "salary_certificate":
                    e1 = str(_extract_val(doc_data, "employer_name") or "").strip().lower()
                    e2 = str(_extract_val(o_data, "employer_name") or "").strip().lower()
                    same_emp = bool(e1 and e2 and (e1 == e2 or e1 in e2 or e2 in e1))
                    y1 = _extract_val(doc_data, "tax_year")
                    y2 = _extract_val(o_data, "tax_year")
                    same_yr = bool(y1 and y2 and y1 == y2)

                    if same_emp and same_yr:
                        g1 = _extract_val(doc_data, "gross_salary")
                        g2 = _extract_val(o_data, "gross_salary")
                        emp_display = _extract_val(doc_data, "employer_name") or _extract_val(o_data, "employer_name") or "Employer"
                        if g1 is not None and g2 is not None:
                            if abs(float(g1) - float(g2)) < 1.0:
                                # Exact financial duplicate across separate uploads
                                doc.is_duplicate_suspect = True
                                msg = f"Suspected financial duplicate: Exactly matches gross salary CHF {float(g1):,.2f} for employer '{emp_display}' on '{other.original_filename}'."
                                if msg not in warnings:
                                    warnings.append(msg)
                            else:
                                # Conflicting salary amounts for same employer and tax year
                                conflict_msg = (
                                    f"Conflict detected: Gross salary for {emp_display} is CHF {float(g1):.1f}, "
                                    f"but another document has CHF {float(g2):.1f} for {y1}. Please review."
                                )
                                if conflict_msg not in warnings:
                                    warnings.append(conflict_msg)
                                flags.append({
                                    "flag_type": "warning",
                                    "field": "employment_income",
                                    "message": f"Conflicting gross salary for employer '{emp_display}' across documents ({g1} vs {g2}).",
                                    "severity": "high",
                                })

                # 2. Bank Statement Duplicate vs Conflict
                elif doc.document_type == "bank_statement" and other.document_type == "bank_statement":
                    iban1 = str(_extract_val(doc_data, "iban") or "").replace(" ", "").upper()
                    iban2 = str(_extract_val(o_data, "iban") or "").replace(" ", "").upper()
                    if iban1 and iban2 and len(iban1) > 10 and iban1 == iban2:
                        b1 = _extract_val(doc_data, "balance")
                        b2 = _extract_val(o_data, "balance")
                        if b1 is not None and b2 is not None:
                            if abs(float(b1) - float(b2)) < 1.0:
                                doc.is_duplicate_suspect = True
                                msg = f"Suspected financial duplicate: Account balance CHF {float(b1):,.2f} for IBAN {iban1} matches '{other.original_filename}'."
                                if msg not in warnings:
                                    warnings.append(msg)
                            else:
                                conflict_msg = (
                                    f"Conflict detected: Differing balances reported for IBAN {iban1} "
                                    f"(CHF {float(b1):,.2f} vs CHF {float(b2):,.2f} on '{other.original_filename}')."
                                )
                                if conflict_msg not in warnings:
                                    warnings.append(conflict_msg)
                                flags.append({
                                    "flag_type": "warning",
                                    "field": "bank_accounts",
                                    "message": conflict_msg,
                                    "severity": "high",
                                })

                # 3. Pillar 3a Duplicate
                elif doc.document_type == "pillar3a" and other.document_type == "pillar3a":
                    p1 = str(_extract_val(doc_data, "provider_name") or "").strip().lower()
                    p2 = str(_extract_val(o_data, "provider_name") or "").strip().lower()
                    c1 = _extract_val(doc_data, "contribution_amount")
                    c2 = _extract_val(o_data, "contribution_amount")
                    if p1 and p2 and (p1 == p2 or p1 in p2 or p2 in p1) and c1 is not None and c2 is not None:
                        if abs(float(c1) - float(c2)) < 1.0:
                            doc.is_duplicate_suspect = True
                            p_display = _extract_val(doc_data, "provider_name") or "Provider"
                            msg = f"Suspected financial duplicate: Matches Pillar 3a contribution CHF {float(c1):,.2f} from '{p_display}' on '{other.original_filename}'."
                            if msg not in warnings:
                                warnings.append(msg)

                # 4. AHV Number Conflict Across Documents
                ahv1 = str(_extract_val(doc_data, "ahv_number") or "").strip()
                ahv2 = str(_extract_val(o_data, "ahv_number") or "").strip()
                if ahv1 and ahv2 and len(ahv1) >= 11 and len(ahv2) >= 11 and ahv1 != ahv2:
                    ahv_conflict = (
                        f"Conflicting AHV number detected: AHV number {ahv1} on this document differs from "
                        f"AHV number {ahv2} on '{other.original_filename}'."
                    )
                    if ahv_conflict not in warnings:
                        warnings.append(ahv_conflict)
                    flags.append({
                        "flag_type": "warning",
                        "field": "ahv_number",
                        "message": f"Conflicting AHV numbers found across documents ({ahv1} vs {ahv2}).",
                        "severity": "high",
                    })

            doc_data["warnings"] = warnings
            doc.extracted_data = doc_data
            if profile:
                seen = set()
                deduped_flags = []
                for f in flags:
                    m = f.get("message")
                    if m not in seen:
                        seen.add(m)
                        deduped_flags.append(f)
                profile.tax_flags = deduped_flags
                db.add(profile)
                await db.flush()
        except Exception as integrity_exc:
            logger.warning("Cross-document integrity check skipped: %s", integrity_exc)

    async def _mark_failed(self, doc: Document, error_message: str, db: AsyncSession) -> Document:
        """Record an actionable error message and mark processing as failed."""
        doc.processing_status = "failed"
        payload = dict(doc.extracted_data or {})
        payload["_error_message"] = error_message
        payload["error"] = error_message
        doc.extracted_data = payload
        doc.processed_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(doc)
        logger.warning("Document %s marked as failed: %s", doc.id, error_message)
        return doc

    async def apply_approved_fields_to_profile(
        self,
        document: Document,
        profile: TaxProfile,
        db: AsyncSession,
    ) -> List[str]:
        """
        Merge only explicitly approved fields into the TaxProfile.
        Replaces any prior entries from this document to avoid duplicate counts.
        Invalidates existing tax calculations to force re-computation.
        """
        data = dict(document.extracted_data or {})
        reviews = data.get("_reviews") or {}
        fields_dict = data.get("fields") or data.get("_fields") or {}
        doc_type = document.document_type
        applied_fields: List[str] = []

        def get_val(fld: str) -> Any:
            if fld in data and not isinstance(data[fld], dict):
                return data[fld]
            if fld in data and isinstance(data[fld], dict) and "value" in data[fld]:
                return data[fld]["value"]
            fld_meta = fields_dict.get(fld)
            if isinstance(fld_meta, dict) and "value" in fld_meta:
                return fld_meta["value"]
            return data.get(fld)

        def is_approved(fld: str) -> bool:
            rev = reviews.get(fld)
            if isinstance(rev, dict):
                return rev.get("status") in ("approved", "edited")
            fld_meta = fields_dict.get(fld)
            if isinstance(fld_meta, dict):
                st = fld_meta.get("review_status") or fld_meta.get("status")
                return st in ("approved", "edited")
            return False

        # Load copies of JSON profile structures
        income = dict(profile.income_data or {})
        personal = dict(profile.personal_data or {})
        wealth = dict(profile.wealth_data or {})
        deductions = dict(profile.deductions_data or {})
        liabilities = dict(profile.liabilities_data or {})

        # 1. Salary Certificate
        if doc_type == "salary_certificate":
            # Multi-job & job-change support: maintain list of employment records
            emp_records = list(income.get("employment_records") or [])
            # Filter out any prior record from this specific document
            emp_records = [r for r in emp_records if r.get("source_document_id") != document.id]

            emp_name = get_val("employer_name") or document.original_filename or "Employer"
            gross_raw = get_val("gross_salary")
            net_raw = get_val("net_salary")
            bvg_raw = get_val("pension_bvg") if get_val("pension_bvg") is not None else get_val("pillar2_contributions")

            gross_approved = gross_raw is not None and is_approved("gross_salary")
            net_approved = net_raw is not None and is_approved("net_salary")
            bvg_approved = bvg_raw is not None and (is_approved("pension_bvg") or is_approved("pillar2_contributions"))

            gross_val = float(gross_raw) if gross_approved else 0.0
            net_val = float(net_raw) if net_approved else 0.0

            if gross_approved or net_approved:
                record = {
                    "employer_name": emp_name,
                    "gross_salary": gross_val,
                    "net_salary": net_val,
                    "gross_salary_approved": gross_approved,
                    "net_salary_approved": net_approved,
                    "tax_year": get_val("tax_year"),
                    "source_document_id": document.id,
                    "source_document_name": document.original_filename,
                }
                emp_records.append(record)
                income["employment_records"] = emp_records
                # Sum combined employment incomes across all salary certificates
                if any(r.get("gross_salary_approved") for r in emp_records):
                    income["employment_income"] = round(sum(r.get("gross_salary", 0.0) for r in emp_records if r.get("gross_salary_approved")), 2)
                elif "employment_income" in income:
                    income.pop("employment_income", None)

                if any(r.get("net_salary_approved") for r in emp_records):
                    income["net_salary"] = round(sum(r.get("net_salary", 0.0) for r in emp_records if r.get("net_salary_approved")), 2)
                elif "net_salary" in income:
                    income.pop("net_salary", None)

                if gross_approved:
                    applied_fields.append("employment_income")
                if net_approved:
                    applied_fields.append("net_salary")

            # Combine BVG / Pillar 2 pension deductions across multiple employers
            if bvg_approved:
                new_bvg = float(bvg_raw)
                # maintain per-doc tracking
                doc_contribs = dict(income.get("_doc_bvg_contributions") or {})
                doc_contribs[document.id] = new_bvg
                income["_doc_bvg_contributions"] = doc_contribs
                income["pillar2_contributions"] = round(sum(doc_contribs.values()), 2)
                applied_fields.append("pillar2_contributions")

            emp_name_val = get_val("employee_name")
            if emp_name_val and is_approved("employee_name") and not personal.get("name"):
                personal["name"] = str(emp_name_val).strip()
                parts = personal["name"].split(" ", 1)
                personal["first_name"] = parts[0]
                if len(parts) > 1:
                    personal["last_name"] = parts[1]
                applied_fields.append("employee_name")

            ahv_val = get_val("ahv_number")
            if ahv_val and is_approved("ahv_number") and not personal.get("ahv_number"):
                personal["ahv_number"] = str(ahv_val).strip()
                applied_fields.append("ahv_number")

        # 2. Bank Statement
        elif doc_type == "bank_statement":
            accounts = list(wealth.get("bank_accounts") or [])
            # Filter out prior entry from this document
            accounts = [a for a in accounts if a.get("source_document_id") != document.id]

            bal = data.get("balance")
            if bal is not None and is_approved("balance"):
                acc_entry = {
                    "bank_name": data.get("bank_name") or "Bank Account",
                    "iban": data.get("iban") or "–",
                    "balance_chf": float(bal),
                    "currency": "CHF",
                    "source_document_id": document.id,
                    "source_document_name": document.original_filename,
                }
                accounts.append(acc_entry)
                wealth["bank_accounts"] = accounts
                applied_fields.append("bank_accounts")

            # Idempotent interest income tracking: remove prior contribution before adding new
            income_contributions = dict(income.get("_doc_contributions") or {})
            doc_income_contrib = dict(income_contributions.get(document.id) or {})
            if "interest_income" in doc_income_contrib:
                prior_val = doc_income_contrib.pop("interest_income")
                current_total = income.get("interest_income") or 0.0
                income["interest_income"] = max(0.0, round(current_total - prior_val, 2))

            int_earned = data.get("interest_earned")
            if int_earned is not None and is_approved("interest_earned"):
                new_val = float(int_earned)
                income["interest_income"] = round((income.get("interest_income") or 0.0) + new_val, 2)
                doc_income_contrib["interest_income"] = new_val
                applied_fields.append("interest_income")

            if doc_income_contrib:
                income_contributions[document.id] = doc_income_contrib
            else:
                income_contributions.pop(document.id, None)
            income["_doc_contributions"] = income_contributions

        # 3. Pillar 3a
        elif doc_type == "pillar3a":
            contrib = data.get("contribution_amount")
            if contrib is not None and is_approved("contribution_amount"):
                deductions["pillar3a_contributions"] = float(contrib)
                applied_fields.append("pillar3a_contributions")

            bal = data.get("balance")
            if bal is not None and is_approved("balance"):
                wealth["pillar3a_capital"] = float(bal)
                applied_fields.append("pillar3a_capital")

        # 4. Mortgage
        elif doc_type == "mortgage":
            mortgages = list(liabilities.get("mortgages") or [])
            mortgages = [m for m in mortgages if m.get("source_document_id") != document.id]

            bal = data.get("mortgage_balance")
            if bal is not None and is_approved("mortgage_balance"):
                m_entry = {
                    "lender": data.get("lender_name") or "Mortgage Creditor",
                    "outstanding_balance": float(bal),
                    "source_document_id": document.id,
                    "source_document_name": document.original_filename,
                }
                mortgages.append(m_entry)
                liabilities["mortgages"] = mortgages
                applied_fields.append("mortgages")

            # Idempotent debt interest tracking
            deductions_contributions = dict(deductions.get("_doc_contributions") or {})
            doc_ded_contrib = dict(deductions_contributions.get(document.id) or {})
            if "debt_interest" in doc_ded_contrib:
                prior_val = doc_ded_contrib.pop("debt_interest")
                current_total = deductions.get("debt_interest") or 0.0
                deductions["debt_interest"] = max(0.0, round(current_total - prior_val, 2))

            int_paid = data.get("interest_paid")
            if int_paid is not None and is_approved("interest_paid"):
                new_val = float(int_paid)
                deductions["debt_interest"] = round((deductions.get("debt_interest") or 0.0) + new_val, 2)
                doc_ded_contrib["debt_interest"] = new_val
                applied_fields.append("debt_interest")

            if doc_ded_contrib:
                deductions_contributions[document.id] = doc_ded_contrib
            else:
                deductions_contributions.pop(document.id, None)
            deductions["_doc_contributions"] = deductions_contributions

        # 5. Donations
        elif doc_type == "donation":
            # Idempotent donation tracking
            deductions_contributions = dict(deductions.get("_doc_contributions") or {})
            doc_ded_contrib = dict(deductions_contributions.get(document.id) or {})
            if "donations" in doc_ded_contrib:
                prior_val = doc_ded_contrib.pop("donations")
                current_total = deductions.get("donations") or 0.0
                deductions["donations"] = max(0.0, round(current_total - prior_val, 2))

            amt = data.get("amount")
            if amt is not None and is_approved("amount"):
                new_val = float(amt)
                deductions["donations"] = round((deductions.get("donations") or 0.0) + new_val, 2)
                doc_ded_contrib["donations"] = new_val
                applied_fields.append("donations")

            if doc_ded_contrib:
                deductions_contributions[document.id] = doc_ded_contrib
            else:
                deductions_contributions.pop(document.id, None)
            deductions["_doc_contributions"] = deductions_contributions

        # 6. Insurance
        elif doc_type == "insurance":
            prem = data.get("premium_amount")
            if prem is not None and is_approved("premium_amount"):
                deductions["health_insurance_premiums"] = float(prem)
                applied_fields.append("health_insurance_premiums")

        # 7. Medical
        elif doc_type == "medical":
            # Idempotent medical expense tracking
            deductions_contributions = dict(deductions.get("_doc_contributions") or {})
            doc_ded_contrib = dict(deductions_contributions.get(document.id) or {})
            if "medical_expenses" in doc_ded_contrib:
                prior_val = doc_ded_contrib.pop("medical_expenses")
                current_total = deductions.get("medical_expenses") or 0.0
                deductions["medical_expenses"] = max(0.0, round(current_total - prior_val, 2))

            med = data.get("amount")
            if med is not None and is_approved("amount"):
                new_val = float(med)
                deductions["medical_expenses"] = round((deductions.get("medical_expenses") or 0.0) + new_val, 2)
                doc_ded_contrib["medical_expenses"] = new_val
                applied_fields.append("medical_expenses")

            if doc_ded_contrib:
                deductions_contributions[document.id] = doc_ded_contrib
            else:
                deductions_contributions.pop(document.id, None)
            deductions["_doc_contributions"] = deductions_contributions

        # 8. Securities Statement
        elif doc_type == "securities_statement":
            positions = list(wealth.get("securities_positions") or [])
            positions = [p for p in positions if p.get("source_document_id") != document.id]

            tot_val = data.get("total_value")
            if tot_val is not None and is_approved("total_value"):
                sec_entry = {
                    "broker_name": data.get("broker_name") or "Securities Account",
                    "name": data.get("broker_name") or "Securities Account",
                    "total_value_chf": float(tot_val),
                    "value_chf": float(tot_val),
                    "source_document_id": document.id,
                    "source_document_name": document.original_filename,
                }
                positions.append(sec_entry)
                wealth["securities_positions"] = positions
                wealth["securities"] = positions
                applied_fields.append("securities_positions")
                applied_fields.append("securities")

            income_contributions = dict(income.get("_doc_contributions") or {})
            doc_income_contrib = dict(income_contributions.get(document.id) or {})
            if "dividends" in doc_income_contrib:
                prior_val = doc_income_contrib.pop("dividends")
                current_total = income.get("dividend_income") or income.get("dividends") or 0.0
                rem_total = max(0.0, round(current_total - prior_val, 2))
                income["dividend_income"] = rem_total
                income["dividends"] = rem_total

            div_rec = data.get("dividends_received")
            if div_rec is not None and is_approved("dividends_received"):
                new_val = float(div_rec)
                cur_total = income.get("dividend_income") or income.get("dividends") or 0.0
                updated_total = round(cur_total + new_val, 2)
                income["dividend_income"] = updated_total
                income["dividends"] = updated_total
                doc_income_contrib["dividends"] = new_val
                applied_fields.append("dividend_income")
                applied_fields.append("dividends")

            if doc_income_contrib:
                income_contributions[document.id] = doc_income_contrib
            else:
                income_contributions.pop(document.id, None)
            income["_doc_contributions"] = income_contributions

        # Save profile updates
        profile.income_data = income
        profile.personal_data = personal
        profile.wealth_data = wealth
        profile.deductions_data = deductions
        profile.liabilities_data = liabilities
        profile.updated_at = datetime.now(timezone.utc)
        db.add(profile)

        # Mark document as completed now that approved data is merged
        document.processing_status = "completed"
        db.add(document)

        # Invalidate existing tax calculations so the user recalculates
        if document.tax_return_id:
            calcs_res = await db.execute(
                select(TaxCalculation).where(TaxCalculation.tax_return_id == str(document.tax_return_id))
            )
            for calc in calcs_res.scalars().all():
                calc.status = "stale"
                calc.is_final = False
                db.add(calc)

        await db.commit()
        return applied_fields

    async def retract_document_contributions(
        self,
        document_id: str,
        tax_return_id: str,
        db: AsyncSession,
    ) -> None:
        """
        Retract all financial amounts and metadata contributed by a document
        from the associated TaxProfile.
        """
        prof_res = await db.execute(
            select(TaxProfile).where(TaxProfile.tax_return_id == str(tax_return_id))
        )
        profile = prof_res.scalar_one_or_none()
        if not profile:
            return

        income = dict(profile.income_data or {})
        wealth = dict(profile.wealth_data or {})
        deductions = dict(profile.deductions_data or {})
        liabilities = dict(profile.liabilities_data or {})

        # 1. Retract income contributions
        income_contribs = dict(income.get("_doc_contributions") or {})
        doc_inc = income_contribs.pop(document_id, None)
        if doc_inc and isinstance(doc_inc, dict):
            for field_name, amount in doc_inc.items():
                cur = float(income.get(field_name) or 0.0)
                income[field_name] = max(0.0, round(cur - float(amount), 2))
                if field_name == "dividends" and "dividend_income" in income:
                    income["dividend_income"] = income[field_name]
                elif field_name == "dividend_income" and "dividends" in income:
                    income["dividends"] = income[field_name]
        income["_doc_contributions"] = income_contribs

        # 2. Retract deductions contributions
        ded_contribs = dict(deductions.get("_doc_contributions") or {})
        doc_ded = ded_contribs.pop(document_id, None)
        if doc_ded and isinstance(doc_ded, dict):
            for field_name, amount in doc_ded.items():
                cur = float(deductions.get(field_name) or 0.0)
                deductions[field_name] = max(0.0, round(cur - float(amount), 2))
        deductions["_doc_contributions"] = ded_contribs

        # 3. Retract wealth contributions (bank accounts, securities)
        bank_accounts = list(wealth.get("bank_accounts") or [])
        wealth["bank_accounts"] = [
            acc for acc in bank_accounts if acc.get("source_document_id") != document_id
        ]

        sec_positions = list(wealth.get("securities_positions") or [])
        rem_sec = [p for p in sec_positions if p.get("source_document_id") != document_id]
        wealth["securities_positions"] = rem_sec
        wealth["securities"] = rem_sec

        # 4. Retract flags referencing this document
        flags = list(profile.tax_flags or [])
        profile.tax_flags = [
            f for f in flags if isinstance(f, dict) and f.get("source_document_id") != document_id
        ]

        profile.income_data = income
        profile.wealth_data = wealth
        profile.deductions_data = deductions
        profile.liabilities_data = liabilities
        profile.updated_at = datetime.now(timezone.utc)
        db.add(profile)


# Module singleton
document_pipeline_service = DocumentPipelineService()
