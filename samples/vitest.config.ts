import { workspaceProjects } from '@triage/tooling/vitest';
import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { projects: workspaceProjects('samples') } });
