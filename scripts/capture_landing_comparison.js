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
    console.log(`\nCapturing viewports for ${vp.name} (${vp.width}x${vp.height})...`);

    // 1. Reference Landing Page (Frame 1 from SunTax Redesign (1).html)
    const pageRef = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await pageRef.goto('file:///Users/osamashaikh/Downloads/SunTax%20Redesign%20(1).html', { waitUntil: 'networkidle' });
    await pageRef.waitForTimeout(1000);

    const frame1 = pageRef.frames().find(f => f.url().includes('blob:'));
    if (frame1) {
      // In frame 1, let's take screenshot of the frame or full page
      // We can screenshot the frame's document element directly!
      const frameEl = await pageRef.$('iframe');
      if (frameEl) {
        const frameBox = await frameEl.boundingBox();
        // Or navigate pageRef directly to the blob URL or load landing_rendered.html
      }
    }

    // Let's also load landing_rendered.html directly for perfect 1:1 reference
    const pageDirectRef = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await pageDirectRef.goto('file:///Users/osamashaikh/.gemini/antigravity/scratch/suntax/developer_packet/landing_redesign_template.html', { waitUntil: 'networkidle' });
    await pageDirectRef.waitForTimeout(1000);
    const refPath = path.join(OUT_DIR, `ref_landing_${vp.name}.png`);
    await pageDirectRef.screenshot({ path: refPath, fullPage: true });
    fs.copyFileSync(refPath, path.join(BRAIN_DIR, `ref_landing_${vp.name}.png`));
    console.log(`Saved reference: ref_landing_${vp.name}.png`);
    await pageDirectRef.close();
    await pageRef.close();

    // 2. Current Deployed Landing Page
    const pageDep = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    await pageDep.goto('https://frontend-ruby-gamma-46.vercel.app', { waitUntil: 'networkidle' });
    await pageDep.waitForTimeout(1000);
    const depPath = path.join(OUT_DIR, `current_deployed_${vp.name}.png`);
    await pageDep.screenshot({ path: depPath, fullPage: true });
    fs.copyFileSync(depPath, path.join(BRAIN_DIR, `current_deployed_${vp.name}.png`));
    console.log(`Saved current deployed: current_deployed_${vp.name}.png`);
    await pageDep.close();
  }

  await browser.close();
  console.log('\nAll comparisons captured successfully!');
}

capture().catch(console.error);
