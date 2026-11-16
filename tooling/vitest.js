/**
 * Vitest projects of one workspace: `<name>:unit`, `<name>:integration` and `<name>:e2e`.
 * Unit tests sit next to the source, integration tests are `*.int.test.ts`, backend e2e tests live in test/e2e.
 */
export function workspaceProjects(name, { environment = 'node', setupFiles = [] } = {}) {
  return [
    {
      extends: true,
      test: {
        name: `${name}:unit`,
        environment,
        setupFiles,
        include: ['src/**/*.test.{ts,tsx}'],
        exclude: ['**/*.int.test.ts', '**/node_modules/**'],
      },
    },
    {
      extends: true,
      test: { name: `${name}:integration`, include: ['src/**/*.int.test.ts'], testTimeout: 30_000 },
    },
    {
      extends: true,
      test: { name: `${name}:e2e`, include: ['test/e2e/**/*.e2e.test.ts'], testTimeout: 30_000 },
    },
  ];
}
