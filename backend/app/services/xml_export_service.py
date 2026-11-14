"""
Official Swiss Tax Declaration eCH-0119 v4.0.0 Export & Validation Service.

Produces fully compliant, XSD-validated Swiss E-Tax filing messages pursuant to:
  - Standard eCH-0119 Version 4.0.0 (Namespace: http://www.ech.ch/xmlns/eCH-0119/4)
  - Subordinate standards: eCH-0044 (Person Identification), eCH-0010 (Postal Address),
    eCH-0046 (Contact), eCH-0011 (Civil Status), eCH-0007 (Municipality BFS).
"""
from __future__ import annotations

import email.message
import io
import logging
import os
import re
import urllib.request
import urllib.response
import xml.dom.minidom
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.core.config import settings

logger = logging.getLogger(__name__)

# Base directory for local eCH schemas
SCHEMAS_DIR = Path(__file__).resolve().parents[1] / "schemas" / "ech0119"


_IMAGE_MIMES = {"image/jpeg", "image/jpg", "image/png", "image/tiff", "image/tif", "image/webp"}
_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp"}


def _detect_mime_type(doc: Any, filename: str) -> str:
    """Determine documentFormat pursuant to eCH-0119 attachment specification."""
    mime = getattr(doc, "mime_type", None) or (doc.get("mime_type") if isinstance(doc, dict) else None)
    if mime:
        m = str(mime).lower().strip()
        if m in ("image/jpeg", "image/jpg"):
            return "image/jpeg"
        if m in ("image/png", "application/pdf", "image/tiff", "image/webp"):
            return m
    ext = Path(filename).suffix.lower()
    if ext in (".jpg", ".jpeg"):
        return "image/jpeg"
    if ext == ".png":
        return "image/png"
    if ext in (".tif", ".tiff"):
        return "image/tiff"
    if ext == ".webp":
        return "image/webp"
    return "application/pdf"


def normalize_attachment_for_ech(
    doc: Any, sort_order: int = 1, seen_names: Optional[set] = None
) -> Tuple[str, str]:
    """Normalize attachment filename (safe basename + .pdf for images/PDFs) and deduplicate."""
    raw_name = (
        getattr(doc, "original_filename", None)
        or (doc.get("original_filename") if isinstance(doc, dict) else None)
        or getattr(doc, "filename", None)
        or (doc.get("filename") if isinstance(doc, dict) else None)
        or f"beleg_{sort_order}.pdf"
    )
    safe_base = Path(str(raw_name).replace("\\", "/")).name
    safe_base = re.sub(r"[^A-Za-z0-9._-]", "_", safe_base).strip("._") or f"beleg_{sort_order}"
    detected_mime = _detect_mime_type(doc, safe_base)
    ext = Path(safe_base).suffix.lower()

    if detected_mime == "application/pdf" or detected_mime in _IMAGE_MIMES or ext == ".pdf" or ext in _IMAGE_EXTS:
        stem = Path(safe_base).stem or f"beleg_{sort_order}"
        target_ext = ".pdf"
        target_mime = "application/pdf"
    else:
        stem = Path(safe_base).stem or f"beleg_{sort_order}"
        target_ext = ext or ".pdf"
        target_mime = detected_mime

    candidate = f"{stem}{target_ext}"
    if seen_names is not None:
        idx = sort_order
        while candidate.lower() in seen_names:
            candidate = f"{stem}_{idx}{target_ext}"
            idx += 1
        seen_names.add(candidate.lower())

    return candidate, target_mime


def convert_attachment_to_pdf(
    raw_bytes: bytes, mime_type: Optional[str] = None, filename: str = "attachment.pdf"
) -> Tuple[bytes, str]:
    """Validate attachment bytes and convert supported raster images cleanly into PDF bytes."""
    import fitz

    if not raw_bytes:
        raise ValueError(f"Attachment '{filename}' is empty")

    declared = (mime_type or "").lower().strip()
    if raw_bytes.startswith(b"%PDF-"):
        if declared and declared not in ("application/pdf", "application/x-pdf"):
            raise ValueError(f"Attachment '{filename}' has PDF magic bytes but declared MIME '{declared}'")
        with fitz.open(stream=raw_bytes, filetype="pdf") as pdf_doc:
            if pdf_doc.page_count < 1:
                raise ValueError(f"PDF attachment '{filename}' has zero pages")
        return raw_bytes, "pdf"

    detected_type: Optional[str] = None
    if raw_bytes.startswith(b"\xff\xd8\xff"):
        detected_type = "jpeg"
    elif raw_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        detected_type = "png"
    elif raw_bytes.startswith((b"II*\x00", b"MM\x00*")):
        detected_type = "tiff"
    elif len(raw_bytes) >= 12 and raw_bytes[:4] == b"RIFF" and raw_bytes[8:12] == b"WEBP":
        detected_type = "webp"

    if not detected_type:
        raise ValueError(f"Unsupported or invalid binary header for attachment '{filename}' ({declared or 'unknown'})")

    mime_map = {
        "image/jpeg": "jpeg",
        "image/jpg": "jpeg",
        "image/png": "png",
        "image/tiff": "tiff",
        "image/tif": "tiff",
        "image/webp": "webp",
    }
    if declared and declared in mime_map and mime_map[declared] != detected_type:
        raise ValueError(f"Attachment '{filename}' magic bytes ({detected_type}) do not match declared MIME '{declared}'")
    if declared == "application/pdf":
        raise ValueError(f"Attachment '{filename}' declared as PDF but lacks %PDF- header")

    with fitz.open(stream=raw_bytes, filetype=detected_type) as img_doc:
        pdf_bytes = img_doc.convert_to_pdf()
    if not pdf_bytes.startswith(b"%PDF-"):
        raise ValueError(f"Conversion of '{filename}' did not produce valid PDF bytes")
    return pdf_bytes, detected_type


def _val(v: Any, default: str = "") -> str:
    """Safely convert value to string without ever outputting 'None'."""
    if v is None:
        return default
    s = str(v).strip()
    return default if s.lower() == "none" else s


def validate_swiss_ahv(ahv: Any) -> bool:
    """
    Validate Swiss NAVS13 / AHV-13 number according to official EAN-13 algorithm.
    Format must begin with 756 and have 13 digits with valid checksum.
    """
    digits = re.sub(r"\D", "", str(ahv or ""))
    if len(digits) != 13 or not digits.startswith("756"):
        return False
    total = sum(int(d) * (1 if i % 2 == 0 else 3) for i, d in enumerate(digits[:12]))
    expected_check = (10 - (total % 10)) % 10
    return int(digits[12]) == expected_check


