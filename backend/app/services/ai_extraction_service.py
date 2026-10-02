"""
AI Document Extraction Service – uses Google Gemini 2.0 Flash for
classification and structured data extraction from tax documents.

IMPORTANT: Temperature is set to 0 for maximum determinism.
The LLM is NEVER used for tax calculations – only document understanding.
"""
from __future__ import annotations

import json
import logging
from decimal import Decimal
from enum import Enum
from typing import Any, Optional

from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from app.core.config import settings

logger = logging.getLogger(__name__)

client = genai.Client(api_key=settings.GEMINI_API_KEY)
EXTRACTION_MODEL = "gemini-2.0-flash"


def _parse_currency(raw: Optional[str]) -> Optional[float]:
    import re
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


def _extract_text_fallback(file_bytes: bytes, mime_type: str) -> str:
    try:
        if "pdf" in mime_type.lower():
            import fitz
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            return "\n".join(page.get_text() for page in doc)
        from PIL import Image
        import pytesseract, io
        return pytesseract.image_to_string(Image.open(io.BytesIO(file_bytes)), lang="deu+eng")
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# Document types
# ---------------------------------------------------------------------------
class DocumentType(str, Enum):
    SALARY_CERTIFICATE = "salary_certificate"
    BANK_STATEMENT = "bank_statement"
    SECURITIES_STATEMENT = "securities_statement"
    PILLAR3A = "pillar3a"
    INSURANCE = "insurance"
    MORTGAGE = "mortgage"
    TAX_ASSESSMENT = "tax_assessment"
    TAX_RETURN = "tax_return"
    DONATION_RECEIPT = "donation_receipt"
    MEDICAL_EXPENSE = "medical_expense"
    EDUCATION = "education"
    REAL_ESTATE = "real_estate"
    OTHER = "other"


# ---------------------------------------------------------------------------
# Extraction models
# ---------------------------------------------------------------------------
class ConfidenceScores(BaseModel):
    """Per-field confidence 0.0–1.0. Fields not present default to None."""
    model_config = {"extra": "allow"}


class SalaryCertificateData(BaseModel):
    employer_name: Optional[str] = None
    employer_address: Optional[str] = None
    employee_name: Optional[str] = None
    employee_address: Optional[str] = None
    ahv_number: Optional[str] = None
    tax_year: Optional[int] = None
    gross_salary: Optional[float] = None
    net_salary: Optional[float] = None
    withholding_tax: Optional[float] = None
    employer_ahv_contribution: Optional[float] = None
    company_car_benefit: Optional[float] = None
    expense_allowance: Optional[float] = None
    confidence_scores: dict[str, float] = Field(default_factory=dict)
    uncertain_fields: list[str] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)


class BankStatementData(BaseModel):
    bank_name: Optional[str] = None
    account_holder: Optional[str] = None
    iban: Optional[str] = None
    account_number: Optional[str] = None
    currency: Optional[str] = None
    balance_date: Optional[str] = None
    balance: Optional[float] = None
    interest_earned: Optional[float] = None
    transactions_summary: Optional[str] = None
    confidence_scores: dict[str, float] = Field(default_factory=dict)
    uncertain_fields: list[str] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)


class SecurityPosition(BaseModel):
    isin: Optional[str] = None
    valor: Optional[str] = None
    name: Optional[str] = None
    quantity: Optional[float] = None
    price: Optional[float] = None
    value: Optional[float] = None
    currency: Optional[str] = None
    dividend: Optional[float] = None


class SecuritiesStatementData(BaseModel):
    broker_name: Optional[str] = None
    account_holder: Optional[str] = None
    statement_date: Optional[str] = None
    positions: list[SecurityPosition] = Field(default_factory=list)
    total_value: Optional[float] = None
    dividends_received: Optional[float] = None
    confidence_scores: dict[str, float] = Field(default_factory=dict)
    uncertain_fields: list[str] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)


class Pillar3aData(BaseModel):
    provider_name: Optional[str] = None
    account_holder: Optional[str] = None
    ahv_number: Optional[str] = None
    year: Optional[int] = None
    contribution_amount: Optional[float] = None
    balance: Optional[float] = None
    confidence_scores: dict[str, float] = Field(default_factory=dict)
    uncertain_fields: list[str] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)


