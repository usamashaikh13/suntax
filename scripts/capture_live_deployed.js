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
    await pageDe.waitForTimeout(1500); // let entrance animations settle
    const dePath = path.join(OUT_DIR, `live_deployed_${vp.name}_de.png`);
    await pageDe.screenshot({ path: dePath, fullPage: true });
    fs.copyFileSync(dePath, path.join(BRAIN_DIR, `live_deployed_${vp.name}_de.png`));
    console.log(`Saved live deployed DE: ${dePath}`);

    // If desktop, capture section closeups and verify geometries
    if (vp.name === 'desktop') {
      const ablauf = await pageDe.$('#ablauf');
      if (ablauf) {
        await ablauf.screenshot({ path: path.join(OUT_DIR, 'live_ablauf_desktop_de.png') });
        fs.copyFileSync(path.join(OUT_DIR, 'live_ablauf_desktop_de.png'), path.join(BRAIN_DIR, 'live_ablauf_desktop_de.png'));
      }
      const cta = await pageDe.$('.thcta');
      if (cta) {
        await cta.screenshot({ path: path.join(OUT_DIR, 'live_cta_desktop_de.png') });
        fs.copyFileSync(path.join(OUT_DIR, 'live_cta_desktop_de.png'), path.join(BRAIN_DIR, 'live_cta_desktop_de.png'));
      }
    }

    // English
    const enBtn = pageDe.locator('button:has-text("EN")');
    if (await enBtn.count() > 0) {
      await enBtn.first().click();
      await pageDe.waitForTimeout(1000);
      const enPath = path.join(OUT_DIR, `live_deployed_${vp.name}_en.png`);
      await pageDe.screenshot({ path: enPath, fullPage: true });
      fs.copyFileSync(enPath, path.join(BRAIN_DIR, `live_deployed_${vp.name}_en.png`));
      console.log(`Saved live deployed EN: ${enPath}`);

      if (vp.name === 'desktop') {
        const ablauf = await pageDe.$('#ablauf');
        if (ablauf) {
          await ablauf.screenshot({ path: path.join(OUT_DIR, 'live_ablauf_desktop_en.png') });
          fs.copyFileSync(path.join(OUT_DIR, 'live_ablauf_desktop_en.png'), path.join(BRAIN_DIR, 'live_ablauf_desktop_en.png'));
        }
        const cta = await pageDe.$('.thcta');
        if (cta) {
          await cta.screenshot({ path: path.join(OUT_DIR, 'live_cta_desktop_en.png') });
          fs.copyFileSync(path.join(OUT_DIR, 'live_cta_desktop_en.png'), path.join(BRAIN_DIR, 'live_cta_desktop_en.png'));
        }

        const metrics = await pageDe.evaluate(() => {
          const ctaH2 = document.querySelector('.thcta h2');
          const ctaBox = document.querySelector('.thcta');
          const h2Color = window.getComputedStyle(ctaH2).color;
          const bg = window.getComputedStyle(ctaBox).backgroundColor;

          const s1 = document.querySelector('.sa1tray').getBoundingClientRect();
          const s2 = document.querySelector('.sa2card').getBoundingClientRect();
          const s3 = (document.querySelector('.sa3card') || document.querySelector('.sa3')).getBoundingClientRect();

          const h1 = document.querySelectorAll('.thstep h3')[0].getBoundingClientRect();
          const h2 = document.querySelectorAll('.thstep h3')[1].getBoundingClientRect();
          const h3 = document.querySelectorAll('.thstep h3')[2].getBoundingClientRect();

          return {
            h2Color,
            bg,
            cards: [
              { step: 1, w: Math.round(s1.width), h: Math.round(s1.height), y: Math.round(s1.y) },
              { step: 2, w: Math.round(s2.width), h: Math.round(s2.height), y: Math.round(s2.y) },
              { step: 3, w: Math.round(s3.width), h: Math.round(s3.height), y: Math.round(s3.y) }
            ],
            headings: [
              { step: 1, y: Math.round(h1.y), h: Math.round(h1.height) },
              { step: 2, y: Math.round(h2.y), h: Math.round(h2.height) },
              { step: 3, y: Math.round(h3.y), h: Math.round(h3.height) }
            ]
          };
        });
        console.log('\nLIVE VERIFIED METRICS:');
        console.log(JSON.stringify(metrics, null, 2));
      }
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
