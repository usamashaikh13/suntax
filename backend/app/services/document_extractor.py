"""
Document classification and structured field extraction engine for SunTax.

Supports:
  - Deterministic parsing for Swiss tax documents across German, French, Italian, and English
  - Swiss and international currency formats (including zero and negative values)
  - Per-field source tracking (page, raw text, confidence level, method, review status)
  - Mathematical cross-field validation (e.g. salary formula, tax year consistency)
  - Privacy-preserving external AI (Google Gemini) integration only when explicitly enabled
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from app.core.config import settings
from app.services.ocr_service import DocumentOCRResult, PageOCRResult

logger = logging.getLogger(__name__)


# ── Currency Parser ───────────────────────────────────────────────────────────

def parse_currency_amount(raw: Any) -> Optional[float]:
    """
    Parse Swiss and international currency amounts.
    Preserves zero (0.0) and negative values (-1200.00).

    Examples:
      "120'000.00" -> 120000.0
      "120'000.-"  -> 120000.0
      "120 000,00" -> 120000.0
      "120.000,00" -> 120000.0
      "0.00"       -> 0.0
      "-1'500.00"  -> -1500.0
      "(1'500.00)" -> -1500.0
    """
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw)

    s = str(raw).strip()
    if not s:
        return None

    # Detect accounting negative with parentheses: (1'500.00)
    is_negative = False
    if s.startswith("(") and s.endswith(")"):
        is_negative = True
        s = s[1:-1].strip()
    elif s.startswith("-"):
        is_negative = True
        s = s[1:].strip()

    # Remove currency symbols and formatting noise
    s = re.sub(r"(?i)\b(?:CHF|EUR|USD|Fr\.|SFr\.)\b", "", s).strip()
    s = s.rstrip(".,-")
    s = s.replace("'", "").replace("’", "").replace(" ", "")

    # Date guard: e.g. 28.03.2025 or 31.12.2025 is a date, not a currency amount
    if re.search(r"^\d{1,2}\.\d{1,2}\.\d{2,4}$", s):
        return None

    if not s:
        return None

    # Handle comma and dot decimals
    if "," in s and "." in s:
        if s.rfind(".") > s.rfind(","):
            s = s.replace(",", "")
        else:
            s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        parts = s.split(",")
        if len(parts) == 2 and len(parts[1]) in (1, 2):
            s = parts[0] + "." + parts[1]
        else:
            s = s.replace(",", "")
    elif "." in s:
        parts = s.split(".")
        if len(parts) > 2:
            s = "".join(parts[:-1]) + "." + parts[-1]

    try:
        val = float(s)
        return -val if is_negative else val
    except (ValueError, TypeError):
        return None


# ── Extracted Field Representation ───────────────────────────────────────────

@dataclass
class ExtractedFieldDetail:
    field_name: str
    value: Any
    raw_value: Optional[str]
    source_page: int
    source_text: str
    confidence: float
    confidence_level: str  # high, medium, low, uncertain
    extraction_method: str  # deterministic_ocr, google_gemini
    status: str = "needs_review"  # needs_review, approved, edited, rejected
    warnings: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "value": self.value,
            "raw_value": self.raw_value,
            "source_page": self.source_page,
            "source_text": self.source_text,
            "confidence": round(self.confidence, 2),
            "confidence_level": self.confidence_level,
            "extraction_method": self.extraction_method,
            "status": self.status,
            "warnings": self.warnings,
        }


@dataclass
class ExtractionResult:
    document_type: str
    classification_confidence: float
    fields: Dict[str, ExtractedFieldDetail]
    provider: str
    warnings: List[str] = field(default_factory=list)

    @property
    def data_payload(self) -> Dict[str, Any]:
        """Format suitable for Document.extracted_data."""
        res: Dict[str, Any] = {}
        reviews: Dict[str, Any] = {}
        fields_map: Dict[str, Any] = {}

        for k, fld in self.fields.items():
            res[k] = fld.value
            reviews[k] = {
                "status": fld.status,
                "value": fld.value,
                "warnings": fld.warnings,
            }
            fields_map[k] = fld.to_dict()

        res["_fields"] = fields_map
        res["_reviews"] = reviews
        res["_metadata"] = {
            "provider": self.provider,
            "document_type": self.document_type,
            "classification_confidence": round(self.classification_confidence, 2),
            "warnings": self.warnings,
        }
        return res

    @property
    def confidence_payload(self) -> Dict[str, float]:
        """Format suitable for Document.extraction_confidence."""
        return {k: round(fld.confidence, 2) for k, fld in self.fields.items()}


# ── Deterministic Swiss Tax Extractor ─────────────────────────────────────────

class DocumentExtractor:
    """Classifies Swiss tax documents and extracts typed, verifiable fields."""

    # Keywords for multi-lingual classification
    TYPE_KEYWORDS = {
        "salary_certificate": [
            "lohnausweis", "certificat de salaire", "certificato di salario",
            "bruttolohn", "nettolohn", "salaire brut", "salaire net",
            "annual salary", "salary certificate", "arbeitgeber", "employeur",
        ],
        "bank_statement": [
            "bank statement", "kontoauszug", "bankbeleg", "relevé de compte",
            "estratto conto", "kontostand", "saldo per 31.12", "solde au 31.12",
            "habenzins", "intérêts", "zinsabschluss", "iban",
        ],
        "securities_statement": [
            "wertschriftenverzeichnis", "depotauszug", "relevé de titres",
            "dépôt de titres", "dossier titoli", "securities statement",
            "steuerwert", "valeur fiscale", "valore fiscale", "isin", "valor",
        ],
        "pillar3a": [
            "säule 3a", "pilier 3a", "pilastro 3a", "pillar 3a",
            "vorsorgevereinbarung 3a", "bescheinigung säule 3a",
            "attestation pilier 3a", "certificato pilastro 3a",
            "gebundene vorsorge", "prévoyance liée",
        ],
        "mortgage": [
            "hypothek", "hypothekarzins", "hypothekerausweis", "dette hypothécaire",
            "intérêts hypothécaires", "attestation hypothécaire", "ipoteca",
            "interessi ipotecari", "mortgage statement", "schuld per 31.12",
        ],
        "insurance": [
            "krankenkasse", "krankenversicherung", "assurance maladie",
            "assurance-maladie", "assicurazione malattia", "health insurance",
            "prämienrechnung", "décompte de primes", "police d'assurance",
        ],
        "donation": [
            "spendenbescheinigung", "spendenquittung", "spende", "dons",
            "attestation de don", "donations", "ricevuta di donazione",
            "gemeinnützig", "d'utilité publique",
        ],
        "medical": [
            "krankheitskosten", "frais médicaux", "spese mediche",
            "selbstbehalt", "franchise", "zahnarzt", "dentiste", "dentista",
            "medical expenses", "frais de traitement",
        ],
        "previous_tax_return": [
            "steuererklärung 20", "déclaration d'impôt 20", "dichiarazione fiscale 20",
            "tax return 20",
        ],
        "tax_assessment": [
            "steuerveranlagung", "definitiven veranlagung", "notification de taxation",
            "taxation définitive", "decisione di tassazione", "tax assessment",
        ],
    }

    def classify_document(self, ocr_result: DocumentOCRResult, filename: str = "") -> Tuple[str, float]:
        """Classify document type using keywords in filename and extracted text."""
        haystack = f"{filename}\n{ocr_result.full_text}".lower()

        scores: Dict[str, int] = {}
        for doc_type, keywords in self.TYPE_KEYWORDS.items():
            match_count = sum(1 for kw in keywords if kw in haystack)
            if match_count > 0:
                scores[doc_type] = match_count

        if not scores:
            return "other", 0.30

        best_type, count = max(scores.items(), key=lambda item: item[1])
        # Calculate confidence bounded between 0.60 and 0.98
        conf = min(0.60 + (count * 0.10), 0.98)
        return best_type, conf

    def _find_number_in_pages(
        self,
        labels: Tuple[str, ...],
        pages: List[PageOCRResult],
    ) -> Tuple[Optional[float], Optional[str], int, str, float]:
        """
        Search for a numeric currency amount near any of the specified labels.
        Evaluates labels in priority order (specific labels first).
        Returns: (value, raw_value, page_num, source_text, confidence)
        """
        for label in labels:
            for page in pages:
                lines = page.raw_lines or page.text.splitlines()
                for line_idx, line in enumerate(lines):
                    if re.search(rf"\b{re.escape(label)}\b", line, re.I) or (len(label) > 6 and label.lower() in line.lower()):
                        # 1. Check direct match on line with optional 'per DD.MM.YYYY' or colon
                        direct_match = re.search(
                            rf"{re.escape(label)}(?:\s+per\s+\d{{1,2}}\.\d{{1,2}}\.\d{{2,4}})?\s*[:]?\s*(?:CHF|EUR|Fr\.)?\s*([0-9][0-9'., ]*)",
                            line,
                            re.I,
                        )
                        if direct_match:
                            val = parse_currency_amount(direct_match.group(1))
                            if val is not None and not (1990 <= val <= 2099 and not re.search(r"(?:CHF|EUR|Fr\.)", line, re.I)):
                                return val, direct_match.group(1).strip(), page.page_number, line.strip(), 0.95

                        cleaned = re.sub(r"\b\d{1,2}\.\d{1,2}\.\d{2,4}\b", " ", line)

                        cur_match = re.search(r"(?:CHF|EUR|USD|Fr\.|SFr\.)\s*[:]?\s*([0-9][0-9'., ]*)", cleaned, re.I)
                        if cur_match:
                            val = parse_currency_amount(cur_match.group(1))
                            if val is not None:
                                return val, cur_match.group(1).strip(), page.page_number, line.strip(), 0.95

                        after_match = re.search(rf"{re.escape(label)}[^0-9\n]{{0,40}}([0-9][0-9'., ]*)", cleaned, re.I)
                        if after_match:
                            val = parse_currency_amount(after_match.group(1))
                            if val is not None:
                                if 1990 <= val <= 2099 and not re.search(r"(?:CHF|EUR|Fr\.)", cleaned, re.I):
                                    continue
                                return val, after_match.group(1).strip(), page.page_number, line.strip(), 0.90

                        if line_idx + 1 < len(lines):
                            next_line = lines[line_idx + 1]
                            next_match = re.search(r"(?:CHF|EUR|Fr\.)?\s*([0-9][0-9'., ]*)", next_line, re.I)
                            if next_match:
                                val = parse_currency_amount(next_match.group(1))
                                if val is not None:
                                    if 1990 <= val <= 2099 and not re.search(r"(?:CHF|EUR|Fr\.)", next_line, re.I):
                                        continue
                                    return val, next_match.group(1).strip(), page.page_number, f"{line} -> {next_line}".strip(), 0.85

        return None, None, 1, "", 0.0

    def _find_text_in_pages(
        self,
        labels: Tuple[str, ...],
        pages: List[PageOCRResult],
    ) -> Tuple[Optional[str], int, str, float]:
        """
        Search for text value near any of the specified labels in priority order.
        Returns: (text_value, page_num, source_text, confidence)
        """
        header_words = {
            "name", "employee", "employer", "address", "adresse", "mitarbeiter", "arbeitgeber",
            "chf", "lohnausweis", "certificat", "steuerjahr", "spendenbescheinigung",
        }

        for label in labels:
            for page in pages:
                lines = page.raw_lines or page.text.splitlines()
                for line_idx, line in enumerate(lines):
                    match = re.search(rf"{re.escape(label)}\s*[:]\s*([^\n\r]+)", line, re.I)
                    if match:
                        val = match.group(1).strip()
                        if val and val.lower() not in header_words and len(val) > 2:
                            return val, page.page_number, line.strip(), 0.92

                    if re.search(rf"\b{re.escape(label)}\b", line, re.I) and line_idx + 1 < len(lines):
                        next_line = lines[line_idx + 1].strip()
                        if next_line and next_line.lower() not in header_words and len(next_line) > 2:
                            return next_line, page.page_number, f"{line} -> {next_line}", 0.82

        return None, 1, "", 0.0

    def _find_ahv_number(self, pages: List[PageOCRResult]) -> Tuple[Optional[str], int, str, float]:
        """Extract Swiss AHV/AVS number in standard format: 756.xxxx.xxxx.xx or 756xxxxxxxxxx."""
        ahv_pattern = re.compile(r"\b(756[.\s]?[0-9]{4}[.\s]?[0-9]{4}[.\s]?[0-9]{2})\b")
        for page in pages:
            lines = page.raw_lines or page.text.splitlines()
            for line in lines:
                m = ahv_pattern.search(line)
                if m:
                    raw = m.group(1)
                    clean = re.sub(r"[\s]", "", raw)
                    return clean, page.page_number, line.strip(), 0.98
        return None, 1, "", 0.0

    def _find_tax_year(
        self,
        pages: List[PageOCRResult],
        expected_tax_year: Optional[int] = None,
    ) -> Tuple[Optional[int], int, str, float]:
        """Find tax year mentioned in the document (e.g. 2024, 2025, 2026)."""
        year_pattern = re.compile(r"\b(20[2-3][0-9])\b")
        
        # 1. High priority: explicit Steuerjahr / Tax Year / Période fiscale
        for page in pages:
            lines = page.raw_lines or page.text.splitlines()
            for line in lines:
                m_sj = re.search(r"(?:steuerjahr|p[eé]riode\s*fiscale|tax\s*year)\s*[:]?\s*(20[2-3][0-9])", line, re.I)
                if m_sj:
                    return int(m_sj.group(1)), page.page_number, line.strip(), 0.98

        # 2. Date ranges: e.g. 01.01.2025 - 31.12.2025
        for page in pages:
            lines = page.raw_lines or page.text.splitlines()
            for line in lines:
                m_range = re.search(r"01\.01\.(20[2-3][0-9])\s*[-–]\s*31\.12\.(20[2-3][0-9])", line)
                if m_range:
                    return int(m_range.group(2)), page.page_number, line.strip(), 0.98

        # 3. Year-end balance date: e.g. per 31.12.2025
        for page in pages:
            lines = page.raw_lines or page.text.splitlines()
            for line in lines:
                m_end = re.search(r"(?:per|au|al)\s*31\.12\.(20[2-3][0-9])", line, re.I)
                if m_end:
                    return int(m_end.group(1)), page.page_number, line.strip(), 0.95

        # 4. Keyword near year: jahr / année / periode
        for page in pages:
            lines = page.raw_lines or page.text.splitlines()
            for line in lines:
                # Also check donation date e.g. "Datum der Spende: 28.03.2025"
                m_sp = re.search(r"(?:spende|donation|don)\b[^\n\r]*\b\d{1,2}\.\d{1,2}\.(20[2-3][0-9])", line, re.I)
                if m_sp:
                    return int(m_sp.group(1)), page.page_number, line.strip(), 0.95
                if any(w in line.lower() for w in ("jahr", "année", "anno", "tax year", "periode", "période")):
                    m = year_pattern.search(line)
                    if m:
                        return int(m.group(1)), page.page_number, line.strip(), 0.90

        # 5. If issue date is in Jan-Apr of YYYY, annual tax documents (Lohnausweis, Bescheinigung) apply to YYYY - 1
        for page in pages:
            lines = page.raw_lines or page.text.splitlines()
            for line in lines:
                m_issue = re.search(r"\b\d{1,2}\.(?:0[1-4])\.(20[2-3][0-9])\b", line)
                if m_issue:
                    issue_yr = int(m_issue.group(1))
                    if expected_tax_year and issue_yr == expected_tax_year + 1:
                        return expected_tax_year, page.page_number, line.strip(), 0.92
                    elif not expected_tax_year:
                        return issue_yr - 1, page.page_number, line.strip(), 0.85

        # 6. Fallback: any mention of 2024-2026
        for page in pages:
            for line in page.raw_lines or page.text.splitlines():
                m = year_pattern.search(line)
                if m:
                    return int(m.group(1)), page.page_number, line.strip(), 0.75
        return None, 1, "", 0.0

    def _find_iban(self, pages: List[PageOCRResult]) -> Tuple[Optional[str], int, str, float]:
        """Extract Swiss or European IBAN."""
        iban_pattern = re.compile(r"\b([A-Z]{2}[0-9]{2}[A-Z0-9]{11,30})\b", re.I)
        for page in pages:
            for line in page.raw_lines or page.text.splitlines():
                clean_line = line.replace(" ", "")
                m = iban_pattern.search(clean_line)
                if m:
                    return m.group(1).upper(), page.page_number, line.strip(), 0.98
        return None, 1, "", 0.0

    # ── Extraction handlers by document type ──────────────────────────────────

    def extract_salary_certificate(
        self,
        ocr_result: DocumentOCRResult,
        expected_tax_year: Optional[int] = None,
    ) -> Tuple[Dict[str, ExtractedFieldDetail], List[str]]:
        fields: Dict[str, ExtractedFieldDetail] = {}
        warnings: List[str] = []
        pages = ocr_result.pages

        # Gross Salary (Ziffer 8 or Ziffer 1)
        gross, raw_g, pg_g, src_g, conf_g = self._find_number_in_pages(
            (
                "bruttolohn total",
                "salario lordo totale",
                "salaire brut total",
                "8. bruttolohn",
                "8. salaire brut",
                "8. salario lordo",
                "bruttolohn",
                "salario lordo",
                "salaire brut",
                "gross salary",
                "gross annual salary",
                "1. lohn",
                "1. salaire",
            ),
            pages,
        )
        if gross is not None:
            fields["gross_salary"] = ExtractedFieldDetail(
                field_name="gross_salary",
                value=gross,
                raw_value=raw_g,
                source_page=pg_g,
                source_text=src_g,
                confidence=conf_g,
                confidence_level="high" if conf_g > 0.85 else "medium",
                extraction_method="deterministic_ocr",
            )

        # Net Salary (Ziffer 11)
        net, raw_n, pg_n, src_n, conf_n = self._find_number_in_pages(
            ("11. nettolohn", "11. salaire net", "11. salario netto", "nettolohn", "salaire net", "salario netto", "net salary", "net salary paid"),
            pages,
        )
        if net is not None:
            fields["net_salary"] = ExtractedFieldDetail(
                field_name="net_salary",
                value=net,
                raw_value=raw_n,
                source_page=pg_n,
                source_text=src_n,
                confidence=conf_n,
                confidence_level="high" if conf_n > 0.85 else "medium",
                extraction_method="deterministic_ocr",
            )

        # Social deductions (AHV/AVS/AI/APG/ALV - Ziffer 9)
        social, raw_s, pg_s, src_s, conf_s = self._find_number_in_pages(
            ("9. beiträge ahv", "9. cotisations avs", "9. contributi avs", "beiträge ahv", "contributi avs", "cotisations avs", "ahv/iv/eo/alv", "social deductions"),
            pages,
        )
        if social is not None:
            fields["social_deductions"] = ExtractedFieldDetail(
                field_name="social_deductions",
                value=social,
                raw_value=raw_s,
                source_page=pg_s,
                source_text=src_s,
                confidence=conf_s,
                confidence_level="high" if conf_s > 0.85 else "medium",
                extraction_method="deterministic_ocr",
            )

        # Pension / BVG / LPP (Ziffer 10.1)
        pension, raw_p, pg_p, src_p, conf_p = self._find_number_in_pages(
            (
                "10.1 ordentliche beiträge",
                "ordentliche beiträge",
                "cotisations ordinaires",
                "contributi ordinari",
                "10. berufliche vorsorge",
                "10. prévoyance professionnelle",
                "10. previdenza professionale",
                "bvg",
                "lpp",
                "pension fund",
                "berufliche vorsorge (bvg)",
            ),
            pages,
        )
        if pension is not None:
            fields["pension_bvg"] = ExtractedFieldDetail(
                field_name="pension_bvg",
                value=pension,
                raw_value=raw_p,
                source_page=pg_p,
                source_text=src_p,
                confidence=conf_p,
                confidence_level="high" if conf_p > 0.85 else "medium",
                extraction_method="deterministic_ocr",
            )

        # Employer name
        employer, pg_em, src_em, conf_em = self._find_text_in_pages(
            ("arbeitgeber", "employeur", "datore di lavoro", "employer"),
            pages,
        )
        if not employer:
            # Fallback: scan for corporate entity indicator (AG, GmbH, SA, Sàrl) in issuer section
            for page in pages:
                lines = page.raw_lines or page.text.splitlines()
                for line in lines:
                    if re.search(r"\b([A-Z][A-Za-z0-9\s&.-]+(?:\s+AG|\s+GmbH|\s+SA|\s+S[aà]rl))\b", line):
                        m = re.search(r"\b([A-Z][A-Za-z0-9\s&.-]+(?:\s+AG|\s+GmbH|\s+SA|\s+S[aà]rl))\b", line)
                        cand = m.group(1).strip()
                        if len(cand) > 3 and not any(skip in cand.lower() for skip in ("ubs", "vorsorge", "postfinance", "bundesamt")):
                            employer = cand
                            pg_em = page.page_number
                            src_em = line.strip()
                            conf_em = 0.88
                            break
                if employer:
                    break

        if employer:
            fields["employer_name"] = ExtractedFieldDetail(
                field_name="employer_name",
                value=employer,
                raw_value=employer,
                source_page=pg_em,
                source_text=src_em,
                confidence=conf_em,
                confidence_level="high" if conf_em > 0.85 else "medium",
                extraction_method="deterministic_ocr",
            )

        # AHV Number
        ahv, pg_ahv, src_ahv, conf_ahv = self._find_ahv_number(pages)
        if ahv:
            fields["ahv_number"] = ExtractedFieldDetail(
                field_name="ahv_number",
                value=ahv,
                raw_value=ahv,
                source_page=pg_ahv,
                source_text=src_ahv,
                confidence=conf_ahv,
                confidence_level="high",
                extraction_method="deterministic_ocr",
            )

        # Tax Year
        year, pg_yr, src_yr, conf_yr = self._find_tax_year(pages, expected_tax_year=expected_tax_year)
        if year:
            fields["tax_year"] = ExtractedFieldDetail(
                field_name="tax_year",
                value=year,
                raw_value=str(year),
                source_page=pg_yr,
                source_text=src_yr,
                confidence=conf_yr,
                confidence_level="high",
                extraction_method="deterministic_ocr",
            )
            if expected_tax_year and year != expected_tax_year:
                warnings.append(
                    f"Tax year mismatch: Document indicates {year}, but the tax return is for {expected_tax_year}."
                )

        # Cross-field arithmetic validation: gross - social - pension ~= net
        if gross is not None and net is not None:
            expected_net = gross - (social or 0.0) - (pension or 0.0)
            diff = abs(expected_net - net)
            if diff > (0.05 * gross):
                warnings.append(
                    "Salary arithmetic note: Gross salary minus standard statutory deductions differs from net salary. "
                    "Salary certificates may include additional expense allowances, company benefits, or other deductions. Please review."
                )

        return fields, warnings

    def extract_bank_statement(
        self,
        ocr_result: DocumentOCRResult,
        expected_tax_year: Optional[int] = None,
    ) -> Tuple[Dict[str, ExtractedFieldDetail], List[str]]:
        fields: Dict[str, ExtractedFieldDetail] = {}
        warnings: List[str] = []
        pages = ocr_result.pages

        # Balance as of Dec 31
        bal, raw_b, pg_b, src_b, conf_b = self._find_number_in_pages(
            (
                "kontosaldo",
                "saldo per 31.12",
                "solde au 31.12",
                "saldo al 31.12",
                "kontostand per 31.12",
                "closing balance",
                "schluss-saldo",
                "schlusssaldo",
                "habensaldo",
                "balance",
                "kontostand",
                "saldo",
            ),
            pages,
        )
        if bal is not None:
            fields["balance"] = ExtractedFieldDetail(
                field_name="balance",
                value=bal,
                raw_value=raw_b,
                source_page=pg_b,
                source_text=src_b,
                confidence=conf_b,
                confidence_level="high" if conf_b > 0.85 else "medium",
                extraction_method="deterministic_ocr",
            )

        # Interest Earned (Habenzinsen)
        interest, raw_i, pg_i, src_i, conf_i = self._find_number_in_pages(
            ("habenzins", "bruttozins", "intérêts créditeurs", "interessi", "interest earned", "zinsgutschrift"),
            pages,
        )
        if interest is not None:
            fields["interest_earned"] = ExtractedFieldDetail(
                field_name="interest_earned",
                value=interest,
                raw_value=raw_i,
                source_page=pg_i,
                source_text=src_i,
                confidence=conf_i,
                confidence_level="high" if conf_i > 0.85 else "medium",
                extraction_method="deterministic_ocr",
            )

        # Interest on Debt (Sollzinsen)
        soll, raw_soll, pg_soll, src_soll, conf_soll = self._find_number_in_pages(
            ("sollzinsen", "intérêts débiteurs", "debit interest", "verzugszins"),
            pages,
        )
        if soll is not None:
            fields["interest_debt"] = ExtractedFieldDetail(
                field_name="interest_debt",
                value=soll,
                raw_value=raw_soll,
                source_page=pg_soll,
                source_text=src_soll,
                confidence=conf_soll,
                confidence_level="high" if conf_soll > 0.85 else "medium",
                extraction_method="deterministic_ocr",
            )

        # IBAN
        iban, pg_ib, src_ib, conf_ib = self._find_iban(pages)
        if iban:
            fields["iban"] = ExtractedFieldDetail(
                field_name="iban",
                value=iban,
                raw_value=iban,
                source_page=pg_ib,
                source_text=src_ib,
                confidence=conf_ib,
                confidence_level="high",
                extraction_method="deterministic_ocr",
            )

        # Bank Name
        bank, pg_bn, src_bn, conf_bn = self._find_text_in_pages(
            ("bank", "finanzinstitut", "banque", "banca", "institution"),
            pages,
        )
        if not bank:
            known_banks = (
                "UBS Switzerland AG",
                "UBS",
                "Credit Suisse",
                "Zürcher Kantonalbank",
                "ZKB",
                "PostFinance",
                "Raiffeisen",
                "Julius Bär",
                "Migros Bank",
                "Bank Cler",
                "Basler Kantonalbank",
                "BCV",
            )
            for page in pages:
                lines = page.raw_lines or page.text.splitlines()
                for line in lines[:8]:
                    for kb in known_banks:
                        if re.search(rf"\b{re.escape(kb)}\b", line, re.I):
                            bank = kb
                            pg_bn = page.page_number
                            src_bn = line.strip()
                            conf_bn = 0.95
                            break
                    if bank:
                        break
                if bank:
                    break

        if bank:
            fields["bank_name"] = ExtractedFieldDetail(
                field_name="bank_name",
                value=bank,
                raw_value=bank,
                source_page=pg_bn,
                source_text=src_bn,
                confidence=conf_bn,
                confidence_level="high" if conf_bn > 0.85 else "medium",
                extraction_method="deterministic_ocr",
            )

        # Tax Year
        year, pg_yr, src_yr, conf_yr = self._find_tax_year(pages, expected_tax_year=expected_tax_year)
        if year:
            fields["tax_year"] = ExtractedFieldDetail(
                field_name="tax_year",
                value=year,
                raw_value=str(year),
                source_page=pg_yr,
                source_text=src_yr,
                confidence=conf_yr,
                confidence_level="high",
                extraction_method="deterministic_ocr",
            )
            if expected_tax_year and year != expected_tax_year:
                warnings.append(f"Statement year ({year}) differs from tax return year ({expected_tax_year}).")

        return fields, warnings

    def extract_securities_statement(
        self,
        ocr_result: DocumentOCRResult,
        expected_tax_year: Optional[int] = None,
    ) -> Tuple[Dict[str, ExtractedFieldDetail], List[str]]:
        fields: Dict[str, ExtractedFieldDetail] = {}
        warnings: List[str] = []
        pages = ocr_result.pages

        val, raw_v, pg_v, src_v, conf_v = self._find_number_in_pages(
            ("steuerwert total", "total steuerwert", "valeur fiscale totale", "total market value", "steuerwert", "depotwert"),
            pages,
        )
        if val is not None:
            fields["total_value"] = ExtractedFieldDetail(
                field_name="total_value",
                value=val,
                raw_value=raw_v,
                source_page=pg_v,
                source_text=src_v,
                confidence=conf_v,
                confidence_level="high" if conf_v > 0.85 else "medium",
                extraction_method="deterministic_ocr",
            )

        div, raw_d, pg_d, src_d, conf_d = self._find_number_in_pages(
            ("bruttoertrag", "rendement brut", "dividends received", "total ertrag", "dividenden"),
            pages,
        )
        if div is not None:
            fields["dividends_received"] = ExtractedFieldDetail(
                field_name="dividends_received",
                value=div,
                raw_value=raw_d,
                source_page=pg_d,
                source_text=src_d,
                confidence=conf_d,
                confidence_level="high" if conf_d > 0.85 else "medium",
                extraction_method="deterministic_ocr",
            )

        return fields, warnings

    def extract_pillar3a(
        self,
        ocr_result: DocumentOCRResult,
        expected_tax_year: Optional[int] = None,
    ) -> Tuple[Dict[str, ExtractedFieldDetail], List[str]]:
        fields: Dict[str, ExtractedFieldDetail] = {}
        warnings: List[str] = []
        pages = ocr_result.pages

        # Contribution amount
        contrib, raw_c, pg_c, src_c, conf_c = self._find_number_in_pages(
            (
                "total beiträge an die säule 3a",
                "total beiträge",
                "beiträge an die säule 3a",
                "beiträge säule 3a",
                "vorsorgebeiträge",
                "einzahlung säule 3a",
                "einbezahlter betrag",
                "montant versé",
                "contributo pilastro 3a",
                "cotisations pilier 3a",
                "contribution amount",
                "einzahlung",
                "versé",
            ),
            pages,
        )
        if contrib is not None:
            fields["contribution_amount"] = ExtractedFieldDetail(
                field_name="contribution_amount",
                value=contrib,
                raw_value=raw_c,
                source_page=pg_c,
                source_text=src_c,
                confidence=conf_c,
                confidence_level="high" if conf_c > 0.85 else "medium",
                extraction_method="deterministic_ocr",
            )
            # Stat maximum check warning
            if contrib > 7258.0:
                warnings.append(
                    f"Pillar 3a contribution CHF {contrib:,.2f} exceeds statutory employed maximum (CHF 7,258). Deductible amount will be capped."
                )

        # Balance as of Dec 31
        bal, raw_b, pg_b, src_b, conf_b = self._find_number_in_pages(
            ("guthaben per 31.12", "kapital per 31.12", "avoir au 31.12", "capitale al 31.12", "balance", "kontostand"),
            pages,
        )
        if bal is not None:
            fields["balance"] = ExtractedFieldDetail(
                field_name="balance",
                value=bal,
                raw_value=raw_b,
                source_page=pg_b,
                source_text=src_b,
                confidence=conf_b,
                confidence_level="high" if conf_b > 0.85 else "medium",
                extraction_method="deterministic_ocr",
            )

        # Provider Name
        provider, pg_pr, src_pr, conf_pr = None, 1, "", 0.0
        for page in pages:
            lines = page.raw_lines or page.text.splitlines()
            for idx, line in enumerate(lines):
                # Header "Name und Sitz der Vorsorgeeinrichtung" with next line
                if re.search(r"name\s+und\s+sitz\s+der\s+vorsorge", line, re.I) and idx + 1 < len(lines):
                    next_l = lines[idx + 1].strip()
                    cand = next_l.split(",")[0].strip()
                    if cand and len(cand) > 3:
                        provider = cand
                        pg_pr = page.page_number
                        src_pr = f"{line} -> {next_l}"
                        conf_pr = 0.95
                        break
                # Pattern: explicit line containing Vorsorgestiftung / Bankstiftung
                m_pv = re.search(r"([A-Za-z0-9\s&.-]*(?:vorsorgestiftung|bankstiftung|fondation\s+de\s+pr[eé]voyance|fondazione)[A-Za-z0-9\s&.-]*)", line, re.I)
                if m_pv:
                    cand = m_pv.group(1).split(",")[0].strip()
                    if cand and len(cand) > 4 and not any(skip in cand.lower() for skip in ("sitz", "name", "form.", "steuererklärung", "einrichtung", "/bankstiftung")):
                        provider = cand
                        pg_pr = page.page_number
                        src_pr = line.strip()
                        conf_pr = 0.95
                        break
            if provider:
                break

        if not provider:
            provider, pg_pr, src_pr, conf_pr = self._find_text_in_pages(
                ("vorsorgestiftung", "fondation de prévoyance", "fondazione", "provider", "bank"),
                pages,
            )

        if provider:
            fields["provider_name"] = ExtractedFieldDetail(
                field_name="provider_name",
                value=provider,
                raw_value=provider,
                source_page=pg_pr,
                source_text=src_pr,
                confidence=conf_pr,
                confidence_level="high" if conf_pr > 0.85 else "medium",
                extraction_method="deterministic_ocr",
            )

        # Insured person / account holder
        holder, pg_h, src_h, conf_h = None, 1, "", 0.0
        for page in pages:
            lines = page.raw_lines or page.text.splitlines()
            for idx, line in enumerate(lines):
                if re.search(r"name,\s*vorname|nom,\s*pr[eé]nom|nome,\s*cognome", line, re.I):
                    if idx + 1 < len(lines):
                        cand = lines[idx + 1].strip()
                        if cand and not any(w in cand.lower() for w in ("adresse", "ahv", "strasse", "756.")):
                            holder = cand
                            pg_h = page.page_number
                            src_h = f"{line} -> {cand}"
                            conf_h = 0.90
                            break
            if holder:
                break
        if holder:
            fields["account_holder"] = ExtractedFieldDetail(
                field_name="account_holder",
                value=holder,
                raw_value=holder,
                source_page=pg_h,
                source_text=src_h,
                confidence=conf_h,
                confidence_level="high",
                extraction_method="deterministic_ocr",
            )

        # AHV Number
        ahv, pg_ahv, src_ahv, conf_ahv = self._find_ahv_number(pages)
        if ahv:
            fields["ahv_number"] = ExtractedFieldDetail(
                field_name="ahv_number",
                value=ahv,
                raw_value=ahv,
                source_page=pg_ahv,
                source_text=src_ahv,
                confidence=conf_ahv,
                confidence_level="high",
                extraction_method="deterministic_ocr",
            )

        year, pg_yr, src_yr, conf_yr = self._find_tax_year(pages, expected_tax_year=expected_tax_year)
        if year:
            fields["tax_year"] = ExtractedFieldDetail(
                field_name="tax_year",
                value=year,
                raw_value=str(year),
                source_page=pg_yr,
                source_text=src_yr,
                confidence=conf_yr,
                confidence_level="high",
                extraction_method="deterministic_ocr",
            )

        return fields, warnings

    def extract_mortgage(
        self,
        ocr_result: DocumentOCRResult,
        expected_tax_year: Optional[int] = None,
    ) -> Tuple[Dict[str, ExtractedFieldDetail], List[str]]:
        fields: Dict[str, ExtractedFieldDetail] = {}
        warnings: List[str] = []
        pages = ocr_result.pages

        bal, raw_b, pg_b, src_b, conf_b = self._find_number_in_pages(
            ("hypothekarschuld", "schuld per 31.12", "dette au 31.12", "debito al 31.12", "mortgage balance", "outstanding balance", "kapitalschuld"),
            pages,
        )
        if bal is not None:
            fields["mortgage_balance"] = ExtractedFieldDetail(
                field_name="mortgage_balance",
                value=bal,
                raw_value=raw_b,
                source_page=pg_b,
                source_text=src_b,
                confidence=conf_b,
                confidence_level="high" if conf_b > 0.85 else "medium",
                extraction_method="deterministic_ocr",
            )

        interest, raw_i, pg_i, src_i, conf_i = self._find_number_in_pages(
            ("bezahlte schuldzinsen", "hypothekarzins", "intérêts payés", "interessi pagati", "interest paid"),
            pages,
        )
        if interest is not None:
            fields["interest_paid"] = ExtractedFieldDetail(
                field_name="interest_paid",
                value=interest,
                raw_value=raw_i,
                source_page=pg_i,
                source_text=src_i,
                confidence=conf_i,
                confidence_level="high" if conf_i > 0.85 else "medium",
                extraction_method="deterministic_ocr",
            )

        lender, pg_l, src_l, conf_l = self._find_text_in_pages(
            ("gläubiger", "créancier", "creditore", "lender", "bank"),
            pages,
        )
        if lender:
            fields["lender_name"] = ExtractedFieldDetail(
                field_name="lender_name",
                value=lender,
                raw_value=lender,
                source_page=pg_l,
                source_text=src_l,
                confidence=conf_l,
                confidence_level="medium",
                extraction_method="deterministic_ocr",
            )

        return fields, warnings

    def extract_donation(
        self,
        ocr_result: DocumentOCRResult,
        expected_tax_year: Optional[int] = None,
    ) -> Tuple[Dict[str, ExtractedFieldDetail], List[str]]:
        fields: Dict[str, ExtractedFieldDetail] = {}
        warnings: List[str] = []
        pages = ocr_result.pages

        amt, raw_a, pg_a, src_a, conf_a = self._find_number_in_pages(
            ("betrag der spende", "spendenbetrag", "montant du don", "donazione", "donation amount", "betrag", "spende"),
            pages,
        )
        if amt is not None:
            fields["amount"] = ExtractedFieldDetail(
                field_name="amount",
                value=amt,
                raw_value=raw_a,
                source_page=pg_a,
                source_text=src_a,
                confidence=conf_a,
                confidence_level="high" if conf_a > 0.85 else "medium",
                extraction_method="deterministic_ocr",
            )

        # Organization Name
        org, pg_o, src_o, conf_o = None, 1, "", 0.0
        best_org = ""
        for page in pages:
            lines = page.raw_lines or page.text.splitlines()
            for idx, line in enumerate(lines[:12]):
                m_org = re.search(r"([A-Za-z0-9\s&.-]*(?:\b(?:Charity|Stiftung|Verein|Hilfswerk|Organisation|Association|Fondation|Fund|Alliance|Aid)\b)[A-Za-z0-9\s&.-]*)", line, re.I)
                if m_org:
                    cand = m_org.group(1).split(",")[0].strip()
                    if cand and len(cand) > len(best_org) and not any(skip in cand.lower() for skip in ("befreit", "bestätigen", "institution", "spende", "steuer")):
                        best_org = cand
                        pg_o = page.page_number
                        src_o = line.strip()
                        conf_o = 0.95
        if best_org:
            org = best_org

        if not org:
            org, pg_o, src_o, conf_o = self._find_text_in_pages(
                ("organisation", "begünstigter", "bénéficiaire", "beneficiario", "institution"),
                pages,
            )

        if org:
            fields["organisation_name"] = ExtractedFieldDetail(
                field_name="organisation_name",
                value=org,
                raw_value=org,
                source_page=pg_o,
                source_text=src_o,
                confidence=conf_o,
                confidence_level="high" if conf_o > 0.85 else "medium",
                extraction_method="deterministic_ocr",
            )

        # Donor Name
        donor, pg_d, src_d, conf_d = None, 1, "", 0.0
        for page in pages:
            lines = page.raw_lines or page.text.splitlines()
            for line in lines:
                m_d = re.search(r"(?:spendende\s*person|donateur|donatore|donor)\s*[:]?\s*([A-Za-z\s.-]+)", line, re.I)
                if m_d:
                    donor = m_d.group(1).strip()
                    pg_d = page.page_number
                    src_d = line.strip()
                    conf_d = 0.92
                    break
            if donor:
                break
        if donor:
            fields["donor_name"] = ExtractedFieldDetail(
                field_name="donor_name",
                value=donor,
                raw_value=donor,
                source_page=pg_d,
                source_text=src_d,
                confidence=conf_d,
                confidence_level="high",
                extraction_method="deterministic_ocr",
            )

        # Tax Year
        year, pg_yr, src_yr, conf_yr = self._find_tax_year(pages, expected_tax_year=expected_tax_year)
        if year:
            fields["tax_year"] = ExtractedFieldDetail(
                field_name="tax_year",
                value=year,
                raw_value=str(year),
                source_page=pg_yr,
                source_text=src_yr,
                confidence=conf_yr,
                confidence_level="high",
                extraction_method="deterministic_ocr",
            )

        return fields, warnings

    def extract_insurance(
        self,
        ocr_result: DocumentOCRResult,
        expected_tax_year: Optional[int] = None,
    ) -> Tuple[Dict[str, ExtractedFieldDetail], List[str]]:
        fields: Dict[str, ExtractedFieldDetail] = {}
        warnings: List[str] = []
        pages = ocr_result.pages

        prem, raw_p, pg_p, src_p, conf_p = self._find_number_in_pages(
            ("prämien total", "jahresprämie", "primes payées", "premi pagati", "annual premium", "prämie"),
            pages,
        )
        if prem is not None:
            fields["premium_amount"] = ExtractedFieldDetail(
                field_name="premium_amount",
                value=prem,
                raw_value=raw_p,
                source_page=pg_p,
                source_text=src_p,
                confidence=conf_p,
                confidence_level="high" if conf_p > 0.85 else "medium",
                extraction_method="deterministic_ocr",
            )

        insurer, pg_ins, src_ins, conf_ins = self._find_text_in_pages(
            ("versicherer", "krankenkasse", "assureur", "assicuratore", "insurance company"),
            pages,
        )
        if insurer:
            fields["insurer_name"] = ExtractedFieldDetail(
                field_name="insurer_name",
                value=insurer,
                raw_value=insurer,
                source_page=pg_ins,
                source_text=src_ins,
                confidence=conf_ins,
                confidence_level="medium",
                extraction_method="deterministic_ocr",
            )

        return fields, warnings

    def extract_medical(
        self,
        ocr_result: DocumentOCRResult,
        expected_tax_year: Optional[int] = None,
    ) -> Tuple[Dict[str, ExtractedFieldDetail], List[str]]:
        fields: Dict[str, ExtractedFieldDetail] = {}
        warnings: List[str] = []
        pages = ocr_result.pages

        amt, raw_a, pg_a, src_a, conf_a = self._find_number_in_pages(
            ("selbstbehalt", "frais à charge", "kosten zu ihren lasten", "medical expenses", "rechnungsbetrag", "total"),
            pages,
        )
        if amt is not None:
            fields["amount"] = ExtractedFieldDetail(
                field_name="amount",
                value=amt,
                raw_value=raw_a,
                source_page=pg_a,
                source_text=src_a,
                confidence=conf_a,
                confidence_level="high" if conf_a > 0.85 else "medium",
                extraction_method="deterministic_ocr",
            )

        return fields, warnings

    # ── Main Classification & Extraction Pipeline ─────────────────────────────

    def process_document(
        self,
        ocr_result: DocumentOCRResult,
        filename: str = "",
        expected_tax_year: Optional[int] = None,
        category_hint: Optional[str] = None,
    ) -> ExtractionResult:
        """
        Classifies document and extracts structured fields.
        Uses deterministic parsing by default; invokes Gemini only if enabled & needed.
        """
        if category_hint and category_hint != "other":
            doc_type = category_hint
            conf = 0.95
        else:
            doc_type, conf = self.classify_document(ocr_result, filename)

        fields: Dict[str, ExtractedFieldDetail] = {}
        warnings: List[str] = list(ocr_result.warnings)

        if doc_type == "salary_certificate":
            fields, extra_warn = self.extract_salary_certificate(ocr_result, expected_tax_year)
            warnings.extend(extra_warn)
        elif doc_type == "bank_statement":
            fields, extra_warn = self.extract_bank_statement(ocr_result, expected_tax_year)
            warnings.extend(extra_warn)
        elif doc_type == "securities_statement":
            fields, extra_warn = self.extract_securities_statement(ocr_result, expected_tax_year)
            warnings.extend(extra_warn)
        elif doc_type == "pillar3a":
            fields, extra_warn = self.extract_pillar3a(ocr_result, expected_tax_year)
            warnings.extend(extra_warn)
        elif doc_type == "mortgage":
            fields, extra_warn = self.extract_mortgage(ocr_result, expected_tax_year)
            warnings.extend(extra_warn)
        elif doc_type == "donation":
            fields, extra_warn = self.extract_donation(ocr_result, expected_tax_year)
            warnings.extend(extra_warn)
        elif doc_type == "insurance":
            fields, extra_warn = self.extract_insurance(ocr_result, expected_tax_year)
            warnings.extend(extra_warn)
        elif doc_type == "medical":
            fields, extra_warn = self.extract_medical(ocr_result, expected_tax_year)
            warnings.extend(extra_warn)

    def _extract_with_gemini(
        self,
        ocr_result: DocumentOCRResult,
        doc_type: str,
        expected_tax_year: Optional[int] = None,
    ) -> Tuple[str, float, Dict[str, ExtractedFieldDetail], List[str]]:
        """
        Invokes Google Gemini via the official google-genai SDK for complex,
        ambiguous, or low-confidence tax documents when external AI is enabled.
        """
        import json
        from google import genai
        from google.genai import types

        logger.info("Calling Gemini API (%s) for document extraction", settings.GEMINI_MODEL)
        client = genai.Client(api_key=settings.GEMINI_API_KEY)

        system_instruction = (
            "You are an expert Swiss tax accountant AI. "
            "Your task is to analyze Swiss tax documents (Lohnausweis, bank statements, Pillar 3a, mortgages, donations, etc.) "
            "and extract structured financial and personal data. "
            "Extract exact numbers without rounding or inventing values. Return null for fields not present in the document. "
            "Never invent values. Temperature is 0."
        )

        prompt = f"""Analyze the following extracted document text:
