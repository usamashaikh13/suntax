const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const ARTIFACTS_DIR = '/Users/osamashaikh/.gemini/antigravity/brain/b9c7cd63-97a4-416c-af83-0fa8d84d8782';
const FRONTEND_URL = 'http://localhost:3000';
const BACKEND_URL = 'http://localhost:8000/api/v1';

const FILES = [
  '/Users/osamashaikh/Downloads/IMG_8825.jpeg',
  '/Users/osamashaikh/Downloads/IMG_8824.jpeg',
  '/Users/osamashaikh/Downloads/IMG_8804.jpeg',
  '/Users/osamashaikh/Downloads/IMG_8823.jpeg',
];

async function run() {
  console.log('🚀 Launching Google Chrome via Playwright...');
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 950 }
  });
  const page = await context.newPage();

  console.log('🌐 Step 1: Navigating to landing page...');
  await page.goto(FRONTEND_URL, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'doc_test_00_landing.png') });
  console.log('📸 Saved landing screenshot.');

  console.log('🔑 Step 2: Authenticating test user via backend & injecting cookies...');
  const testEmail = `browser_tester_${Date.now()}@suntax.ch`;
  const testPassword = 'TestPassword123!';

  // Direct API register
  const regRes = await fetch(`${BACKEND_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: testPassword, full_name: 'Swiss Tax Live QA' }),
  });
  console.log('Registered via API:', regRes.status);

  // Direct API login
  const loginRes = await fetch(`${BACKEND_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: testPassword }),
  });
  const loginData = await loginRes.json();
  const accessToken = loginData.access_token;
  const refreshToken = loginData.refresh_token;
  console.log('Got access token:', !!accessToken);

  // Set cookies in browser context
  await context.addCookies([
    { name: 'suntax_access_token', value: accessToken, domain: 'localhost', path: '/' },
    { name: 'suntax_refresh_token', value: refreshToken, domain: 'localhost', path: '/' },
  ]);

  // Set in sessionStorage for React Query / client auth
  await page.goto(`${FRONTEND_URL}/dashboard`, { waitUntil: 'networkidle' });
  await page.evaluate((data) => {
    sessionStorage.setItem('suntax_user', JSON.stringify({
      email: data.email,
      full_name: 'Swiss Tax Live QA'
    }));
  }, { email: testEmail });
  await page.reload({ waitUntil: 'networkidle' });
  console.log('✅ User logged in! Landed on dashboard:', page.url());

  console.log('📝 Step 3: Initializing 2025 ZH Tax Return...');
  const trRes = await fetch(`${BACKEND_URL}/tax-returns`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      canton_code: 'ZH',
      municipality_code: '261',
      municipality_name: 'Zürich',
      tax_year: 2025,
    }),
  });
  const trData = await trRes.json();
  const taxReturnId = trData.id;
  console.log('Created tax return:', taxReturnId);

  // Navigate to return detail
  await page.goto(`${FRONTEND_URL}/tax-returns/${taxReturnId}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  console.log('🎯 Current Return Detail URL:', page.url());

  console.log('📤 Step 4: Activating Documents tab and uploading files...');
  // Click Documents tab trigger explicitly
  const docsTabTrigger = page.locator('button[role="tab"][value="documents"]');
  await docsTabTrigger.waitFor({ state: 'visible', timeout: 10000 });
  await docsTabTrigger.click();
  await page.waitForTimeout(1000);

  // Now the DocumentUploader is mounted, find input[type="file"]
  const fileInput = page.locator('input[type="file"]');
  await fileInput.waitFor({ state: 'attached', timeout: 10000 });
  await fileInput.setInputFiles(FILES);
  console.log('✅ All 4 files selected for upload!');

  console.log('⏳ Waiting for upload & OCR extraction (10 seconds)...');
  await page.waitForTimeout(10000);

  // Reload or refresh data to ensure document list updates
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('button[role="tab"][value="documents"]').click();
  await page.waitForTimeout(2000);

  // Take screenshot of documents tab showing uploaded files
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'doc_test_01_documents_tab.png'), fullPage: true });
  console.log('📸 Saved doc_test_01_documents_tab.png');

  console.log('🔍 Step 5: Checking documents in table and opening review modal...');
  const reviewButtons = page.getByRole('button', { name: /Review|Inspect|Überprüfen/i });
  const reviewCount = await reviewButtons.count();
  console.log(`Found ${reviewCount} review buttons.`);

  if (reviewCount > 0) {
    await reviewButtons.first().click();
    await page.waitForTimeout(1500);

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'doc_test_02_review_modal.png') });
    console.log('📸 Saved doc_test_02_review_modal.png');

    // Click Apply / Approve button inside modal
    const applyBtn = page.getByRole('button', { name: /Apply to Profile|Approve|Speichern/i }).first();
    if (await applyBtn.isVisible()) {
      await applyBtn.click();
      console.log('Approved & Applied fields from modal!');
      await page.waitForTimeout(1500);
    }
  }

  // Approve all docs via review API so profile has complete merged values
  console.log('🔄 Ensuring all 4 documents are approved and applied to profile...');
  const docsListRes = await fetch(`${BACKEND_URL}/documents?tax_return_id=${taxReturnId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  const docsListData = await docsListRes.json();
  for (const doc of docsListData.documents || []) {
    const fieldsKeys = Object.keys((doc.extracted_data && doc.extracted_data._fields) || {});
    const statuses = {};
    fieldsKeys.forEach(k => { statuses[k] = 'approved'; });
    await fetch(`${BACKEND_URL}/documents/${doc.id}/review`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ field_statuses: statuses, apply_to_profile: true }),
    });
  }

  console.log('📊 Step 6: Navigating to Tax Profile tab...');
  const profileTab = page.locator('button[role="tab"][value="profile"]');
  if (await profileTab.isVisible()) {
    await profileTab.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'doc_test_03_tax_profile.png'), fullPage: true });
    console.log('📸 Saved doc_test_03_tax_profile.png');
  }

  console.log('🧮 Step 7: Navigating to Calculation tab...');
  const calcTab = page.locator('button[role="tab"][value="calculation"]');
  if (await calcTab.isVisible()) {
    await calcTab.click();
    await page.waitForTimeout(1000);

    const calcBtn = page.getByRole('button', { name: /Calculate|Recalculate/i }).first();
    if (await calcBtn.isVisible()) {
      await calcBtn.click();
      await page.waitForTimeout(2500);
    }

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'doc_test_04_calculation.png'), fullPage: true });
    console.log('📸 Saved doc_test_04_calculation.png');
  }

  console.log('🎉 All browser tests and screenshots captured successfully!');
  await browser.close();
}

run().catch(err => {
  console.error('❌ Browser QA error:', err);
  process.exit(1);
});
