const path = require('path');
const fs = require('fs');
const { chromium } = require(path.join(__dirname, '..', 'frontend', 'node_modules', 'playwright'));

const BASE_URL = 'https://frontend-ruby-gamma-46.vercel.app';
const EVIDENCE_DIR = path.join(__dirname, '..', 'docs', 'evidence');
const VIDEO_DIR = path.join(EVIDENCE_DIR, 'videos');

if (!fs.existsSync(EVIDENCE_DIR)) fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
if (!fs.existsSync(VIDEO_DIR)) fs.mkdirSync(VIDEO_DIR, { recursive: true });

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  console.log('Starting Playwright automated evidence capture...');
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });

  // -------------------------------------------------------------
  // FLOW 1: Demo Account A (Single Employee - Max Muster)
  // -------------------------------------------------------------
  console.log('\n=== FLOW 1: Account A (Max Muster) ===');
  const contextA = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: {
      dir: VIDEO_DIR,
      size: { width: 1440, height: 900 },
    },
  });

  const pageA = await contextA.newPage();

  try {
    console.log('Navigating to login for Account A...');
    await pageA.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await pageA.waitForSelector('#email', { timeout: 15000 });
    await pageA.fill('#email', 'demo.single.a@suntax.ch');
    await pageA.fill('#password', 'Single_ZuriTax2025!Rkh1MIupe3Ti2QMJ');
    await pageA.click('button[type="submit"]');

    console.log('Submitting 2FA challenge...');
    await pageA.waitForSelector('#twoFactorCode', { timeout: 15000 });
    await pageA.fill('#twoFactorCode', '123456');
    await pageA.click('button[type="submit"]');

    console.log('Waiting for Dashboard to load...');
    await pageA.waitForURL('**/dashboard', { timeout: 20000 });
    // Wait for the loading spinner to be completely gone
    await pageA.waitForSelector('.animate-spin', { state: 'detached', timeout: 20000 }).catch(() => {});
    await sleep(3000);

    console.log('Capturing 01_dashboard_loaded_account_a.png...');
    await pageA.screenshot({
      path: path.join(EVIDENCE_DIR, '01_dashboard_loaded_account_a.png'),
      fullPage: false,
    });

    console.log('Navigating to Document Vault (Step 2)...');
    await pageA.goto(`${BASE_URL}/tax-returns/72b90c29-ab41-431d-896a-cfb22ac6a805?step=documents`, { waitUntil: 'networkidle' });
    await pageA.waitForSelector('.animate-spin', { state: 'detached', timeout: 15000 }).catch(() => {});
    await sleep(2500);

    console.log('Capturing 02_document_vault_classified.png...');
    await pageA.screenshot({
      path: path.join(EVIDENCE_DIR, '02_document_vault_classified.png'),
      fullPage: false,
    });

    // Check for "Felder prüfen" button
    const reviewBtn = await pageA.$('button:has-text("Felder prüfen"), button:has-text("Review fields")');
    if (reviewBtn) {
      console.log('Clicking "Felder prüfen" to open DocumentReviewModal...');
      await reviewBtn.click();
      await sleep(2500);

      console.log('Capturing 03_document_review_modal.png...');
      await pageA.screenshot({
        path: path.join(EVIDENCE_DIR, '03_document_review_modal.png'),
        fullPage: false,
      });

      // Close modal
      const closeBtn = await pageA.$('button:has-text("Schliessen"), button:has-text("Close"), button[aria-label="Close"]');
      if (closeBtn) {
        await closeBtn.click();
        await sleep(1000);
      }
    }

    console.log('Capturing 04_sidebar_live_calculation.png...');
    await pageA.screenshot({
      path: path.join(EVIDENCE_DIR, '04_sidebar_live_calculation.png'),
      fullPage: false,
    });

  } catch (err) {
    console.error('Error in Flow A:', err);
  } finally {
    await pageA.close();
    await contextA.close();
    console.log('Flow A finished, video saved.');
  }

  // -------------------------------------------------------------
  // FLOW 2: Demo Account B (Family / Multi-Doc - Thomas & Sarah)
  // -------------------------------------------------------------
  console.log('\n=== FLOW 2: Account B (Family Keller) ===');
  const contextB = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: {
      dir: VIDEO_DIR,
      size: { width: 1440, height: 900 },
    },
  });

  const pageB = await contextB.newPage();

  try {
    console.log('Navigating to login for Account B...');
    await pageB.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await pageB.waitForSelector('#email', { timeout: 15000 });
    await pageB.fill('#email', 'demo.family.b@suntax.ch');
    await pageB.fill('#password', 'Family_ZuriTax2025!biPRd9bbyjR5zICW');
    await pageB.click('button[type="submit"]');

    console.log('Submitting 2FA challenge for Account B...');
    await pageB.waitForSelector('#twoFactorCode', { timeout: 15000 });
    await pageB.fill('#twoFactorCode', '123456');
    await pageB.click('button[type="submit"]');

    console.log('Waiting for Account B Dashboard...');
    await pageB.waitForURL('**/dashboard', { timeout: 20000 });
    await pageB.waitForSelector('.animate-spin', { state: 'detached', timeout: 20000 }).catch(() => {});
    await sleep(3000);

    console.log('Capturing 08_account_b_dashboard_family.png...');
    await pageB.screenshot({
      path: path.join(EVIDENCE_DIR, '08_account_b_dashboard_family.png'),
      fullPage: false,
    });

    console.log('Navigating to Account B Document Vault...');
    await pageB.goto(`${BASE_URL}/tax-returns/344f38ae-1467-45d5-a795-55960540254d?step=documents`, { waitUntil: 'networkidle' });
    await pageB.waitForSelector('.animate-spin', { state: 'detached', timeout: 15000 }).catch(() => {});
    await sleep(3000);

    console.log('Capturing 05_account_b_duplicate_alert.png...');
    await pageB.screenshot({
      path: path.join(EVIDENCE_DIR, '05_account_b_duplicate_alert.png'),
      fullPage: false,
    });

    // Scroll down slightly to show remaining documents and warnings
    await pageB.evaluate(() => window.scrollBy(0, 380));
    await sleep(1500);

    console.log('Capturing 06_account_b_all_documents_vault.png...');
    await pageB.screenshot({
      path: path.join(EVIDENCE_DIR, '06_account_b_all_documents_vault.png'),
      fullPage: false,
    });

  } catch (err) {
    console.error('Error in Flow B:', err);
  } finally {
    await pageB.close();
    await contextB.close();
    console.log('Flow B finished, video saved.');
  }

  await browser.close();
  console.log('\nAll evidence captures and video recordings completed successfully!');
})();
