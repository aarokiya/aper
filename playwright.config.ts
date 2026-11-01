import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const e2eDb = path.join(process.cwd(), 'data', 'e2e.db');

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  webServer: {
    command:
      'pnpm exec tsx tests/e2e/global-setup.ts && pnpm exec next dev --hostname 127.0.0.1 --port 3100',
    url: 'http://127.0.0.1:3100/api/sync/status',
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      ACADEMIC_DB_PATH: e2eDb,
      ACADEMIC_DATA_DIR: path.join(process.cwd(), 'data', 'e2e'),
    },
  },
});
