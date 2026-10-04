"""
Regression and verification tests for SunTax Milestones 1-3 Audit Remediation.
Covers:
- M1-01: Refresh Token Revocation, Active Store & Atomic Rotation
- M1-02: Password 72-Byte Boundary & Truncation Collision Prevention
- M2-01: Multiple Identical Document Uploads (No 500 crash on 3+ uploads)
- M2-02: Partial Profile Updates Preserving Unrelated Data & Provenance
- M3-01: Stale Calculation Invalidation on Profile Edits & Blocked Confirmation
- M3-02: Finalized/Confirmed Return Restrictions (409 Conflict) & Reopen Flow
- Document Deletion: Retraction of Financial Contributions & Calculation Invalidation
"""
import io
import uuid
from unittest.mock import patch
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document
from app.models.tax_calculation import TaxCalculation
from app.models.tax_profile import TaxProfile
from app.models.tax_return import TaxReturn
from app.models.user import User


@pytest.mark.asyncio
async def test_m1_01_refresh_token_revocation_and_rotation(client: AsyncClient, test_user: User):
    """M1-01: Verify active token store, atomic rotation, and replay prevention."""
    # 1. Login
    login_resp = await client.post(
        "/api/v1/auth/login",
        json={"email": test_user.email, "password": "Test1234!"},
    )
    assert login_resp.status_code == 200
    tokens = login_resp.json()
    refresh_token_1 = tokens["refresh_token"]

    # 2. Refresh once -> returns new refresh token, revokes first
    refresh_resp_1 = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token_1},
    )
    assert refresh_resp_1.status_code == 200
    new_tokens = refresh_resp_1.json()
    refresh_token_2 = new_tokens["refresh_token"]
    assert refresh_token_2 != refresh_token_1

    # 3. Replay attack: reusing refresh_token_1 must be rejected with 401
    replay_resp = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token_1},
    )
    assert replay_resp.status_code == 401
    assert "revoked" in replay_resp.json()["detail"].lower() or "invalid" in replay_resp.json()["detail"].lower()

    # 4. Logout invalidates all refresh sessions
    access_token_2 = new_tokens["access_token"]
    logout_resp = await client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {access_token_2}"},
    )
    assert logout_resp.status_code == 200

    # 5. Refresh token 2 should now also be rejected
    after_logout_resp = await client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token_2},
    )
    assert after_logout_resp.status_code == 401


@pytest.mark.asyncio
async def test_m1_02_password_length_boundary(client: AsyncClient):
    """M1-02: Passwords > 72 bytes must be rejected at schema and security level."""
    long_password = "A" * 73
    reg_resp = await client.post(
        "/api/v1/auth/register",
        json={
            "email": f"longpw_{uuid.uuid4().hex[:6]}@suntax.ch",
            "password": long_password,
            "full_name": "Long Password User",
        },
    )
    assert reg_resp.status_code == 422


@pytest.mark.asyncio
async def test_m2_01_three_identical_uploads_succeed(auth_client: AsyncClient, test_user: User):
    """M2-01: Uploading an identical document 3 times must not trigger 500 MultipleResultsFound."""
    # Create tax return
    tr_resp = await auth_client.post(
        "/api/v1/tax-returns",
        json={
            "canton_code": "ZH",
            "municipality_code": "261",
            "municipality_name": "Zürich",
            "tax_year": 2025,
        },
    )
    assert tr_resp.status_code == 201
    tr_id = tr_resp.json()["id"]

    # Minimal dummy PDF content
    pdf_content = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"

    with patch("app.api.v1.documents.process_document.delay") as mock_delay:
        for i in range(3):
            upload_resp = await auth_client.post(
                "/api/v1/documents/upload",
                data={"tax_return_id": tr_id},
                files={"files": (f"test_dup_{i}.pdf", io.BytesIO(pdf_content), "application/pdf")},
            )
            assert upload_resp.status_code in (200, 202), f"Upload {i+1} failed: {upload_resp.text}"
            data = upload_resp.json()
            assert len(data) >= 1
            if i > 0:
                assert "duplicate" in data[0]["message"].lower()


@pytest.mark.asyncio
async def test_m2_02_partial_profile_update_preserves_data_and_provenance(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
):
    """M2-02: Updating only employment income preserves interest, dividends and _doc_contributions."""
    tr_id = str(uuid.uuid4())
    tr = TaxReturn(
        id=tr_id,
        user_id=str(test_user.id),
        canton_code="ZH",
        municipality_code="261",
        municipality_name="Zürich",
        tax_year=2025,
        status="draft",
    )
    profile = TaxProfile(
        id=str(uuid.uuid4()),
        tax_return_id=tr_id,
        income_data={
            "employment_income": 100000.0,
            "interest_income": 1500.0,
            "dividend_income": 2500.0,
            "_doc_contributions": {
                "doc-1": {"employment_income": 100000.0},
            },
        },
        wealth_data={
            "bank_accounts": [{"bank_name": "UBS", "balance_chf": 50000.0}],
        },
    )
    db_session.add_all([tr, profile])
    await db_session.commit()

    # Send partial update modifying only employment income
    update_resp = await auth_client.patch(
        f"/api/v1/tax-returns/{tr_id}/profile",
        json={"income_data": {"employment_income": 120000.0}},
    )
    assert update_resp.status_code == 200

    # Fetch profile and verify
    get_resp = await auth_client.get(f"/api/v1/tax-returns/{tr_id}/profile")
    assert get_resp.status_code == 200
    income = get_resp.json()["income_data"]

    assert income["employment_income"] == 120000.0
    assert income["interest_income"] == 1500.0
    assert income["dividend_income"] == 2500.0
    # Also verify in raw DB record that _doc_contributions remained untouched
    await db_session.refresh(profile)
    assert "_doc_contributions" in profile.income_data
    assert profile.income_data["_doc_contributions"]["doc-1"]["employment_income"] == 100000.0


