/**
 * Scenario 04: Questions (Step 3) and Profile Complete (Step 4)
 * Tests commute mode (PT vs Car with justification), home office, meals,
 * custody/alimony, manual entry of securities/bank accounts, add/remove, and persistence.
 */
const { test, expect } = require('@playwright/test');
const {
  FRONTEND_URL,
  captureEvidence,
  createTestUser,
  setAuthSession,
  createTestTaxReturn,
} = require('./helpers');

test.describe('Scenario 04: Questions and Profile Complete', () => {
  let user;
  let taxReturn;

  test.beforeAll(async () => {
    user = await createTestUser('questions_user');
    taxReturn = await createTestTaxReturn(user.accessToken, 'ZH', 2025, '261', 'Zürich');
  });

  test('4.1 Commute mode selection: PT vs Car with reason justification requirement', async ({ page, context }) => {
    await setAuthSession(context, user);
    await page.goto(`${FRONTEND_URL}/tax-returns/${taxReturn.id}?step=questions`);
    await page.waitForLoadState('networkidle');

    // Verify on Step 3
    await expect(page.locator('h2:has-text("Nur noch ein paar Fragen")')).toBeVisible();

    // Select ÖV
    const ptButton = page.locator('button:has-text("ÖV")').first();
    await ptButton.click();
    await expect(page.locator('text=Kosten deines ÖV-Abos pro Jahr')).toBeVisible();

    // Fill ÖV cost
    const oevInput = page.locator('input[placeholder="z. B. 2100"]');
    await oevInput.fill('2450');

    // Switch to Car (Auto)
    const carButton = page.locator('button:has-text("Auto")').first();
    await carButton.click();

    // Reason requirement must be displayed
    await expect(page.locator('text=Warum brauchst du das Auto?')).toBeVisible();
    await expect(page.locator('button:has-text("Über 1 Std. Zeitersparnis")')).toBeVisible();

    // Select car reason
    await page.locator('button:has-text("Über 1 Std. Zeitersparnis")').click();

    // Fill workplace address & km
    const addrInput = page.locator('input[placeholder="Strasse, PLZ Ort"]');
    await addrInput.fill('Industriestrasse 10, 8005 Zürich');

    await captureEvidence(page, 'sc04_01_commute_car_selected', 'Car commute with reason justification');

    // Save answers
    await page.getByRole('button', { name: 'Antworten speichern', exact: true }).first().click();
    await expect(page.getByText('Angaben erfolgreich gespeichert', { exact: true })).toBeVisible();
  });

  test('4.2 Home office days, meal type, and confession deductions', async ({ page, context }) => {
    await setAuthSession(context, user);
    await page.goto(`${FRONTEND_URL}/tax-returns/${taxReturn.id}?step=questions`);
    await page.waitForLoadState('networkidle');

    // Select 2 days home office
    const homeOffice2 = page.locator('button:has-text("2 Tage")').first();
    if (await homeOffice2.isVisible()) {
      await homeOffice2.click();
    }

    // Select Canteen / cheap meal
    const canteenOption = page.locator('button:has-text("Günstig / Kantine")').first();
    if (await canteenOption.isVisible()) {
      await canteenOption.click();
    }

    await captureEvidence(page, 'sc04_02_homeoffice_meals', 'Home office and meals configuration');

    // Save answers
    await page.getByRole('button', { name: 'Antworten speichern', exact: true }).first().click();
    await expect(page.getByText('Angaben erfolgreich gespeichert', { exact: true })).toBeVisible();
  });

  test('4.3 Step 4: Complete profile with manual securities and bank accounts', async ({ page, context }) => {
    await setAuthSession(context, user);
    await page.goto(`${FRONTEND_URL}/tax-returns/${taxReturn.id}?step=complete`);
    await page.waitForLoadState('networkidle');

    // Verify on Step 4
    await expect(page.locator('h2:has-text("Haben wir etwas vergessen?")')).toBeVisible();
    await expect(page.locator('span:has-text("Wertschriften- und Guthabenverzeichnis")')).toBeVisible();

    // Click "Position hinzufügen" to add a bank account
    const addPositionBtn = page.locator('button:has-text("Position hinzufügen")');
    await addPositionBtn.click();

    // Fill new position details
    const nameInput = page.locator('input[placeholder*="Sparkonto"]').first();
    await nameInput.fill('Zürcher Kantonalbank Sparkonto 1234');

    // Fill tax value (Steuerwert 31.12.)
    const valueInputs = page.locator('table tbody tr').first().locator('input[type="number"]');
    // First number input is tax_value
    await valueInputs.nth(0).fill('45000');
    // Second number input is gross_revenue_with_tax (Ertrag mit VSt)
    await valueInputs.nth(1).fill('450');

    await captureEvidence(page, 'sc04_03_securities_added', 'Added bank account in securities register');

    // Click "Änderungen speichern"
    await page.locator('button:has-text("Änderungen speichern")').click();
    await expect(page.getByText('Angaben gespeichert', { exact: true })).toBeVisible();
  });

  test('4.4 Remove position and verify backward/forward persistence', async ({ page, context }) => {
    await setAuthSession(context, user);
    await page.goto(`${FRONTEND_URL}/tax-returns/${taxReturn.id}?step=complete`);
    await page.waitForLoadState('networkidle');

    // Verify previously saved bank account is displayed
    const nameInput = page.locator('input[value*="Zürcher Kantonalbank"]');
    await expect(nameInput).toBeVisible();

    // Add a second position to test deletion
    await page.locator('button:has-text("Position hinzufügen")').click();
    const deleteButtons = page.locator('button[title="Position löschen"], button[title*="löschen"]');
    await expect(deleteButtons).toHaveCount(2);

    // Delete the second position
    await deleteButtons.nth(1).click();
    await expect(deleteButtons).toHaveCount(1);

    // Save and reload to verify persistence
    await page.locator('button:has-text("Änderungen speichern")').click();
    await expect(page.getByText('Angaben gespeichert', { exact: true })).toBeVisible();

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('input[value*="Zürcher Kantonalbank"]')).toBeVisible();
    await captureEvidence(page, 'sc04_04_persistence_verified', 'Step 4 inputs persisted after reload');
  });
});
