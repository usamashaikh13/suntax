/**
 * Scenario 06: Spouse Confirmation (Art. 113 DBG)
 * Tests married dossier, Partner 2 invitation URL generation, opening in
 * separate browser context, dossier review before confirmation,
 * partner status update in primary dossier, invalid token handling,
 * and invalidation when downstream data changes.
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

test.describe('Scenario 06: Spouse Confirmation (Art. 113 DBG)', () => {
  let partner1;
  let marriedReturn;
  let inviteUrl;
  let inviteToken;

  test.beforeAll(async () => {
    partner1 = await createTestUser('partner1');
    marriedReturn = await createTestTaxReturn(partner1.accessToken, 'ZH', 2025, '261', 'Zürich');

    // Seed married profile with Partner 1 and Partner 2 info
    await fetch(`${BACKEND_URL}/tax-returns/${marriedReturn.id}/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${partner1.accessToken}`,
      },
      body: JSON.stringify({
        personal_data: {
          first_name: 'Hans',
          last_name: 'Muster',
          name: 'Hans Muster',
          marital_status: 'married',
          civil_status: 'verheiratet',
          postal_code: '8001',
          canton_code: 'ZH',
          partner2: {
            first_name: 'Anna',
            last_name: 'Muster',
          },
        },
        income_data: {
          employment_income: 98000,
        },
      }),
    });

    // Run calculation
    await fetch(`${BACKEND_URL}/tax-returns/${marriedReturn.id}/calculate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${partner1.accessToken}` },
    });
  });

  test('6.1 Generate Partner 2 invitation link in Step 6', async ({ page, context }) => {
    await setAuthSession(context, partner1);
    await page.goto(`${FRONTEND_URL}/tax-returns/${marriedReturn.id}?step=submit`);
    await page.waitForLoadState('networkidle');

    // Verify Art. 113 DBG section exists
    await expect(page.locator('span:has-text("Gemeinsame Steuererklärung (Art. 113 DBG)")')).toBeVisible();

    // Fill Partner 2 Email
    const partnerEmailInput = page.locator('input[placeholder="E-Mail-Adresse von Partner 2"]');
    await partnerEmailInput.fill('anna.muster@suntax-synthetic.ch');

    // Click "Einladung generieren"
    const generateBtn = page.locator('button:has-text("Einladung generieren")');
    await generateBtn.click();

    // Verify confirmation link displayed
    await expect(page.locator('text=Persönlicher Bestätigungslink für Partner 2:')).toBeVisible();

    // Extract the confirmation URL from the input
    const linkInput = page.locator('input[readonly]');
    inviteUrl = await linkInput.inputValue();
    expect(inviteUrl).toContain('/partner-confirm?token=');

    // Extract token
    const urlObj = new URL(inviteUrl);
    inviteToken = urlObj.searchParams.get('token');
    expect(inviteToken).toBeTruthy();

    await captureEvidence(page, 'sc06_01_partner2_invite_generated', 'Partner 2 invitation link generated');
  });

  test('6.2 Partner 2 reviews dossier summary and confirms in separate browser context', async ({ browser }) => {
    expect(inviteUrl).toBeTruthy();

    // Open new unauthenticated browser context
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();

    await guestPage.goto(inviteUrl);
    await guestPage.waitForLoadState('networkidle');

    // Verify header branding and Art. 113 DBG subtitle
    await expect(guestPage.locator('text=Offizielle Partner-Bestätigung (Art. 113 DBG)')).toBeVisible();

    // Verify dossier summary
    await expect(guestPage.locator('text=Gemeinsame Steuererklärung überprüfen')).toBeVisible();
    await expect(guestPage.locator('text=ZH – Zürich')).toBeVisible();
    await expect(guestPage.locator('text=Hans Muster').first()).toBeVisible();

    // Enter full name
    const nameInput = guestPage.locator('#fullName');
    await nameInput.fill('Anna Muster');

    // Check confirmation checkbox
    const confirmCheckbox = guestPage.locator('input[type="checkbox"]');
    await confirmCheckbox.check();

    await captureEvidence(guestPage, 'sc06_02_partner2_review_form', 'Partner 2 reviewing dossier before confirmation');

    // Submit confirmation
    await guestPage.locator('button[type="submit"]:has-text("Rechtsgültig bestätigen")').click();

    // Verify success confirmation view
    await expect(guestPage.locator('text=Bestätigung erfolgreich erfasst')).toBeVisible();
    await captureEvidence(guestPage, 'sc06_03_partner2_success', 'Partner 2 confirmation successful');

    await guestContext.close();
  });

  test('6.3 Partner 1 sees Partner 2 confirmation reflected in dossier', async ({ page, context }) => {
    await setAuthSession(context, partner1);
    await page.goto(`${FRONTEND_URL}/tax-returns/${marriedReturn.id}?step=submit`);
    await page.waitForLoadState('networkidle');

    // Verify Partner 2 confirmation is reflected as confirmed
    await expect(page.locator('text=Persönliche Bestätigung von Anna Muster')).toBeVisible();
    await captureEvidence(page, 'sc06_04_partner1_confirmation_reflected', 'Partner 2 status confirmed in primary dossier');
  });

  test('6.4 Invalid or expired token handling', async ({ browser }) => {
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();

    // Visit with invalid token
    await guestPage.goto(`${FRONTEND_URL}/partner-confirm?token=INVALID_BOGUS_TOKEN_12345`);
    await guestPage.waitForLoadState('networkidle');

    // Verify error box
    await expect(guestPage.locator('text=Link nicht gültig')).toBeVisible();
    await captureEvidence(guestPage, 'sc06_05_invalid_token_error', 'Invalid partner token error display');

    await guestContext.close();
  });

  test('6.5 Downstream modification invalidates Partner 2 confirmation', async ({ page, context }) => {
    await setAuthSession(context, partner1);

    // Modify deductions in Step 4
    await page.goto(`${FRONTEND_URL}/tax-returns/${marriedReturn.id}?step=complete`);
    await page.waitForLoadState('networkidle');

    // Add education expenses
    const eduInput = page.locator('label:has-text("Weiterbildungskosten")').locator('..').locator('input');
    await eduInput.fill('800');

    await page.locator('button:has-text("Änderungen speichern")').click();
    await expect(page.getByText('Angaben gespeichert', { exact: true })).toBeVisible();

    // Check Partner 2 status in backend API - should be invalidated
    const statusRes = await fetch(`${BACKEND_URL}/tax-returns/${marriedReturn.id}/partner2/status`, {
      headers: { Authorization: `Bearer ${partner1.accessToken}` },
    });
    const statusData = await statusRes.json();
    expect(statusData.is_confirmed).toBe(false);

    // Reload Step 6 and verify confirmation is now pending again
    await page.goto(`${FRONTEND_URL}/tax-returns/${marriedReturn.id}?step=submit`);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('button:has-text("Einladung generieren")')).toBeVisible();
    await captureEvidence(page, 'sc06_06_confirmation_invalidated', 'Partner 2 confirmation invalidated after modification');
  });
});
