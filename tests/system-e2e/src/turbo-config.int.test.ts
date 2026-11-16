import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

interface DryRun {
  tasks: { environmentVariables: { passthrough: string[] | null } }[];
}

/**
 * Names of the shell variables Turborepo hands to a workspace's dev task, from its dry run, which
 * lists each one as `NAME=<hash of the value>`.
 */
function variablesReachingDev(workspace: string, env: Record<string, string>): string[] {
  const output = execFileSync('npx', ['turbo', 'run', 'dev', `--filter=${workspace}`, '--dry=json'], {
    cwd: REPO_ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const [task] = (JSON.parse(output) as DryRun).tasks;
  return (task?.environmentVariables.passthrough ?? []).map((entry) => entry.replace(/=.*/, ''));
}

describe('turbo.json', () => {
  it.each([
    ['GOOGLE_API_KEY', 'dummy-google-api-key'],
    ['GEMINI_MODEL', 'gemini-3.5-flash-lite'],
    ['MODEL_MAX_ATTEMPTS', '2'],
    ['MODEL_REPAIR_ATTEMPTS', '1'],
    ['MAX_TOOL_CALLS', '4'],
    ['REFUND_WINDOW_DAYS', '14'],
    ['REFUND_MAX_AUTO_AMOUNT', '100'],
    ['RUN_DEADLINE_SECONDS', '60'],
    ['RUN_EVENTS_HEARTBEAT_SECONDS', '5'],
    ['PORT', '3200'],
    ['HOST', '0.0.0.0'],
    ['DATABASE_PATH', '/tmp/runs.sqlite'],
    ['LOG_LEVEL', 'debug'],
  ])('Service setting %s set in the shell reaches its dev task', (name, value) => {
    const variables = variablesReachingDev('@triage/service', { [name]: value });

    expect(variables).toContain(name);
  });

  it('Proxy target set in the shell reaches the web dev task', () => {
    const variables = variablesReachingDev('@triage/web', { API_URL: 'http://127.0.0.1:3200' });

    expect(variables).toContain('API_URL');
  });
});