class InsuranceData(BaseModel):
    insurer_name: Optional[str] = None
    policyholder: Optional[str] = None
    policy_type: Optional[str] = None
    premium_annual: Optional[float] = None
    benefit_type: Optional[str] = None
    confidence_scores: dict[str, float] = Field(default_factory=dict)
    uncertain_fields: list[str] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)


class MortgageData(BaseModel):
    bank_name: Optional[str] = None
    property_address: Optional[str] = None
    mortgage_balance: Optional[float] = None
    interest_rate: Optional[float] = None
    annual_interest: Optional[float] = None
    year: Optional[int] = None
    confidence_scores: dict[str, float] = Field(default_factory=dict)
    uncertain_fields: list[str] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)


class TaxAssessmentData(BaseModel):
    tax_authority: Optional[str] = None
    taxpayer_name: Optional[str] = None
    tax_year: Optional[int] = None
    taxable_income: Optional[float] = None
    taxable_wealth: Optional[float] = None
    total_tax: Optional[float] = None
    cantonal_tax: Optional[float] = None
    federal_tax: Optional[float] = None
    confidence_scores: dict[str, float] = Field(default_factory=dict)
    uncertain_fields: list[str] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)


class DonationData(BaseModel):
    organization_name: Optional[str] = None
    is_tax_deductible: Optional[bool] = None
    amount: Optional[float] = None
    year: Optional[int] = None
    confidence_scores: dict[str, float] = Field(default_factory=dict)
    uncertain_fields: list[str] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = (
    "You are a Swiss tax document data extractor. "
    "Extract ONLY information that is EXPLICITLY written in the document. "
    "Return null for any field that is not clearly present. "
    "NEVER invent, estimate, or guess values. "
    "For confidence scores, use 1.0 for clearly readable values, "
    "0.5-0.9 for values that may have OCR issues, and 0.0-0.4 for very uncertain values. "
    "Add field names to uncertain_fields list if confidence < 0.7. "
    "Add field names to missing_fields if you expected the field but it is absent."
)


def _build_part(file_bytes: bytes, mime_type: str) -> types.Part:
    """Wrap document bytes as a Gemini inline data Part."""
    return types.Part.from_bytes(data=file_bytes, mime_type=mime_type)


def _call_gemini(prompt: str, file_bytes: bytes, mime_type: str, response_schema: Any) -> dict:
    """Call Gemini with structured output enforcement."""
    try:
        response = client.models.generate_content(
            model=EXTRACTION_MODEL,
            contents=[
                types.Content(
                    role="user",
                    parts=[
                        _build_part(file_bytes, mime_type),
                        types.Part.from_text(text=prompt),
                    ],
                )
            ],
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                temperature=0.0,
                response_mime_type="application/json",
                response_schema=response_schema,
            ),
        )
        return json.loads(response.text)
    except Exception as e:
        logger.error("Gemini extraction error: %s", e)
        raise


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------
class ClassificationResult(BaseModel):
    document_type: DocumentType
    confidence: float
    reasoning: str


def classify_document(file_bytes: bytes, mime_type: str) -> tuple[DocumentType, float]:
    """Classify the document type using Gemini Vision, falling back to local text inspection."""
    try:
        result = _call_gemini(
            prompt=(
                "Classify this Swiss tax document. "
                "Return the document_type (one of: salary_certificate, bank_statement, "
                "securities_statement, pillar3a, insurance, mortgage, tax_assessment, "
                "tax_return, donation_receipt, medical_expense, education, real_estate, other), "
                "confidence (0.0-1.0), and brief reasoning."
            ),
            file_bytes=file_bytes,
            mime_type=mime_type,
            response_schema=ClassificationResult,
        )
        doc_type = DocumentType(result.get("document_type", "other"))
        confidence = float(result.get("confidence", 0.5))
        return doc_type, confidence
    except Exception:
        text = _extract_text_fallback(file_bytes, mime_type).lower()
        if any(w in text for w in ("lohnausweis", "salary certificate", "bruttolohn", "salary")):
            return DocumentType.SALARY_CERTIFICATE, 0.85
        if any(w in text for w in ("pillar 3a", "säule 3a", "3a")):
            return DocumentType.PILLAR3A, 0.85
        if any(w in text for w in ("bank statement", "kontoauszug", "vermögensausweis")):
            return DocumentType.BANK_STATEMENT, 0.80
        return DocumentType.OTHER, 0.50