@pytest.mark.asyncio
async def test_m3_01_stale_calculation_invalidation_and_confirm_block(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
):
    """M3-01: Profile edit marks calculation stale, and confirm rejects stale calculations."""
    tr_id = str(uuid.uuid4())
    tr = TaxReturn(
        id=tr_id,
        user_id=str(test_user.id),
        canton_code="ZH",
        municipality_code="261",
        tax_year=2025,
        status="draft",
    )
    profile = TaxProfile(
        id=str(uuid.uuid4()),
        tax_return_id=tr_id,
        income_data={"employment_income": 100000.0},
    )
    calc = TaxCalculation(
        id=str(uuid.uuid4()),
        tax_return_id=tr_id,
        status="completed",
        is_final=False,
        total_tax_due=15000.0,
        federal_income_tax=3000.0,
        cantonal_income_tax=7000.0,
        municipal_income_tax=5000.0,
    )
    db_session.add_all([tr, profile, calc])
    await db_session.commit()

    # Edit profile
    patch_resp = await auth_client.patch(
        f"/api/v1/tax-returns/{tr_id}/profile",
        json={"income_data": {"employment_income": 110000.0}},
    )
    assert patch_resp.status_code == 200

    # Verify calculation is marked stale
    await db_session.refresh(calc)
    assert calc.status == "stale"

    # Attempt to confirm return -> must fail with 400 because calculation is stale
    confirm_resp = await auth_client.post(
        f"/api/v1/tax-returns/{tr_id}/confirm",
        json={"confirmation_text": "I hereby confirm that all information provided in this tax return is true, complete, and accurate to the best of my knowledge."},
    )
    assert confirm_resp.status_code == 400
    assert "stale" in confirm_resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_m3_02_confirmed_return_blocks_modification_and_allows_reopen(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
):
    """M3-02: Confirmed return cannot be edited (409 Conflict) and can be reopened to draft."""
    tr_id = str(uuid.uuid4())
    tr = TaxReturn(
        id=tr_id,
        user_id=str(test_user.id),
        canton_code="ZH",
        municipality_code="261",
        tax_year=2025,
        status="confirmed",
    )
    profile = TaxProfile(
        id=str(uuid.uuid4()),
        tax_return_id=tr_id,
        income_data={"employment_income": 100000.0},
    )
    db_session.add_all([tr, profile])
    await db_session.commit()

    # Attempt to patch profile on confirmed return -> 409
    patch_resp = await auth_client.patch(
        f"/api/v1/tax-returns/{tr_id}/profile",
        json={"income_data": {"employment_income": 115000.0}},
    )
    assert patch_resp.status_code == 409

    # Reopen tax return
    reopen_resp = await auth_client.post(f"/api/v1/tax-returns/{tr_id}/reopen")
    assert reopen_resp.status_code == 200
    assert reopen_resp.json()["status"] == "draft"

    # After reopen, editing is permitted
    patch_resp2 = await auth_client.patch(
        f"/api/v1/tax-returns/{tr_id}/profile",
        json={"income_data": {"employment_income": 115000.0}},
    )
    assert patch_resp2.status_code == 200


@pytest.mark.asyncio
async def test_document_deletion_retracts_contributions_and_invalidates_calc(
    auth_client: AsyncClient,
    db_session: AsyncSession,
    test_user: User,
):
    """Document deletion retracts approved financial contributions and invalidates calculations."""
    tr_id = str(uuid.uuid4())
    doc_id = str(uuid.uuid4())
    tr = TaxReturn(
        id=tr_id,
        user_id=str(test_user.id),
        canton_code="ZH",
        municipality_code="261",
        tax_year=2025,
        status="draft",
    )
    doc = Document(
        id=doc_id,
        user_id=str(test_user.id),
        tax_return_id=tr_id,
        original_filename="salary.pdf",
        storage_key=f"users/{test_user.id}/{doc_id}/salary.pdf",
        mime_type="application/pdf",
        file_size_bytes=1024,
        document_type="salary_certificate",
        processing_status="done",
        extracted_data={"gross_salary": 85000.0},
    )
    profile = TaxProfile(
        id=str(uuid.uuid4()),
        tax_return_id=tr_id,
        income_data={
            "employment_income": 85000.0,
            "_doc_contributions": {
                doc_id: {"employment_income": 85000.0},
            },
        },
    )
    calc = TaxCalculation(
        id=str(uuid.uuid4()),
        tax_return_id=tr_id,
        status="completed",
        is_final=False,
        total_tax_due=10000.0,
    )
    db_session.add_all([tr, doc, profile, calc])
    await db_session.commit()

    # Delete document
    del_resp = await auth_client.delete(f"/api/v1/documents/{doc_id}")
    assert del_resp.status_code in (200, 204)

    # Refresh DB objects
    await db_session.refresh(profile)
    await db_session.refresh(calc)

    # Financial contribution should be retracted (subtracted or removed)
    assert profile.income_data.get("employment_income", 0.0) == 0.0
    assert doc_id not in str(profile.income_data.get("_doc_contributions", {}))
    # Calculation is marked stale
    assert calc.status == "stale"
