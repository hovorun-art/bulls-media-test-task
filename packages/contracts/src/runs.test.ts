import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ApprovalRequestSchema, RunEventSchema, RunSchema, RunSummarySchema, TriageAcceptedSchema } from './runs';

const aRunSummary = (overrides: Record<string, unknown> = {}) => ({
  id: randomUUID(),
  createdAt: '2026-11-13T12:00:00.000Z',
  subject: 'Where is my order?',
  status: 'done',
  category: 'order_status',
  action: 'reply',
  ...overrides,
});

const aRun = (overrides: Record<string, unknown> = {}) => ({
  id: randomUUID(),
  createdAt: '2026-11-13T12:00:00.000Z',
  model: { provider: 'ollama', name: 'qwen3:8b' },
  ticket: { email: 'anna@example.com', subject: 'Order', body: 'Where is it?' },
  status: 'done',
  result: {
    category: 'order_status',
    priority: 'normal',
    action: 'reply',
    replyDraft: 'On its way.',
    citedArticles: [],
    reasons: ['Shipped'],
    refund: null,
    flags: {
      injectionSuspected: false,
      toolLimitReached: false,
      policyOverride: false,
      modelFailure: false,
      deadlineReached: false,
    },
    summary: 'order_status, normal priority. Action: reply.',
  },
  trace: [],
  ...overrides,
});

const issuePaths = (result: { error?: { issues: { path: PropertyKey[] }[] } }) =>
  result.error?.issues.map((issue) => issue.path.join('.'));

describe('RunSchema', () => {
  it('accepts a complete run', () => {
    expect(RunSchema.safeParse(aRun()).success).toBe(true);
  });

  it.each([
    ['id that is not a UUID', 'id', { id: 'run-1' }],
    ['creation time that is not ISO', 'createdAt', { createdAt: '13.11.2026' }],
    ['ticket without a body', 'ticket.body', { ticket: { email: 'anna@example.com', subject: 'Order' } }],
  ])('rejects a run with an %s', (_case, field, overrides) => {
    expect(issuePaths(RunSchema.safeParse(aRun(overrides)))).toEqual([field]);
  });

  it.each(['running', 'awaiting_approval'])('accepts a %s run without a result', (status) => {
    expect(RunSchema.safeParse(aRun({ status, result: null })).success).toBe(true);
  });

  it('rejects a done run without a result', () => {
    expect(issuePaths(RunSchema.safeParse(aRun({ status: 'done', result: null })))).toEqual(['result']);
  });

  it('rejects a running run with a result', () => {
    expect(issuePaths(RunSchema.safeParse(aRun({ status: 'running' })))).toEqual(['result']);
  });
});

describe('RunSummarySchema', () => {
  it('accepts a summary', () => {
    expect(RunSummarySchema.safeParse(aRunSummary()).success).toBe(true);
  });

  it.each([
    ['id that is not a UUID', 'id', { id: 'run-1' }],
    ['unknown action', 'action', { action: 'ignore' }],
    ['unknown status', 'status', { status: 'paused' }],
  ])('rejects a summary with an %s', (_case, field, overrides) => {
    expect(issuePaths(RunSummarySchema.safeParse(aRunSummary(overrides)))).toEqual([field]);
  });

  it('accepts a running summary without a category or action', () => {
    expect(RunSummarySchema.safeParse(aRunSummary({ status: 'running', category: null, action: null })).success).toBe(true);
  });
});

describe('ApprovalRequestSchema', () => {
  it.each(['approve', 'reject'])('accepts %s', (decision) => {
    expect(ApprovalRequestSchema.safeParse({ decision }).success).toBe(true);
  });

  it('rejects an unknown decision', () => {
    expect(issuePaths(ApprovalRequestSchema.safeParse({ decision: 'maybe' }))).toEqual(['decision']);
  });
});

describe('RunEventSchema', () => {
  it('accepts the whole run', () => {
    expect(RunEventSchema.safeParse({ type: 'run', run: aRun() }).success).toBe(true);
  });

  it('accepts a finished step with its place in the trace', () => {
    const entry = { step: 'classify', tool: null, input: {}, output: {}, error: null, startedAt: '2026-11-13T12:00:00.000Z', durationMs: 5 };

    expect(RunEventSchema.safeParse({ type: 'step', index: 1, entry }).success).toBe(true);
  });

  it('rejects an unknown kind of event', () => {
    expect(issuePaths(RunEventSchema.safeParse({ type: 'progress', run: aRun() }))).toEqual(['type']);
  });

  it('rejects a step with a negative index', () => {
    const entry = { step: 'classify', tool: null, input: {}, output: {}, error: null, startedAt: '2026-11-13T12:00:00.000Z', durationMs: 5 };

    expect(issuePaths(RunEventSchema.safeParse({ type: 'step', index: -1, entry }))).toEqual(['index']);
  });
});

describe('TriageAcceptedSchema', () => {
  it('accepts the id of the new run', () => {
    expect(TriageAcceptedSchema.safeParse({ id: randomUUID() }).success).toBe(true);
  });

  it('rejects an id that is not a UUID', () => {
    expect(issuePaths(TriageAcceptedSchema.safeParse({ id: 'run-1' }))).toEqual(['id']);
  });
});
