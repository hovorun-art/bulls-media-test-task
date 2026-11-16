import 'reflect-metadata';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { PinoLogger, ZodConfigParser } from '@triage/service-kit';
import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { ModelUnavailableError } from '../../domain/triage/model-unavailable.error';
import { SUPPORT_MODEL, type SupportModel } from '../../domain/triage/support-model';
import type { ModelReadiness } from '../../domain/triage/model-readiness';
import { AppModule } from '../app.module';
import { TriageConfigSchema } from '../config';

/**
 * Builds the app the way production does, with the real Gemini clients from the config; the model
 * factories are private to the module, so no lower level can reach them. `readiness` replaces the
 * start check when given.
 */
async function anAppFor(directory: string, env: Record<string, string>, readiness?: ModelReadiness) {
  const { config } = new ZodConfigParser().parse({
    schema: TriageConfigSchema,
    env: { GOOGLE_API_KEY: 'test-key', DATABASE_PATH: join(directory, 'runs.sqlite'), ...env },
  });
  const logger = new PinoLogger({ pino: pino({ level: 'silent' }) });
  return NestFactory.createApplicationContext(AppModule.forRoot({ config, logger, ports: { modelReadiness: readiness } }), {
    logger: false,
    abortOnError: false,
  });
}

/** The app with a start check that passes. */
async function aReadyAppFor(directory: string, env: Record<string, string>) {
  const readiness = mockDeep<ModelReadiness>();
  readiness.check.mockResolvedValueOnce(undefined);
  return anAppFor(directory, env, readiness);
}

async function describedModelFor(directory: string, env: Record<string, string>) {
  const app = await aReadyAppFor(directory, env);
  try {
    return app.get<SupportModel>(SUPPORT_MODEL).describe();
  } finally {
    await app.close();
  }
}

const A_TICKET = { email: 'anna@example.com', subject: 'Order', body: 'Late' };

/** What Gemini answers when it is overloaded. */
const anOverloadedAnswer = () =>
  Response.json({ error: { code: 503, message: 'The model is overloaded.', status: 'UNAVAILABLE' } }, { status: 503 });

/** What Gemini answers with a classification that fails the schema. */
const anInvalidClassification = () =>
  Response.json({
    candidates: [{ content: { role: 'model', parts: [{ text: '{"category":"lost_parcel"}' }] }, finishReason: 'STOP', index: 0 }],
  });

describe('TriageModule', () => {
  let directory = '';
  let app: Awaited<ReturnType<typeof anAppFor>> | undefined;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'triage-module-'));
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    vi.useRealTimers();
    vi.restoreAllMocks();
    rmSync(directory, { recursive: true, force: true });
  });

  it('Default Gemini model is recorded', async () => {
    expect(await describedModelFor(directory, {})).toEqual({ provider: 'gemini', name: 'gemini-flash-lite-latest' });
  });

  it('Configured Gemini model is recorded', async () => {
    expect(await describedModelFor(directory, { GEMINI_MODEL: 'gemini-3.5-flash-lite' })).toEqual({
      provider: 'gemini',
      name: 'gemini-3.5-flash-lite',
    });
  });

  it('Old provider settings are ignored', async () => {
    expect(await describedModelFor(directory, { LLM_PROVIDER: 'ollama' })).toEqual({ provider: 'gemini', name: 'gemini-flash-lite-latest' });
  });

  it('calls the configured Gemini model with the key', async () => {
    app = await aReadyAppFor(directory, { GEMINI_MODEL: 'gemini-3.5-flash-lite' });
    const answer = { category: 'order_status', priority: 'normal', issueSummary: 'Where is A-1001.' };
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      Response.json({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(answer) }] }, finishReason: 'STOP', index: 0 }] }),
    );

    await app.get<SupportModel>(SUPPORT_MODEL).classify({ ticket: A_TICKET });

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
    expect(new Headers(init?.headers).get('x-goog-api-key')).toBe('test-key');
  });

  it('calls the model at most MODEL_MAX_ATTEMPTS times when it keeps failing', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    app = await aReadyAppFor(directory, { MODEL_MAX_ATTEMPTS: '2' });
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(anOverloadedAnswer())
      .mockResolvedValueOnce(anOverloadedAnswer())
      .mockRejectedValueOnce(new Error('a third call must not be made'));

    // The rejection is awaited after the backoff timers have run.
    const outcome = expect(app.get<SupportModel>(SUPPORT_MODEL).classify({ ticket: A_TICKET })).rejects.toThrow(ModelUnavailableError);
    await vi.runAllTimersAsync();

    await outcome;
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('Model call is retried after a transient failure', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    app = await aReadyAppFor(directory, { MODEL_MAX_ATTEMPTS: '2' });
    const answer = { category: 'order_status', priority: 'normal', issueSummary: 'Where is A-1001.' };
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(anOverloadedAnswer())
      .mockResolvedValueOnce(
        Response.json({ candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify(answer) }] }, finishReason: 'STOP', index: 0 }] }),
      );

    const classification = app.get<SupportModel>(SUPPORT_MODEL).classify({ ticket: A_TICKET });
    await vi.runAllTimersAsync();

    expect(await classification).toEqual(answer);
  });

  it('asks the model for a valid answer again MODEL_REPAIR_ATTEMPTS times', async () => {
    app = await aReadyAppFor(directory, { MODEL_REPAIR_ATTEMPTS: '1' });
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(anInvalidClassification())
      .mockResolvedValueOnce(anInvalidClassification())
      .mockRejectedValueOnce(new Error('a third call must not be made'));

    await expect(app.get<SupportModel>(SUPPORT_MODEL).classify({ ticket: A_TICKET })).rejects.toThrow(
      new ModelUnavailableError({ reason: 'invalid output after 2 attempts' }),
    );

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('checks the configured Gemini model with the key at start', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { status: 404 }));

    await expect(anAppFor(directory, { GEMINI_MODEL: 'gemini-unknown' })).rejects.toThrow(
      'the Gemini API does not know the model gemini-unknown',
    );
    expect(fetch).toHaveBeenCalledWith('https://generativelanguage.googleapis.com/v1beta/models/gemini-unknown', {
      headers: { 'x-goog-api-key': 'test-key' },
    });
  });
});
