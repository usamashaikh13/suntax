/**
 * Scenario 10: Responsive Layout, Visual Polish, Brand, and Accessibility
 * Tests desktop (1440x900), tablet (768x1024), and mobile (375x667) layouts,
 * absence of horizontal overflow, brand color #1E7B52, touch targets,
 * keyboard accessibility, and Swiss German "du" terminology.
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

test.describe('Scenario 10: Responsive Layout, Visual Polish, and Accessibility', () => {
  let user;
  let taxReturn;

  test.beforeAll(async () => {
    user = await createTestUser('a11y_responsive_user');
    taxReturn = await createTestTaxReturn(user.accessToken, 'ZH', 2025, '261', 'Zürich');
  });

  test('10.1 Multi-device responsive layout without horizontal overflow', async ({ page }) => {
    const viewports = [
      { name: 'Desktop (1440x900)', width: 1440, height: 900 },
      { name: 'Tablet (768x1024)', width: 768, height: 1024 },
      { name: 'Mobile (375x667)', width: 375, height: 667 },
    ];

    await setAuthSession(page, user.accessToken, user.id);

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${FRONTEND_URL}/tax-returns/${taxReturn.id}`);
      await page.waitForLoadState('networkidle');

      // Check that content does not horizontally overflow viewport
      const isOverflowing = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth + 5;
      });
      expect(isOverflowing).toBe(false);

      // Verify header and wizard steps container are visible
      const stepHeader = page.locator('nav, header, [role="navigation"]');
      await expect(stepHeader.first()).toBeVisible();

      await captureEvidence(page, `sc10_01_viewport_${vp.width}x${vp.height}`);
    }
  });

  test('10.2 Touch target sizes on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${FRONTEND_URL}/login`);
    await page.waitForLoadState('networkidle');

    // Primary CTA buttons and form controls should have height >= 40px
    const submitBtn = page.getByRole('button', { name: /Anmelden/i });
    await expect(submitBtn).toBeVisible();

    const box = await submitBtn.boundingBox();
    expect(box).not.toBeNull();
    expect(box.height).toBeGreaterThanOrEqual(40);
    expect(box.width).toBeGreaterThanOrEqual(100);

    const emailInput = page.locator('input[type="email"]');
    const emailBox = await emailInput.boundingBox();
    expect(emailBox).not.toBeNull();
    expect(emailBox.height).toBeGreaterThanOrEqual(38);

    await captureEvidence(page, 'sc10_02_mobile_touch_targets');
  });

  test('10.3 Brand theme and primary green #1E7B52 verification', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${FRONTEND_URL}/login`);
    await page.waitForLoadState('networkidle');

    const submitBtn = page.getByRole('button', { name: /Anmelden/i });
    const bgColor = await submitBtn.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });

    // #1E7B52 in RGB is rgb(30, 123, 82)
    // Accept rgb(30, 123, 82) or nearby dark green brand shades
    expect(bgColor).toMatch(/rgb\(30,\s*123,\s*82\)|#1E7B52/i);

    // Verify background is a clean light theme
    const bodyBg = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });
    // Should be light (white or near-white gray)
    expect(bodyBg).toMatch(/rgb\(255,\s*255,\s*255\)|rgb\(24\d,\s*24\d,\s*24\d\)/);

    await captureEvidence(page, 'sc10_03_brand_theme');
  });

  test('10.4 Swiss German copy and informal "du" tone verification', async ({ page }) => {
    await setAuthSession(page, user.accessToken, user.id);
    await page.goto(`${FRONTEND_URL}/tax-returns/${taxReturn.id}`);
    await page.waitForLoadState('networkidle');

    const pageText = await page.innerText('body');

    // Verify presence of Swiss tax terminology
    expect(pageText).toMatch(/Steuererklärung|Dokumente|Fragen|Übersicht|Berechnung/i);

    // Verify no untranslated mock phrases or placeholder gibberish
    expect(pageText).not.toContain('Lorem ipsum');
    expect(pageText).not.toContain('TODO:');
    expect(pageText).not.toContain('mock_data');

    // Verify informal German address ("dein", "deine", "du") instead of formal "Ihr", "Ihre"
    // Check wizard headings / descriptions
    const hasInformalTone = /dein|deine|du\b/i.test(pageText);
    expect(hasInformalTone).toBe(true);

    await captureEvidence(page, 'sc10_04_swiss_german_copy');
  });

  test('10.5 Keyboard navigation and focus accessibility', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/login`);
    await page.waitForLoadState('networkidle');

    // Tab to email field and type
    const emailInput = page.locator('input[type="email"]');
    await emailInput.focus();
    await page.keyboard.type('test@example.ch');

    // Tab from email goes to "Passwort vergessen?" link, then to password input
    await page.keyboard.press('Tab');
    const firstTabTag = await page.evaluate(() => document.activeElement?.tagName);
    expect(['A', 'INPUT']).toContain(firstTabTag);

    // Tab to password field
    await page.keyboard.press('Tab');
    const pwdFocused = await page.evaluate(() => {
      const active = document.activeElement;
      return active?.getAttribute('type') === 'password' || active?.name === 'password';
    });
    expect(pwdFocused).toBe(true);

    await captureEvidence(page, 'sc10_05_keyboard_focus');
  });
});
