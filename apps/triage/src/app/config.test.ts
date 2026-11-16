import { ConfigInvalidError } from '@triage/kernel';
import { ZodConfigParser } from '@triage/service-kit';
import { describe, expect, it } from 'vitest';
import { TriageConfigSchema } from './config';

const parse = (env: Record<string, string>) => new ZodConfigParser().parse({ schema: TriageConfigSchema, env }).config;

describe('TriageConfigSchema', () => {
  it('Hosted provider without a key does not start', () => {
    expect(() => parse({ LLM_PROVIDER: 'anthropic' })).toThrow(
      new ConfigInvalidError({
        issues: [{ path: 'ANTHROPIC_API_KEY', message: 'is required when LLM_PROVIDER=anthropic' }],
      }),
    );
  });

  it('runs the local model by default', () => {
    expect(parse({})).toMatchObject({
      LLM_PROVIDER: 'ollama',
      OLLAMA_BASE_URL: 'http://127.0.0.1:11434',
      OLLAMA_MODEL: 'qwen3:8b',
      MODEL_MAX_ATTEMPTS: 4,
      MODEL_REPAIR_ATTEMPTS: 2,
      MAX_TOOL_CALLS: 8,
      REFUND_WINDOW_DAYS: 30,
      REFUND_MAX_AUTO_AMOUNT: 500,
      RUN_DEADLINE_SECONDS: 600,
      RUN_EVENTS_HEARTBEAT_SECONDS: 15,
      PORT: 3000,
    });
  });

  it('accepts the hosted provider with a key', () => {
    expect(parse({ LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'test-key' })).toMatchObject({
      LLM_PROVIDER: 'anthropic',
      ANTHROPIC_MODEL: 'claude-sonnet-5-5',
    });
  });

  it('reads numbers from text', () => {
    expect(parse({ MAX_TOOL_CALLS: '3', PORT: '0' })).toMatchObject({ MAX_TOOL_CALLS: 3, PORT: 0 });
  });

  it('accepts the lowest allowed values', () => {
    const lowest = { MODEL_REPAIR_ATTEMPTS: '0', MODEL_MAX_ATTEMPTS: '1', MAX_TOOL_CALLS: '1', REFUND_WINDOW_DAYS: '0' };

    expect(parse(lowest)).toMatchObject({ MODEL_REPAIR_ATTEMPTS: 0, MODEL_MAX_ATTEMPTS: 1, MAX_TOOL_CALLS: 1, REFUND_WINDOW_DAYS: 0 });
  });

  it.each([
    ['LLM_PROVIDER', 'gpt'],
    ['ANTHROPIC_API_KEY', ''],
    ['OLLAMA_BASE_URL', 'localhost'],
    ['MODEL_MAX_ATTEMPTS', '0'],
    ['MODEL_REPAIR_ATTEMPTS', '-1'],
    ['REFUND_WINDOW_DAYS', '-1'],
    ['OLLAMA_MODEL', ''],
    ['ANTHROPIC_MODEL', ''],
    ['MAX_TOOL_CALLS', '0'],
    ['MAX_TOOL_CALLS', '2.5'],
    ['REFUND_MAX_AUTO_AMOUNT', '-1'],
    ['RUN_DEADLINE_SECONDS', '0'],
    ['RUN_EVENTS_HEARTBEAT_SECONDS', '0'],
    ['PORT', '-1'],
    ['LOG_LEVEL', 'verbose'],
  ])('refuses to start with %s=%s', (name, value) => {
    expect(() => parse({ [name]: value })).toThrow(expect.objectContaining({ details: { issues: [expect.objectContaining({ path: name })] } }));
  });
});
