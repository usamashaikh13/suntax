const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 60000,
  retries: 0,
  workers: 1, // run sequentially for predictable E2E state
  use: {
    baseURL: 'http://localhost:3000',
    channel: 'chrome',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: {
        channel: 'chrome',
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
