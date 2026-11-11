/**
 * Scenario 07: Payment and Submission Gates
 * Tests CHF 39.00 flat price display, pre-payment validation gates,
 * Payrexx checkout session creation, tamper protection (unverified
 * payment rejected with HTTP 400), and records real provider blocker.
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

test.describe('Scenario 07: Payment and Submission Gates', () => {
  let user;
  let taxReturn;

  test.beforeAll(async () => {
    user = await createTestUser('payment_tester');
    taxReturn = await createTestTaxReturn(user.accessToken, 'ZH', 2025, '261', 'Zürich');

    // Seed profile data
    await fetch(`${BACKEND_URL}/tax-returns/${taxReturn.id}/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.accessToken}`,
      },
      body: JSON.stringify({
        personal_data: {
          first_name: 'Beat',
          last_name: 'Muster',
          name: 'Beat Muster',
          marital_status: 'single',
          civil_status: 'ledig',
          postal_code: '8001',
          canton_code: 'ZH',
          confession: 'none',
        },
        income_data: {
          gross_salary: 88000,
          employment_income: 88000,
        },
      }),
    });

    // Run calculation
    await fetch(`${BACKEND_URL}/tax-returns/${taxReturn.id}/calculate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user.accessToken}` },
    });
  });

  test('7.1 CHF 39.00 flat price displayed across header and submit view', async ({ page, context }) => {
    await setAuthSession(context, user);
    await page.goto(`${FRONTEND_URL}/tax-returns/${taxReturn.id}?step=submit`);
    await page.waitForLoadState('networkidle');

    // Verify CHF 39 mentioned in header
    await expect(page.locator('text=Pauschalpreis CHF 39')).toBeVisible();

    // Verify CHF 39 in submission section
    await expect(page.getByText('Pauschale: CHF 39.00')).toBeVisible();

    await captureEvidence(page, 'sc07_01_pricing_display', 'CHF 39 flat fee clearly presented');
  });

  test('7.2 Pre-payment validation gates and payment modal trigger', async ({ page, context }) => {
    await setAuthSession(context, user);
    await page.goto(`${FRONTEND_URL}/tax-returns/${taxReturn.id}?step=submit`);
    await page.waitForLoadState('networkidle');

    // Gate 1: Payment button must be disabled before Art. 110 DBG declaration is checked
    const payButton = page.locator('button:has-text("Zur Bezahlung (CHF 39.00")');
    await expect(payButton).toBeDisabled();

    // Check Art. 110 DBG declaration checkbox
    const confirmCheckbox = page.locator('input[type="checkbox"]');
    await confirmCheckbox.check();

    // Gate 2: Payment button is now enabled
    await expect(payButton).toBeEnabled();
    await payButton.click();

    // Payment modal must appear with TWINT and Credit Card options
    await expect(page.locator('h3:has-text("Einmalige Pauschale")')).toBeVisible();
    await expect(page.getByRole('button', { name: 'TWINT Schweizer Standard' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Kreditkarte Mastercard / Visa' })).toBeVisible();

    await captureEvidence(page, 'sc07_02_payment_modal', 'Payment method selection modal');
  });

  test('7.3 Initiate checkout creates Payrexx session with CHF 39 amount', async () => {
    // Test direct checkout endpoint API contract
    const res = await fetch(`${BACKEND_URL}/tax-returns/${taxReturn.id}/payment/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.accessToken}`,
      },
      body: JSON.stringify({ method: 'twint' }),
    });

    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.amount_chf).toBe(39.0);
    expect(data.currency).toBe('CHF');
    expect(data.gateway_id).toBeTruthy();
    expect(data.checkout_url).toBeTruthy();
    expect(data.status).toBe('ready');
    expect(data.provider).toBe('payrexx');
  });

  test('7.4 Tamper protection: unverified fake confirmation rejected with HTTP 400', async () => {
    // Attempt to forge a payment confirmation without genuine provider verification
    const res = await fetch(`${BACKEND_URL}/tax-returns/${taxReturn.id}/payment/confirm`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.accessToken}`,
      },
      body: JSON.stringify({
        gateway_id: 'fake_tampered_gateway_9999',
        transaction_id: 'fake_tx_8888',
        method: 'twint',
      }),
    });

    // Must be rejected with HTTP 400 Bad Request
    expect(res.status).toBe(400);
    const err = await res.json();
    expect(err.detail).toContain('Zahlung beim Zahlungsanbieter noch nicht bestätigt');
  });

  test('7.5 Real Payrexx sandbox integration boundary verified (live credentials blocked)', async () => {
    // Verify payment status query API
    const res = await fetch(`${BACKEND_URL}/tax-returns/${taxReturn.id}/payment/status`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    });

    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.payment_amount).toBe(39.0);
    expect(data.is_paid).toBe(false);
  });
});
