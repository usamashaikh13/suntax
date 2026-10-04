"""
OCR and image processing service for SunTax.

Supports:
  - Digital PDFs via PyMuPDF (fitz)
  - Scanned and mixed PDFs with per-page rasterization and Tesseract OCR
  - Image formats: JPEG, PNG, WebP, multi-page TIFF, HEIC/HEIF (with decoder)
  - Pillow image enhancements: EXIF orientation correction, auto-contrast, grayscale
  - Safety limits: file size, page count, image resolution, password encryption, corrupted files
  - Multi-language OCR: German, French, Italian, and English
"""
from __future__ import annotations

import io
import logging
import os
import pathlib
import time
from dataclasses import dataclass, field
from typing import List, Optional

import fitz  # PyMuPDF
from PIL import Image, ImageEnhance, ImageOps, ImageSequence

from app.core.config import settings

logger = logging.getLogger(__name__)

# Enforce decompression bomb protection limit
Image.MAX_IMAGE_PIXELS = settings.OCR_MAX_IMAGE_PIXELS

# Register HEIC/HEIF support if pillow_heif is available
_HEIF_AVAILABLE = False
try:
    import pillow_heif
    pillow_heif.register_heif_opener()
    _HEIF_AVAILABLE = True
except Exception:
    _HEIF_AVAILABLE = False


# ── Exceptions ────────────────────────────────────────────────────────────────

class OcrError(Exception):
    """Base exception for OCR and document processing failures."""
    pass


class OcrSecurityError(OcrError):
    """Raised when a document is password-protected or encrypted."""
    pass


class OcrCorruptError(OcrError):
    """Raised when a file cannot be decoded or is corrupt."""
    pass


class OcrLimitError(OcrError):
    """Raised when page count or dimensions exceed safety limits."""
    pass


class OcrFormatError(OcrError):
    """Raised when a file format or decoder is unsupported."""
    pass


# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class PageOCRResult:
    page_number: int
    text: str
    is_scanned: bool = False
    confidence: float = 0.90
    raw_lines: List[str] = field(default_factory=list)


@dataclass
class DocumentOCRResult:
    full_text: str
    pages: List[PageOCRResult]
    page_count: int
    is_empty: bool
    ocr_engine: str
    warnings: List[str] = field(default_factory=list)


# ── OcrService ────────────────────────────────────────────────────────────────

