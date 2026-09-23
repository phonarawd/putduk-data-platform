import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'admin-*.spec.ts',
  fullyParallel: false,
  forbidOnly: true,
  retries: 1,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'https://ops.hiptk.app',
    locale: 'ko-KR',
    trace: 'retain-on-failure',
    serviceWorkers: 'block'
  }
});