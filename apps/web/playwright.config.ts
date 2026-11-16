import { defineConfig } from '@playwright/test';

// The page against a Vite dev server; the API is mocked per test with page.route.
export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://127.0.0.1:4173' },
  webServer: { command: 'npx vite --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: false },
});