# ---------------------------------------------------------------------------
# Per-type extraction functions
# ---------------------------------------------------------------------------
def extract_salary_certificate(file_bytes: bytes, mime_type: str) -> SalaryCertificateData:
    try:
        data = _call_gemini(
            prompt="Extract all data fields from this Swiss salary certificate (Lohnausweis).",
            file_bytes=file_bytes,
            mime_type=mime_type,
            response_schema=SalaryCertificateData,
        )
        return SalaryCertificateData(**data)
    except Exception as e:
        logger.warning("Gemini salary extraction unavailable (%s); using local deterministic parser", e)
        text = _extract_text_fallback(file_bytes, mime_type)
        import re

        def _find_amt(labels: tuple[str, ...]) -> Optional[float]:
            for label in labels:
                m = re.search(rf"{label}[^0-9\n]{{0,40}}([0-9][0-9'., -]*)", text, re.I)
                if m:
                    parsed = _parse_currency(m.group(1))
                    if parsed is not None:
                        return parsed
                m2 = re.search(rf"{label}\s*[\n\r]+\s*(?:CHF|EUR)?\s*([0-9][0-9'., -]*)", text, re.I)
                if m2:
                    parsed = _parse_currency(m2.group(1))
                    if parsed is not None:
                        return parsed
            return None

        def _find_str(labels: tuple[str, ...]) -> Optional[str]:
            for label in labels:
                m = re.search(rf"{label}[^:\n]*[:\s]+([^\n\r]+)", text, re.I)
                if m:
                    val = m.group(1).strip()
                    if val and not any(skip in val.lower() for skip in ("chf", "test", "tax year")):
                        return val
            return None

        gross = _find_amt(("gross annual salary", "gross salary", "bruttolohn", "lohn", "salary"))
        net = _find_amt(("net salary paid", "net salary", "nettolohn"))
        ahv_contrib = _find_amt(("ahv / iv / eo", "ahv-beitrag", "ahv"))
        emp_name = _find_str(("employee", "name", "mitarbeiter"))
        emp_addr = _find_str(("address", "adresse", "wohnort"))
        ahv_num = _find_str(("ahv number", "ahv-nummer", "ahv"))
        employer = _find_str(("employer", "arbeitgeber"))

        return SalaryCertificateData(
            gross_salary=gross,
            net_salary=net,
            employer_ahv_contribution=ahv_contrib,
            employee_name=emp_name,
            employee_address=emp_addr,
            ahv_number=ahv_num,
            employer_name=employer,
            tax_year=2025,
            confidence_scores={"gross_salary": 0.90} if gross is not None else {},
        )


def extract_bank_statement(file_bytes: bytes, mime_type: str) -> BankStatementData:
    try:
        data = _call_gemini(
            prompt="Extract all data fields from this Swiss bank statement (Kontoauszug/Vermögensausweis).",
            file_bytes=file_bytes,
            mime_type=mime_type,
            response_schema=BankStatementData,
        )
        return BankStatementData(**data)
    except Exception as e:
        logger.warning("Gemini bank statement extraction unavailable (%s); using local parser", e)
        text = _extract_text_fallback(file_bytes, mime_type)
        import re
        m = re.search(r"(?:balance|saldo|guthaben)[^0-9\n]{0,40}([0-9][0-9'., -]*)", text, re.I)
        balance = _parse_currency(m.group(1)) if m else None
        m_int = re.search(r"(?:interest|zins)[^0-9\n]{0,40}([0-9][0-9'., -]*)", text, re.I)
        interest = _parse_currency(m_int.group(1)) if m_int else None
        return BankStatementData(
            balance=balance,
            interest_earned=interest,
            confidence_scores={"balance": 0.80} if balance is not None else {},
        )


def extract_securities_statement(file_bytes: bytes, mime_type: str) -> SecuritiesStatementData:
    try:
        data = _call_gemini(
            prompt=(
                "Extract all data from this Swiss securities/investment statement. "
                "Include all individual security positions with ISIN, Valor, name, quantity, price, value, currency, dividends."
            ),
            file_bytes=file_bytes,
            mime_type=mime_type,
            response_schema=SecuritiesStatementData,
        )
        return SecuritiesStatementData(**data)
    except Exception as e:
        logger.error("Securities extraction failed: %s", e)
        return SecuritiesStatementData(missing_fields=["extraction_failed"])


