import { ZodConfigParser } from '@triage/service-kit';
import { describe, expect, it } from 'vitest';
import { TriageConfigSchema } from './config';

const parse = (env: Record<string, string>) =>
  new ZodConfigParser().parse({
    schema: TriageConfigSchema,
    env: { GOOGLE_API_KEY: 'test-key', ...env },
  }).config;

describe('TriageConfigSchema', () => {
  it('Missing Gemini key does not start', () => {
    expect(() => new ZodConfigParser().parse({ schema: TriageConfigSchema, env: {} })).toThrow(
      expect.objectContaining({
        details: {
          issues: [expect.objectContaining({ path: 'GOOGLE_API_KEY' })],
        },
      }),
    );
  });

  it('applies the defaults', () => {
    expect(parse({})).toMatchObject({
      GEMINI_MODEL: 'gemini-flash-lite-latest',
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

  it('reads the model from GEMINI_MODEL', () => {
    expect(parse({ GEMINI_MODEL: 'gemini-3.5-flash-lite' })).toMatchObject({ GEMINI_MODEL: 'gemini-3.5-flash-lite' });
  });

  it('reads numbers from text', () => {
    expect(parse({ MAX_TOOL_CALLS: '3', PORT: '0' })).toMatchObject({
      MAX_TOOL_CALLS: 3,
      PORT: 0,
    });
  });

  it('accepts the lowest allowed values', () => {
    const lowest = {
      MODEL_REPAIR_ATTEMPTS: '0',
      MODEL_MAX_ATTEMPTS: '1',
      MAX_TOOL_CALLS: '1',
      REFUND_WINDOW_DAYS: '0',
    };

    expect(parse(lowest)).toMatchObject({
      MODEL_REPAIR_ATTEMPTS: 0,
      MODEL_MAX_ATTEMPTS: 1,
      MAX_TOOL_CALLS: 1,
      REFUND_WINDOW_DAYS: 0,
    });
  });

  it.each([
    ['GOOGLE_API_KEY', ''],
    ['GEMINI_MODEL', ''],
    ['MODEL_MAX_ATTEMPTS', '0'],
    ['MODEL_REPAIR_ATTEMPTS', '-1'],
    ['REFUND_WINDOW_DAYS', '-1'],
    ['MAX_TOOL_CALLS', '0'],
    ['MAX_TOOL_CALLS', '2.5'],
    ['REFUND_MAX_AUTO_AMOUNT', '-1'],
    ['RUN_DEADLINE_SECONDS', '0'],
    ['RUN_EVENTS_HEARTBEAT_SECONDS', '0'],
    ['PORT', '-1'],
    ['LOG_LEVEL', 'verbose'],
  ])('refuses to start with %s=%s', (name, value) => {
    expect(() => parse({ [name]: value })).toThrow(
      expect.objectContaining({
        details: { issues: [expect.objectContaining({ path: name })] },
      }),
    );
  });
});
