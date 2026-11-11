/**
 * Scenario 14: Complete End-to-End Flow in German (DE) and English (EN)
 * Verifies:
 *   - DE flow: PLZ 8952 -> Schlieren (247) -> Year 2026 -> PNG image receipt upload ->
 *     Step 3 questions (0.75/km car, Pillar 3a + catch-up) -> Calculate ->
 *     Step 5 Review -> Step 6 Submit (missing personal data, receipt check, DE PDF export +
 *     e-Tax Dossier ZIP containing converted %PDF- attachment)
 *   - EN flow: Switch UI to EN -> PLZ 8051 -> Dübendorf (191) -> Year 2025 ->
 *     Step 3 EN questions -> Calculate -> Step 5 EN Review -> Step 6 EN Submit & EN PDF export
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const {
  FRONTEND_URL,
  BACKEND_URL,
  FIXTURES_DIR,
  captureEvidence,
  createTestUser,
  setAuthSession,
} = require('./helpers');

test.describe('Scenario 14: Complete User Flow in German and English', () => {
  test('14.1 Complete German (DE) flow from PLZ 8952 (2026) through PNG image upload, questions, calculation, and PDF/Dossier export', async ({ page, context }) => {
    const user = await createTestUser('e2e_de_flow');
    await setAuthSession(context, user);

    // Ensure German locale active
    await page.goto(`${FRONTEND_URL}/`);
    await page.waitForLoadState('networkidle');
    const deBtn = page.locator('button:has-text("DE")').first();
    if (await deBtn.isVisible()) {
      await deBtn.click();
    }

    // Step 1: Select PLZ 8952 -> Schlieren (BFS 247) and Tax Year 2026
    await page.goto(`${FRONTEND_URL}/tax-returns/new`);
    await expect(page.getByRole('heading', { name: 'Kurz zu dir' })).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Steuerjahr 2026' }).click();
    await page.fill('input[placeholder*="8400"]', '8952');

    const dropdown = page.locator('select').first();
    await expect(dropdown).toBeVisible({ timeout: 10000 });
    await dropdown.selectOption('247');
    await expect(page.locator('div.bg-\\[\\#F0FDF4\\]')).toContainText('Schlieren');
    await expect(page.locator('div.bg-\\[\\#F0FDF4\\]')).toContainText('BFS #247');

    // Create return & navigate to Step 2
    await page.getByRole('button', { name: /Weiter zu Schritt 2/i }).click();
    await page.waitForURL(/\/tax-returns\/(?!new)[^/?]+/, { timeout: 15000 });
    const match = page.url().match(/\/tax-returns\/([^/?]+)/);
    expect(match).not.toBeNull();
    const taxReturnId = match[1];
    await page.goto(`${FRONTEND_URL}/tax-returns/${taxReturnId}?step=documents`);

    // Step 2: Upload PNG receipt (verified image-to-PDF pipeline in dossier)
    const pngPath = path.join(FIXTURES_DIR, 'synthetic_lohnausweis_scanned.png');
    expect(fs.existsSync(pngPath)).toBe(true);
    await page.locator('input[type="file"]').setInputFiles(pngPath);
    await page.getByRole('button', { name: /Dokument\(e\) hochladen/i }).click();
    await expect(page.locator('text=synthetic_lohnausweis_scanned.png').first()).toBeVisible({ timeout: 25000 });

    // Seed personal profile fields (missing date_of_birth/ahv initially so missing_personal_data shows, then seed salary for calculation)
    await fetch(`${BACKEND_URL}/tax-returns/${taxReturnId}/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.accessToken}`,
      },
      body: JSON.stringify({
        personal_data: {
          first_name: 'Anna',
          last_name: 'Weber',
          name: 'Anna Weber',
          civil_status: 'ledig',
          marital_status: 'single',
          canton_code: 'ZH',
          postal_code: '8952',
          confession: 'none',
        },
        income_data: {
          employment_income: 108000,
          gross_salary: 108000,
          net_salary: 94000,
        },
      }),
    });

    // Step 3: Questions (ZH 2026: car 0.75/km + Pillar 3a + catch-up)
    await page.goto(`${FRONTEND_URL}/tax-returns/${taxReturnId}?step=questions`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('CHF 0.75 / km')).toBeVisible({ timeout: 10000 });
    await page.locator('button:has-text("Auto")').first().click();
    await page.locator('button:has-text("Über 1 Std. Zeitersparnis")').click();
    await page.getByRole('button', { name: /^(Ja|Ja \(Betrag eingeben\))$/i }).first().click();
    await page.locator('input[placeholder="z. B. 7258"]').fill('7258');
    await page.getByTestId('pillar3a-catchup-input').fill('2500');
    await page.getByTestId('health-insurance-input').fill('4100');
    await page.getByRole('button', { name: 'Antworten speichern', exact: true }).first().click();
    await expect(page.getByText('Angaben erfolgreich gespeichert', { exact: true })).toBeVisible({ timeout: 10000 });

    // Trigger calculate so Step 5/6 show live 2026 figures
    const calcRes = await fetch(`${BACKEND_URL}/tax-returns/${taxReturnId}/calculate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user.accessToken}` },
    });
    expect(calcRes.ok).toBe(true);

    // Step 5: Review counterfactual savings in German
    await page.goto(`${FRONTEND_URL}/tax-returns/${taxReturnId}?step=review`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('so-viel-sparst-du-card')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('so-viel-sparst-du-card')).toContainText(/Dank deinen Abzügen sparst du ca\. CHF/i);

    // Step 6: Submit view (missing personal data warning, receipt check, DE PDF download)
    await page.goto(`${FRONTEND_URL}/tax-returns/${taxReturnId}?step=submit`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('missing-personal-data-box')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('receipt-check-card')).toBeVisible();

    const [pdfDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Amtliche Steuererklärung als PDF herunterladen/i }).click(),
    ]);
    const dePdfPath = await pdfDownload.path();
    const dePdfText = fs.readFileSync(dePdfPath, 'latin1');
    expect(dePdfText.startsWith('%PDF-')).toBe(true);
    expect(dePdfText).toContain('ZH');
    expect(dePdfText).toContain('2026');

    // Fill missing personal details & verify Dossier ZIP download with PNG converted to %PDF-
    await fetch(`${BACKEND_URL}/tax-returns/${taxReturnId}/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.accessToken}`,
      },
      body: JSON.stringify({
        personal_data: {
          first_name: 'Anna',
          last_name: 'Weber',
          name: 'Anna Weber',
          date_of_birth: '1989-07-22',
          ahv_number: '756.9217.0769.85',
          address_street: 'Badenerstrasse 18',
          address_zip: '8952',
          address_city: 'Schlieren',
          postal_code: '8952',
          civil_status: 'ledig',
          marital_status: 'single',
          canton_code: 'ZH',
          confession: 'none',
        },
      }),
    });

    const recalcRes = await fetch(`${BACKEND_URL}/tax-returns/${taxReturnId}/calculate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user.accessToken}` },
    });
    expect(recalcRes.ok).toBe(true);

    const dossierRes = await fetch(`${BACKEND_URL}/tax-returns/${taxReturnId}/export/dossier?lang=de`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    });
    if (dossierRes.status !== 200) {
      throw new Error(`Expected dossier 200, got ${dossierRes.status}: ${await dossierRes.text()}`);
    }
    expect(dossierRes.status).toBe(200);
    const zipBytes = Buffer.from(await dossierRes.arrayBuffer());
    expect(zipBytes.subarray(0, 2).toString()).toBe('PK');
    expect(zipBytes.toString('latin1')).toContain('attachments/synthetic_lohnausweis_scanned.pdf');

    await captureEvidence(page, 'sc14_01_complete_de_flow', 'Complete German ZH 2026 flow');
  });

  test('14.2 Complete English (EN) flow from PLZ 8051 (Dübendorf, 2025) through EN Step 3 questions, Review, and English PDF export', async ({ page, context }) => {
    const user = await createTestUser('e2e_en_flow');
    await setAuthSession(context, user);

    // Toggle UI to English
    await page.goto(`${FRONTEND_URL}/`);
    await page.waitForLoadState('networkidle');
    await page.locator('button:has-text("EN")').first().click();
    await expect(page.locator('h1').first()).toContainText('Tax Return', { timeout: 10000 });

    // Step 1 in English: PLZ 8051 -> Dübendorf (191), Year 2025
    await page.goto(`${FRONTEND_URL}/tax-returns/new`);
    await page.waitForLoadState('networkidle');
    await page.fill('input[placeholder*="8400"]', '8051');

    const dropdown = page.locator('select').first();
    await expect(dropdown).toBeVisible({ timeout: 10000 });
    await dropdown.selectOption('191');
    await expect(page.locator('div.bg-\\[\\#F0FDF4\\]')).toContainText('Dübendorf');
    await expect(page.locator('div.bg-\\[\\#F0FDF4\\]')).toContainText('BFS #191');

    await page.getByRole('button', { name: /Continue to Step 2/i }).click();
    await page.waitForURL(/\/tax-returns\/(?!new)[^/?]+/, { timeout: 15000 });
    const match = page.url().match(/\/tax-returns\/([^/?]+)/);
    expect(match).not.toBeNull();
    const taxReturnId = match[1];
    await page.goto(`${FRONTEND_URL}/tax-returns/${taxReturnId}?step=documents`);

    await expect(page.getByRole('heading', { name: /Upload your documents/i })).toBeVisible({ timeout: 10000 });
    const pdfFixture = path.join(FIXTURES_DIR, 'synthetic_lohnausweis_digital.pdf');
    expect(fs.existsSync(pdfFixture)).toBe(true);
    await page.locator('input[type="file"]').setInputFiles(pdfFixture);
    await expect(page.getByRole('button', { name: /Document\(s\) upload & analyze/i })).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: /Document\(s\) upload & analyze/i }).click();
    await expect(page.locator('text=synthetic_lohnausweis_digital.pdf').first()).toBeVisible({ timeout: 25000 });

    // Seed personal + salary data
    await fetch(`${BACKEND_URL}/tax-returns/${taxReturnId}/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.accessToken}`,
      },
      body: JSON.stringify({
        personal_data: {
          first_name: 'Oliver',
          last_name: 'Meyer',
          name: 'Oliver Meyer',
          date_of_birth: '1987-03-14',
          ahv_number: '756.9217.0769.85',
          address_street: 'Ueberlandstrasse 40',
          address_zip: '8051',
          address_city: 'Dübendorf',
          postal_code: '8051',
          civil_status: 'single',
          marital_status: 'single',
          canton_code: 'ZH',
          confession: 'none',
        },
        income_data: {
          employment_income: 102000,
          gross_salary: 102000,
          net_salary: 89000,
        },
      }),
    });

    // Step 3 in English
    await page.goto(`${FRONTEND_URL}/tax-returns/${taxReturnId}?step=questions`);
    await page.waitForLoadState('networkidle');
    await page.locator('button:has-text("Public Transit")').first().click();
    await page.getByRole('button', { name: /Yes \(Enter amount\)|Ja \(Betrag eingeben\)/i }).click();
    await page.locator('input[placeholder*="7258"]').first().fill('7258');
    await page.getByTestId('health-insurance-input').fill('3900');
    await page.getByRole('button', { name: /Save answers/i }).first().click();
    await expect(page.getByText(/saved successfully/i).first()).toBeVisible({ timeout: 10000 });

    const calcRes = await fetch(`${BACKEND_URL}/tax-returns/${taxReturnId}/calculate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user.accessToken}` },
    });
    expect(calcRes.ok).toBe(true);

    // Step 5 in English
    await page.goto(`${FRONTEND_URL}/tax-returns/${taxReturnId}?step=review`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('so-viel-sparst-du-card')).toBeVisible({ timeout: 10000 });

    // Step 6 in English + English PDF Download (must send ?lang=en)
    await page.goto(`${FRONTEND_URL}/tax-returns/${taxReturnId}?step=submit`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Postal Filing Procedure (Official Swiss Method)')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('receipt-check-card')).toBeVisible();

    const [pdfRequest, pdfDownload] = await Promise.all([
      page.waitForRequest((req) => req.url().includes('/export/pdf') && req.url().includes('lang=en')),
      page.waitForEvent('download'),
      page.getByRole('button', { name: /Download official tax return PDF/i }).click(),
    ]);
    expect(pdfRequest.url()).toContain('lang=en');
    const enPdfPath = await pdfDownload.path();
    const enPdfBytes = fs.readFileSync(enPdfPath);
    expect(enPdfBytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(enPdfBytes.length).toBeGreaterThan(1024);

    await captureEvidence(page, 'sc14_02_complete_en_flow', 'Complete English ZH 2025 flow');
  });
});
