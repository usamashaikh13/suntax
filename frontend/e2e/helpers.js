/**
 * E2E Test Helper Utilities for SunTax Playwright Suite
 */
const path = require('path');
const fs = require('fs');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000/api/v1';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const EVIDENCE_DIR = '/Users/osamashaikh/.gemini/antigravity/brain/b9c7cd63-97a4-416c-af83-0fa8d84d8782/e2e_evidence';
const FIXTURES_DIR = '/Users/osamashaikh/.gemini/antigravity/scratch/suntax/e2e_fixtures';

if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

/**
 * Capture a screenshot and record evidence metadata
 */
async function captureEvidence(page, name, description = '') {
  const filename = `${name}.png`;
  const filepath = path.join(EVIDENCE_DIR, filename);
  await page.screenshot({ path: filepath, fullPage: false });
  return { filename, filepath, description };
}

/**
 * Register a unique synthetic test user directly via API
 */
async function createTestUser(prefix = 'tester') {
  const timestamp = Date.now() + Math.floor(Math.random() * 1000);
  const email = `${prefix}_${timestamp}@suntax-synthetic.ch`;
  const password = 'TestPassword2026!';
  const full_name = `Synthetic ${prefix.charAt(0).toUpperCase() + prefix.slice(1)} ${timestamp}`;

  const res = await fetch(`${BACKEND_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, full_name, terms_accepted: true }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to create test user: ${res.status} ${txt}`);
  }

  // Login to get tokens (handle mandatory 2FA challenge)
  const loginRes = await fetch(`${BACKEND_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const loginData = await loginRes.json();
  let accessToken = loginData.access_token;
  let refreshToken = loginData.refresh_token;

  if (loginData.two_factor_required && loginData.temp_token) {
    const twoFaRes = await fetch(`${BACKEND_URL}/auth/login/2fa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ temp_token: loginData.temp_token, code: '123456' }),
    });
    if (twoFaRes.ok) {
      const twoFaData = await twoFaRes.json();
      accessToken = twoFaData.access_token;
      refreshToken = twoFaData.refresh_token;
    }
  }

  return {
    email,
    password,
    full_name,
    accessToken,
    refreshToken,
    twoFactorRequired: loginData.two_factor_required,
    tempToken: loginData.temp_token,
  };
}

/**
 * Set authentication cookies in a Playwright browser context
 */
async function setAuthSession(context, tokens) {
  if (tokens.accessToken) {
    const domain = new URL(FRONTEND_URL).hostname;
    await context.addCookies([
      { name: 'suntax_access_token', value: tokens.accessToken, domain, path: '/' },
      { name: 'suntax_refresh_token', value: tokens.refreshToken || '', domain, path: '/' },
    ]);
  }
}

/**
 * Clear authentication cookies
 */
async function clearAuthSession(context) {
  await context.clearCookies();
}

/**
 * Create a synthetic tax return via API
 */
async function createTestTaxReturn(accessToken, canton = 'ZH', year = 2025, muniBfs = '261', muniName = 'Zürich') {
  const res = await fetch(`${BACKEND_URL}/tax-returns`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      canton_code: canton,
      tax_year: year,
      municipality_code: muniBfs,
      municipality_name: muniName,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create tax return: ${res.status} ${err}`);
  }
  return await res.json();
}

module.exports = {
  BACKEND_URL,
  FRONTEND_URL,
  EVIDENCE_DIR,
  FIXTURES_DIR,
  captureEvidence,
  createTestUser,
  setAuthSession,
  clearAuthSession,
  createTestTaxReturn,
};
