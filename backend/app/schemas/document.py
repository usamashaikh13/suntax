"""
Pydantic v2 schemas for Document upload, retrieval, and updates.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DocumentResponse(BaseModel):
    """
    Document metadata returned to the client.

    Note: storage_key is intentionally excluded to avoid leaking internal paths.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    tax_return_id: Optional[UUID]
    original_filename: str
    mime_type: str
    file_size_bytes: int
    document_type: Optional[str]
    classification_confidence: Optional[float]
    processing_status: str
    extracted_data: Optional[Dict[str, Any]]
    extraction_confidence: Optional[Dict[str, Any]]
    is_duplicate_suspect: bool
    uploaded_at: datetime
    processed_at: Optional[datetime]


class DocumentUploadResponse(BaseModel):
    """Immediate response after a successful file upload enqueue."""

    id: UUID
    original_filename: str
    processing_status: str = "pending"
    message: str = "File uploaded and queued for processing"


class DocumentUpdateRequest(BaseModel):
    """Payload for PUT /documents/{id}."""

    document_type: Optional[str] = Field(
        None,
        max_length=64,
        examples=["salary_certificate"],
        description="Override the AI-classified document type",
    )
    tax_return_id: Optional[UUID] = Field(
        None,
        description="Associate this document with a specific tax return",
    )


class DocumentStatusResponse(BaseModel):
    """Lightweight status response for polling."""

    id: UUID
    processing_status: str
    document_type: Optional[str]
    classification_confidence: Optional[float]
    processed_at: Optional[datetime]
    is_duplicate_suspect: bool


class DocumentListResponse(BaseModel):
    """Paginated list of documents."""

    items: List[DocumentResponse]
    total: int
    page: int
    page_size: int


class PresignedUrlResponse(BaseModel):
    """Presigned download URL with expiry."""

    url: str
    expires_in_seconds: int = 600
