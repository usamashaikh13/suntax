const { test, expect } = require('@playwright/test');

test('Landing page loads with SunTax title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/SunTax/i);
});
