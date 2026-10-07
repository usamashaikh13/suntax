const { chromium } = require('/Users/osamashaikh/.gemini/antigravity/scratch/suntax/frontend/node_modules/playwright');
const path = require('path');
const fs = require('fs');

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  
  await page.goto('http://localhost:3000/login');
  await page.fill('input[type="email"]', 'calc_tester@suntax.ch');
  await page.fill('input[type="password"]', 'TestPassword123!');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);

  await page.goto('http://localhost:3000/tax-returns/229aa099-6158-434e-8fe2-0e125693285c');
  await page.waitForTimeout(2000);

  // Click Documents tab
  const docsTab = page.locator('button[role="tab"]:has-text("Documents")');
  await docsTab.click();
  await page.waitForTimeout(1000);

  const outDir = '/Users/osamashaikh/.gemini/antigravity/scratch/suntax/jira_evidence_screenshots';

  const reviewButtons = page.locator('button:has-text("Review Fields")');
  const count = await reviewButtons.count();
  console.log(`Found ${count} "Review Fields" buttons`);

  for (let i = 0; i < count; i++) {
    console.log(`Opening modal ${i + 1}/${count}...`);
    await reviewButtons.nth(i).click();
    await page.waitForTimeout(1000);
    
    // Check if dialog is visible
    const dialog = page.locator('[role="dialog"]');
    if (await dialog.isVisible()) {
      await dialog.screenshot({ path: path.join(outDir, `modal_doc_${i + 1}.png`) });
      console.log(`Saved modal_doc_${i + 1}.png (dialog)`);
    } else {
      await page.screenshot({ path: path.join(outDir, `modal_doc_${i + 1}_full.png`) });
      console.log(`Saved modal_doc_${i + 1}_full.png (full)`);
    }

    // Close the dialog
    const closeBtn = page.locator('[role="dialog"] button:has-text("Cancel"), [role="dialog"] button:has-text("Close"), [role="dialog"] button[aria-label="Close"], [role="dialog"] button:has-text("Abbrechen")').first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await page.waitForTimeout(600);
    } else {
      // Try clicking escape or outside
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
    }
  }

  await browser.close();
  console.log('Done capturing review modals.');
}

main().catch(console.error);
