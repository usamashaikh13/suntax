"""
Documents API router for SunTax.

Endpoints:
  POST   /documents/upload      – upload one or more documents
  GET    /documents             – list user's documents
  GET    /documents/{id}        – get document metadata
  GET    /documents/{id}/download – presigned URL
  GET    /documents/{id}/status – lightweight processing status
  PUT    /documents/{id}        – update document_type / tax_return_id
  DELETE /documents/{id}        – delete document
"""

from __future__ import annotations

import hashlib
import json
import logging
import mimetypes
import uuid as uuid_mod
from typing import List, Optional
from uuid import UUID

try:
    import magic as _magic_lib
    def detect_mime(data: bytes) -> str:
        return _magic_lib.from_buffer(data, mime=True)
except (ImportError, OSError):
    # libmagic is optional in local development. Inspect well-known magic bytes
    # rather than rejecting every otherwise valid upload as octet-stream.
    def detect_mime(data: bytes) -> str:  # type: ignore[misc]
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
        return "application/octet-stream"
from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db, set_rls_user_id
from app.core.security import get_current_user
from app.models.audit_log import AuditLog
from app.models.document import Document
from app.models.tax_return import TaxReturn
from app.models.user import User
from app.schemas.document import (
    DocumentListResponse,
    DocumentResponse,
    DocumentStatusResponse,
    DocumentUpdateRequest,
    DocumentUploadResponse,
    PresignedUrlResponse,
)
from app.services.storage_service import StorageService
from app.tasks.ocr_tasks import process_document

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Documents"])
storage = StorageService()


# ── Helpers ───────────────────────────────────────────────────────────────────


def _compute_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _validate_mime(content_type: str, file_bytes: bytes) -> str:
    """
    Double-check the MIME type using libmagic (magic bytes).

    Returns the detected MIME type.
    Raises HTTPException 415 if not in the allowed list.
    """
    detected = detect_mime(file_bytes[:4096])
    if detected not in settings.ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=(
                f"File type '{detected}' is not allowed. "
                f"Accepted types: {', '.join(settings.ALLOWED_MIME_TYPES)}"
            ),
        )
    return detected


# ── Upload ────────────────────────────────────────────────────────────────────