class OcrService:
    """Enterprise-grade OCR extraction service."""

    def __init__(self) -> None:
        self._tessdata_dir = self._detect_tessdata_dir()
        self._available_languages = self._detect_languages()

    def _detect_tessdata_dir(self) -> Optional[str]:
        """Find the best available tessdata directory."""
        candidates = [
            settings.TESSDATA_DIR,
            os.environ.get("TESSDATA_PREFIX"),
            str(pathlib.Path(__file__).parent.parent.parent / "tessdata"),
            "/opt/homebrew/share/tessdata",
            "/usr/share/tesseract-ocr/4.00/tessdata",
            "/usr/share/tesseract-ocr/5/tessdata",
            "/usr/share/tessdata",
        ]
        for c in candidates:
            if c and os.path.isdir(c) and (os.path.exists(os.path.join(c, "eng.traineddata")) or os.path.exists(os.path.join(c, "deu.traineddata"))):
                return str(pathlib.Path(c).resolve())
        return None

    def _detect_languages(self) -> str:
        """Return available OCR language string (e.g. deu+fra+ita+eng)."""
        available = []
        target_langs = ["deu", "fra", "ita", "eng"]

        if self._tessdata_dir:
            for lang in target_langs:
                if os.path.exists(os.path.join(self._tessdata_dir, f"{lang}.traineddata")):
                    available.append(lang)

        if not available:
            # Fallback to standard pytesseract languages or default eng
            try:
                import pytesseract
                installed = pytesseract.get_languages(config="")
                for lang in target_langs:
                    if lang in installed:
                        available.append(lang)
            except Exception:
                pass

        if not available:
            available = ["eng"]

        return "+".join(available)

    def _get_tesseract_config(self) -> str:
        if self._tessdata_dir:
            return f'--tessdata-dir "{self._tessdata_dir}"'
        return ""

    def _run_tesseract(self, img: Image.Image, timeout: Optional[float] = None) -> str:
        """Run Tesseract on a PIL Image with configured languages and process timeout."""
        try:
            import pytesseract
            config = self._get_tesseract_config()
            text = pytesseract.image_to_string(
                img,
                lang=self._available_languages,
                config=config,
                timeout=timeout,
            )
            return text.strip()
        except RuntimeError as rt_exc:
            if "timeout" in str(rt_exc).lower():
                raise OcrLimitError(
                    f"OCR processing exceeded time limit of {settings.OCR_TIMEOUT_SECONDS} seconds."
                ) from rt_exc
            logger.warning("Pytesseract runtime error: %s", rt_exc)
            return ""
        except Exception as exc:
            logger.warning("Pytesseract execution failed: %s", exc)
            return ""

    def _detect_and_fix_orientation(self, img: Image.Image, timeout: Optional[float] = None) -> Image.Image:
        """
        Detect and correct 90, 180, or 270 degree rotation using Tesseract OSD.
        Tesseract OSD reports 'rotate' in clockwise degrees needed to make the image upright.
        Pillow rotates counter-clockwise for positive angles, so -rot_deg rotates clockwise.
        """
        try:
            import pytesseract
            config = self._get_tesseract_config()
            osd = pytesseract.image_to_osd(
                img,
                config=config,
                output_type=pytesseract.Output.DICT,
                timeout=timeout,
            )
            rot_deg = osd.get("rotate", 0)
            conf = float(osd.get("orientation_conf", 0.0))
            if rot_deg in (90, 180, 270) and conf >= 1.5:
                logger.info("Detected document rotation of %d degrees (confidence %.2f); correcting orientation", rot_deg, conf)
                # Rotate clockwise in Pillow via negative angle
                img = img.rotate(-rot_deg, expand=True)
        except RuntimeError as rt_exc:
            if "timeout" in str(rt_exc).lower():
                raise OcrLimitError(
                    f"OCR processing exceeded time limit of {settings.OCR_TIMEOUT_SECONDS} seconds."
                ) from rt_exc
        except Exception as exc:
            # OSD might raise TesseractError on low-text images or diagrams; keep current orientation
            logger.debug("Tesseract OSD orientation detection skipped or failed: %s", exc)
        return img

    def _deskew_image(self, img: Image.Image, max_angle: float = 8.0, step: float = 1.0) -> Image.Image:
        """
        Detect and correct slight skew (tilt) angles using fast projection profile analysis.
        """
        try:
            w, h = img.size
            if w < 50 or h < 50:
                return img

            # Fast thumbnail for profile analysis
            thumb = img.convert("L")
            thumb.thumbnail((256, 256))
            tw, th = thumb.size
            if th < 20 or tw < 20:
                return img

            bw = thumb.point(lambda p: 255 if p > 180 else 0)

            best_score = -1.0
            best_angle = 0.0

            angle = -max_angle
            while angle <= max_angle:
                rot = bw.rotate(angle, resample=Image.Resampling.NEAREST, fillcolor=255)
                data = rot.tobytes()
                # Fast C-implemented byte count per line
                row_sums = [tw - data[y * tw : (y + 1) * tw].count(255) for y in range(th)]

                mean_val = sum(row_sums) / th
                variance = sum((v - mean_val) ** 2 for v in row_sums) / th
                if variance > best_score:
                    best_score = variance
                    best_angle = angle
                angle += step

            if abs(best_angle) >= 0.5:
                logger.info("Detected skew angle of %.1f degrees; deskewing image", best_angle)
                img = img.rotate(best_angle, resample=Image.Resampling.BICUBIC, fillcolor="white", expand=False)
        except Exception as exc:
            logger.debug("Deskewing skipped or failed: %s", exc)
        return img

    def _preprocess_image(self, img: Image.Image, timeout: Optional[float] = None) -> Image.Image:
        """Preprocess PIL image: orientation, deskewing, contrast enhancement, grayscale."""
        # 1. Correct EXIF orientation
        try:
            img = ImageOps.exif_transpose(img)
        except Exception:
            pass

        # 2. Check dimensions and megapixels
        w, h = img.size
        if w * h > settings.OCR_MAX_IMAGE_PIXELS:
            raise OcrLimitError(
                f"Image size ({w}x{h} = {w*h} pixels) exceeds the maximum allowed limit of {settings.OCR_MAX_IMAGE_PIXELS} pixels."
            )

        # 3. Convert to RGB if palette/RGBA
        if img.mode not in ("L", "RGB"):
            img = img.convert("RGB")

        # 4. Correct 90/180/270 degree rotation if text is inverted or sideways
        img = self._detect_and_fix_orientation(img, timeout=timeout)

        # 5. Correct fine tilt/skew
        img = self._deskew_image(img)

        # 6. Enhance contrast for OCR readability
        gray = img.convert("L")
        gray = ImageOps.autocontrast(gray, cutoff=2)
        enhancer = ImageEnhance.Contrast(gray)
        enhanced = enhancer.enhance(1.4)
        return enhanced

    def extract_from_pdf(self, file_bytes: bytes) -> DocumentOCRResult:
        """
        Extract text from PDF using PyMuPDF.
        Detects scanned pages individually, renders them, and applies Tesseract.
        """
        try:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
        except Exception as exc:
            raise OcrCorruptError("The uploaded PDF file is corrupt or invalid.") from exc

        try:
            if doc.is_encrypted or doc.needs_pass:
                raise OcrSecurityError(
                    "Password-protected PDF files cannot be processed. Please upload an unlocked document."
                )

            page_count = len(doc)
            if page_count == 0:
                raise OcrCorruptError("The uploaded PDF file contains 0 pages.")

            if page_count > settings.OCR_MAX_PAGES:
                raise OcrLimitError(
                    f"Document contains {page_count} pages, which exceeds the maximum limit of {settings.OCR_MAX_PAGES} pages."
                )

            pages_result: List[PageOCRResult] = []
            has_scanned = False
            has_digital = False
            warnings: List[str] = []
            start_time = time.monotonic()

            for idx, page in enumerate(doc, start=1):
                elapsed = time.monotonic() - start_time
                if elapsed > settings.OCR_TIMEOUT_SECONDS:
                    raise OcrLimitError(
                        f"OCR processing exceeded time limit of {settings.OCR_TIMEOUT_SECONDS} seconds."
                    )
                remaining_timeout = max(0.5, float(settings.OCR_TIMEOUT_SECONDS) - elapsed)
                digital_text = page.get_text().strip()
                words = digital_text.split()

                # If text is rich (>= 40 chars and >= 8 words), consider it digital
                if len(digital_text) >= 40 and len(words) >= 8:
                    has_digital = True
                    lines = [ln.strip() for ln in digital_text.splitlines() if ln.strip()]
                    pages_result.append(
                        PageOCRResult(
                            page_number=idx,
                            text=digital_text,
                            is_scanned=False,
                            confidence=0.95,
                            raw_lines=lines,
                        )
                    )
                else:
                    # Sparse or image-based page: render to image and run Tesseract OCR
                    has_scanned = True
                    logger.info("Page %d of PDF appears scanned/sparse; rendering for Tesseract OCR", idx)
                    try:
                        # 300 DPI for high recognition accuracy
                        pix = page.get_pixmap(dpi=300)
                        page_img = Image.open(io.BytesIO(pix.tobytes("png")))
                        rem_prep = max(0.5, float(settings.OCR_TIMEOUT_SECONDS) - (time.monotonic() - start_time))
                        processed_img = self._preprocess_image(page_img, timeout=rem_prep)
                        rem_ocr = max(0.5, float(settings.OCR_TIMEOUT_SECONDS) - (time.monotonic() - start_time))
                        ocr_text = self._run_tesseract(processed_img, timeout=rem_ocr)
                        combined_text = (digital_text + "\n" + ocr_text).strip() if digital_text else ocr_text
                        lines = [ln.strip() for ln in combined_text.splitlines() if ln.strip()]
                        pages_result.append(
                            PageOCRResult(
                                page_number=idx,
                                text=combined_text,
                                is_scanned=True,
                                confidence=0.85,
                                raw_lines=lines,
                            )
                        )
                    except Exception as render_exc:
                        logger.warning("Failed to OCR scanned page %d: %s", idx, render_exc)
                        warnings.append(f"Page {idx} could not be rendered for OCR: {str(render_exc)}")
                        pages_result.append(
                            PageOCRResult(
                                page_number=idx,
                                text=digital_text,
                                is_scanned=True,
                                confidence=0.50,
                                raw_lines=[],
                            )
                        )

            engine = "pymupdf_hybrid" if (has_digital and has_scanned) else ("pymupdf_digital" if has_digital else "tesseract_ocr")

            full_text_parts = []
            for p in pages_result:
                if p.text:
                    full_text_parts.append(f"--- Page {p.page_number} ---\n{p.text}")

            full_text = "\n\n".join(full_text_parts).strip()
            is_empty = len(full_text.replace("\n", "").strip()) == 0

            if is_empty:
                warnings.append("Document appears blank or no readable text was detected.")

            return DocumentOCRResult(
                full_text=full_text,
                pages=pages_result,
                page_count=page_count,
                is_empty=is_empty,
                ocr_engine=engine,
                warnings=warnings,
            )
        finally:
            doc.close()

    def extract_from_image(self, file_bytes: bytes, mime_type: str = "image/jpeg") -> DocumentOCRResult:
        """
        Extract text from images (JPEG, PNG, WebP, multi-page TIFF, HEIC/HEIF).
        Handles multi-page TIFF frames and EXIF rotation.
        """
        # Validate HEIC/HEIF capability
        if mime_type.lower() in ("image/heic", "image/heif") and not _HEIF_AVAILABLE:
            raise OcrFormatError(
                "HEIC/HEIF decoding is not available in the current runtime environment. Please convert and upload as JPEG, PNG, or PDF."
            )

        try:
            img = Image.open(io.BytesIO(file_bytes))
        except Exception as exc:
            raise OcrCorruptError("The uploaded image file is corrupt or invalid.") from exc

        pages_result: List[PageOCRResult] = []
        warnings: List[str] = []

        try:
            # Handle multi-page images (such as multi-frame TIFF)
            frames = []
            for frame in ImageSequence.Iterator(img):
                frames.append(frame.copy())
            if not frames:
                frames = [img.copy()]

            if len(frames) > settings.OCR_MAX_PAGES:
                raise OcrLimitError(
                    f"Image contains {len(frames)} frames/pages, which exceeds the limit of {settings.OCR_MAX_PAGES}."
                )

            start_time = time.monotonic()
            for idx, frame in enumerate(frames, start=1):
                elapsed = time.monotonic() - start_time
                if elapsed > settings.OCR_TIMEOUT_SECONDS:
                    raise OcrLimitError(
                        f"OCR processing exceeded time limit of {settings.OCR_TIMEOUT_SECONDS} seconds."
                    )
                remaining_timeout = max(0.5, float(settings.OCR_TIMEOUT_SECONDS) - elapsed)
                processed_frame = self._preprocess_image(frame.copy(), timeout=remaining_timeout)
                text = self._run_tesseract(processed_frame, timeout=remaining_timeout)
                lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
                pages_result.append(
                    PageOCRResult(
                        page_number=idx,
                        text=text,
                        is_scanned=True,
                        confidence=0.88 if text else 0.0,
                        raw_lines=lines,
                    )
                )

            full_text_parts = []
            for p in pages_result:
                if p.text:
                    full_text_parts.append(f"--- Page {p.page_number} ---\n{p.text}" if len(pages_result) > 1 else p.text)

            full_text = "\n\n".join(full_text_parts).strip()
            is_empty = len(full_text.replace("\n", "").strip()) == 0
            if is_empty:
                warnings.append("No readable text detected in the uploaded image.")

            return DocumentOCRResult(
                full_text=full_text,
                pages=pages_result,
                page_count=len(pages_result),
                is_empty=is_empty,
                ocr_engine="tesseract_ocr",
                warnings=warnings,
            )
        finally:
            img.close()

    def process_file(self, file_bytes: bytes, mime_type: str, filename: str = "") -> DocumentOCRResult:
        """Single entry-point for extracting text and pages from any supported document."""
        if not file_bytes:
            raise OcrCorruptError(f"File '{filename}' is empty (0 bytes).")

        mime = mime_type.lower()
        if "pdf" in mime or filename.lower().endswith(".pdf"):
            return self.extract_from_pdf(file_bytes)

        return self.extract_from_image(file_bytes, mime_type=mime)


# Module singleton
ocr_service = OcrService()
