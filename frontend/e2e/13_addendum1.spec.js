/**
 * Scenario 13: Addendum 1 Full End-to-End Verification
 * Covers:
 *   1. Landing 26-canton calculator (2025 vs 2026 car rate 0.70 -> 0.75/km, Pillar 3a 2026 catch-up, rollout badges)
 *   2. Step 1 Coming-Soon canton gate (PLZ 3011 BE): «Dein Kanton kommt bald», waitlist signup, no payment/proceed
 *   3. Step 3 Question Catalogue (ZH 2026): Next disabled with plain hint until answered, 2026 0.75/km & Pillar 3a catch-up, «Spart ca. CHF X»
 *   4. Step 5 & Step 6: «So viel sparst du» counterfactual summary + «Unverbindliche Schätzung...» + Receipt required vs keep_only card
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

test.describe('Scenario 13: Addendum 1 Complete Feature Verification', () => {
  test('13.1 Landing page 26-canton calculator shows 2025 vs 2026 rates and rollout badges', async ({ page }) => {
    await page.goto(FRONTEND_URL);
    await page.waitForLoadState('networkidle');

    // Verify default 2025 Zürich
    await expect(page.locator('#cantonSelect')).toHaveValue('ZH');
    await expect(page.getByText('Direkt einreichen möglich')).toBeVisible();
    await expect(page.getByText('CHF 0.70/km').first()).toBeVisible();

    // Switch to 2026 -> car rate CHF 0.75/km & Pillar 3a catch-up appear
    await page.getByRole('button', { name: '2026', exact: true }).click();
    await expect(page.getByText('CHF 0.75/km').first()).toBeVisible();
    await expect(page.getByText('Säule 3a Einkauf (neu 2026)')).toBeVisible();

    // All 26 cantons remain selectable (check BE shows coming_soon info badge)
    await page.locator('#cantonSelect').selectOption('BE');
    await expect(page.getByText('Kommt bald (Info)')).toBeVisible();

    await captureEvidence(page, 'sc13_01_landing_canton_rules', 'Landing page 2026 rules & rollout badge');
  });

  test('13.2 Coming-soon canton (BE 3011) shows waitlist banner & blocks proceeding/payment', async ({ page, context }) => {
    const user = await createTestUser('add1_waitlist');
    await setAuthSession(context, user);

    await page.goto(`${FRONTEND_URL}/tax-returns/new`);
    await page.waitForLoadState('networkidle');

    const plzInput = page.locator('input[placeholder*="8400"]').first();
    await plzInput.fill('3011');

    // Wait for PLZ resolution banner
    const banner = page.getByTestId('canton-coming-soon-banner');
    await expect(banner).toBeVisible({ timeout: 10000 });
    await expect(banner.getByText(/Dein Kanton kommt bald/i)).toBeVisible();

    // Proceed button must remain disabled
    const proceedBtn = page.getByRole('button', { name: /Weiter zu Schritt 2/i });
    await expect(proceedBtn).toBeDisabled();

    // Join waitlist by email
    const wlEmail = `wl_${Date.now()}@example.ch`;
    await page.getByTestId('waitlist-email-input').fill(wlEmail);
    await page.getByTestId('waitlist-submit-btn').click();
    await expect(page.getByTestId('waitlist-success')).toBeVisible({ timeout: 10000 });

    await captureEvidence(page, 'sc13_02_coming_soon_waitlist', 'BE 3011 coming soon banner + waitlist confirmed');
  });

  test('13.3–13.5 ZH 2026 workflow: Step-3 disabled hint, 2026 rules, counterfactual savings, and receipt classification', async ({ page, context }) => {
    const user = await createTestUser('add1_zh2026');
    const tr = await createTestTaxReturn(user.accessToken, 'ZH', 2026, '261', 'Zürich');

    // Seed personal + salary data (no receipts uploaded yet so receipt-check shows required vs keep_only)
    await fetch(`${BACKEND_URL}/tax-returns/${tr.id}/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.accessToken}`,
      },
      body: JSON.stringify({
        personal_data: {
          first_name: 'Lukas',
          last_name: 'Weber',
          name: 'Lukas Weber',
          marital_status: 'single',
          civil_status: 'ledig',
          postal_code: '8001',
          address_street: 'Bahnhofstrasse 10',
          address_zip: '8001',
          address_city: 'Zürich',
          date_of_birth: '1990-05-12',
          ahv_number: '756.9217.0769.85',
          canton_code: 'ZH',
          confession: 'none',
        },
        income_data: {
          employment_income: 115000,
          gross_salary: 115000,
          net_salary: 100000,
        },
      }),
    });

    await setAuthSession(context, user);

    // Navigate to Step 3 (Questions) for ZH 2026
    await page.goto(`${FRONTEND_URL}/tax-returns/${tr.id}?step=questions`);
    await page.waitForLoadState('networkidle');

    // 1. Verify Next is disabled until required Step-3 questions are answered, with visible hint above it
    const qNextBtn = page.getByTestId('questions-next-btn');
    await expect(qNextBtn).toBeDisabled();
    await expect(page.getByTestId('questions-missing-hint')).toBeVisible();

    // 2. Verify 2026 car km rate CHF 0.75/km & answer car commute + reason
    await expect(page.getByText('CHF 0.75 / km')).toBeVisible();
    await page.locator('button:has-text("Auto")').first().click();
    await page.locator('button:has-text("Über 1 Std. Zeitersparnis")').click();

    // 3. Answer Pillar 3a (7258) + 2026 Retroactive Catch-up (3000) + Health insurance (4200)
    await page.getByRole('button', { name: /^(Ja|Ja \(Betrag eingeben\))$/i }).first().click();
    const catchupInput = page.getByTestId('pillar3a-catchup-input');
    await expect(catchupInput).toBeVisible();
    await page.locator('input[placeholder="z. B. 7258"]').fill('7258');
    await catchupInput.fill('3000');
    await page.getByTestId('health-insurance-input').fill('4200');

    // Missing hint must vanish and Next becomes enabled
    await expect(page.getByTestId('questions-missing-hint')).toHaveCount(0);
    await expect(qNextBtn).toBeEnabled();

    // Save answers and trigger recalculation -> verify «Spart ca. CHF X» badges appear
    await page.getByRole('button', { name: 'Antworten speichern', exact: true }).first().click();
    await expect(page.getByText('Angaben erfolgreich gespeichert', { exact: true })).toBeVisible();
    await page.waitForTimeout(800);
    await expect(page.getByTestId('deduction-savings-badge').first()).toBeVisible({ timeout: 10000 });
    await captureEvidence(page, 'sc13_03_step3_questions_2026_savings', 'Step 3 ZH 2026 0.75/km + Pillar 3a catch-up + savings badges');

    // Navigate to Step 5 (Review) -> verify «So viel sparst du» counterfactual card & disclaimer
    await page.goto(`${FRONTEND_URL}/tax-returns/${tr.id}?step=review`);
    await page.waitForLoadState('networkidle');
    const savingsCard = page.getByTestId('so-viel-sparst-du-card');
    await expect(savingsCard).toBeVisible({ timeout: 10000 });
    await expect(savingsCard.getByText(/Dank deinen Abzügen sparst du ca\. CHF/i)).toBeVisible();
    await expect(savingsCard.getByText(/Säule 3a Einkauf/i)).toBeVisible();
    await expect(savingsCard.getByText(/Unverbindliche Schätzung/i)).toBeVisible();
    await expect(savingsCard.getByText(/Spart ca\. CHF/i).first()).toBeVisible();
    await captureEvidence(page, 'sc13_04_step5_savings_breakdown', 'Step 5 counterfactual savings breakdown');

    // Navigate to Step 6 (Submit) -> verify receipt check (required vs keep_only) & savings summary
    await page.goto(`${FRONTEND_URL}/tax-returns/${tr.id}?step=submit`);
    await page.waitForLoadState('networkidle');
    const receiptCard = page.getByTestId('receipt-check-card');
    await expect(receiptCard).toBeVisible({ timeout: 10000 });
    await expect(receiptCard.getByText(/Zwingend beizulegende Belege/i)).toBeVisible();
    await expect(receiptCard.getByText(/Nur aufbewahren/i)).toBeVisible();
    await expect(page.getByText(/Dank deinen Abzügen sparst du ca\. CHF/i).first()).toBeVisible();
    await captureEvidence(page, 'sc13_05_step6_receipts_and_savings', 'Step 6 receipt rules + savings summary');
  });
});
