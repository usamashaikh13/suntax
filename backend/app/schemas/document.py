"""
Pydantic v2 schemas for Document upload, retrieval, review, and updates.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional, Union
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DocumentResponse(BaseModel):
    """
    Document metadata returned to the client.

    Note: storage_key is intentionally excluded to avoid leaking internal paths.
    """

    model_config = ConfigDict(from_attributes=True)

    id: Union[UUID, str]
    user_id: Union[UUID, str]
    tax_return_id: Optional[Union[UUID, str]] = None
    original_filename: str
    mime_type: str
    file_size_bytes: int
    document_type: Optional[str] = None
    classification_confidence: Optional[float] = None
    processing_status: str
    extracted_data: Optional[Dict[str, Any]] = None
    extraction_confidence: Optional[Dict[str, Any]] = None
    is_duplicate_suspect: bool = False
    uploaded_at: datetime
    processed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    provider: Optional[str] = None


class DocumentUploadResponse(BaseModel):
    """Immediate response after a successful file upload enqueue."""

    id: Union[UUID, str]
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
    tax_return_id: Optional[Union[UUID, str]] = Field(
        None,
        description="Associate this document with a specific tax return",
    )


class FieldReviewItem(BaseModel):
    """Review status for an individual extracted field."""

    field_name: str
    value: Any = None
    status: Literal["needs_review", "approved", "rejected", "edited"] = "needs_review"
    confidence: Optional[float] = None


class DocumentReviewRequest(BaseModel):
    """Payload for reviewing/approving extracted fields on a document."""

    document_type: Optional[str] = None
    fields: Optional[Dict[str, Any]] = None  # field_name -> value
    field_statuses: Optional[Dict[str, str]] = None  # field_name -> approved | rejected | edited
    apply_to_profile: bool = False


class DocumentStatusResponse(BaseModel):
    """Lightweight status response for polling."""

    id: Union[UUID, str]
    processing_status: str
    document_type: Optional[str] = None
    classification_confidence: Optional[float] = None
    processed_at: Optional[datetime] = None
    is_duplicate_suspect: bool = False
    error_message: Optional[str] = None
    provider: Optional[str] = None


class DocumentRetryResponse(BaseModel):
    """Response after initiating OCR retry on a document."""

    id: Union[UUID, str]
    processing_status: str
    message: str


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