def _clean_ahv(ahv: Any) -> str:
    """Return 13-digit AHV number without dots or spaces."""
    if not ahv:
        return ""
    digits = re.sub(r"[^\d]", "", str(ahv))
    return digits if len(digits) == 13 else ""


def round_to_whole_franc(v: Any, default: Optional[int] = 0, strict: bool = False) -> int:
    """
    Swiss tax declaration standard (Art. 214 DBG / eCH-0119 moneyType1):
    Declared tax amounts in the official eCH-0119 manifest are restricted to xs:integer (whole CHF).
    Centimes are rounded half-up to the nearest integer Swiss franc using Decimal arithmetic
    to avoid binary floating-point representation errors (e.g. 2.4 -> 2, 2.5 -> 3, 3.5 -> 4, 52'590.10 -> 52590).

    Midpoint rounding:
      - 2.4 -> 2
      - 2.5 -> 3
      - 3.5 -> 4
      - 52,590.10 -> 52590
      - 0 -> 0
      - -2.4 -> -2
      - -2.5 -> -3
      - -3.5 -> -4

    If strict=True and v is None, empty string, or invalid numeric, raises ValueError.
    If strict=False, returns `default` on invalid/missing input.
    """
    if v is None:
        if strict or default is None:
            raise ValueError("Input value cannot be None for whole-franc rounding.")
        return default

    if isinstance(v, Decimal):
        d = v
    elif isinstance(v, int):
        return v
    elif isinstance(v, float):
        d = Decimal(str(v))
    elif isinstance(v, str):
        cleaned = v.strip().replace("'", "").replace(" ", "")
        if not cleaned:
            if strict or default is None:
                raise ValueError("Empty string input for whole-franc rounding.")
            return default
        # Handle mixed thousands and decimal separators
        if "," in cleaned and "." in cleaned:
            if cleaned.rfind(".") > cleaned.rfind(","):
                # e.g. 52,590.10 (Anglo-Saxon: comma is thousands, dot is decimal)
                cleaned = cleaned.replace(",", "")
            else:
                # e.g. 52.590,10 (Continental European: dot is thousands, comma is decimal)
                cleaned = cleaned.replace(".", "").replace(",", ".")
        elif "," in cleaned:
            cleaned = cleaned.replace(",", ".")
        try:
            d = Decimal(cleaned)
        except InvalidOperation:
            if strict or default is None:
                raise ValueError(f"Invalid numeric string input for whole-franc rounding: {v!r}")
            return default
    else:
        if strict or default is None:
            raise ValueError(f"Unsupported input type for whole-franc rounding: {type(v).__name__}")
        return default

    # Quantize to whole franc with ROUND_HALF_UP (half rounded away from zero)
    return int(d.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _num(v: Any) -> int:
    """Format numeric values as whole Swiss francs (rounded half-up)."""
    return round_to_whole_franc(v)


def _num2(v: Any) -> str:
    """Format numeric values with 2 decimals (e.g. for Verrechnungssteuer)."""
    try:
        val = float(v or 0)
        return f"{val:.2f}"
    except (TypeError, ValueError):
        return "0.00"


def _parse_civil_status_code(status_str: Any) -> str:
    """
    Map civil status to official eCH-0011 codes:
    1 = ledig / single
    2 = verheiratet / married
    3 = verwitwet / widowed
    4 = geschieden / divorced
    5 = eingetragene Partnerschaft / registered partnership
    6 = aufgelöste Partnerschaft / dissolved partnership
    """
    s = str(status_str or "").lower()
    if "verh" in s or "marr" in s:
        return "2"
    if "gesch" in s or "divorc" in s:
        return "4"
    if "verw" in s or "widow" in s:
        return "3"
    if "partner" in s or "eingetr" in s:
        return "5"
    return "1"


def _parse_sex_code(sex_str: Any) -> str:
    """1 = male, 2 = female."""
    s = str(sex_str or "").lower()
    if s in ("2", "f", "female", "w", "weiblich", "frau"):
        return "2"
    return "1"


def _parse_religion_code(konf: Any) -> str:
    """
    Official Swiss tax religion codes:
    111 = Evangelisch-reformiert
    121 = Römisch-katholisch
    122 = Christkatholisch
    200 = Keine / Andere
    """
    s = str(konf or "").strip().lower()
    if s in ("111", "121", "122", "200"):
        return s
    if "christ" in s:
        return "122"
    if "röm" in s or "roem" in s or "kath" in s:
        return "121"
    if "ref" in s or "evang" in s:
        return "111"
    return "200"


class OfflineLocalUrlHandler(urllib.request.BaseHandler):
    """
    Security interceptor enforcing zero-network offline XSD resolution.
    Maps authoritative eCH HTTP namespace URLs to authentic local files.
    Blocks any unexpected or remote HTTP/HTTPS connections.
    """

    def __init__(self, url_map: Dict[str, Path]):
        self.url_map = url_map

    def default_open(self, req):
        url = req.full_url
        if url in self.url_map:
            p = self.url_map[url]
            if not p.is_file():
                raise FileNotFoundError(f"Offline schema dependency missing: {p}")
            data = p.read_bytes()
            msg = email.message.Message()
            msg["Content-Type"] = "application/xml"
            msg["Content-Length"] = str(len(data))
            resp = urllib.response.addinfourl(io.BytesIO(data), msg, url, code=200)
            resp.msg = "OK"
            return resp
        if url.startswith("http://") or url.startswith("https://"):
            raise RuntimeError(f"Offline security policy: Remote HTTP network fetch blocked for {url}")
        return None


class Ech0119ExportService:
    """Dedicated exporter and validator for official Swiss eCH-0119 v4.0.0 tax files."""

    def __init__(self, schemas_dir: Optional[Path] = None):
        self.schemas_dir = schemas_dir or SCHEMAS_DIR
        self._schema_validator = None
        # Lazy initialization on first validate_xml call to prevent blocking server import

    def _init_validator(self) -> None:
        """Initialize xmlschema validator using authentic local schema files in offline mode."""
        main_xsd = self.schemas_dir / "eCH-0119-4-0-0.xsd"
        official_dir = self.schemas_dir / "official"
        if not main_xsd.is_file():
            logger.error("eCH-0119 main schema file missing at %s", main_xsd)
            return

        url_map = {
            "http://www.ech.ch/xmlns/eCH-0006/2/eCH-0006-2-0.xsd": official_dir / "eCH-0006-2-0.xsd",
            "http://www.ech.ch/xmlns/eCH-0007-f/5/eCH-0007-5-0f.xsd": official_dir / "eCH-0007-5-0f.xsd",
            "http://www.ech.ch/xmlns/eCH-0007/5/eCH-0007-5-0.xsd": official_dir / "eCH-0007-5-0.xsd",
            "http://www.ech.ch/xmlns/eCH-0135/1/eCH-0007-5-0.xsd": official_dir / "eCH-0007-5-0.xsd",
            "http://www.ech.ch/xmlns/eCH-0008-f/3/eCH-0008-3-0f.xsd": official_dir / "eCH-0008-3-0f.xsd",
            "http://www.ech.ch/xmlns/eCH-0010-f/5/eCH-0010-5-1f.xsd": official_dir / "eCH-0010-5-1f.xsd",
            "http://www.ech.ch/xmlns/eCH-0044-f/4/eCH-0044-4-1f.xsd": official_dir / "eCH-0044-4-1f.xsd",
            "http://www.ech.ch/xmlns/eCH-0135/1/eCH-0135-1-0.xsd": official_dir / "eCH-0135-1-0.xsd",
        }

        # Check required schema dependencies exist
        for u, path in url_map.items():
            if not path.is_file():
                logger.error("Required official eCH dependency missing: %s (%s)", path, u)
                return

        try:
            import xmlschema
            def map_schema_uri(uri: str) -> str:
                if uri in url_map:
                    return url_map[uri].resolve().as_uri()
                return uri

            self._schema_validator = xmlschema.XMLSchema(
                str(main_xsd), uri_mapper=map_schema_uri, allow="local",
                defuse="always", use_fallback=False,
            )
            logger.info("Official eCH-0119 v4.0.0 XMLSchema validator successfully initialized (offline mode).")
        except Exception as e:
            logger.error("Failed to compile eCH-0119 XMLSchema: %s", e)
            self._schema_validator = None

    def validate_xml(self, xml_content: str) -> Tuple[bool, List[str]]:
        """
        Validate generated XML content against official eCH-0119 v4 XSD schemas.
        Returns (is_valid, list_of_error_strings).
        """
        if not self._schema_validator:
            self._init_validator()
        if not self._schema_validator:
            return False, ["eCH-0119 XMLSchema validator not available or dependencies missing"]

        errors: List[str] = []
        try:
            for err in self._schema_validator.iter_errors(xml_content):
                errors.append(f"{err.path}: {err.message}")
        except Exception as exc:
            errors.append(f"Validation exception: {str(exc)}")

        return (len(errors) == 0, errors)

    def generate_ech0119_xml(
        self,
        tax_return: Any,
        profile: Any,
        calculation: Any,
        attachments: Optional[List[Dict[str, Any]]] = None,
    ) -> str:
        """
        Generate official, validated Swiss eCH-0119 V4.0.0 XML.
        Strictly computes cantonal and federal figures as matching pairs.
        """
        if calculation is None:
            raise ValueError(
                "Tax calculation snapshot is required before generating eCH-0119 XML filing data. "
                "Please calculate the tax return first."
            )

        calc_time = getattr(calculation, "calculated_at", None)
        profile_time = getattr(profile, "updated_at", None)
        if calc_time and profile_time:
            ct = calc_time.replace(tzinfo=None) if getattr(calc_time, "tzinfo", None) else calc_time
            pt = profile_time.replace(tzinfo=None) if getattr(profile_time, "tzinfo", None) else profile_time
            if ct < (pt - timedelta(seconds=2)):
                raise ValueError(
                    "Tax calculation snapshot is outdated relative to recent profile updates. "
                    "Please recalculate before exporting XML filing data."
                )

        pd = getattr(profile, "personal_data", {}) or {}
        inc = getattr(profile, "income_data", {}) or getattr(profile, "income", {}) or {}
        wealth = getattr(profile, "wealth_data", {}) or getattr(profile, "wealth", {}) or {}
        ded = getattr(profile, "deductions_data", {}) or getattr(profile, "deductions", {}) or {}
        liab = getattr(profile, "liabilities_data", {}) or getattr(profile, "liabilities", {}) or {}

        # Calculation results
        inputs = getattr(calculation, "inputs", {}) or {}
        results = getattr(calculation, "results", {}) or {}
        details = getattr(calculation, "calculation_details", {}) or {}
        if isinstance(details, str):
            try:
                import json
                details = json.loads(details)
            except Exception:
                details = {}

        brand_cfg = settings.get_brand_config()
        tx_prefix = brand_cfg["transaction_prefix"]
        canton_code = _val(getattr(tax_return, "canton_code", "ZH"), "ZH").upper()
        municipality_name = _val(getattr(tax_return, "municipality_name", "Zürich"), "Zürich")
        municipality_code = _val(getattr(tax_return, "municipality_code", "261"), "261")
        tax_year = int(getattr(tax_return, "tax_year", 2025) or 2025)
        tr_id = _val(getattr(tax_return, "id", f"{tx_prefix}01"))

        civil_status_code = _parse_civil_status_code(pd.get("civil_status") or pd.get("marital_status"))
        is_married = civil_status_code in ("2", "5")

        # Art. 113 DBG: Married or registered partners assessed jointly require complete spouse data
        if is_married:
            pd2_check = pd.get("partner2") or pd.get("spouse") or {}
            p2_first_check = str(pd2_check.get("first_name") or "").strip()
            p2_last_check = str(pd2_check.get("last_name") or "").strip()
            raw_ahv2_check = pd2_check.get("ahv_number") or pd2_check.get("vn")
            ahv2_clean = _clean_ahv(raw_ahv2_check) if raw_ahv2_check else ""
            if not p2_first_check or not p2_last_check:
                raise ValueError(
                    "Under Swiss tax law (Art. 113 DBG), joint tax returns for married taxpayers or registered partners "
                    "require complete spouse details (first name and official name). Please complete the spouse profile."
                )
            if not ahv2_clean or not validate_swiss_ahv(ahv2_clean):
                raise ValueError(
                    f"Under Swiss tax law (Art. 113 DBG), a valid Swiss AHV number (vn) is required for spouse/partner. "
                    f"Provided: '{raw_ahv2_check or ''}'."
                )

        now = datetime.now()
        transaction_date = now.strftime("%Y-%m-%dT%H:%M:%S+01:00")
        transaction_number = f"{tx_prefix}-{tax_year}-{tr_id[:8].upper()}"

        # ── XML ROOT & NAMESPACES ─────────────────────────────────────────────
        NS_MAIN = "http://www.ech.ch/xmlns/eCH-0119/4"
        NS_0044 = "http://www.ech.ch/xmlns/eCH-0044-f/4"
        NS_0046 = "http://www.ech.ch/xmlns/eCH-0046-f/5"
        NS_0010 = "http://www.ech.ch/xmlns/eCH-0010-f/7"
        NS_0011 = "http://www.ech.ch/xmlns/eCH-0011-f/8"
        NS_0007 = "http://www.ech.ch/xmlns/eCH-0007-f/6"

        ET.register_namespace("", NS_MAIN)
        ET.register_namespace("eCH-0044f", NS_0044)
        ET.register_namespace("eCH-0046f", NS_0046)
        ET.register_namespace("eCH-0010f", NS_0010)
        ET.register_namespace("eCH-0011f", NS_0011)
        ET.register_namespace("eCH-0007f", NS_0007)

        root = ET.Element(
            f"{{{NS_MAIN}}}message",
            attrib={"minorVersion": "0"},
        )

        def _sub(parent: ET.Element, tag: str, text: Any = None) -> ET.Element:
            el = ET.SubElement(parent, f"{{{NS_MAIN}}}{tag}")
            if text is not None:
                el.text = str(text)
            return el

        def _sub_ns(parent: ET.Element, ns: str, tag: str, text: Any = None) -> ET.Element:
            el = ET.SubElement(parent, f"{{{ns}}}{tag}")
            if text is not None:
                el.text = str(text)
            return el

        def _pair(parent: ET.Element, cantonal_val: Any, federal_val: Any) -> None:
            """Write mandatory cantonal and federal tax amount pair."""
            c_val = _num(cantonal_val)
            f_val = _num(federal_val)
            _sub(parent, "cantonalTax", c_val)
            _sub(parent, "federalTax", f_val)

        # ── 1. HEADER ─────────────────────────────────────────────────────────
        header = _sub(root, "header")

        # Attachments
        doc_list = attachments if attachments is not None else []
        seen_attachment_names: set = set()
        sort_order = 1
        for doc in doc_list:
            att = _sub(header, "attachment")
            file_el = _sub(att, "file")
            norm_filename, doc_format = normalize_attachment_for_ech(
                doc, sort_order=sort_order, seen_names=seen_attachment_names
            )
            _sub(file_el, "pathFileName", f"attachments/{norm_filename}")
            _sub(file_el, "internalSortOrder", sort_order)

            doc_type = getattr(doc, "document_type", None) or (doc.get("document_type") if isinstance(doc, dict) else "Beleg")
            doc_id_el = _sub(att, "documentIdentification")
            _sub(doc_id_el, "documentCanton", canton_code)
            _sub(doc_id_el, "documentType", doc_type)

            _sub(att, "title", norm_filename)
            _sub(att, "documentFormat", doc_format)
            sort_order += 1

        _sub(header, "transactionNumber", transaction_number)
        _sub(header, "transactionDate", transaction_date)
        _sub(header, "taxPeriod", str(tax_year))
        _sub(header, "periodFrom", f"{tax_year}-01-01")
        _sub(header, "periodTo", f"{tax_year}-12-31")
        _sub(header, "canton", canton_code)
        _sub(header, "source", "0")
        _sub(header, "sourceDescription", brand_cfg["source_description"])

        # ── 2. CONTENT ────────────────────────────────────────────────────────
        content = _sub(root, "content")
        main_form = _sub(content, "mainForm")

        # Page 1: Personal Data Partner 1
        p1 = _sub(main_form, "personDataPartner1")
        p1_id = _sub(p1, "partnerPersonIdentification")
        user_obj = getattr(tax_return, "__dict__", {}).get("user")
        user_name = (getattr(user_obj, "full_name", "") or "").strip() if user_obj else ""
        taxpayer_raw = (getattr(tax_return, "taxpayer_name", "") or "").strip() or user_name

        last_name = pd.get("last_name") or pd.get("official_name")
        first_name = pd.get("first_name")
        if not last_name or not first_name:
            full = pd.get("name") or taxpayer_raw
            if full and " " in full.strip():
                parts = full.strip().split(maxsplit=1)
                first_name = first_name or parts[0]
                last_name = last_name or parts[1]
            elif full:
                first_name = first_name or full.strip()
                last_name = last_name or full.strip()

        if not last_name or not first_name:
            raise ValueError(
                "Taxpayer officialName and firstName must be provided before generating eCH-0119 XML filing data. "
                "No fabricated default names are permitted."
            )

        _sub(p1_id, "officialName", str(last_name).strip())
        _sub(p1_id, "firstName", str(first_name).strip())
        _sub(p1_id, "sex", _parse_sex_code(pd.get("sex") or pd.get("gender")))

        dob = _val(pd.get("date_of_birth") or pd.get("birth_date") or "")
        if dob:
            if len(dob) == 10 and "." in dob:
                parts = dob.split(".")
                dob = f"{parts[2]}-{parts[1]}-{parts[0]}"
            dob_el = _sub(p1_id, "dateOfBirth")
            _sub_ns(dob_el, NS_0044, "yearMonthDay", dob)

        raw_ahv = pd.get("ahv_number") or pd.get("vn")
        if not raw_ahv and doc_list:
            for d in doc_list:
                dex = getattr(d, "extracted_data", None) or (d.get("extracted_data") if isinstance(d, dict) else None)
                if isinstance(dex, str):
                    try:
                        import json
                        dex = json.loads(dex)
                    except Exception:
                        dex = {}
                if isinstance(dex, dict) and dex.get("ahv_number"):
                    raw_ahv = dex.get("ahv_number")
                    break

        if not raw_ahv:
            raise ValueError(
                "Taxpayer AHV number (vn) is required under eCH-0119 before generating XML filing data. "
                "Please enter your AHV number in the profile."
            )

        ahv = _clean_ahv(raw_ahv)
        if not validate_swiss_ahv(ahv):
            raise ValueError(
                f"The provided AHV number '{raw_ahv}' fails Swiss NAVS13/EAN-13 checksum validation. "
                "Must be a 13-digit number beginning with 756."
            )
        _sub(p1_id, "vn", ahv)

        # Address
        town = _val(pd.get("address_city") or pd.get("city") or municipality_name or "")
        zip_code = _val(pd.get("address_zip") or pd.get("zip") or pd.get("plz") or pd.get("postal_code") or "")
        street = _val(pd.get("address_street") or pd.get("street") or "")
        house_no = _val(pd.get("house_number") or pd.get("address_number") or "")

        if town or zip_code or street:
            addr_info = _sub(p1, "addressInformation")
            postal_addr = _sub_ns(addr_info, NS_0046, "postalAddress")
            inner_addr = _sub_ns(postal_addr, NS_0010, "addressInformation")
            if street:
                _sub_ns(inner_addr, NS_0010, "street", street)
                if house_no:
                    _sub_ns(inner_addr, NS_0010, "houseNumber", house_no)
            if town:
                _sub_ns(inner_addr, NS_0010, "town", town)
            if zip_code:
                _sub_ns(inner_addr, NS_0010, "swissZipCode", zip_code)
            country_el = _sub_ns(inner_addr, NS_0010, "country")
            _sub_ns(country_el, NS_0010, "countryIdISO2", "CH")

        # Civil status
        marital_el = _sub(p1, "maritalStatusTax")
        _sub_ns(marital_el, NS_0011, "maritalStatus", civil_status_code)

        # Religion
        religion_code = _parse_religion_code(pd.get("religion") or pd.get("confession") or pd.get("church"))
        _sub(p1, "religion", religion_code)

        # Job & Employer (optional elements in eCH-0119)
        job_val = _val(pd.get("job") or pd.get("profession") or "")
        if job_val:
            _sub(p1, "job", job_val)

        employer_val = _val(pd.get("employer") or "")
        if employer_val:
            _sub(p1, "employer", employer_val)

        pow_val = _val(pd.get("place_of_work") or "")
        if pow_val:
            _sub(p1, "placeOfWork", pow_val)

        if "pk" in pd:
            _sub(p1, "paymentPension", "true" if pd.get("pk") else "false")

        # Tax municipality
        tax_muni = _sub(p1, "taxMunicipality")
        _sub_ns(tax_muni, NS_0007, "municipalityId", municipality_code)
        _sub_ns(tax_muni, NS_0007, "municipalityName", municipality_name)
        _sub_ns(tax_muni, NS_0007, "cantonAbbreviation", canton_code)

        # Person Data Partner 2 (if married and partner2 data actually provided)
        pd2 = pd.get("partner2") or pd.get("spouse") or {}
        if is_married and pd2 and (pd2.get("first_name") or pd2.get("last_name") or pd2.get("ahv_number")):
            p2 = _sub(main_form, "personDataPartner2")
            p2_id = _sub(p2, "personIdentification")
            raw_ahv2 = pd2.get("ahv_number") or pd2.get("vn")
            if raw_ahv2:
                ahv2 = _clean_ahv(raw_ahv2)
                if validate_swiss_ahv(ahv2):
                    _sub_ns(p2_id, NS_0044, "vn", ahv2)
            p2_last = _val(pd2.get("last_name") or last_name)
            p2_first = _val(pd2.get("first_name") or "")
            if p2_last:
                _sub_ns(p2_id, NS_0044, "officialName", p2_last)
            if p2_first:
                _sub_ns(p2_id, NS_0044, "firstName", p2_first)
            if pd2.get("sex"):
                _sub_ns(p2_id, NS_0044, "sex", _parse_sex_code(pd2.get("sex")))
            dob2 = _val(pd2.get("date_of_birth") or "")
            if dob2:
                if len(dob2) == 10 and "." in dob2:
                    parts = dob2.split(".")
                    dob2 = f"{parts[2]}-{parts[1]}-{parts[0]}"
                dob2_el = _sub_ns(p2_id, NS_0044, "dateOfBirth")
                _sub_ns(dob2_el, NS_0044, "yearMonthDay", dob2)

            p2_town = _val(pd2.get("address_city") or town)
            p2_zip = _val(pd2.get("address_zip") or zip_code)
            p2_street = _val(pd2.get("address_street") or street)
            p2_house = _val(pd2.get("house_number") or house_no)
            if p2_town or p2_zip or p2_street:
                addr_info2 = _sub(p2, "addressInformation")
                postal_addr2 = _sub_ns(addr_info2, NS_0046, "postalAddress")
                inner_addr2 = _sub_ns(postal_addr2, NS_0010, "addressInformation")
                if p2_street:
                    _sub_ns(inner_addr2, NS_0010, "street", p2_street)
                    if p2_house:
                        _sub_ns(inner_addr2, NS_0010, "houseNumber", p2_house)
                if p2_town:
                    _sub_ns(inner_addr2, NS_0010, "town", p2_town)
                if p2_zip:
                    _sub_ns(inner_addr2, NS_0010, "swissZipCode", p2_zip)
                country_el2 = _sub_ns(inner_addr2, NS_0010, "country")
                _sub_ns(country_el2, NS_0010, "countryIdISO2", "CH")

            marital_el2 = _sub(p2, "maritalStatusTax")
            _sub_ns(marital_el2, NS_0011, "maritalStatus", civil_status_code)
            if pd2.get("religion"):
                _sub(p2, "religion", _parse_religion_code(pd2.get("religion")))
            if pd2.get("job"):
                _sub(p2, "job", _val(pd2.get("job")))
            if pd2.get("employer"):
                _sub(p2, "employer", _val(pd2.get("employer")))
            if pd2.get("place_of_work"):
                _sub(p2, "placeOfWork", _val(pd2.get("place_of_work")))
            if "pk" in pd2:
                _sub(p2, "paymentPension", "true" if pd2.get("pk") else "false")

            tax_muni2 = _sub(p2, "taxMunicipality")
            _sub_ns(tax_muni2, NS_0007, "municipalityId", municipality_code)
            _sub_ns(tax_muni2, NS_0007, "municipalityName", municipality_name)
            _sub_ns(tax_muni2, NS_0007, "cantonAbbreviation", canton_code)

        # ── REVENUE (Page 2) ──────────────────────────────────────────────────
        revenue = _sub(main_form, "revenue")
        emp_rev = _sub(revenue, "employedMainRevenue")
        salary_p1 = _num(inc.get("employment_income") or inc.get("gross_salary") or inc.get("salary_p1") or inc.get("total_employment_income") or 0)
        _sub(emp_rev, "partner1Amount", salary_p1)
        if is_married:
            salary_p2 = _num(inc.get("salary_p2") or pd2.get("salary") or inc.get("employment_income_spouse") or 0)
            if salary_p2 > 0:
                _sub(emp_rev, "partner2Amount", salary_p2)
        else:
            salary_p2 = 0

        sec_income = _num(inc.get("securities_income") or inc.get("interest_dividends") or inc.get("dividend_income") or inc.get("dividends") or inc.get("interest_income") or wealth.get("total_gross_income") or 0)
        sec_rev = _sub(revenue, "securitiesRevenue")
        _pair(sec_rev, sec_income, sec_income)

        other_inc = _num(inc.get("alimony_received") or 0) + _num(inc.get("self_employment_income") or 0) + _num(inc.get("pension_income") or 0)
        tot_rev_c = salary_p1 + (salary_p2 if is_married else 0) + sec_income + other_inc
        tot_rev_f = tot_rev_c
        tot_rev = _sub(revenue, "totalAmountRevenue")
        _pair(tot_rev, tot_rev_c, tot_rev_f)

        # ── DEDUCTIONS (Page 3) ───────────────────────────────────────────────
        deduction = _sub(main_form, "deduction")

        # Extract approved deductions snapshot directly from calculation details
        ded_applied = details.get("deductions_applied") or {}
        if not isinstance(ded_applied, dict):
            ded_applied = getattr(ded_applied, "__dict__", {}) or {}

        canton_ded_list = details.get("canton_deductions_list")
        federal_ded_list = details.get("federal_deductions_list")
        if not isinstance(canton_ded_list, list) or not isinstance(federal_ded_list, list):
            raise ValueError("Calculation snapshot is missing cantonal or federal deduction lists. Please recalculate before export.")

        def _find_ded(d_list: list, *codes: str) -> Optional[int]:
            for item in d_list:
                if isinstance(item, dict):
                    c = str(item.get("code") or "")
                    if any(cd == c or cd in c for cd in codes):
                        return _num(item.get("amount", 0))
            return None

        # Validate both sides before emitting anything. An absent entry is distinct
        # from an explicit zero, even when the other side also happens to be zero.
        for name, codes, input_keys in (
            ("commuting", ("commute_total", "commute_car", "commute_bike", "commute"), ("commuting", "commuting_deduction", "travel_expenses")),
            ("meals", ("meal_deduction_canteen", "meal_deduction_full", "meals"), ("meals", "meal_deduction", "meal_expenses")),
            ("professional expenses", ("work_expenses_flat", "professional_expenses"), ("professional_expenses", "other_job_costs")),
            ("pillar 3a", ("pillar3a",), ("pillar3a", "pillar3a_p1", "pillar3a_contributions", "p3a")),
            ("insurance", ("health_insurance", "insurance"), ("health_insurance", "insurance_canton", "health_insurance_premiums")),
            ("donations", ("donations",), ("donations",)),
        ):
            cantonal = _find_ded(canton_ded_list, *codes)
            federal = _find_ded(federal_ded_list, *codes)
            if (cantonal is None) != (federal is None):
                raise ValueError(f"Calculation snapshot is missing a cantonal or federal {name} deduction; values cannot silently fall back. Please recalculate before export.")
            if cantonal is None and any(_num(source.get(k)) != 0 for source in (ded_applied, ded) for k in input_keys if source.get(k) is not None):
                raise ValueError(f"Calculation snapshot is missing {name} deductions for both tax levels. Please recalculate before export.")

        # 1. Commute
        commute_cost_c = _find_ded(canton_ded_list, "commute_total", "commute_car", "commute_bike", "commute")
        if commute_cost_c is None:
            commute_cost_c = 0

        commute_cost_f = _find_ded(federal_ded_list, "commute_total", "commute_car", "commute_bike", "commute")
        if commute_cost_f is None:
            if commute_cost_c > 0:
                raise ValueError(
                    "Calculation snapshot is missing explicit federal commuting deduction (DBG Art. 26). "
                    "Federal deductions cannot silently fall back to cantonal values. Please recalculate."
                )
            commute_cost_f = 0

        # 2. Meals
        meal_cost_c = _find_ded(canton_ded_list, "meal_deduction_canteen", "meal_deduction_full", "meals")
        if meal_cost_c is None:
            meal_cost_c = 0

        meal_cost_f = _find_ded(federal_ded_list, "meal_deduction_canteen", "meal_deduction_full", "meals")
        if meal_cost_f is None:
            if meal_cost_c > 0:
                raise ValueError(
                    "Calculation snapshot is missing explicit federal meal deduction. "
                    "Federal deductions cannot silently fall back to cantonal values. Please recalculate."
                )
            meal_cost_f = 0

        # 3. Professional expenses (no calculation formulas or silent fallbacks in exporter)
        other_job_costs_c = _find_ded(canton_ded_list, "work_expenses_flat", "professional_expenses")
        if other_job_costs_c is None:
            other_job_costs_c = 0

        other_job_costs_f = _find_ded(federal_ded_list, "work_expenses_flat", "professional_expenses")
        if other_job_costs_f is None:
            if other_job_costs_c > 0:
                raise ValueError(
                    "Calculation snapshot is missing explicit federal professional expenses deduction (DBG Art. 26). "
                    "Federal deductions cannot silently fall back to cantonal values. Please recalculate."
                )
            other_job_costs_f = 0

        job_expenses_c = commute_cost_c + meal_cost_c + other_job_costs_c
        job_expenses_f = commute_cost_f + meal_cost_f + other_job_costs_f

        if job_expenses_c > 0 or job_expenses_f > 0:
            job_exp_p1 = _sub(deduction, "jobExpensesPartner1")
            _pair(job_exp_p1, job_expenses_c, job_expenses_f)

        # Pillar 3a partner 1
        p3a_p1_c = _find_ded(canton_ded_list, "pillar3a")
        if p3a_p1_c is None:
            p3a_p1_c = 0
        p3a_p1_f = _find_ded(federal_ded_list, "pillar3a")
        if p3a_p1_f is None:
            if p3a_p1_c > 0:
                raise ValueError(
                    "Calculation snapshot is missing explicit federal Pillar 3a deduction. "
                    "Please recalculate before export."
                )
            p3a_p1_f = 0

        if p3a_p1_c > 0 or p3a_p1_f > 0:
            p3a_el = _sub(deduction, "provision3aPartner1Deduction")
            _pair(p3a_el, p3a_p1_c, p3a_p1_f)

        # Insurance premiums & bank interest
        ins_c = _find_ded(canton_ded_list, "health_insurance", "insurance")
        if ins_c is None:
            ins_c = 0

        ins_f = _find_ded(federal_ded_list, "health_insurance", "insurance")
        if ins_f is None:
            if ins_c > 0:
                raise ValueError(
                    "Calculation snapshot is missing explicit federal health insurance deduction. "
                    "Federal health insurance limits differ from cantonal limits and cannot silently fall back. Please recalculate."
                )
            ins_f = 0

        if ins_c > 0 or ins_f > 0:
            ins_el = _sub(deduction, "insuranceAndInterest")
            _pair(ins_el, ins_c, ins_f)

        donations_c = _find_ded(canton_ded_list, "donations")
        if donations_c is None:
            donations_c = 0

        donations_f = _find_ded(federal_ded_list, "donations")
        if donations_f is None:
            if donations_c > 0:
                raise ValueError(
                    "Calculation snapshot is missing explicit federal donations deduction (DBG Art. 33a). "
                    "Federal deductions cannot silently fall back to cantonal values. Please recalculate."
                )
            donations_f = 0

        # Totals
        tot_ded_c = _num(details.get("canton_deductions_total")) if details.get("canton_deductions_total") is not None else (job_expenses_c + p3a_p1_c + ins_c + donations_c)
        tot_ded_f = _num(details.get("federal_deductions_total")) if details.get("federal_deductions_total") is not None else (job_expenses_f + p3a_p1_f + ins_f + donations_f)
        tot_ded = _sub(deduction, "totalAmountDeduction")
        _pair(tot_ded, tot_ded_c, tot_ded_f)

        if p3a_p1_c > 0:
            _sub(deduction, "provision3aPartner1Effective", p3a_p1_c)

        # ── REVENUE CALCULATION (Page 3) ──────────────────────────────────────
        rev_calc = _sub(main_form, "revenueCalculation")
        r_tot = _sub(rev_calc, "totalAmountRevenue")
        _pair(r_tot, tot_rev_c, tot_rev_f)

        d_tot = _sub(rev_calc, "totalAmountDeduction")
        _pair(d_tot, tot_ded_c, tot_ded_f)

        calc_taxable_c = _num(
            getattr(calculation, "taxable_income", None)
            or details.get("cantonal_taxable_income")
            or details.get("taxable_income")
            or results.get("cantonal_taxable_income")
            or results.get("taxable_income")
        )
        calc_taxable_f = _num(
            getattr(calculation, "federal_taxable_income", None)
            or details.get("federal_taxable_income")
            or results.get("federal_taxable_income")
        )
        # Net income (Reineinkommen) is gross revenue minus allowable deductions
        net_c = calc_taxable_c if calc_taxable_c > 0 else max(0, tot_rev_c - tot_ded_c)
        if calc_taxable_f > 0:
            net_f = calc_taxable_f
        elif tot_ded_f != tot_ded_c or tot_rev_f != tot_rev_c:
            net_f = max(0, tot_rev_f - tot_ded_f)
        else:
            net_f = net_c
        net_c = max(0, net_c)
        net_f = max(0, net_f)

        net_el = _sub(rev_calc, "netIncome")
        _pair(net_el, net_c, net_f)

        adj_el = _sub(rev_calc, "adjustedNetIncome")
        _pair(adj_el, net_c, net_f)

        fisc_rev = _sub(rev_calc, "totalAmountFiscalRevenue")
        _pair(fisc_rev, net_c, net_f)

        # ── ASSETS (Page 4) ───────────────────────────────────────────────────
        asset = _sub(main_form, "asset")
        bank_accounts_list = wealth.get("bank_accounts") or []
        securities_positions_list = wealth.get("securities_positions") or wealth.get("securities") or []
        calc_wealth_sum = sum(
            float(a.get("balance") or a.get("balance_chf") or 0) for a in bank_accounts_list if isinstance(a, dict)
        ) + sum(
            float(s.get("total_value_chf") or s.get("value") or 0) for s in securities_positions_list if isinstance(s, dict)
        )
        gross_wealth_val = _num(calc_wealth_sum or wealth.get("total_wealth") or wealth.get("bank_balance") or 0)

        # Liabilities / Debts
        liab_data = liab if isinstance(liab, dict) else (getattr(liab, "__dict__", {}) or {})
        debts_val = _num(
            (liab_data.get("total_debt") if isinstance(liab_data, dict) else None)
            or (liab_data.get("total") if isinstance(liab_data, dict) else None)
            or (liab_data.get("debt") if isinstance(liab_data, dict) else None)
            or (wealth.get("debts") if isinstance(wealth, dict) else None)
            or (wealth.get("total_debts") if isinstance(wealth, dict) else None)
            or 0
        )
        reinvermoegen = max(0, gross_wealth_val - debts_val)

        movable = _sub(asset, "movablePropertySecuritiesAndAssets")
        _sub(movable, "fiscalValue", gross_wealth_val)

        tot_assets = _sub(asset, "totalAmountAssets")
        _sub(tot_assets, "fiscalValue", gross_wealth_val)

        if debts_val > 0:
            tot_liab = _sub(asset, "totalAmountLiabilities")
            _sub(tot_liab, "fiscalValue", debts_val)

        tot_fisc_assets = _sub(asset, "totalAmountFiscalAssets")
        _sub(tot_fisc_assets, "fiscalValue", reinvermoegen)

        # ── ANNEX: LIST OF SECURITIES & WITHHOLDING TAX REFUND (eCH-0196) ─────
        if bank_accounts_list or securities_positions_list or sec_income > 0:
            sec_list = _sub(content, "listOfSecurities")
            first_acc = bank_accounts_list[0] if bank_accounts_list else {}
            iban = _val(first_acc.get("iban") or wealth.get("iban") or "")
            bank_name = _val(first_acc.get("bank_name") or wealth.get("bank_name") or "")
            if iban or bank_name:
                bank_acc = _sub(sec_list, "bankAccount")
                if iban and iban != "–":
                    _sub(bank_acc, "ibanNumber", re.sub(r"\s+", "", iban))
                if bank_name:
                    _sub(bank_acc, "bankName", bank_name)
                _sub(bank_acc, "accountOwner", f"{first_name} {last_name}".strip())

            if securities_positions_list:
                for sp in securities_positions_list:
                    sec_entry = _sub(sec_list, "securityEntry")
                    _sub(sec_entry, "originalCurrency", _val(sp.get("currency") or "CHF"))
                    desc = f"{sp.get('name', 'Wertschrift')} {sp.get('isin', '')} (eCH-0196)".strip()
                    _sub(sec_entry, "detailedDescription", desc)
                    _sub(sec_entry, "countryOfDepositaryBank", "CH")
                    pos_val = _num(sp.get("total_value_chf") or sp.get("value") or 0)
                    tax_val_el = _sub(sec_entry, "taxValueEndOfYear")
                    _pair(tax_val_el, pos_val, pos_val)
                    pos_inc = _num(sp.get("income_chf") or sp.get("dividend") or 0)
                    gross_rev_a = _sub(sec_entry, "grossRevenueA")
                    _pair(gross_rev_a, pos_inc, pos_inc)
            elif bank_accounts_list:
                sec_entry = _sub(sec_list, "securityEntry")
                _sub(sec_entry, "originalCurrency", "CHF")
                desc = f"Bankkonto {bank_name}".strip()
                if iban and iban != "–":
                    desc += f" {iban}"
                _sub(sec_entry, "detailedDescription", f"{desc} (eCH-0196)".strip())
                _sub(sec_entry, "countryOfDepositaryBank", "CH")
                tax_val_el = _sub(sec_entry, "taxValueEndOfYear")
                _pair(tax_val_el, gross_wealth_val, gross_wealth_val)
                gross_rev_a = _sub(sec_entry, "grossRevenueA")
                _pair(gross_rev_a, sec_income, sec_income)

            tot_tax_val = _sub(sec_list, "totalTaxValue")
            _pair(tot_tax_val, gross_wealth_val, gross_wealth_val)

            sub_gross_a1 = _sub(sec_list, "subtotalGrossRevenueA1")
            _pair(sub_gross_a1, sec_income, sec_income)

            tot_gross_rev = _sub(sec_list, "totalGrossRevenue")
            _pair(tot_gross_rev, sec_income, sec_income)

            withholding_tax = Decimal(str(sec_income)) * Decimal("0.35")
            _sub(sec_list, "withholdingTax", f"{withholding_tax:.2f}")

        # ── ANNEX: JOB EXPENSES FORM ──────────────────────────────────────────
        if job_expenses_c > 0 or job_expenses_f > 0:
            job_expenses_annex = _sub(content, "jobExpenses")
            job_exp_p1_annex = _sub(job_expenses_annex, "jobExpensePartner1")
            if commute_cost_c > 0 or commute_cost_f > 0:
                commute_el = _sub(job_exp_p1_annex, "ticketCostPublicTransport")
                _pair(commute_el, commute_cost_c, commute_cost_f)

            if meal_cost_c > 0 or meal_cost_f > 0:
                meal_el = _sub(job_exp_p1_annex, "cateringNonSubsidized")
                _pair(meal_el, meal_cost_c, meal_cost_f)

            if other_job_costs_c > 0 or other_job_costs_f > 0:
                other_el = _sub(job_exp_p1_annex, "remainingJobCostFlatrate")
                _pair(other_el, other_job_costs_c, other_job_costs_f)

            tot_job_el = _sub(job_exp_p1_annex, "totalAmountJobExpenses")
            _pair(tot_job_el, job_expenses_c, job_expenses_f)

            # Never fabricate address. Only output if place of work is actually provided.
            if pow_val:
                _sub(job_exp_p1_annex, "placeOfWorkAddress", pow_val)

        # ── ANNEX: INSURANCE PREMIUMS FORM ────────────────────────────────────
        if ins_c > 0 or ins_f > 0:
            ins_annex = _sub(content, "insurancePremiums")
            single_ins = _sub(ins_annex, "deductionInsuranceAndInterestSingle" if not is_married else "deductionInsuranceAndInterestMarried")
            _pair(single_ins, ins_c, ins_f)

            final_ins = _sub(ins_annex, "finalDeduction")
            _pair(final_ins, ins_c, ins_f)

            # Never represent a capped deduction as actual premium if unknown (Client Compliance Rule)
            raw_paid = (
                ded.get("health_insurance_actual")
                or ded.get("health_insurance_premium_paid")
                or ded.get("health_insurance_paid")
                or (inputs.get("health_insurance_premium_paid") if isinstance(inputs, dict) else None)
                or (inputs.get("health_insurance_actual") if isinstance(inputs, dict) else None)
                or getattr(calculation, "health_insurance_premium_paid", None)
            )
            if raw_paid is not None and _num(raw_paid) > 0:
                _sub(ins_annex, "privateHealthInsurance", _num(raw_paid))

            _sub(ins_annex, "interestSavings", sec_income)

        # Format and output UTF-8 XML string
        raw_xml = ET.tostring(root, encoding="utf-8")
        dom = xml.dom.minidom.parseString(raw_xml)
        pretty_xml = dom.toprettyxml(indent="  ", encoding="utf-8").decode("utf-8")

        # Strip extra blank lines minidom might introduce
        clean_lines = [line for line in pretty_xml.splitlines() if line.strip()]
        legal_comment = (
            "<!-- ESTV / Eidgenoessische Steuerverwaltung | "
            "Selbstdeklaration pursuant to Art. 110 DBG | "
            "DirectTaxpayerFiling | eCH-0196 Securities Standard Compatibility -->"
        )
        if len(clean_lines) > 1:
            clean_lines.insert(1, legal_comment)
        return "\n".join(clean_lines)


# Singleton instance
ech_export_service = Ech0119ExportService()


def generate_ech_xml(
    tax_return: Any,
    profile: Any,
    calculation: Any,
    attachments: Optional[List[Dict[str, Any]]] = None,
) -> str:
    """Public helper function for exporting eCH-0119 v4 XML."""
    return ech_export_service.generate_ech0119_xml(tax_return, profile, calculation, attachments)


def validate_ech_xml(xml_content: str) -> Tuple[bool, List[str]]:
    """Public helper function for validating XML against official eCH-0119 v4 XSD."""
    return ech_export_service.validate_xml(xml_content)
