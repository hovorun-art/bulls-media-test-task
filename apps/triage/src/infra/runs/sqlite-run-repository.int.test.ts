import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import type { Run } from '@triage/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RunNotFoundError } from '../../domain/runs/run-not-found.error';
import { SqliteRunRepository } from './sqlite-run-repository';
import { SqliteSchemaMigrator } from './sqlite-schema-migrator';

const migrationsDirectory = fileURLToPath(new URL('../../../migrations', import.meta.url));

const aRun = (overrides: Partial<Run> = {}): Run => ({
  id: randomUUID(),
  createdAt: '2026-11-13T10:00:00.000Z',
  model: { provider: 'ollama', name: 'qwen3:8b' },
  ticket: { email: 'anna@example.com', subject: 'Where is my order?', body: 'Lamp', orderId: 'A-1001' },
  result: {
    category: 'order_status',
    priority: 'normal',
    action: 'reply',
    replyDraft: 'It ships tomorrow.',
    citedArticles: ['order-tracking'],
    reasons: ['Order is shipped'],
    refund: null,
    flags: { injectionSuspected: false, toolLimitReached: false, policyOverride: false, modelFailure: false },
    summary: 'Order status question answered.',
  },
  trace: [
    {
      step: 'tool',
      tool: 'get_order',
      input: { orderId: 'A-1001' },
      output: { found: true },
      error: null,
      startedAt: '2026-11-13T10:00:00.000Z',
      durationMs: 2,
    },
  ],
  ...overrides,
});

describe('SqliteRunRepository', () => {
  let directory: string;
  let database: DatabaseSync;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'runs-'));
    database = new DatabaseSync(join(directory, 'runs.sqlite'));
    new SqliteSchemaMigrator({ database }, { directory: migrationsDirectory }).migrate();
  });

  afterEach(() => {
    database.close();
    rmSync(directory, { recursive: true });
  });

  it('returns a saved run unchanged', async () => {
    const repository = new SqliteRunRepository({ database });
    const run = aRun();

    await repository.save({ run });

    expect((await repository.get({ id: run.id })).run).toEqual(run);
  });

  it('lists runs newest first with their summary', async () => {
    const repository = new SqliteRunRepository({ database });
    const older = aRun({ createdAt: '2026-11-13T10:00:00.000Z' });
    const newer = aRun({ createdAt: '2026-11-13T11:00:00.000Z' });
    await repository.save({ run: older });
    await repository.save({ run: newer });

    const { runs } = await repository.list({ limit: 10 });

    expect(runs).toEqual([
      { id: newer.id, createdAt: '2026-11-13T11:00:00.000Z', subject: 'Where is my order?', category: 'order_status', action: 'reply' },
      { id: older.id, createdAt: '2026-11-13T10:00:00.000Z', subject: 'Where is my order?', category: 'order_status', action: 'reply' },
    ]);
  });

  it('lists at most the requested number of runs, the newest kept', async () => {
    const repository = new SqliteRunRepository({ database });
    const older = aRun({ createdAt: '2026-11-13T10:00:00.000Z' });
    const newer = aRun({ createdAt: '2026-11-13T11:00:00.000Z' });
    await repository.save({ run: older });
    await repository.save({ run: newer });

    const { runs } = await repository.list({ limit: 1 });

    expect(runs.map((run) => run.id)).toEqual([newer.id]);
  });

  it('lists runs of the same time last-saved first', async () => {
    const repository = new SqliteRunRepository({ database });
    const first = aRun({ createdAt: '2026-11-13T10:00:00.000Z' });
    const second = aRun({ createdAt: '2026-11-13T10:00:00.000Z' });
    await repository.save({ run: first });
    await repository.save({ run: second });

    const { runs } = await repository.list({ limit: 10 });

    expect(runs.map((run) => run.id)).toEqual([second.id, first.id]);
  });

  it('lists nothing when no run is stored', async () => {
    const repository = new SqliteRunRepository({ database });

    expect(await repository.list({ limit: 10 })).toEqual({ runs: [] });
  });

  it('refuses a second run with the same id and keeps the first', async () => {
    const repository = new SqliteRunRepository({ database });
    const run = aRun();
    await repository.save({ run });

    await expect(repository.save({ run: aRun({ id: run.id, createdAt: '2026-11-14T10:00:00.000Z' }) })).rejects.toThrow(
      /UNIQUE constraint failed/,
    );

    expect((await repository.get({ id: run.id })).run.createdAt).toBe('2026-11-13T10:00:00.000Z');
  });

  it('throws RunNotFoundError for an unknown id', async () => {
    const repository = new SqliteRunRepository({ database });

    await expect(repository.get({ id: randomUUID() })).rejects.toBeInstanceOf(RunNotFoundError);
  });

  it('keeps the runs across a restart', async () => {
    const run = aRun();
    await new SqliteRunRepository({ database }).save({ run });
    database.close();
    database = new DatabaseSync(join(directory, 'runs.sqlite'));

    const migrated = new SqliteSchemaMigrator({ database }, { directory: migrationsDirectory }).migrate();

    expect(migrated).toEqual({ applied: [] });
    expect((await new SqliteRunRepository({ database }).get({ id: run.id })).run).toEqual(run);
  });
});
