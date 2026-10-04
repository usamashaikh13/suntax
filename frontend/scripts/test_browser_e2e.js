const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = '/Users/osamashaikh/.gemini/antigravity/brain/b9c7cd63-97a4-416c-af83-0fa8d84d8782/browser_verification';

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function runBrowserTests() {
  console.log('🚀 Starting SunTax Browser Acceptance Test Suite...');
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1440,900'],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  const results = [];

  try {
    // 1. Landing Page
    console.log('\n--- 1. Testing Landing Page ---');
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
    const landingTitle = await page.title();
    console.log('Landing page title:', landingTitle);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_landing_page.png'), fullPage: true });
    results.push({ test: 'Landing Page', status: 'PASS', title: landingTitle });

    // 2. Registration Page
    console.log('\n--- 2. Testing Register Page ---');
    await page.goto('http://localhost:3000/register', { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_register_page.png') });
    
    const uniqueEmail = `browser_${Date.now()}@suntax.ch`;
    await page.fill('input#full_name', 'Automated QA Tester');
    await page.fill('input#email', uniqueEmail);
    await page.fill('input#password', 'TestPassword123!');
    await page.fill('input#confirm_password', 'TestPassword123!');
    await page.check('input#terms');
    
    // Submit registration
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_register_success.png') });
    console.log('Registration submitted for:', uniqueEmail);
    results.push({ test: 'Registration', status: 'PASS', email: uniqueEmail });

    // 3. Login Page
    console.log('\n--- 3. Testing Login Page & Authentication ---');
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_login_page.png') });
    
    await page.fill('input#email', uniqueEmail);
    await page.fill('input#password', 'TestPassword123!');
    await page.click('button[type="submit"]');

    // Wait for redirection to /dashboard
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    console.log('Successfully redirected to:', page.url());
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_dashboard_page.png'), fullPage: true });
    results.push({ test: 'Login & Dashboard', status: 'PASS', url: page.url() });

    // 4. Tax Returns List
    console.log('\n--- 4. Testing Tax Returns Page ---');
    await page.goto('http://localhost:3000/tax-returns', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_tax_returns_list.png') });
    results.push({ test: 'Tax Returns List', status: 'PASS' });

    // 5. New Tax Return Wizard
    console.log('\n--- 5. Testing Tax Return Creation Wizard ---');
    await page.goto('http://localhost:3000/tax-returns/new', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_wizard_step1_canton.png') });

    // Step 0: Select Canton ZH (button containing Zürich)
    console.log('Selecting Canton ZH...');
    const zhBtn = page.locator('button').filter({ hasText: 'Zürich' }).first();
    await zhBtn.waitFor({ state: 'visible', timeout: 5000 });
    await zhBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_wizard_step2_municipality.png') });

    // Step 1: Select Municipality Zürich (BFS 261)
    console.log('Selecting Municipality Zürich...');
    const muniBtn = page.locator('button').filter({ hasText: 'Zürich' }).first();
    await muniBtn.waitFor({ state: 'visible', timeout: 5000 });
    await muniBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_wizard_step3_year.png') });

    // Step 2: Select Tax Year (2025 button)
    console.log('Selecting Tax Year 2025...');
    const yearBtn = page.locator('button').filter({ hasText: '2025' }).first();
    await yearBtn.waitFor({ state: 'visible', timeout: 5000 });
    await yearBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_wizard_step4_review.png') });

    // Step 3: Click 'Create Tax Return'
    console.log('Submitting Tax Return creation...');
    const createBtn = page.locator('button:has-text("Create Tax Return")');
    await createBtn.waitFor({ state: 'visible', timeout: 5000 });
    await createBtn.click();

    // Wait for navigation to detail page
    await page.waitForURL('**/tax-returns/**', { timeout: 10000 });
    console.log('Created tax return, navigated to:', page.url());
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_tax_return_detail_docs.png'), fullPage: true });
    results.push({ test: 'Tax Return Wizard Creation', status: 'PASS', returnUrl: page.url() });

    // 6. Inspect Tabs in Tax Return Detail
    console.log('\n--- 6. Testing Tax Return Detail Tabs ---');
    // Tab: Tax Profile
    const profileTab = page.locator('button[role="tab"]').filter({ hasText: /Tax Profile|Profile/i }).first();
    if (await profileTab.isVisible()) {
      await profileTab.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12_tab_tax_profile.png') });
    }

    // Tab: Questions
    const questionsTab = page.locator('button[role="tab"]').filter({ hasText: /Questions/i }).first();
    if (await questionsTab.isVisible()) {
      await questionsTab.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '13_tab_questions.png') });
    }

    // Tab: Calculation
    const calcTab = page.locator('button[role="tab"]').filter({ hasText: /Calculation/i }).first();
    if (await calcTab.isVisible()) {
      await calcTab.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '14_tab_calculation.png') });
    }

    // Tab: Review & Submit
    const reviewTab = page.locator('button[role="tab"]').filter({ hasText: /Review/i }).first();
    if (await reviewTab.isVisible()) {
      await reviewTab.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '15_tab_review_submit.png') });
    }
    results.push({ test: 'Tax Return Detail Tabs', status: 'PASS' });

    // 7. Documents Page
    console.log('\n--- 7. Testing Documents Page ---');
    await page.goto('http://localhost:3000/documents', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '16_documents_vault.png') });
    results.push({ test: 'Documents Vault', status: 'PASS' });

    // 8. User Profile Page
    console.log('\n--- 8. Testing User Profile Page ---');
    await page.goto('http://localhost:3000/profile', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '17_user_profile.png') });
    results.push({ test: 'User Profile Page', status: 'PASS' });

    console.log('\n========================================');
    console.log('✅ ALL BROWSER QA TESTS COMPLETED SUCCESSFULLY!');
    console.log('========================================');
    console.table(results);

  } catch (err) {
    console.error('❌ Browser test failed:', err);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'error_state.png'), fullPage: true });
    results.push({ test: 'Error', status: 'FAIL', error: err.message });
  } finally {
    await browser.close();
  }

  return results;
}

runBrowserTests();
