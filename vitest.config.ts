import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(process.cwd()) } },
  test: {
    environment: 'node',
    // Pin the app zone so date tests never depend on the machine or a local .env.
    env: { APER_TIME_ZONE: 'America/New_York' },
    include: ['tests/**/*.test.ts'],
    pool: 'forks',
    fileParallelism: false,
    coverage: { provider: 'v8', reporter: ['text', 'html'], include: ['lib/**/*.ts'] },
  },
});
