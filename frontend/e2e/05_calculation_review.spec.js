/**
 * Scenario 05: Calculation and Review (Step 5)
 * Tests Cantonal vs Federal dual calculation breakdown, totals, rounding,
 * approximate estimate labels « ca. CHF … », input modification recalculation,
 * and missing data links in validation summary.
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

test.describe('Scenario 05: Calculation and Review', () => {
  let user;
  let taxReturn;

  test.beforeAll(async () => {
    user = await createTestUser('calc_review_user');
    taxReturn = await createTestTaxReturn(user.accessToken, 'ZH', 2025, '261', 'Zürich');

    // Seed profile data with income and deductions via API for calculation
    const profileRes = await fetch(`${BACKEND_URL}/tax-returns/${taxReturn.id}/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.accessToken}`,
      },
      body: JSON.stringify({
        personal_data: {
          first_name: 'Max',
          last_name: 'Muster',
          name: 'Max Muster',
          marital_status: 'single',
          civil_status: 'ledig',
          postal_code: '8001',
          canton_code: 'ZH',
          confession: 'none',
        },
        income_data: {
          gross_salary: 95000,
          employment_income: 95000,
          net_salary: 82000,
        },
        deductions_data: {
          travel_expenses: 2450,
          pillar3a_contributions: 7056,
          health_insurance_premiums: 3600,
        },
        wealth_data: {
          securities: [
            { name: 'Sparkonto ZKB', tax_value: 50000, gross_revenue_with_tax: 500, gross_revenue_without_tax: 0 },
          ],
        },
      }),
    });

    if (!profileRes.ok) {
      throw new Error(`Profile setup failed: ${profileRes.status} ${await profileRes.text()}`);
    }

    // Run initial calculation so calculation is persisted
    const calcRes = await fetch(`${BACKEND_URL}/tax-returns/${taxReturn.id}/calculate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user.accessToken}`,
      },
    });

    if (!calcRes.ok) {
      throw new Error(`Initial calculation failed: ${calcRes.status} ${await calcRes.text()}`);
    }
  });

  test('5.1 Dual calculation breakdown & approximate estimate label « ca. CHF … »', async ({ page, context }) => {
    await setAuthSession(context, user);
    await page.goto(`${FRONTEND_URL}/tax-returns/${taxReturn.id}?step=review`);
    await page.waitForLoadState('networkidle');

    // If calculation has not run yet, click "Steuern jetzt berechnen"
    const calcBtn = page.locator('button:has-text("Steuern jetzt berechnen")');
    if (await calcBtn.isVisible()) {
      await calcBtn.click();
      await page.waitForTimeout(1000);
    }

    // Check approximate estimate label format: « ca. CHF … »
    const estimateLabel = page.locator('text=/« ca. CHF [0-9’\'. ]+ »/');
    await expect(estimateLabel.first()).toBeVisible();

    // Check Art. 110 DBG disclaimer text
    await expect(page.locator('text=Art. 110 DBG').first()).toBeVisible();

    await captureEvidence(page, 'sc05_01_dual_calc_banner', 'Top calculation banner with estimate label');
  });

  test('5.2 4-Component breakdown cards (Federal, Cantonal, Municipal, Wealth)', async ({ page, context }) => {
    await setAuthSession(context, user);
    await page.goto(`${FRONTEND_URL}/tax-returns/${taxReturn.id}?step=review`);
    await page.waitForLoadState('networkidle');

    // Verify 4 tax component labels
    await expect(page.getByText('Bundessteuer', { exact: true })).toBeVisible();
    await expect(page.locator('text=Kantonssteuer (ZH)')).toBeVisible();
    await expect(page.locator('text=Gemeindesteuer')).toBeVisible();
    await expect(page.locator('text=Vermögenssteuer')).toBeVisible();

    await captureEvidence(page, 'sc05_02_component_cards', '4 Component breakdown cards');
  });

  test('5.3 Side-by-side comparison table: Canton ZH vs Bund', async ({ page, context }) => {
    await setAuthSession(context, user);
    await page.goto(`${FRONTEND_URL}/tax-returns/${taxReturn.id}?step=review`);
    await page.waitForLoadState('networkidle');

    // Verify Comparison Table
    await expect(page.locator('span:has-text("Gegenüberstellung: Kanton ZH vs. Bund")')).toBeVisible();
    await expect(page.locator('th:has-text("Kanton ZH")')).toBeVisible();
    await expect(page.locator('th:has-text("Bund (DBG)")')).toBeVisible();

    // Check income and deductions rows
    await expect(page.locator('td:has-text("Haupterwerb (Lohn)")')).toBeVisible();
    await expect(page.locator('td:has-text("Arbeitsweg (Fahrkosten)")')).toBeVisible();
    await expect(page.locator('td:has-text("Säule 3a")')).toBeVisible();

    await captureEvidence(page, 'sc05_03_side_by_side_table', 'Canton vs Bund comparison table');
  });

  test('5.4 Input change recalculation & downstream update', async ({ page, context }) => {
    await setAuthSession(context, user);
    // Go to complete step and add additional donation deduction
    await page.goto(`${FRONTEND_URL}/tax-returns/${taxReturn.id}?step=complete`);
    await page.waitForLoadState('networkidle');

    // Fill Gemeinnützige Spenden
    const donationInput = page.locator('label:has-text("Gemeinnützige Spenden")').locator('..').locator('input');
    await donationInput.fill('1500');

    await page.locator('button:has-text("Änderungen speichern")').click();
    await expect(page.getByText('Angaben gespeichert', { exact: true })).toBeVisible();

    // Return to review
    await page.goto(`${FRONTEND_URL}/tax-returns/${taxReturn.id}?step=review`);
    await page.waitForLoadState('networkidle');

    // Click "Neu berechnen"
    const reCalcBtn = page.locator('button:has-text("Neu berechnen")');
    await reCalcBtn.click();
    await page.waitForTimeout(1000);

    // Verify Spenden row now visible in comparison table
    await expect(page.locator('td:has-text("Gemeinnützige Spenden")')).toBeVisible();

    await captureEvidence(page, 'sc05_04_recalculation_after_edit', 'Recalculated with updated donations');
  });

  test('5.5 Missing data links in final review summary', async ({ page, context }) => {
    // Create a married return where Partner 2 has not confirmed yet
    const marriedUser = await createTestUser('married_val_user');
    const marriedReturn = await createTestTaxReturn(marriedUser.accessToken, 'ZH', 2025, '261', 'Zürich');

    // Seed married status: set both civil_status and marital_status to verheiratet
    await fetch(`${BACKEND_URL}/tax-returns/${marriedReturn.id}/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${marriedUser.accessToken}`,
      },
      body: JSON.stringify({
        personal_data: {
          civil_status: 'verheiratet',
          marital_status: 'married',
          canton_code: 'ZH',
        },
        income_data: {
          employment_income: 85000,
        },
      }),
    });

    // Run calculation
    await fetch(`${BACKEND_URL}/tax-returns/${marriedReturn.id}/calculate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${marriedUser.accessToken}` },
    });

    await setAuthSession(context, marriedUser);
    await page.goto(`${FRONTEND_URL}/tax-returns/${marriedReturn.id}?step=submit`);
    await page.waitForLoadState('networkidle');

    // Should indicate incomplete/missing items due to unconfirmed Partner 2
    await expect(page.locator('text=Vor dem Einreichen ausstehend')).toBeVisible();

    // Check direct link to missing partner 2 confirmation
    const partner2Link = page.locator('button:has-text("Persönliche Bestätigung von Partner 2")');
    await expect(partner2Link).toBeVisible();

    await captureEvidence(page, 'sc05_05_missing_data_link_navigation', 'Direct navigation from validation summary');
  });
});
