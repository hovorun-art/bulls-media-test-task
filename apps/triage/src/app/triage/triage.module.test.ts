import 'reflect-metadata';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { PinoLogger, ZodConfigParser } from '@triage/service-kit';
import { pino } from 'pino';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import { SUPPORT_MODEL, type SupportModel } from '../../domain/triage/support-model';
import type { ModelReadiness } from '../../domain/triage/model-readiness';
import { AppModule } from '../app.module';
import { TriageConfigSchema } from '../config';

/** Builds the app the way production does, with the real chat model from the config, and returns its model description. */
async function describedModelFor(directory: string, env: Record<string, string>) {
  const { config } = new ZodConfigParser().parse({
    schema: TriageConfigSchema,
    env: { GOOGLE_API_KEY: 'test-key', DATABASE_PATH: join(directory, 'runs.sqlite'), ...env },
  });
  const logger = new PinoLogger({ pino: pino({ level: 'silent' }) });
  const readiness = mockDeep<ModelReadiness>();
  readiness.check.mockResolvedValueOnce(undefined);
  const app = await NestFactory.createApplicationContext(AppModule.forRoot({ config, logger, ports: { modelReadiness: readiness } }), {
    logger: false,
  });
  try {
    return app.get<SupportModel>(SUPPORT_MODEL).describe();
  } finally {
    await app.close();
  }
}

describe('TriageModule', () => {
  let directory = '';

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'triage-module-'));
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('Default Gemini model is recorded', async () => {
    expect(await describedModelFor(directory, {})).toEqual({ provider: 'gemini', name: 'gemini-3.8-flash' });
  });

  it('Configured Gemini model is recorded', async () => {
    expect(await describedModelFor(directory, { GEMINI_MODEL: 'gemini-3.5-flash-lite' })).toEqual({
      provider: 'gemini',
      name: 'gemini-3.5-flash-lite',
    });
  });

  it('Old provider settings are ignored', async () => {
    expect(await describedModelFor(directory, { LLM_PROVIDER: 'ollama' })).toEqual({ provider: 'gemini', name: 'gemini-3.8-flash' });
  });
});
