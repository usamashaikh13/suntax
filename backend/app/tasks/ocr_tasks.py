"""
ocr_tasks.py — shim that re-exports from extraction_tasks.
The OCR pipeline is integrated into the extraction chain in extraction_tasks.py.
"""
from app.tasks.extraction_tasks import process_document, extract_document_data  # noqa: F401

__all__ = ["process_document", "extract_document_data"]
