import { workspaceProjects } from '@triage/tooling/vitest';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: { projects: workspaceProjects('web', { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'] }) },
});
