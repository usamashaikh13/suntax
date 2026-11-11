/**
 * Scenario 08: PDF and Data Exports
 * Tests official PDF generation & inspection (magic bytes %PDF-, size > 1KB,
 * entered data), eCH-0119 XML export evaluation, and cantonal direct submission
 * guard enforcing the official paper filing workflow.
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

test.describe('Scenario 08: PDF and Data Exports', () => {
  let user;
  let taxReturn;

  test.beforeAll(async () => {
    user = await createTestUser('export_user');
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
          first_name: 'Sabine',
          last_name: 'Muster',
          name: 'Sabine Muster',
          date_of_birth: '1988-06-15',
          ahv_number: '756.9217.0769.85',
          address_street: 'Bahnhofstrasse 12',
          address_zip: '8001',
          address_city: 'Zürich',
          marital_status: 'single',
          civil_status: 'ledig',
          postal_code: '8001',
          canton_code: 'ZH',
          confession: 'none',
        },
        income_data: {
          gross_salary: 102000,
          employment_income: 102000,
          net_salary: 89000,
        },
        deductions_data: {
          pillar3a_contributions: 7056,
          travel_expenses: 2100,
        },
      }),
    });

    // Run calculation
    await fetch(`${BACKEND_URL}/tax-returns/${taxReturn.id}/calculate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user.accessToken}` },
    });
  });

  test('8.1 PDF Export API: magic bytes %PDF-, size > 1KB, and content inspection', async () => {
    const res = await fetch(`${BACKEND_URL}/tax-returns/${taxReturn.id}/export/pdf`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user.accessToken}`,
      },
    });

    expect(res.ok).toBe(true);
    expect(res.headers.get('content-type')).toContain('application/pdf');

    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    // 1. Verify %PDF- magic bytes (0x25, 0x50, 0x44, 0x46, 0x2D)
    const header = String.fromCharCode(...bytes.slice(0, 5));
    expect(header).toBe('%PDF-');

    // 2. Verify file size > 1KB
    expect(bytes.length).toBeGreaterThan(1024);

    // 3. Inspect text content inside PDF streams
    const rawContent = new TextDecoder('latin1').decode(bytes);
    expect(rawContent).toContain('ZH');
    expect(rawContent).toContain('2025');
  });

  test('8.2 Browser UI PDF Download button and filing guide display', async ({ page, context }) => {
    await setAuthSession(context, user);
    await page.goto(`${FRONTEND_URL}/tax-returns/${taxReturn.id}?step=submit`);
    await page.waitForLoadState('networkidle');

    // Verify paper filing guide
    await expect(page.locator('text=Filing per Postversand (Offizielles Schweizer Verfahren)')).toBeVisible();
    await expect(page.locator('text=1. PDF herunterladen')).toBeVisible();
    await expect(page.locator('text=2. Unterschreiben')).toBeVisible();
    await expect(page.locator('text=3. Per Post absenden')).toBeVisible();

    // Verify PDF download button
    const pdfBtn = page.locator('button:has-text("Amtliche Steuererklärung als PDF herunterladen")');
    await expect(pdfBtn).toBeVisible();

    // Intercept download
    const downloadPromise = page.waitForEvent('download');
    await pdfBtn.click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toContain('Steuererklaerung.pdf');
    await captureEvidence(page, 'sc08_01_pdf_download_ui', 'PDF download button and filing guide');
  });

  test('8.3 eCH-0119 XML export verification: valid XML structure and official standard compliance', async () => {
    const res = await fetch(`${BACKEND_URL}/tax-returns/${taxReturn.id}/export/xml`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${user.accessToken}`,
      },
    });

    // Verification of fixed BUG-BE-02: Must succeed with HTTP 200 OK
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('xml');

    const xmlText = await res.text();

    // 1. Check valid XML prologue
    expect(xmlText).toContain('<?xml version="1.0"');

    // 2. Check official eCH-0119 namespace declaration
    expect(xmlText).toContain('http://www.ech.ch/xmlns/eCH-0119/4');

    // 3. Check header fields (tax period, canton, transaction)
    expect(xmlText).toContain('<taxPeriod>2025</taxPeriod>');
    expect(xmlText).toContain('<canton>ZH</canton>');
    expect(xmlText).toContain('<sourceDescription>SunTax 1.0</sourceDescription>');

    // 4. Check main form and taxpayer details from profile
    expect(xmlText).toContain('<mainForm>');
    expect(xmlText).toContain('<personDataPartner1>');
    expect(xmlText).toContain('<officialName>Muster</officialName>');
    expect(xmlText).toContain('<firstName>Sabine</firstName>');
  });

  test('8.4 Cantonal direct submission guard: Third-party electronic submission blocked', async ({ page, context }) => {
    await setAuthSession(context, user);
    await page.goto(`${FRONTEND_URL}/tax-returns/${taxReturn.id}?step=submit`);
    await page.waitForLoadState('networkidle');

    // Verify no fake simulated government submission button exists in redesign
    const fakeSubmitBtn = page.locator('button:has-text("Direkt ans Steueramt übermitteln")');
    await expect(fakeSubmitBtn).toHaveCount(0);

    // Verify explanation that electronic third-party filing is not yet open for private providers
    await expect(
      page.locator('text=Das elektronische Filing für Drittanbieter wird im Kanton Zürich aktuell schrittweise eingeführt')
    ).toBeVisible();

    await captureEvidence(page, 'sc08_02_cantonal_submission_blocked', 'No simulated direct filing controls');
  });
});
