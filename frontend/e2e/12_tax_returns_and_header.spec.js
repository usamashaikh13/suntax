const { test, expect } = require('@playwright/test');
const {
  FRONTEND_URL,
  BACKEND_URL,
  createTestUser,
  setAuthSession,
  createTestTaxReturn,
  captureEvidence,
} = require('./helpers');

test.describe('12: SunTax UI Redesign, Bilingual & Header Verification', () => {
  let user;

  test.beforeAll(async () => {
    user = await createTestUser('qa_ui');
  });

  test('Issue 4: document.documentElement.lang synchronizes on mount and on language toggle', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/login`);

    // Verify initial default language is de-CH
    const initialLang = await page.evaluate(() => document.documentElement.lang);
    expect(initialLang).toBe('de-CH');

    // Switch to English using exact button
    const enBtn = page.getByRole('button', { name: 'EN', exact: true });
    await enBtn.click();
    await page.waitForTimeout(300);

    const enLang = await page.evaluate(() => document.documentElement.lang);
    expect(enLang).toBe('en');

    const storedLang = await page.evaluate(() => localStorage.getItem('suntax_language_preference'));
    expect(storedLang).toBe('en');

    // Reload page to verify document.documentElement.lang synchronizes on initial mount from localStorage
    await page.reload();
    await page.waitForTimeout(300);

    const reloadedLang = await page.evaluate(() => document.documentElement.lang);
    expect(reloadedLang).toBe('en');

    // Switch back to German
    const deBtn = page.getByRole('button', { name: 'DE', exact: true });
    await deBtn.click();
    await page.waitForTimeout(300);

    const deLang = await page.evaluate(() => document.documentElement.lang);
    expect(deLang).toBe('de-CH');

    await captureEvidence(page, 'sc12_01_lang_sync', 'HTML document.documentElement.lang synchronization');
  });

  test('Issue 3: Shared header responsiveness at 1440, 1024, 768, and 375px without overflow', async ({ page, context }) => {
    await setAuthSession(context, user);

    // 1. Desktop 1440x900
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${FRONTEND_URL}/dashboard`);
    await page.waitForLoadState('networkidle');

    const header = page.locator('header').first();
    const box1440 = await header.boundingBox();
    expect(box1440.height).toBeLessThanOrEqual(65);

    // Verify desktop elements
    await expect(page.locator('nav[aria-label="Main Navigation"]')).toBeVisible();
    await expect(page.getByText('Daten in der Schweiz')).toBeVisible();
    const flatFeeBadge = page.getByText('Pauschalpreis CHF 39');
    await expect(flatFeeBadge).toBeVisible();

    // Verify whitespace-nowrap on fee badge
    const isNowrap = await flatFeeBadge.evaluate((el) => window.getComputedStyle(el).whiteSpace);
    expect(isNowrap).toBe('nowrap');

    await captureEvidence(page, 'sc12_02_header_1440', 'Shared dashboard header at 1440x900');

    // 2. Compact Desktop / Large Tablet: 1024x768
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForTimeout(300);
    const box1024 = await header.boundingBox();
    expect(box1024.height).toBeLessThanOrEqual(65);
    await expect(page.locator('nav[aria-label="Main Navigation"]')).toBeVisible();

    await captureEvidence(page, 'sc12_03_header_1024', 'Shared dashboard header at 1024x768');

    // 3. Tablet Portrait: 768x1024 (md breakpoint where overflow previously occurred)
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(300);
    const box768 = await header.boundingBox();
    // Verify header does NOT wrap or exceed 65px
    expect(box768.height).toBeLessThanOrEqual(65);

    // Desktop nav links should be hidden
    await expect(page.locator('nav[aria-label="Main Navigation"]')).toBeHidden();

    // Hamburger button should be visible with aria-expanded=false
    const hamburgerBtn = page.locator('button[aria-controls="mobile-nav-menu"]');
    await expect(hamburgerBtn).toBeVisible();
    expect(await hamburgerBtn.getAttribute('aria-expanded')).toBe('false');

    // Click hamburger to open accessible menu
    await hamburgerBtn.click();
    await page.waitForTimeout(200);
    expect(await hamburgerBtn.getAttribute('aria-expanded')).toBe('true');
    await expect(page.locator('#mobile-nav-menu')).toBeVisible();

    // Press Escape to close menu
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    expect(await hamburgerBtn.getAttribute('aria-expanded')).toBe('false');
    await expect(page.locator('#mobile-nav-menu')).toBeHidden();

    await captureEvidence(page, 'sc12_04_header_768', 'Accessible mobile menu at 768px');

    // 4. Mobile: 375x812
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(300);
    const box375 = await header.boundingBox();
    expect(box375.height).toBeLessThanOrEqual(65);
    await expect(hamburgerBtn).toBeVisible();

    await captureEvidence(page, 'sc12_05_header_375', 'Mobile header at 375px');

    // Reset viewport
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('Issue 3: No duplicate "New Return" CTA in header when on /tax-returns', async ({ page, context }) => {
    await setAuthSession(context, user);
    await page.setViewportSize({ width: 1440, height: 900 });

    // On /dashboard: Header should render the "+ Neue Erklärung" action
    await page.goto(`${FRONTEND_URL}/dashboard`);
    await page.waitForLoadState('networkidle');
    const headerNewBtnDashboard = page.locator('header a[href="/tax-returns/new"]');
    await expect(headerNewBtnDashboard).toBeVisible();

    // On /tax-returns: Header should NOT render duplicate action because page has prominent CTA
    await page.goto(`${FRONTEND_URL}/tax-returns`);
    await page.waitForLoadState('networkidle');
    const headerNewBtnReturns = page.locator('header a[href="/tax-returns/new"]');
    await expect(headerNewBtnReturns).toBeHidden();

    // Page body should render the primary CTA link
    const pagePrimaryCTA = page.locator('main a[href="/tax-returns/new"]').first();
    await expect(pagePrimaryCTA).toBeVisible();

    await captureEvidence(page, 'sc12_06_no_duplicate_cta', 'No duplicate New Return CTA on /tax-returns');
  });

  test('Issue 1 & 2: Tax-returns list bilingual toggle, status mapping and delete dialog', async ({ page, context }) => {
    await setAuthSession(context, user);
    await page.setViewportSize({ width: 1440, height: 900 });

    // Seed test returns with different cantons
    await createTestTaxReturn(user.accessToken, 'ZH', 2025, '261', 'Zürich');
    await createTestTaxReturn(user.accessToken, 'VD', 2026, '5586', 'Lausanne');

    await page.goto(`${FRONTEND_URL}/tax-returns`);
    await page.waitForLoadState('networkidle');

    // ── GERMAN MODE ──
    const deBtn = page.getByRole('button', { name: 'DE', exact: true });
    await deBtn.click();
    await page.waitForTimeout(300);

    // Verify German Headings & Subtitles
    await expect(page.getByRole('heading', { name: 'Meine Steuererklärungen' })).toBeVisible();
    await expect(page.getByText('Verwalte deine Steuererklärungen für alle 26 Schweizer Kantone.')).toBeVisible();

    // Verify German Filter Pills
    await expect(page.getByRole('button', { name: /^Alle/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entwürfe' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'In Bearbeitung' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bestätigt' })).toBeVisible();

    // Verify Search input placeholder in German
    const searchInput = page.getByPlaceholder('Nach Kanton oder Gemeinde suchen...');
    await expect(searchInput).toBeVisible();

    // Verify German Canton Names
    await expect(page.getByText('Zürich – Zürich')).toBeVisible();
    await expect(page.getByText('Waadt – Lausanne')).toBeVisible();

    // Verify BFS label in German
    await expect(page.getByText(/BFS-Gemeindenummer: #261/)).toBeVisible();

    // Status label in German
    await expect(page.locator('span:text("Entwurf")').first()).toBeVisible();

    await captureEvidence(page, 'sc12_07_returns_de', 'Tax returns list in German');

    // ── ENGLISH MODE ──
    const enBtn = page.getByRole('button', { name: 'EN', exact: true });
    await enBtn.click();
    await page.waitForTimeout(300);

    // Verify English Headings & Subtitles
    await expect(page.getByRole('heading', { name: 'My Tax Declarations' })).toBeVisible();
    await expect(page.getByText('Manage your tax declarations across all 26 Swiss cantons.')).toBeVisible();

    // Verify English Filter Pills
    await expect(page.getByRole('button', { name: /^All/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Drafts' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'In Progress' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirmed' })).toBeVisible();

    // Verify Search input placeholder in English
    const enSearchInput = page.getByPlaceholder('Search by canton or municipality...');
    await expect(enSearchInput).toBeVisible();

    // Verify English Canton Names
    await expect(page.getByText('Zurich – Zürich')).toBeVisible();
    await expect(page.getByText('Vaud – Lausanne')).toBeVisible();

    // Verify BFS label in English
    await expect(page.getByText(/BFS Municipality No\.: #261/)).toBeVisible();

    // Status label in English
    await expect(page.locator('span:text("Draft")').first()).toBeVisible();

    await captureEvidence(page, 'sc12_08_returns_en', 'Tax returns list in English');

    // ── SEARCH PERSISTENCE & CANTON QUERY ──
    await enSearchInput.fill('Vaud');
    await page.waitForTimeout(200);
    await expect(page.getByText('Vaud – Lausanne')).toBeVisible();
    await expect(page.getByText('Zurich – Zürich')).toBeHidden();

    // Switch language to German while search is active: search query should persist
    await deBtn.click();
    await page.waitForTimeout(300);
    expect(await page.locator('input[type="text"]').inputValue()).toBe('Vaud');
    await page.locator('input[type="text"]').fill('');

    // ── INLINE ACCESSIBLE DELETE CONFIRMATION DIALOG ──
    const deleteBtn = page.locator('button[aria-label="Steuererklärung löschen"]').first();
    await deleteBtn.click();

    // Dialog should open
    const deleteDialog = page.locator('div[role="dialog"]');
    await expect(deleteDialog).toBeVisible();
    await expect(deleteDialog.getByRole('button', { name: 'Löschen' })).toBeVisible();

    // Click cancel
    const cancelBtn = deleteDialog.getByRole('button', { name: 'Abbrechen' });
    await cancelBtn.click();
    await expect(deleteDialog).toBeHidden();

    await captureEvidence(page, 'sc12_09_delete_dialog', 'Accessible inline delete confirmation dialog');
  });

  test('Issue 2: Status label "Exported (PDF ready)" without misleading "Filed" claim', async ({ page, context }) => {
    await setAuthSession(context, user);
    await page.goto(`${FRONTEND_URL}/tax-returns`);
    await page.waitForLoadState('networkidle');

    // Assert that the string "Exported & Filed" is NEVER present on page
    const pageText = await page.textContent('body');
    expect(pageText).not.toContain('Exported & Filed');
    expect(pageText).not.toContain('Exportiert & Eingereicht');
  });

  test('Issue 5: Bilingual verification of Dashboard, Documents, Profile and Auth', async ({ page, context }) => {
    await setAuthSession(context, user);
    await page.setViewportSize({ width: 1440, height: 900 });

    // 1. Dashboard Bilingual Check
    await page.goto(`${FRONTEND_URL}/dashboard`);
    await page.waitForLoadState('networkidle');

    // Switch to English
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await page.waitForTimeout(300);

    // Verify English Next Best Action & Telemetry Cards
    await expect(page.getByText('Recommended Next Step')).toBeVisible();
    await expect(page.getByText('Documents Uploaded')).toBeVisible();
    await expect(page.getByText('Needs Review')).toBeVisible();
    await expect(page.getByText('Completeness')).toBeVisible();
    await expect(page.getByText('Swiss Cantonal Tax Deadline Reminder')).toBeVisible();

    // Verify Swiss Tax Tools Hub tabs
    await expect(page.getByRole('button', { name: 'Commute' })).toBeVisible();

    await captureEvidence(page, 'sc12_10_dashboard_en', 'Dashboard in English');

    // 2. Documents Vault Bilingual Check
    await page.goto(`${FRONTEND_URL}/documents`);
    await page.waitForLoadState('networkidle');

    // English verification
    await expect(page.getByText('Document Treasury')).toBeVisible();
    await expect(page.getByText('Automated Document OCR')).toBeVisible();
    await expect(page.getByText('AES-256 Encrypted')).toBeVisible();
    await expect(page.getByText('Total Tax Documents')).toBeVisible();
    await expect(page.getByText('Swiss nDSG Compliant')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload Documents' })).toBeVisible();

    await captureEvidence(page, 'sc12_11_documents_en', 'Document vault in English');

    // Switch to German
    await page.getByRole('button', { name: 'DE', exact: true }).click();
    await page.waitForTimeout(300);

    // German verification
    await expect(page.getByText('Dokumenten-Tresor')).toBeVisible();
    await expect(page.getByText('Automatisierte Beleg-Erkennung (OCR)')).toBeVisible();
    await expect(page.getByText('AES-256 verschlüsselt')).toBeVisible();
    await expect(page.getByText('Steuerdokumente gesamt')).toBeVisible();

    await captureEvidence(page, 'sc12_12_documents_de', 'Document vault in German');

    // 3. Profile Bilingual Check
    await page.goto(`${FRONTEND_URL}/profile`);
    await page.waitForLoadState('networkidle');

    // German verification
    await expect(page.locator('h2:has-text("Mein Profil")')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Persönliche Daten' })).toBeVisible();
    await expect(page.getByText('Passwort ändern')).toBeVisible();
    await expect(page.getByText('Zwei-Faktor-Authentifizierung (2FA)')).toBeVisible();
    await expect(page.getByText('Schweizer nDSG garantiert')).toBeVisible();

    await captureEvidence(page, 'sc12_13_profile_de', 'Profile page in German');

    // Switch to English
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await page.waitForTimeout(300);

    // English verification
    await expect(page.locator('h2:has-text("My Profile")')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Personal Details' })).toBeVisible();
    await expect(page.getByText('Change Password')).toBeVisible();
    await expect(page.getByText('Two-Factor Authentication (2FA)')).toBeVisible();
    await expect(page.getByText('Swiss FDPIC/nDSG Guaranteed')).toBeVisible();

    await captureEvidence(page, 'sc12_14_profile_en', 'Profile page in English');

    // 4. Forgot-Password Bilingual Check
    await page.goto(`${FRONTEND_URL}/forgot-password`);
    await page.waitForLoadState('networkidle');

    // English
    await expect(page.getByText('Reset Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send Link' })).toBeVisible();

    // Switch to German
    await page.getByRole('button', { name: 'DE', exact: true }).click();
    await page.waitForTimeout(300);
    await expect(page.getByText('Passwort zurücksetzen')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Link senden' })).toBeVisible();

    await captureEvidence(page, 'sc12_15_forgot_pw_de', 'Forgot password page in German');
  });
});
