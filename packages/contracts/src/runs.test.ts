import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { RunSchema, RunSummarySchema } from './runs';

const aRunSummary = (overrides: Record<string, unknown> = {}) => ({
  id: randomUUID(),
  createdAt: '2026-11-13T12:00:00.000Z',
  subject: 'Where is my order?',
  category: 'order_status',
  action: 'reply',
  ...overrides,
});

const aRun = (overrides: Record<string, unknown> = {}) => ({
  id: randomUUID(),
  createdAt: '2026-11-13T12:00:00.000Z',
  model: { provider: 'ollama', name: 'qwen3:8b' },
  ticket: { email: 'anna@example.com', subject: 'Order', body: 'Where is it?' },
  result: {
    category: 'order_status',
    priority: 'normal',
    action: 'reply',
    replyDraft: 'On its way.',
    citedArticles: [],
    reasons: ['Shipped'],
    refund: null,
    flags: { injectionSuspected: false, toolLimitReached: false, policyOverride: false, modelFailure: false },
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
});

describe('RunSummarySchema', () => {
  it('accepts a summary', () => {
    expect(RunSummarySchema.safeParse(aRunSummary()).success).toBe(true);
  });

  it.each([
    ['id that is not a UUID', 'id', { id: 'run-1' }],
    ['unknown action', 'action', { action: 'ignore' }],
  ])('rejects a summary with an %s', (_case, field, overrides) => {
    expect(issuePaths(RunSummarySchema.safeParse(aRunSummary(overrides)))).toEqual([field]);
  });
});
