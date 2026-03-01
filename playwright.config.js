const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000
  },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry'
  },
  webServer: {
    command:
      "bash -lc 'rm -f /tmp/college-twitter-e2e.db /tmp/college-twitter-e2e.db-shm /tmp/college-twitter-e2e.db-wal && DB_PATH=/tmp/college-twitter-e2e.db PORT=4173 SESSION_SECRET=e2e-secret NODE_ENV=test node server.js'",
    url: 'http://127.0.0.1:4173/login',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
