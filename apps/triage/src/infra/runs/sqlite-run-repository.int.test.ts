import { randomUUID } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
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
  status: 'done',
  result: {
    category: 'order_status',
    priority: 'normal',
    action: 'reply',
    replyDraft: 'It ships tomorrow.',
    citedArticles: ['order-tracking'],
    reasons: ['Order is shipped'],
    refund: null,
    flags: {
      injectionSuspected: false,
      toolLimitReached: false,
      policyOverride: false,
      modelFailure: false,
      deadlineReached: false,
    },
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
      { id: newer.id, createdAt: '2026-11-13T11:00:00.000Z', subject: 'Where is my order?', status: 'done', category: 'order_status', action: 'reply' },
      { id: older.id, createdAt: '2026-11-13T10:00:00.000Z', subject: 'Where is my order?', status: 'done', category: 'order_status', action: 'reply' },
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

  it('replaces a saved run with its newer state', async () => {
    const repository = new SqliteRunRepository({ database });
    const running = aRun({ status: 'running', result: null, trace: [] });
    await repository.save({ run: running });
    const done = aRun({ id: running.id });

    await repository.save({ run: done });

    expect((await repository.get({ id: running.id })).run).toEqual(done);
    expect((await repository.list({ limit: 10 })).runs).toEqual([
      expect.objectContaining({ id: running.id, status: 'done', category: 'order_status', action: 'reply' }),
    ]);
  });

  it('lists a running run with its status and without a category or action', async () => {
    const repository = new SqliteRunRepository({ database });
    const run = aRun({ status: 'running', result: null });
    await repository.save({ run });

    const { runs } = await repository.list({ limit: 10 });

    expect(runs).toEqual([
      { id: run.id, createdAt: '2026-11-13T10:00:00.000Z', subject: 'Where is my order?', status: 'running', category: null, action: null },
    ]);
  });

  it('finds the runs that are still running', async () => {
    const repository = new SqliteRunRepository({ database });
    const running = aRun({ status: 'running', result: null });
    await repository.save({ run: running });
    await repository.save({ run: aRun({ status: 'awaiting_approval', result: null }) });
    await repository.save({ run: aRun() });

    expect(await repository.listRunning()).toEqual({ runs: [running] });
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

  it('keeps the runs stored before runs had a status, as done', async () => {
    database.close();
    rmSync(join(directory, 'runs.sqlite'));
    database = new DatabaseSync(join(directory, 'runs.sqlite'));
    const firstMigrationOnly = join(directory, 'first-migration');
    mkdirSync(firstMigrationOnly);
    copyFileSync(join(migrationsDirectory, '001_create_runs.sql'), join(firstMigrationOnly, '001_create_runs.sql'));
    new SqliteSchemaMigrator({ database }, { directory: firstMigrationOnly }).migrate();
    // A document from before the status column and the deadline flag.
    const run = aRun();
    const oldRun = {
      ...run,
      status: undefined,
      result: { ...run.result, flags: { injectionSuspected: false, toolLimitReached: false, policyOverride: false, modelFailure: false } },
    };
    database
      .prepare('INSERT INTO runs (id, created_at, subject, category, action, document) VALUES (?, ?, ?, ?, ?, ?)')
      .run(oldRun.id, oldRun.createdAt, 'Where is my order?', 'order_status', 'reply', JSON.stringify(oldRun));

    new SqliteSchemaMigrator({ database }, { directory: migrationsDirectory }).migrate();

    expect((await new SqliteRunRepository({ database }).get({ id: oldRun.id })).run.status).toBe('done');
    expect((await new SqliteRunRepository({ database }).list({ limit: 10 })).runs[0]?.status).toBe('done');
  });
});
