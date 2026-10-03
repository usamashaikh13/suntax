"""
Celery application factory for SunTax.

Uses Redis as both the broker and the result backend.
Configuration mirrors Django Celery best practices adapted for FastAPI.
"""

from __future__ import annotations

from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "suntax",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "app.tasks.ocr_tasks",
        "app.tasks.extraction_tasks",
        "app.tasks.merge_tasks",
    ],
)

celery_app.conf.update(
    # Serialisation
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    # Timezone
    timezone="Europe/Zurich",
    enable_utc=True,
    # Task behaviour
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    task_track_started=True,
    # Result backend
    result_expires=86400,  # 24 hours
    # Rate limiting & retry defaults
    task_default_retry_delay=30,  # seconds
    task_max_retries=3,
    broker_connection_retry_on_startup=False,
    broker_connection_max_retries=1,
    broker_connection_timeout=0.2,
    # Worker settings
    worker_prefetch_multiplier=1,  # One task at a time per worker slot (IO-bound)
    worker_max_tasks_per_child=100,  # Recycle workers to avoid memory leaks
    # Beat schedule (optional periodic tasks)
    beat_schedule={},
)

# Allow tasks to be called with apply_async / delay from any module
celery_app.autodiscover_tasks(
    packages=["app.tasks"],
    force=True,
)