--------------------
{ocr_result.full_text[:8000]}
--------------------

Identify the document category (one of: salary_certificate, bank_statement, securities_statement, pillar3a, mortgage, donation, insurance, medical, previous_tax_return, tax_assessment, other).
Extract all relevant fields:
- For salary_certificate: gross_salary, net_salary, pension_bvg, employee_name, employer_name, ahv_number, tax_year
- For bank_statement: bank_name, account_holder, iban, balance, interest_earned
- For securities_statement: broker_name, total_value, dividends_received
- For pillar3a: provider_name, contribution_amount, balance, tax_year
- For mortgage: lender_name, mortgage_balance, interest_paid
- For donation: organization_name, amount, tax_year
- For insurance: insurer_name, premium_amount
- For medical: provider_name, amount

Return a JSON object with:
{{
  "document_type": "<type>",
  "confidence": 0.0 to 1.0,
  "fields": {{
     "<field_name>": {{
         "value": <numeric or string value>,
         "raw_value": "<raw substring>",
         "confidence": 0.0 to 1.0,
         "source_line": "<line text>"
     }}
  }},
  "warnings": ["<optional warning message>"]
}}
"""

        response = client.models.generate_content(
            model=settings.GEMINI_MODEL,
            contents=[prompt],
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.0,
                response_mime_type="application/json",
            ),
        )

        gemini_data = json.loads(response.text)
        detected_type = gemini_data.get("document_type") or doc_type
        detected_conf = float(gemini_data.get("confidence") or 0.85)
        raw_fields = gemini_data.get("fields") or {}
        gemini_warnings = gemini_data.get("warnings") or []

        extracted_fields: Dict[str, ExtractedFieldDetail] = {}
        for fld_name, fld_info in raw_fields.items():
            if not isinstance(fld_info, dict):
                continue
            val = fld_info.get("value")
            if val is None:
                continue
            if fld_name in (
                "gross_salary", "net_salary", "pension_bvg", "balance",
                "interest_earned", "contribution_amount", "mortgage_balance",
                "interest_paid", "amount", "premium_amount", "total_value", "dividends_received"
            ):
                try:
                    val = float(val)
                except (ValueError, TypeError):
                    pass

            conf_fld = float(fld_info.get("confidence") or 0.90)
            extracted_fields[fld_name] = ExtractedFieldDetail(
                field_name=fld_name,
                value=val,
                raw_value=str(fld_info.get("raw_value") or val),
                source_page=1,
                source_text=str(fld_info.get("source_line") or "Extracted via Google Gemini"),
                confidence=conf_fld,
                confidence_level="high" if conf_fld >= 0.85 else ("medium" if conf_fld >= 0.70 else "low"),
                extraction_method="google_gemini",
                status="needs_review",
            )

        return detected_type, detected_conf, extracted_fields, gemini_warnings

    # ── Main Classification & Extraction Pipeline ─────────────────────────────

    def process_document(
        self,
        ocr_result: DocumentOCRResult,
        filename: str = "",
        expected_tax_year: Optional[int] = None,
        category_hint: Optional[str] = None,
    ) -> ExtractionResult:
        """
        Classifies document and extracts structured fields.
        Uses deterministic parsing by default; invokes Gemini when enabled & needed.
        """
        if category_hint and category_hint != "other":
            doc_type = category_hint
            conf = 0.95
        else:
            doc_type, conf = self.classify_document(ocr_result, filename)

        fields: Dict[str, ExtractedFieldDetail] = {}
        warnings: List[str] = list(ocr_result.warnings)

        if doc_type == "salary_certificate":
            fields, extra_warn = self.extract_salary_certificate(ocr_result, expected_tax_year)
            warnings.extend(extra_warn)
        elif doc_type == "bank_statement":
            fields, extra_warn = self.extract_bank_statement(ocr_result, expected_tax_year)
            warnings.extend(extra_warn)
        elif doc_type == "securities_statement":
            fields, extra_warn = self.extract_securities_statement(ocr_result, expected_tax_year)
            warnings.extend(extra_warn)
        elif doc_type == "pillar3a":
            fields, extra_warn = self.extract_pillar3a(ocr_result, expected_tax_year)
            warnings.extend(extra_warn)
        elif doc_type == "mortgage":
            fields, extra_warn = self.extract_mortgage(ocr_result, expected_tax_year)
            warnings.extend(extra_warn)
        elif doc_type == "donation":
            fields, extra_warn = self.extract_donation(ocr_result, expected_tax_year)
            warnings.extend(extra_warn)
        elif doc_type == "insurance":
            fields, extra_warn = self.extract_insurance(ocr_result, expected_tax_year)
            warnings.extend(extra_warn)
        elif doc_type == "medical":
            fields, extra_warn = self.extract_medical(ocr_result, expected_tax_year)
            warnings.extend(extra_warn)

        # Fallback check: if Gemini is configured and permitted by privacy setting, and fields are scarce
        provider = "deterministic_ocr"
        valid_key = (
            bool(settings.GEMINI_API_KEY)
            and settings.GEMINI_API_KEY not in ("your-gemini-api-key", "placeholder", "")
        )
        if settings.ENABLE_EXTERNAL_AI_EXTRACTION and valid_key:
            if not fields or conf < 0.60 or doc_type == "other":
                try:
                    logger.info("Invoking Gemini for extraction on %s (model: %s)", filename, settings.GEMINI_MODEL)
                    ai_type, ai_conf, ai_fields, ai_warn = self._extract_with_gemini(
                        ocr_result=ocr_result,
                        doc_type=doc_type,
                        expected_tax_year=expected_tax_year,
                    )
                    if ai_fields:
                        fields = ai_fields
                        doc_type = ai_type
                        conf = ai_conf
                        warnings.extend(ai_warn)
                        provider = f"google_gemini:{settings.GEMINI_MODEL}"
                        logger.info("Gemini extraction succeeded with %d fields", len(fields))
                except Exception as exc:
                    logger.warning("Gemini AI extraction encountered error; using deterministic fallback: %s", exc)
                    warnings.append(f"AI extraction unavailable: {str(exc)}")

        return ExtractionResult(
            document_type=doc_type,
            classification_confidence=conf,
            fields=fields,
            provider=provider,
            warnings=warnings,
        )


# Module singleton
document_extractor = DocumentExtractor()