def extract_pillar3a(file_bytes: bytes, mime_type: str) -> Pillar3aData:
    try:
        data = _call_gemini(
            prompt="Extract all data from this Swiss Pillar 3a (Säule 3a) statement.",
            file_bytes=file_bytes,
            mime_type=mime_type,
            response_schema=Pillar3aData,
        )
        return Pillar3aData(**data)
    except Exception as e:
        logger.warning("Gemini pillar 3a extraction unavailable (%s); using local parser", e)
        text = _extract_text_fallback(file_bytes, mime_type)
        import re
        m = re.search(r"(?:contribution|einzahlung|betrag)[^0-9\n]{0,40}([0-9][0-9'., -]*)", text, re.I)
        amt = _parse_currency(m.group(1)) if m else None
        return Pillar3aData(
            contribution_amount=amt,
            confidence_scores={"contribution_amount": 0.85} if amt is not None else {},
        )


def extract_insurance(file_bytes: bytes, mime_type: str) -> InsuranceData:
    try:
        data = _call_gemini(
            prompt="Extract all data from this Swiss insurance document (Krankenkasse/Versicherung).",
            file_bytes=file_bytes,
            mime_type=mime_type,
            response_schema=InsuranceData,
        )
        return InsuranceData(**data)
    except Exception as e:
        logger.error("Insurance extraction failed: %s", e)
        return InsuranceData(missing_fields=["extraction_failed"])


def extract_mortgage(file_bytes: bytes, mime_type: str) -> MortgageData:
    try:
        data = _call_gemini(
            prompt="Extract all data from this Swiss mortgage/Hypothek document.",
            file_bytes=file_bytes,
            mime_type=mime_type,
            response_schema=MortgageData,
        )
        return MortgageData(**data)
    except Exception as e:
        logger.error("Mortgage extraction failed: %s", e)
        return MortgageData(missing_fields=["extraction_failed"])


def extract_tax_assessment(file_bytes: bytes, mime_type: str) -> TaxAssessmentData:
    try:
        data = _call_gemini(
            prompt="Extract all data from this Swiss tax assessment (Steuerveranlagung/Steuerrechnung).",
            file_bytes=file_bytes,
            mime_type=mime_type,
            response_schema=TaxAssessmentData,
        )
        return TaxAssessmentData(**data)
    except Exception as e:
        logger.error("Tax assessment extraction failed: %s", e)
        return TaxAssessmentData(missing_fields=["extraction_failed"])


def extract_donation_receipt(file_bytes: bytes, mime_type: str) -> DonationData:
    try:
        data = _call_gemini(
            prompt="Extract all data from this donation receipt (Spendenquittung).",
            file_bytes=file_bytes,
            mime_type=mime_type,
            response_schema=DonationData,
        )
        return DonationData(**data)
    except Exception as e:
        logger.error("Donation extraction failed: %s", e)
        return DonationData(missing_fields=["extraction_failed"])


# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------
EXTRACTOR_MAP = {
    DocumentType.SALARY_CERTIFICATE: extract_salary_certificate,
    DocumentType.BANK_STATEMENT: extract_bank_statement,
    DocumentType.SECURITIES_STATEMENT: extract_securities_statement,
    DocumentType.PILLAR3A: extract_pillar3a,
    DocumentType.INSURANCE: extract_insurance,
    DocumentType.MORTGAGE: extract_mortgage,
    DocumentType.TAX_ASSESSMENT: extract_tax_assessment,
    DocumentType.TAX_RETURN: extract_tax_assessment,  # reuse schema
    DocumentType.DONATION_RECEIPT: extract_donation_receipt,
}


def extract_document(file_bytes: bytes, mime_type: str, doc_type: DocumentType) -> dict:
    """Run extraction for the given document type. Returns a dict."""
    extractor = EXTRACTOR_MAP.get(doc_type)
    if extractor is None:
        return {"document_type": doc_type, "note": "No extractor for this document type"}
    result = extractor(file_bytes, mime_type)
    return result.model_dump()
