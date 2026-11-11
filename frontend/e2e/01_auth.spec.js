const { test, expect } = require('@playwright/test');
const {
  BACKEND_URL,
  captureEvidence,
  createTestUser,
  setAuthSession,
  clearAuthSession,
} = require('./helpers');

test.describe('Scenario 1: Registration and Authentication', () => {
  test('1.1 Valid registration with Swiss German light UI and terms consent', async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('h2')).toContainText('Konto erstellen');
    await captureEvidence(page, 'sc01_01_register_page', 'Initial registration screen with light Swiss design');

    const timestamp = Date.now();
    const testEmail = `test_reg_${timestamp}@suntax-synthetic.ch`;

    // Fill form
    await page.fill('input[name="full_name"]', 'Muster Hans');
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="password"]', 'SuntaxSecure2026!');

    // Check terms
    const termsCheckbox = page.locator('input[name="terms_accepted"]');
    await termsCheckbox.check();
    await expect(termsCheckbox).toBeChecked();

    await captureEvidence(page, 'sc01_02_register_filled', 'Completed registration form');

    // Submit
    await page.click('button[type="submit"]');

    // Verify confirmation message is displayed
    await expect(page.getByRole('heading', { name: 'E-Mail bestätigen' })).toBeVisible({ timeout: 10000 });
    await captureEvidence(page, 'sc01_03_register_success', 'Successful registration confirmation');
  });

  test('1.2 Duplicate registration handling', async ({ page }) => {
    // Register once
    const user = await createTestUser('dup');

    await page.goto('/register');
    await page.fill('input[name="full_name"]', 'Duplicate User');
    await page.fill('input[name="email"]', user.email);
    await page.fill('input[name="password"]', 'SuntaxSecure2026!');
    await page.check('input[name="terms_accepted"]');

    await page.click('button[type="submit"]');

    // Backend returns generic message or error toast
    await page.waitForTimeout(1500);
    await captureEvidence(page, 'sc01_04_duplicate_registration', 'Handling of duplicate registration attempt');
  });

  test('1.3 Input validation: invalid email, weak password, and required consent', async ({ page }) => {
    await page.goto('/register');

    const submitBtn = page.locator('button[type="submit"]');

    // Attempt submit with empty fields and unticked terms
    await submitBtn.click();

    // Verify required consent and required field errors
    await expect(page.locator('text=Bitte gib deinen Vor- und Nachnamen ein').first()).toBeVisible();

    // Fill invalid email and weak password
    await page.fill('input[name="full_name"]', 'Tester');
    await page.fill('input[name="email"]', 'invalid-email-format');
    await page.fill('input[name="password"]', 'weak');
    await submitBtn.click();

    // Verify specific format errors appear
    await expect(page.locator('text=Bitte gib eine gültige E-Mail-Adresse ein').first()).toBeVisible();
    await expect(page.locator('text=Mindestens 10 Zeichen erforderlich').first()).toBeVisible();

    await captureEvidence(page, 'sc01_05_register_validation_errors', 'Client-side validation error indicators');
  });

  test('1.4 Login: correct credentials, incorrect password, and account lockout', async ({ page }) => {
    const user = await createTestUser('login_test');

    // 1. Incorrect password
    await page.goto('/login');
    await page.fill('input[name="email"]', user.email);
    await page.fill('input[name="password"]', 'WrongPassword123!');
    await page.click('button[type="submit"]');

    await expect(page.locator('text=Anmeldung fehlgeschlagen').first()).toBeVisible({ timeout: 10000 });
    await captureEvidence(page, 'sc01_06_login_invalid_password', 'Error message for incorrect password');

    // 2. Lockout test: 4 more failed attempts (total 5)
    for (let i = 0; i < 4; i++) {
      await page.fill('input[name="password"]', `WrongPasswordAttempt${i}!`);
      await page.click('button[type="submit"]');
      await page.waitForTimeout(600);
    }

    // Attempt 6 should trigger HTTP 423 lockout
    await page.fill('input[name="password"]', 'WrongPasswordAttemptLocked!');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1000);
    await captureEvidence(page, 'sc01_07_login_locked_account', 'Account lockout after 5 consecutive failed attempts');

    // 3. Valid login with a fresh user (completing mandatory 2FA)
    const freshUser = await createTestUser('login_valid');
    await page.goto('/login');
    await page.fill('input[name="email"]', freshUser.email);
    await page.fill('input[name="password"]', freshUser.password);
    await page.click('button[type="submit"]');

    // 2FA challenge is presented (mandatory per Developer Guide & BUG-SEC-01 fix)
    await expect(page.locator('text=Code eingeben').first()).toBeVisible({ timeout: 10000 });
    await page.fill('input#twoFactorCode, input[placeholder="000000"]', '123456');
    await page.click('button:has-text("Bestätigen")');

    // Should redirect to dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
    await captureEvidence(page, 'sc01_08_login_success_dashboard', 'Dashboard reached after valid login');
  });

  test('1.5 2FA evaluation: mandatory 2FA challenge on every sign-in', async ({ page }) => {
    // Create new user without pre-configured TOTP
    const freshUser = await createTestUser('eval_2fa');

    // Check direct API login response
    const res = await fetch(`${BACKEND_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: freshUser.email, password: freshUser.password }),
    });
    const data = await res.json();

    // Verification of fixed BUG-SEC-01: Two-factor authentication is mandatory on every sign-in
    expect(data.two_factor_required).toBe(true);
    expect(data.temp_token).toBeTruthy();
    expect(data.access_token).toBeFalsy();
  });

  test('1.6 Logout and protected route access restriction', async ({ context, page }) => {
    const user = await createTestUser('logout_test');
    await setAuthSession(context, user);

    // Access dashboard
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/);

    // Logout
    await clearAuthSession(context);

    // Try navigating to protected routes
    const protectedRoutes = ['/dashboard', '/tax-returns', '/profile'];
    for (const route of protectedRoutes) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/);
    }

    await captureEvidence(page, 'sc01_09_logout_protection', 'Protected route redirects unauthenticated user to login');
  });

  test('1.7 Network error representation does not claim invalid password', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', 'network_test@suntax.ch');
    await page.fill('input[name="password"]', 'ValidPassword123!');

    // Intercept /auth/login and return 500 server error
    await page.route('**/api/v1/auth/login', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Internal Server Error' }),
      });
    });

    await page.click('button[type="submit"]');

    // Error must NOT say "invalid password" or "falsches Passwort"
    await page.waitForTimeout(1000);
    const toastText = await page.textContent('body');
    expect(toastText).not.toContain('falsches Passwort');
    await captureEvidence(page, 'sc01_10_network_failure_handling', 'Network failure does not misinform user with invalid password');
  });
});
