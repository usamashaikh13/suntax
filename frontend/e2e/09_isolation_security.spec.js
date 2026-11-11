/**
 * Scenario 09: Multi-User Isolation and Security
 * Tests dossier isolation between distinct users (User B blocked from User A's
 * returns, profiles, documents, exports), non-admin blocked from admin endpoints
 * (HTTP 403), Swiss nDSG data protection headers, and absence of sensitive
 * plaintext leaks in client state.
 */
const { test, expect } = require('@playwright/test');
const {
  FRONTEND_URL,
  BACKEND_URL,
  captureEvidence,
  createTestUser,
  setAuthSession,
  createTestTaxReturn,
} = require('./helpers');

test.describe('Scenario 09: Multi-User Isolation and Security', () => {
  let userA;
  let userB;
  let taxReturnA;

  test.beforeAll(async () => {
    userA = await createTestUser('isolation_user_a');
    userB = await createTestUser('isolation_user_b');
    taxReturnA = await createTestTaxReturn(userA.accessToken, 'ZH', 2025, '261', 'Zürich');

    // Seed profile data for User A with private financial figures
    await fetch(`${BACKEND_URL}/tax-returns/${taxReturnA.id}/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userA.accessToken}`,
      },
      body: JSON.stringify({
        personal_data: {
          first_name: 'PrivatA',
          last_name: 'Geheim',
          name: 'PrivatA Geheim',
          ahv_number: '756.1234.5678.90',
          postal_code: '8001',
          canton_code: 'ZH',
        },
        income_data: {
          gross_salary: 175000,
          employment_income: 175000,
        },
        wealth_data: {
          bank_accounts: [{ iban: 'CH9300000000000000000', balance: 500000 }],
        },
      }),
    });
  });

  test('9.1 API Cross-User Isolation: User B cannot access User A dossier or profile', async () => {
    // 1. User B tries to read User A tax return
    const trRes = await fetch(`${BACKEND_URL}/tax-returns/${taxReturnA.id}`, {
      headers: { Authorization: `Bearer ${userB.accessToken}` },
    });
    expect([403, 404]).toContain(trRes.status);

    // 2. User B tries to read User A profile
    const profRes = await fetch(`${BACKEND_URL}/tax-returns/${taxReturnA.id}/profile`, {
      headers: { Authorization: `Bearer ${userB.accessToken}` },
    });
    expect([403, 404]).toContain(profRes.status);

    // 3. User B tries to list User A documents
    const docRes = await fetch(`${BACKEND_URL}/documents/tax-return/${taxReturnA.id}`, {
      headers: { Authorization: `Bearer ${userB.accessToken}` },
    });
    expect([403, 404]).toContain(docRes.status);

    // 4. User B tries to export User A PDF
    const pdfRes = await fetch(`${BACKEND_URL}/tax-returns/${taxReturnA.id}/export/pdf`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userB.accessToken}` },
    });
    expect([403, 404]).toContain(pdfRes.status);
  });

  test('9.2 UI Cross-User Isolation: User B blocked when opening User A dossier URL', async ({ page, context }) => {
    // Login as User B
    await setAuthSession(context, userB);

    // Attempt to navigate directly to User A's tax return
    await page.goto(`${FRONTEND_URL}/tax-returns/${taxReturnA.id}`);
    await page.waitForLoadState('networkidle');

    // Must show "Steuererklärung nicht gefunden" error card
    await expect(page.locator('text=Steuererklärung nicht gefunden')).toBeVisible();

    // Verify User A's private name or salary is NOT leaked anywhere in DOM
    const bodyContent = await page.textContent('body');
    expect(bodyContent).not.toContain('PrivatA Geheim');
    expect(bodyContent).not.toContain('175000');
    expect(bodyContent).not.toContain('CH9300000000000000000');

    await captureEvidence(page, 'sc09_01_cross_user_blocked_ui', 'User B blocked from User A dossier');
  });

  test('9.3 Non-admin blocked from admin endpoints (HTTP 403 Forbidden)', async () => {
    // Ordinary user calls admin endpoints
    const usersRes = await fetch(`${BACKEND_URL}/admin/users`, {
      headers: { Authorization: `Bearer ${userA.accessToken}` },
    });
    expect(usersRes.status).toBe(403);
    const usersErr = await usersRes.json();
    expect(usersErr.detail).toMatch(/Admin/i);

    const statsRes = await fetch(`${BACKEND_URL}/admin/stats`, {
      headers: { Authorization: `Bearer ${userA.accessToken}` },
    });
    expect(statsRes.status).toBe(403);
  });

  test('9.4 Swiss nDSG data residency and security headers verification', async () => {
    const res = await fetch(`${BACKEND_URL}/cantons`);
    expect(res.ok).toBe(true);

    // Verify Swiss nDSG compliance header
    const ndsgHeader = res.headers.get('x-data-protection-compliance');
    expect(ndsgHeader).toContain('Swiss-nDSG');

    // Verify security headers
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('strict-transport-security')).toBeTruthy();
  });
});
