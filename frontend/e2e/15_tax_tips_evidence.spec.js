const { test, expect } = require('@playwright/test');
const {
  BACKEND_URL,
  FRONTEND_URL,
  createTestUser,
  setAuthSession,
} = require('./helpers');

test.describe('Scenario 15: Addendum 1 Tax Tips Integration', () => {
  test('15.1 Verify client tax tips and warnings displayed in LiveTaxCounter and review UI', async ({ page, context }) => {
    const user = await createTestUser('e2e_tax_tips');
    await setAuthSession(context, user);

    // Create a 2026 ZH tax return
    const createRes = await fetch(`${BACKEND_URL}/tax-returns`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.accessToken}`,
      },
      body: JSON.stringify({
        tax_year: 2026,
        canton_code: 'ZH',
        municipality_code: '247',
        municipality_name: 'Schlieren',
      }),
    });
    expect(createRes.ok).toBe(true);
    const returnData = await createRes.json();
    const returnId = returnData.id;

    // Seed profile with income and deductions
    await fetch(`${BACKEND_URL}/tax-returns/${returnId}/profile`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${user.accessToken}`,
      },
      body: JSON.stringify({
        first_name: 'Max',
        last_name: 'Muster',
        civil_status: 'single',
        income: {
          salary_primary: 90000,
        },
        deductions: {
          pillar_3a: 4000,
          health_insurance: 3000,
          work_expenses: 2500,
        },
      }),
    });

    // Run calculation
    const calcRes = await fetch(`${BACKEND_URL}/tax-returns/${returnId}/calculate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user.accessToken}` },
    });
    expect(calcRes.ok).toBe(true);

    // Verify tax tips API directly
    const tipsRes = await fetch(`${BACKEND_URL}/tax-returns/${returnId}/tax-tips?lang=de`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    });
    expect(tipsRes.ok).toBe(true);
    const tipsData = await tipsRes.json();
    expect(tipsData.tips.length).toBeLessThanOrEqual(3);
    expect(tipsData.tips.some(t => t.id === 'pillar3a_late_payment')).toBe(false);
    expect(tipsData.tips.some(t => t.id === 'property_maintenance')).toBe(false);

    // Navigate to tax return in UI
    await page.goto(`${FRONTEND_URL}/tax-returns/${returnId}?step=review`);
    await page.waitForLoadState('networkidle');

    // Verify LiveTaxCounter displays the tips
    const tipsContainer = page.locator('text=Tipps für dich');
    await expect(tipsContainer).toBeVisible({ timeout: 10000 });

    // Ensure approximate wording is present
    await expect(page.locator('text=/ca\\. CHF|bis zu CHF/i').first()).toBeVisible();

    // Capture screenshot evidence for report
    const screenshotPath = '/Users/osamashaikh/.gemini/antigravity/brain/b9c7cd63-97a4-416c-af83-0fa8d84d8782/e2e_evidence/sc15_01_tax_tips_live.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });
});
