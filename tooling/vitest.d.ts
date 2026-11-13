import type { TestProjectInlineConfiguration } from 'vitest/config';

export function workspaceProjects(
  name: string,
  options?: { environment?: string; setupFiles?: string[] },
): TestProjectInlineConfiguration[];
