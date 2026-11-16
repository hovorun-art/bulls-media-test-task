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

const aStepEvent = (index: number) => ({
  type: 'step',
  index,
  entry: { step: 'classify', tool: null, input: {}, output: {}, error: null, startedAt: '2026-11-13T12:00:00.000Z', durationMs: 5 },
});

const issuePaths = (result: { error?: { issues: { path: PropertyKey[] }[] } }) =>
  result.error?.issues.map((issue) => issue.path.join('.'));

describe('RunSchema', () => {
  it('accepts a complete run', () => {
    expect(RunSchema.safeParse(aRun()).success).toBe(true);
  });

  it.each([
    ['an id that is not a UUID', 'id', { id: 'run-1' }],
    ['a creation time that is not ISO', 'createdAt', { createdAt: '13.11.2026' }],
    ['a ticket without a body', 'ticket.body', { ticket: { email: 'anna@example.com', subject: 'Order' } }],
  ])('rejects a run with %s', (_case, field, overrides) => {
    expect(issuePaths(RunSchema.safeParse(aRun(overrides)))).toEqual([field]);
  });

  it.each(['running', 'awaiting_approval'])('accepts a %s run without a result', (status) => {
    expect(RunSchema.safeParse(aRun({ status, result: null })).success).toBe(true);
  });

  it('rejects a done run without a result', () => {
    expect(issuePaths(RunSchema.safeParse(aRun({ status: 'done', result: null })))).toEqual(['result']);
  });

  it.each(['running', 'awaiting_approval'])('rejects a %s run with a result', (status) => {
    expect(issuePaths(RunSchema.safeParse(aRun({ status })))).toEqual(['result']);
  });
});

describe('RunSummarySchema', () => {
  it('accepts a summary', () => {
    expect(RunSummarySchema.safeParse(aRunSummary()).success).toBe(true);
  });

  it.each([
    ['an id that is not a UUID', 'id', { id: 'run-1' }],
    ['an unknown action', 'action', { action: 'ignore' }],
    ['an unknown status', 'status', { status: 'paused' }],
  ])('rejects a summary with %s', (_case, field, overrides) => {
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

  it.each([
    ['an unknown decision', { decision: 'maybe' }],
    ['a missing decision', {}],
  ])('rejects %s', (_case, body) => {
    expect(issuePaths(ApprovalRequestSchema.safeParse(body))).toEqual(['decision']);
  });
});

describe('RunEventSchema', () => {
  it('accepts the whole run', () => {
    expect(RunEventSchema.safeParse({ type: 'run', run: aRun() }).success).toBe(true);
  });

  it('accepts the first step of the trace', () => {
    expect(RunEventSchema.safeParse(aStepEvent(0)).success).toBe(true);
  });

  it('rejects an unknown kind of event', () => {
    expect(issuePaths(RunEventSchema.safeParse({ type: 'progress', run: aRun() }))).toEqual(['type']);
  });

  it.each([
    ['a negative index', -1],
    ['a fractional index', 1.5],
  ])('rejects a step with %s', (_case, index) => {
    expect(issuePaths(RunEventSchema.safeParse(aStepEvent(index)))).toEqual(['index']);
  });

  it('rejects a run event whose run breaks the run rules', () => {
    expect(issuePaths(RunEventSchema.safeParse({ type: 'run', run: aRun({ status: 'done', result: null }) }))).toEqual(['run.result']);
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
