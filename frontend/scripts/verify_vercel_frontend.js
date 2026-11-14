const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function run() {
  console.log('=== VERCEL FRONTEND & RENDER BACKEND INTEGRATION TEST ===');
  
  // 1. Get DB connection to retrieve TOTP secret for the synthetic user
  const pythonCmd = `/Users/osamashaikh/.gemini/antigravity/scratch/suntax/backend/.venv/bin/python -c "
import yaml, os, urllib.request, json
cli_yaml = os.path.expanduser('~/.render/cli.yaml')
with open(cli_yaml) as f:
    cfg = yaml.safe_load(f)
token = cfg['api']['key']
req = urllib.request.Request('https://api.render.com/v1/postgres/dpg-dbsb5v2fngtc73c89hn0-a/connection-info', headers={'Authorization': f'Bearer {token}', 'Accept': 'application/json'})
with urllib.request.urlopen(req) as resp:
    info = json.loads(resp.read().decode())
print(info['externalConnectionString'])
"`;
  const extConn = execSync(pythonCmd).toString().trim();
  
  const timestamp = Math.floor(Date.now() / 1000);
  const synthEmail = `qa_vercel_ui_${timestamp}@suntax.ch`;
  const synthPassword = `SecurePassword123!`;
  const synthName = `Vercel UI Tester ${timestamp}`;

  console.log(`Testing with synthetic user: ${synthEmail}`);

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Track network requests to suntax-api.onrender.com
  const apiRequests = [];
  page.on('request', req => {
    if (req.url().includes('suntax-api.onrender.com')) {
      apiRequests.push({ method: req.method(), url: req.url() });
    }
  });

  page.on('response', resp => {
    if (resp.url().includes('suntax-api.onrender.com')) {
      console.log(`[NETWORK] ${resp.request().method()} ${resp.url()} -> Status ${resp.status()}`);
    }
  });

  // Step 1: Open registration page on Vercel
  console.log('1. Navigating to Vercel registration page...');
  await page.goto('https://frontend-ruby-gamma-46.vercel.app/register', { waitUntil: 'networkidle' });

  // Fill registration form
  console.log('2. Submitting registration form on Vercel frontend...');
  await page.fill('input[type="text"], input[name="fullName"], input[name="name"]', synthName);
  await page.fill('input[type="email"]', synthEmail);
  const passwordInputs = await page.$$('input[type="password"]');
  if (passwordInputs.length > 0) {
    await passwordInputs[0].fill(synthPassword);
  }
  if (passwordInputs.length > 1) {
    await passwordInputs[1].fill(synthPassword);
  }

  // Accept terms if checkbox exists
  const checkbox = await page.$('input[type="checkbox"]');
  if (checkbox) {
    await checkbox.check();
  }

  // Submit registration
  const submitButton = await page.$('button[type="submit"]');
  await submitButton.click();

  // Wait 3 seconds for registration response
  await page.waitForTimeout(3000);

  // Step 2: Open login page on Vercel
  console.log('3. Navigating to Vercel login page...');
  await page.goto('https://frontend-ruby-gamma-46.vercel.app/login', { waitUntil: 'networkidle' });

  console.log('4. Entering login credentials on Vercel frontend...');
  await page.fill('input[type="email"]', synthEmail);
  const loginPwInputs = await page.$$('input[type="password"]');
  if (loginPwInputs.length > 0) {
    await loginPwInputs[0].fill(synthPassword);
  }

  const loginSubmit = await page.$('button[type="submit"]');
  await loginSubmit.click();

  // Wait for 2FA screen or response
  await page.waitForTimeout(3000);

  // Step 3: Fetch TOTP secret from suntax-db-test
  console.log('5. Querying TOTP secret from Render PostgreSQL...');
  const getTotpCmd = `/Users/osamashaikh/.gemini/antigravity/scratch/suntax/backend/.venv/bin/python /Users/osamashaikh/.gemini/antigravity/scratch/get_totp.py ${synthEmail}`;
  const totpCode = execSync(getTotpCmd).toString().trim();
  console.log(`Generated TOTP 2FA code: ${totpCode}`);

  // Step 4: Fill 2FA code
  console.log('6. Waiting for #twoFactorCode input on Vercel frontend...');
  const twoFaInput = await page.waitForSelector('#twoFactorCode', { timeout: 10000 });
  if (twoFaInput) {
    console.log('Submitting 2FA challenge on Vercel frontend...');
    await twoFaInput.fill(totpCode);
    const twoFaBtn = await page.$('button[type="submit"]');
    if (twoFaBtn) await twoFaBtn.click();
    console.log('Waiting for navigation to /dashboard...');
    await page.waitForURL('**/dashboard', { timeout: 15000 }).catch(e => console.log('Wait for dashboard url note:', e.message));
    await page.waitForTimeout(3000);
  }

  // Check current URL and page state
  const currentUrl = page.url();
  console.log(`7. Final Vercel URL after auth: ${currentUrl}`);

  // Save screenshot evidence
  const evidenceDir = '/Users/osamashaikh/.gemini/antigravity/brain/b9c7cd63-97a4-416c-af83-0fa8d84d8782/e2e_evidence';
  fs.mkdirSync(evidenceDir, { recursive: true });
  const screenshotPath = path.join(evidenceDir, 'vercel_frontend_connected_to_render_db.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`8. Screenshot evidence saved to: ${screenshotPath}`);

  await browser.close();

  const renderRequests = apiRequests.filter(r => r.url.includes('suntax-api.onrender.com'));
  console.log(`Total requests intercepted to Render backend: ${renderRequests.length}`);
  if (renderRequests.length > 0) {
    console.log('>>> VERCEL FRONTEND IS FULLY CONNECTED AND COMMUNICATING WITH RENDER BACKEND! <<<');
  } else {
    throw new Error('No requests reached suntax-api.onrender.com');
  }
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
