const { chromium } = require('/Users/osamashaikh/.gemini/antigravity/scratch/suntax/frontend/node_modules/playwright');
const path = require('path');
const fs = require('fs');

async function captureEvidence() {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();

  console.log('Logging in at http://localhost:3000/login...');
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' });

  // Fill login
  await page.fill('input[type="email"]', 'calc_tester@suntax.ch');
  await page.fill('input[type="password"]', 'TestPassword123!');
  await page.click('button[type="submit"]');

  await page.waitForNavigation({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);

  const outDir = '/Users/osamashaikh/.gemini/antigravity/scratch/suntax/jira_evidence_screenshots';
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  console.log('Navigating to tax return detail...');
  await page.goto('http://localhost:3000/tax-returns/229aa099-6158-434e-8fe2-0e125693285c', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Take screenshot of Documents tab
  await page.screenshot({ path: path.join(outDir, '01_documents_tab.png'), fullPage: false });
  console.log('Saved 01_documents_tab.png');

  // Let's see buttons for reviewing documents
  const reviewButtons = await page.$$('button:has-text("Review"), button:has-text("View"), button:has-text("Details"), button:has-text("Überprüfen")');
  console.log(`Found ${reviewButtons.length} review buttons`);

  // Let's inspect buttons inside document cards
  const allButtons = await page.$$eval('button', btns => btns.map(b => b.innerText.trim()));
  console.log('All buttons on page:', allButtons);

  // Click on "Tax Profile" tab
  const profileTab = await page.$('button[role="tab"]:has-text("Profile"), button[role="tab"]:has-text("Steuerprofil"), button[role="tab"]:has-text("Tax Profile")');
  if (profileTab) {
    await profileTab.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(outDir, '02_tax_profile_tab.png'), fullPage: false });
    console.log('Saved 02_tax_profile_tab.png');
  }

  // Click on "Calculation" tab
  const calcTab = await page.$('button[role="tab"]:has-text("Calculation"), button[role="tab"]:has-text("Berechnung")');
  if (calcTab) {
    await calcTab.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(outDir, '03_calculation_tab.png'), fullPage: false });
    console.log('Saved 03_calculation_tab.png');
  }

  // Click on "Review & Submit" tab
  const reviewTab = await page.$('button[role="tab"]:has-text("Review"), button[role="tab"]:has-text("Export"), button[role="tab"]:has-text("Übersicht")');
  if (reviewTab) {
    await reviewTab.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(outDir, '04_final_review_tab.png'), fullPage: false });
    console.log('Saved 04_final_review_tab.png');
  }

  await browser.close();
  console.log('Finished capturing screenshots.');
}

captureEvidence().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
