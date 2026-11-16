import { defineConfig } from 'vitest/config';

// Lets `npx vitest related --run <files>` run from the root across every workspace.
export default defineConfig({
  test: { projects: ['packages/*', 'apps/*'] },
});
