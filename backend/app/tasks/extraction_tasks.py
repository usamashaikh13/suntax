"""
Celery task workers for document OCR and extraction.
Delegates to the shared DocumentPipelineService for complete consistency across worker and non-worker environments.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Optional

from app.services.document_pipeline_service import document_pipeline_service
from app.tasks.celery_app import celery_app

import concurrent.futures

logger = logging.getLogger(__name__)


def _run_async(coro):
    """Safely execute an async coroutine from synchronous Celery worker or test environment."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(asyncio.run, coro).result()
    else:
        return asyncio.run(coro)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=10)
def process_document(self, document_id: str) -> None:
    """
    Celery task to run the unified OCR and extraction pipeline.
    Leaves the document in 'needs_review' on success or 'failed' on error.
    Retries on transient infrastructure exceptions with exponential backoff.
    """
    attempt = getattr(self.request, "retries", 0) + 1
    max_retries = self.max_retries or 3
    logger.info(
        "Celery process_document task started for document_id=%s (attempt %d/%d)",
        document_id,
        attempt,
        max_retries,
    )
    try:
        _run_async(document_pipeline_service.process_document_by_id(document_id, raise_on_failure=True))
        logger.info("Celery process_document task finished for document_id=%s", document_id)
    except Exception as exc:
        logger.exception("Celery process_document task failed for %s: %s", document_id, exc)
        current_retries = getattr(self.request, "retries", 0)
        if current_retries < max_retries:
            countdown = (2 ** current_retries) * 5
            raise self.retry(exc=exc, countdown=countdown)
        else:
            logger.error("Celery process_document exhausted %d retries for %s", max_retries, document_id)
            _run_async(
                document_pipeline_service.mark_document_failed_by_id(
                    document_id,
                    f"Processing failed after {max_retries} attempts: {str(exc)}",
                )
            )
            raise


@celery_app.task(bind=True, max_retries=3, default_retry_delay=10)
def extract_document_data(self, document_id: str) -> None:
    """Alias for backwards compatibility with legacy task chains."""
    process_document(document_id)


@celery_app.task(bind=True, max_retries=2, default_retry_delay=10)
def merge_document_into_profile(self, tax_return_id: str) -> None:
    """
    Unreviewed worker results are never automatically merged into the taxpayer profile.
    This task is retained for backwards compatibility but requires explicit user review.
    """
    logger.info(
        "merge_document_into_profile called for tax_return_id=%s. Automatic unreviewed merge is disabled to enforce human review.",
        tax_return_id,
    )