@router.post(
    "/documents/upload",
    response_model=List[DocumentUploadResponse],
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload one or more documents for processing",
)
async def upload_documents(
    files: List[UploadFile] = File(..., description="One or more files to upload"),
    tax_return_id: Optional[UUID] = Query(
        None, description="Associate uploaded files with a tax return"
    ),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[DocumentUploadResponse]:
    """
    Upload documents for OCR extraction and AI classification.

    - Validates MIME type via Content-Type header AND magic bytes.
    - Enforces per-file size limit (MAX_UPLOAD_SIZE_MB).
    - Computes SHA-256 hash and flags potential duplicates.
    - Stores file in MinIO under a user-scoped path.
    - Enqueues the async Celery processing pipeline.
    """
    await set_rls_user_id(db, current_user.id)

    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one file must be provided",
        )

    # Validate tax_return ownership if provided
    if tax_return_id:
        tr_result = await db.execute(
            select(TaxReturn).where(
                TaxReturn.id == str(tax_return_id),
                TaxReturn.user_id == current_user.id,
            )
        )
        if not tr_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tax return not found",
            )

    responses: List[DocumentUploadResponse] = []

    for file in files:
        file_bytes = await file.read()

        # Size check
        if len(file_bytes) > settings.max_upload_size_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=(
                    f"File '{file.filename}' exceeds the maximum allowed "
                    f"size of {settings.MAX_UPLOAD_SIZE_MB} MB"
                ),
            )

        if len(file_bytes) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File '{file.filename}' is empty",
            )

        # MIME validation (magic bytes)
        detected_mime = _validate_mime(file.content_type or "", file_bytes)

        # SHA-256 hash for duplicate detection
        sha256 = _compute_sha256(file_bytes)

        # Check for existing document with same hash belonging to this user
        dup_result = await db.execute(
            select(Document).where(
                Document.user_id == current_user.id,
                Document.sha256_hash == sha256,
            )
        )
        is_dup = dup_result.scalar_one_or_none() is not None

        # Build MinIO storage key: users/{user_id}/{doc_uuid}/{filename}
        doc_id = str(uuid_mod.uuid4())
        ext = mimetypes.guess_extension(detected_mime) or ""
        storage_key = (
            f"users/{current_user.id}/{doc_id}/{file.filename or f'document{ext}'}"
        )

        # Upload to MinIO
        await storage.upload_file(file_bytes, storage_key, detected_mime)

        # Persist document record
        document = Document(
            id=doc_id,
            user_id=current_user.id,
            tax_return_id=str(tax_return_id) if tax_return_id else None,
            original_filename=file.filename or f"document{ext}",
            storage_key=storage_key,
            mime_type=detected_mime,
            file_size_bytes=len(file_bytes),
            sha256_hash=sha256,
            is_duplicate_suspect=is_dup,
            processing_status="pending",
        )
        db.add(document)
        await db.flush()

        # Audit log
        db.add(
            AuditLog(
                user_id=current_user.id,
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

        # Enqueue Celery task (fire-and-forget). A local UI must still be able
        # to accept and list an upload when Redis/Celery is not running.
        queued = True
        try:
            process_document.delay(str(doc_id))
        except Exception:
            queued = False
            logger.exception(
                "Document %s was stored but could not be queued for background processing",
                doc_id,
            )

        logger.info(
            "Uploaded document id=%s user=%s size=%d dup=%s",
            doc_id,
            current_user.id,
            len(file_bytes),
            is_dup,
        )

        responses.append(
            DocumentUploadResponse(
                id=doc_id,
                original_filename=document.original_filename,
                processing_status="pending",
                message=(
                    "File uploaded and queued for processing"
                    if queued
                    else "File uploaded. Background processing is unavailable in this environment."
                )
                + (" (possible duplicate detected)" if is_dup else ""),
            )
        )

    return responses


# ── List ──────────────────────────────────────────────────────────────────────


@router.get(
    "/documents",
    response_model=DocumentListResponse,
    summary="List the current user's documents",
)
async def list_documents(
    tax_return_id: Optional[UUID] = Query(None),
    processing_status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentListResponse:
    await set_rls_user_id(db, current_user.id)

    base_q = select(Document).where(Document.user_id == current_user.id)
    if tax_return_id:
        base_q = base_q.where(Document.tax_return_id == tax_return_id)
    if processing_status:
        base_q = base_q.where(Document.processing_status == processing_status)

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
    summary="Get document metadata",
)
async def get_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentResponse:
    await set_rls_user_id(db, current_user.id)
    doc = await _get_owned_document(db, document_id, current_user.id)
    return DocumentResponse.model_validate(doc)


# ── Download presigned URL ─────────────────────────────────────────────────────


@router.get(
    "/documents/{document_id}/download",
    response_model=PresignedUrlResponse,
    summary="Get a presigned download URL (10-minute expiry)",
)
async def get_download_url(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PresignedUrlResponse:
    await set_rls_user_id(db, current_user.id)
    doc = await _get_owned_document(db, document_id, current_user.id)
    url = await storage.generate_presigned_url(doc.storage_key, expires_seconds=600)
    return PresignedUrlResponse(url=url, expires_in_seconds=600)


# ── Processing status (polling) ───────────────────────────────────────────────


@router.get(
    "/documents/{document_id}/status",
    response_model=DocumentStatusResponse,
    summary="Poll the processing status of a document",
)
async def get_document_status(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentStatusResponse:
    await set_rls_user_id(db, current_user.id)
    doc = await _get_owned_document(db, document_id, current_user.id)
    return DocumentStatusResponse(
        id=doc.id,
        processing_status=doc.processing_status,
        document_type=doc.document_type,
        classification_confidence=doc.classification_confidence,
        processed_at=doc.processed_at,
        is_duplicate_suspect=doc.is_duplicate_suspect,
    )


# ── Update ────────────────────────────────────────────────────────────────────


@router.put(
    "/documents/{document_id}",
    response_model=DocumentResponse,
    summary="Update document type or tax return association",
)
async def update_document(
    document_id: str,
    payload: DocumentUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentResponse:
    await set_rls_user_id(db, current_user.id)
    doc = await _get_owned_document(db, document_id, current_user.id)

    if payload.document_type is not None:
        doc.document_type = payload.document_type

    if payload.tax_return_id is not None:
        # Validate ownership of the target tax return
        tr_result = await db.execute(
            select(TaxReturn).where(
                TaxReturn.id == payload.tax_return_id,
                TaxReturn.user_id == current_user.id,
            )
        )
        if not tr_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tax return not found",
            )
        doc.tax_return_id = payload.tax_return_id

    db.add(doc)
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
    doc = await _get_owned_document(db, document_id, current_user.id)

    # Delete from MinIO
    await storage.delete_file(doc.storage_key)

    db.add(
        AuditLog(
            user_id=current_user.id,
            action="document.deleted",
            resource_type="document",
            resource_id=str(doc.id),
            metadata={"filename": doc.original_filename},
        )
    )
    await db.delete(doc)


# ── Private helpers ───────────────────────────────────────────────────────────


async def _get_owned_document(
    db: AsyncSession, document_id: str, user_id: UUID
) -> Document:
    result = await db.execute(
        select(Document).where(
            Document.id == str(document_id),
            Document.user_id == user_id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Document not found"
        )
    return doc
