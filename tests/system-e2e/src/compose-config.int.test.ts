import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

interface ComposeService {
  depends_on?: Record<string, { condition: string }>;
  environment?: Record<string, string>;
  command?: string[];
}

interface ComposeConfig {
  services: { triage: ComposeService; web: ComposeService; 'ollama-pull': ComposeService };
  volumes: { models: { name: string } };
}

/** The configuration Compose would run, rendered without .env so only the files and `env` count. */
function renderConfig({ files = ['compose.yaml'], project = 'triage', env = {} } = {}): ComposeConfig {
  const fileArgs = files.flatMap((file) => ['-f', file]);
  const output = execFileSync(
    'docker',
    ['compose', '--env-file', '/dev/null', '-p', project, ...fileArgs, 'config', '--format', 'json'],
    { cwd: REPO_ROOT, env: { ...process.env, OLLAMA_MODEL: undefined, OLLAMA_BASE_URL: undefined, ...env }, encoding: 'utf8' },
  );
  return JSON.parse(output) as ComposeConfig;
}

describe('compose.yaml', () => {
  it('Triage waits for the model', () => {
    const config = renderConfig();

    expect(config.services.triage.depends_on).toMatchObject({
      ollama: { condition: 'service_healthy' },
      'ollama-pull': { condition: 'service_completed_successfully' },
    });
  });

  it('Web waits for triage', () => {
    const config = renderConfig();

    expect(config.services.web.depends_on).toMatchObject({ triage: { condition: 'service_healthy' } });
  });

  it('Default model', () => {
    const config = renderConfig();

    expect(config.services['ollama-pull'].command).toEqual(['pull', 'qwen3:8b']);
    expect(config.services.triage.environment?.OLLAMA_MODEL).toBe('qwen3:8b');
  });

  it('Model from the environment', () => {
    const config = renderConfig({ env: { OLLAMA_MODEL: 'llama3.2:3b' } });

    expect(config.services['ollama-pull'].command).toEqual(['pull', 'llama3.2:3b']);
    expect(config.services.triage.environment?.OLLAMA_MODEL).toBe('llama3.2:3b');
  });

  it('Models volume is shared across projects', () => {
    const first = renderConfig({ project: 'triage' });
    const second = renderConfig({ project: 'triage-system-e2e' });

    expect(first.volumes.models.name).toBe('triage-ollama-models');
    expect(second.volumes.models.name).toBe('triage-ollama-models');
  });
});

describe('compose.host-llm.yaml', () => {
  const HOST_LLM_FILES = ['compose.yaml', 'compose.host-llm.yaml'];

  it('Override leaves out the model containers', () => {
    const config = renderConfig({ files: HOST_LLM_FILES });

    expect(Object.keys(config.services).sort()).toEqual(['triage', 'web']);
    expect(config.services.triage.depends_on).toBeUndefined();
  });

  it('Override points the service at the host', () => {
    const config = renderConfig({ files: HOST_LLM_FILES });

    expect(config.services.triage.environment?.OLLAMA_BASE_URL).toBe('http://host.docker.internal:11434');
  });
});
