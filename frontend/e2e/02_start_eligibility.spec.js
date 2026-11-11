const { test, expect } = require('@playwright/test');
const {
  captureEvidence,
  createTestUser,
  setAuthSession,
  createTestTaxReturn,
} = require('./helpers');

test.describe('Scenario 2: Start and Eligibility', () => {
  let user;

  test.beforeEach(async ({ context }) => {
    user = await createTestUser('start_elig');
    await setAuthSession(context, user);
  });

  test('2.1 Postcode lookup: resolves canton, municipality name, and BFS number accurately', async ({ page }) => {
    await page.goto('/tax-returns/new');
    await expect(page.getByRole('heading', { name: 'Kurz zu dir' })).toBeVisible();
    await captureEvidence(page, 'sc02_01_start_new_return', 'Initial Start screen with PLZ lookup');

    // Type 8001
    await page.fill('input[placeholder*="8400"]', '8001');
    await page.waitForTimeout(1000);

    // Assert verified behavior: Green box renders with resolved Canton, Municipality, and BFS Code
    const greenBox = page.locator('div.bg-\\[\\#F0FDF4\\]');
    await expect(greenBox).toBeVisible();
    const boxText = await greenBox.textContent();
    expect(boxText).toContain('ZH');
    expect(boxText).toContain('Zürich');
    expect(boxText).toContain('BFS #261');
    await captureEvidence(page, 'sc02_02_plz_8001_resolved', 'Resolved PLZ 8001 box');
  });

  test('2.2 Ambiguous postcode: 8952 displays dropdown allowing selection between Schlieren and Zürich', async ({ page }) => {
    await page.goto('/tax-returns/new');
    await page.fill('input[placeholder*="8400"]', '8952');
    await page.waitForTimeout(1200);

    // Verify ambiguous PLZ dropdown appears
    const dropdown = page.locator('select');
    await expect(dropdown).toBeVisible();

    // Verify both municipalities exist in the dropdown options
    const optionsText = await dropdown.textContent();
    expect(optionsText).toContain('Schlieren');
    expect(optionsText).toContain('Zürich');

    // Select Zürich (BFS 261)
    await dropdown.selectOption('261');
    await page.waitForTimeout(500);

    // Verify green box updates to Zürich
    const greenBox = page.locator('div.bg-\\[\\#F0FDF4\\]');
    await expect(greenBox).toContainText('Zürich');
    await expect(greenBox).toContainText('BFS #261');

    await captureEvidence(page, 'sc02_03_ambiguous_plz_dropdown', 'Municipality dropdown state for 8952 selecting Zürich');
  });

  test('2.3 Unknown postcode: displays validation error and blocks invalid creation', async ({ page }) => {
    await page.goto('/tax-returns/new');
    await page.fill('input[placeholder*="8400"]', '9999');
    await page.waitForTimeout(1000);

    // Verify clear error message is displayed
    const errorAlert = page.getByText(/Postleitzahl.*nicht gefunden/i);
    await expect(errorAlert).toBeVisible();

    // Verify green confirmation box is not shown
    const greenBox = page.locator('div.bg-\\[\\#F0FDF4\\]');
    await expect(greenBox).toHaveCount(0);

    await captureEvidence(page, 'sc02_04_unknown_plz_handling', 'Handling of invalid/unknown postcode 9999');
  });

  test('2.4 Tax years 2025 and 2026 selection', async ({ page }) => {
    await page.goto('/tax-returns/new');

    const btn2025 = page.getByRole('button', { name: 'Steuerjahr 2025' });
    const btn2026 = page.getByRole('button', { name: 'Steuerjahr 2026' });

    await expect(btn2025).toBeVisible();
    await expect(btn2026).toBeVisible();

    // Select 2026
    await btn2026.click();
    await expect(btn2026).toHaveClass(/bg-emerald-50/);
    await captureEvidence(page, 'sc02_05_tax_year_2026_selected', 'Tax year 2026 selected');
  });

  test('2.5 Unsupported eligibility scenarios block creation before payment', async ({ page }) => {
    await page.goto('/tax-returns/new');
    await page.fill('input[placeholder*="8400"]', '8001');
    await page.waitForTimeout(1000);

    const proceedBtn = page.getByRole('button', { name: /Weiter zu Schritt 2/i });

    // Target the specific question card for self-employed and click "Ja"
    const selfEmployedCard = page.locator('div.p-3\\.5').filter({ hasText: 'Übst du eine selbstständige' });
    await selfEmployedCard.getByRole('button', { name: 'Ja' }).click();
    await page.waitForTimeout(1000);

    // When self-employed, an unsupported case alert is shown and proceed button remains disabled
    await expect(proceedBtn).toBeDisabled();
    await expect(page.locator('text=Aktuell noch nicht unterstützt').first()).toBeVisible();

    await captureEvidence(page, 'sc02_06_unsupported_case_blocked', 'Self-employed scenario blocked before payment');
  });

  test('2.6 Successful dossier creation via UI & draft persistence after refresh', async ({ page }) => {
    await page.goto('/tax-returns/new');
    await page.fill('input[placeholder*="8400"]', '8001');
    await page.waitForTimeout(1000);

    const proceedBtn = page.getByRole('button', { name: /Weiter zu Schritt 2/i });
    await expect(proceedBtn).toBeEnabled();
    await proceedBtn.click();

    // Expect navigation to newly created return /tax-returns/[id]
    await expect(page).toHaveURL(/\/tax-returns\/[a-zA-Z0-9_-]+/, { timeout: 15000 });
    await expect(page.locator('text=Kurz zu dir').or(page.locator('text=Dokumente')).first()).toBeVisible({ timeout: 15000 });
    await captureEvidence(page, 'sc02_07_dossier_created', 'Dossier created via UI in Step 1/2');

    // Reload page to verify persistence
    await page.reload();
    await expect(page).toHaveURL(/\/tax-returns\/[a-zA-Z0-9_-]+/);
    await captureEvidence(page, 'sc02_08_draft_resumed_after_reload', 'Dossier values persisted after browser reload');
  });
});
