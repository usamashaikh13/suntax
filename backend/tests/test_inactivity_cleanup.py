"""
Tests for nDSG Two-Year Inactivity Retention & Hard-Deletion Service.
"""
import uuid
import pytest
from datetime import datetime, timezone, timedelta
from app.models.user import User
from app.models.tax_return import TaxReturn
from app.services.inactivity_service import inactivity_service


@pytest.mark.asyncio
async def test_inactivity_cleanup_warning_and_deletion(db_session):
    now = datetime.now(timezone.utc)

    # 1. Active user (last login 10 days ago) - should NOT be warned or deleted
    active_user = User(
        id=str(uuid.uuid4()),
        email=f"active_{uuid.uuid4().hex[:6]}@suntax.ch",
        hashed_password="mock_test_hash",
        last_login_at=now - timedelta(days=10),
        created_at=now - timedelta(days=20),
        is_active=True,
    )
    db_session.add(active_user)

    # 2. Inactive user (last login 710 days ago) - should receive WARNING
    warning_user = User(
        id=str(uuid.uuid4()),
        email=f"warning_{uuid.uuid4().hex[:6]}@suntax.ch",
        hashed_password="mock_test_hash",
        last_login_at=now - timedelta(days=710),
        created_at=now - timedelta(days=800),
        is_active=True,
    )
    db_session.add(warning_user)

    # 3. Very inactive user (last login 750 days ago) - should be HARD DELETED
    del_id = str(uuid.uuid4())
    deleted_user = User(
        id=del_id,
        email=f"deleted_{uuid.uuid4().hex[:6]}@suntax.ch",
        hashed_password="mock_test_hash",
        last_login_at=now - timedelta(days=750),
        created_at=now - timedelta(days=800),
        is_active=True,
    )
    db_session.add(deleted_user)
    await db_session.flush()

    # Add a tax return to deleted_user to verify cascade
    tr = TaxReturn(
        id=str(uuid.uuid4()),
        user_id=del_id,
        canton_code="ZH",
        tax_year=2025,
    )
    db_session.add(tr)
    await db_session.commit()

    # Execute cleanup
    report = await inactivity_service.scan_and_process_inactive_accounts(db_session, current_time=now)

    assert report["warnings_sent_count"] >= 1
    assert warning_user.email in report["warnings_sent_emails"]
    assert report["accounts_deleted_count"] >= 1
    assert deleted_user.email in report["accounts_deleted_emails"]

    # Verify state in DB
    from sqlalchemy import select
    res_active = await db_session.execute(select(User).where(User.id == str(active_user.id)))
    assert res_active.scalar_one_or_none() is not None

    res_warning = await db_session.execute(select(User).where(User.id == str(warning_user.id)))
    warned = res_warning.scalar_one_or_none()
    assert warned is not None
    assert warned.inactivity_warning_sent_at is not None

    res_deleted = await db_session.execute(select(User).where(User.id == del_id))
    assert res_deleted.scalar_one_or_none() is None
