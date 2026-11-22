const { chromium } = require('/Users/osamashaikh/.gemini/antigravity/scratch/suntax/frontend/node_modules/@playwright/test');
const path = require('path');
const fs = require('fs');

const OUT_DIR = '/Users/osamashaikh/.gemini/antigravity/brain/b9c7cd63-97a4-416c-af83-0fa8d84d8782/defect_verification';
fs.mkdirSync(OUT_DIR, { recursive: true });

async function verify() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  console.log('Loading http://localhost:3000 ...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // 1. Verify Defect 2: CTA Heading Color & Contrast
  const ctaHeading = await page.$('.thcta h2');
  const ctaHeadingColor = await page.evaluate(el => window.getComputedStyle(el).color, ctaHeading);
  const ctaBgColor = await page.evaluate(el => window.getComputedStyle(el.closest('.thcta')).backgroundColor, ctaHeading);
  console.log(`\n=== DEFECT 2: CTA Heading Contrast ===`);
  console.log(`CTA Heading color: ${ctaHeadingColor}`);
  console.log(`CTA Container background: ${ctaBgColor}`);

  // 2. Verify Defect 1: Three-step timeline alignment & geometry
  const stepBoxes = await page.evaluate(() => {
    const s1 = document.querySelector('.sa1tray').getBoundingClientRect();
    const s2 = document.querySelector('.sa2card').getBoundingClientRect();
    const s3 = (document.querySelector('.sa3card') || document.querySelector('.sa3')).getBoundingClientRect();
    
    const h1 = document.querySelectorAll('.thstep h3')[0].getBoundingClientRect();
    const h2 = document.querySelectorAll('.thstep h3')[1].getBoundingClientRect();
    const h3 = document.querySelectorAll('.thstep h3')[2].getBoundingClientRect();

    const p1 = document.querySelectorAll('.thstep p')[0].getBoundingClientRect();
    const p2 = document.querySelectorAll('.thstep p')[1].getBoundingClientRect();
    const p3 = document.querySelectorAll('.thstep p')[2].getBoundingClientRect();

    return {
      cards: [
        { step: 1, w: Math.round(s1.width), h: Math.round(s1.height), y: Math.round(s1.y) },
        { step: 2, w: Math.round(s2.width), h: Math.round(s2.height), y: Math.round(s2.y) },
        { step: 3, w: Math.round(s3.width), h: Math.round(s3.height), y: Math.round(s3.y) }
      ],
      headings: [
        { step: 1, y: Math.round(h1.y), h: Math.round(h1.height) },
        { step: 2, y: Math.round(h2.y), h: Math.round(h2.height) },
        { step: 3, y: Math.round(h3.y), h: Math.round(h3.height) }
      ],
      descriptions: [
        { step: 1, y: Math.round(p1.y), h: Math.round(p1.height) },
        { step: 2, y: Math.round(p2.y), h: Math.round(p2.height) },
        { step: 3, y: Math.round(p3.y), h: Math.round(p3.height) }
      ]
    };
  });

  console.log(`\n=== DEFECT 1: Three-step timeline geometry ===`);
  console.log('Cards:', JSON.stringify(stepBoxes.cards, null, 2));
  console.log('Headings:', JSON.stringify(stepBoxes.headings, null, 2));
  console.log('Descriptions:', JSON.stringify(stepBoxes.descriptions, null, 2));

  // Capture close-ups
  const ablaufEl = await page.$('#ablauf');
  await ablaufEl.screenshot({ path: path.join(OUT_DIR, 'ablauf_desktop_de.png') });

  const ctaEl = await page.$('.thcta');
  await ctaEl.screenshot({ path: path.join(OUT_DIR, 'cta_desktop_de.png') });

  // Switch to English
  const enBtn = await page.getByRole('button', { name: 'EN' });
  if (enBtn) {
    await enBtn.click();
    await page.waitForTimeout(400);
    await ablaufEl.screenshot({ path: path.join(OUT_DIR, 'ablauf_desktop_en.png') });
    await ctaEl.screenshot({ path: path.join(OUT_DIR, 'cta_desktop_en.png') });
  }

  // Mobile viewport
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(400);
  await ablaufEl.screenshot({ path: path.join(OUT_DIR, 'ablauf_mobile_en.png') });
  await ctaEl.screenshot({ path: path.join(OUT_DIR, 'cta_mobile_en.png') });

  await browser.close();
  console.log('\nVerification screenshots saved to defect_verification directory!');
}

verify().catch(console.error);
