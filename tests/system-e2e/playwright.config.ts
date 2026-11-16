import { defineConfig } from '@playwright/test';
import { WEB_URL } from './e2e/stack';

// The whole system from compose.yaml, with the real model; the stack is started once for all tests.
export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.e2e.ts',
  workers: 1,
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: { baseURL: WEB_URL },
});
