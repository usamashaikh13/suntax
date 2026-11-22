const { chromium } = require('/Users/osamashaikh/.gemini/antigravity/scratch/suntax/frontend/node_modules/@playwright/test');
const path = require('path');
const fs = require('fs');

const OUT_DIR = '/Users/osamashaikh/.gemini/antigravity/scratch/suntax/docs/screenshots_landing_redesign';
const BRAIN_DIR = '/Users/osamashaikh/.gemini/antigravity/brain/b9c7cd63-97a4-416c-af83-0fa8d84d8782/screenshots_landing_redesign';
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(BRAIN_DIR, { recursive: true });

const viewports = [
  { name: 'desktop', width: 1440, height: 950 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 375, height: 812 }
];

async function capture() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  for (const vp of viewports) {
    console.log(`\nCapturing live deployed viewports for ${vp.name} (${vp.width}x${vp.height})...`);

    // German (Default)
    const pageDe = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await pageDe.goto('https://frontend-ruby-gamma-46.vercel.app/?v=' + Date.now(), { waitUntil: 'networkidle' });
    await pageDe.waitForTimeout(2000); // let entrance animations settle
    const dePath = path.join(OUT_DIR, `live_deployed_${vp.name}_de.png`);
    await pageDe.screenshot({ path: dePath, fullPage: true });
    fs.copyFileSync(dePath, path.join(BRAIN_DIR, `live_deployed_${vp.name}_de.png`));
    console.log(`Saved live deployed DE: ${dePath}`);

    // English
    const enBtn = pageDe.locator('button:has-text("EN")');
    if (await enBtn.count() > 0) {
      await enBtn.first().click();
      await pageDe.waitForTimeout(1000);
      const enPath = path.join(OUT_DIR, `live_deployed_${vp.name}_en.png`);
      await pageDe.screenshot({ path: enPath, fullPage: true });
      fs.copyFileSync(enPath, path.join(BRAIN_DIR, `live_deployed_${vp.name}_en.png`));
      console.log(`Saved live deployed EN: ${enPath}`);
    }
    await pageDe.close();
  }

  await browser.close();
  console.log('\nAll live deployed screenshots captured successfully!');
}

capture().catch(err => {
  console.error(err);
  process.exit(1);
});
