const { test, expect } = require('@playwright/test');
const {
  createTestUser,
  setAuthSession,
  captureEvidence,
  FRONTEND_URL,
  createTestTaxReturn,
} = require('./helpers');

test.describe('Scenario 11: Language Toggle & Bilingual Verification (DE / EN)', () => {
  test('11.1 Landing page toggles cleanly between German and English', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/`);
    await page.waitForLoadState('networkidle');

    // Default language is German (Swiss German)
    const heroTitle = page.locator('h1').first();
    await expect(heroTitle).toBeVisible();
    const deHeroText = await heroTitle.innerText();
    expect(deHeroText).toContain('Steuererklärung');

    // Verify German trust badges & deduction preview
    await expect(page.locator('text=Was gilt in deinem Kanton?').first()).toBeVisible();
    await expect(page.locator('text=CHF 39').first()).toBeVisible();

    // Capture German landing screenshot
    await captureEvidence(page, 'sc11_01_landing_de', 'Landing page in default Swiss German');

    // Toggle to English via LanguageSwitcher pill
    const enButton = page.locator('button:has-text("EN")').first();
    await expect(enButton).toBeVisible();
    await enButton.click();

    // Verify immediate switch to English without full page reload
    await expect(page.locator('h1').first()).toContainText('Tax Return');
    await expect(page.locator('text=What applies in your canton?').first()).toBeVisible();
    await expect(page.locator('text=Flat fee CHF 39').first()).toBeVisible();
    await expect(page.locator('text=All 26 cantons').first()).toBeVisible();

    // Capture English landing screenshot
    await captureEvidence(page, 'sc11_02_landing_en', 'Landing page after switching to English');

    // Check persistence: reload page and verify English remains active
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1').first()).toContainText('Tax Return');
    await expect(page.locator('text=What applies in your canton?').first()).toBeVisible();

    // Toggle back to German
    const deButton = page.locator('button:has-text("DE")').first();
    await deButton.click();
    await expect(page.locator('h1').first()).toContainText('Steuererklärung');
    await expect(page.locator('text=Was gilt in deinem Kanton?').first()).toBeVisible();
  });

  test('11.2 Auth pages (Login & Register) support bilingual copy and preserve typed inputs', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/login`);
    await page.waitForLoadState('networkidle');

    // Verify initial German login form
    await expect(page.locator('text=Anmelden').first()).toBeVisible();
    await expect(page.locator('text=Registrieren').first()).toBeVisible();

    // Type input values into form fields
    const emailField = page.locator('input[type="email"]').first();
    await emailField.fill('test_input_preserve@suntax-synthetic.ch');

    // Toggle language to English
    const enButton = page.locator('button:has-text("EN")').first();
    await enButton.click();

    // Verify English tabs and buttons
    await expect(page.locator('text=Log In').first()).toBeVisible();
    await expect(page.locator('text=Sign Up').first()).toBeVisible();

    // Verify typed input was preserved!
    await expect(emailField).toHaveValue('test_input_preserve@suntax-synthetic.ch');

    // Capture English login screen
    await captureEvidence(page, 'sc11_03_login_en', 'Login screen in English with preserved form input');

    // Toggle back to German
    const deButton = page.locator('button:has-text("DE")').first();
    await deButton.click();
    await expect(emailField).toHaveValue('test_input_preserve@suntax-synthetic.ch');
  });

  test('11.3 Customer Journey (6 Steps) toggles seamlessly and preserves draft state', async ({ page, context }) => {
    // Create an authenticated test user and tax return
    const user = await createTestUser('lang_tester');
    await setAuthSession(context, user);

    const taxReturn = await createTestTaxReturn(user.accessToken, 'ZH', 2025, '261', 'Zürich');

    // Navigate to customer journey wizard
    await page.goto(`${FRONTEND_URL}/tax-returns/${taxReturn.id}`);
    await page.waitForLoadState('networkidle');

    // Step 1: Start (DE default)
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.locator('h1').first()).toContainText('Kurz zu dir');

    // Verify horizontal 6-step progress labels in German
    await expect(page.locator('button:has-text("Start")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Dokumente")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Fragen")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Ergänzen")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Kontrolle")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Einreichen")').first()).toBeVisible();

    // Verify Zwischenstand card in German
    await expect(page.locator('text=Zwischenstand').first()).toBeVisible();

    // Fill in a test postal code in Step 1
    const plzInput = page.locator('input[placeholder*="8001"], input[placeholder*="8400"]').first();
    if (await plzInput.isVisible()) {
      await plzInput.fill('8001');
    }

    // Capture German Step 1
    await captureEvidence(page, 'sc11_04_step1_de', 'Step 1 in Swiss German');

    // Toggle language to English
    const enButton = page.locator('button:has-text("EN")').first();
    await enButton.click();

    // Verify Step 1 in English
    await expect(page.locator('h1').first()).toContainText('About you');
    await expect(page.locator('button:has-text("Documents")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Questions")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Complete")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Review")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Submit")').first()).toBeVisible();
    await expect(page.locator('text=Live Summary').first()).toBeVisible();

    // Verify PLZ input preserved
    if (await plzInput.isVisible()) {
      await expect(plzInput).toHaveValue('8001');
    }

    // Capture English Step 1
    await captureEvidence(page, 'sc11_05_step1_en', 'Step 1 in English with preserved inputs');

    // Navigate to Step 3 (Questions)
    const questionsNav = page.locator('button:has-text("Questions")').first();
    await questionsNav.click();
    await page.waitForTimeout(500);

    // Verify Step 3 in English
    await expect(page.locator('h1').first()).toContainText('questions');
    await expect(page.locator('text=How do you commute to work?').first()).toBeVisible();
    await expect(page.locator('text=Public Transit').first()).toBeVisible();

    // Capture English Step 3
    await captureEvidence(page, 'sc11_06_step3_en', 'Step 3 in English');

    // Toggle back to German on Step 3
    const deButton = page.locator('button:has-text("DE")').first();
    await deButton.click();
    await expect(page.locator('h1').first()).toContainText('Fragen');
    await expect(page.locator('text=Wie kommst du zur Arbeit?').first()).toBeVisible();

    // Capture German Step 3
    await captureEvidence(page, 'sc11_07_step3_de', 'Step 3 in Swiss German');
  });

  test('11.4 Partner confirmation page toggles between German and English', async ({ page }) => {
    // Navigate with a dummy or unconfirmed token
    await page.goto(`${FRONTEND_URL}/partner-confirm?token=sample_token_test`);
    await page.waitForLoadState('networkidle');

    // Verify language switcher is present in header
    const langSwitcher = page.locator('button:has-text("EN")').first();
    await expect(langSwitcher).toBeVisible();

    // Switch to English
    await langSwitcher.click();
    await expect(page.locator('text=Official Spouse Confirmation').first()).toBeVisible();

    // Capture English Partner Confirmation
    await captureEvidence(page, 'sc11_08_partner_en', 'Partner confirmation page in English');

    // Switch back to German
    const deButton = page.locator('button:has-text("DE")').first();
    await deButton.click();
    await expect(page.locator('text=Offizielle Partner-Bestätigung').first()).toBeVisible();

    // Capture German Partner Confirmation
    await captureEvidence(page, 'sc11_09_partner_de', 'Partner confirmation page in German');
  });
});
