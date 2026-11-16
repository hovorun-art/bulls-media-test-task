import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const DUMMY_KEY = 'dummy-google-api-key';

interface ComposeService {
  depends_on?: Record<string, { condition: string }>;
  ports?: { target: number; published: string }[];
  environment?: Record<string, string>;
}

interface ComposeConfig {
  services: Record<string, ComposeService> & { triage: ComposeService; web: ComposeService };
}

/** The configuration Compose would run, rendered without .env so only compose.yaml and `env` count. */
function renderConfig({ env = {} }: { env?: Record<string, string | undefined> } = {}): ComposeConfig {
  const output = execFileSync(
    'docker',
    ['compose', '--env-file', '/dev/null', '-p', 'bulls-media-test', '-f', 'compose.yaml', 'config', '--format', 'json'],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        GOOGLE_API_KEY: DUMMY_KEY,
        GEMINI_MODEL: undefined,
        WEB_PORT: undefined,
        TRIAGE_PORT: undefined,
        ...env,
      },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  return JSON.parse(output) as ComposeConfig;
}

describe('compose.yaml', () => {
  it('No model containers', () => {
    const config = renderConfig();

    expect(Object.keys(config.services).sort()).toEqual(['triage', 'web']);
  });

  it('Default host ports', () => {
    const config = renderConfig();

    expect(config.services.web.ports).toMatchObject([{ target: 80, published: '8080' }]);
    expect(config.services.triage.ports).toMatchObject([{ target: 3000, published: '3000' }]);
  });

  it('Web waits for the healthy triage service', () => {
    const config = renderConfig();

    expect(config.services.web.depends_on).toMatchObject({ triage: { condition: 'service_healthy' } });
    expect(config.services.triage.depends_on).toBeUndefined();
  });

  it('Default model', () => {
    const config = renderConfig();

    expect(config.services.triage.environment?.GEMINI_MODEL).toBe('gemini-flash-lite-latest');
  });

  it('Empty model falls back to the default', () => {
    const config = renderConfig({ env: { GEMINI_MODEL: '' } });

    expect(config.services.triage.environment?.GEMINI_MODEL).toBe('gemini-flash-lite-latest');
  });

  it('Model from the environment', () => {
    const config = renderConfig({ env: { GEMINI_MODEL: 'gemini-3.5-flash-lite' } });

    expect(config.services.triage.environment?.GEMINI_MODEL).toBe('gemini-3.5-flash-lite');
  });

  it.each([
    ['unset', undefined],
    ['empty', ''],
  ])('Missing key stops compose (%s)', (_case, key) => {
    expect(() => renderConfig({ env: { GOOGLE_API_KEY: key } })).toThrow(/GOOGLE_API_KEY/);
  });

  it('Key reaches the triage service', () => {
    const config = renderConfig({ env: { GOOGLE_API_KEY: 'another-key' } });

    expect(config.services.triage.environment?.GOOGLE_API_KEY).toBe('another-key');
  });
});
