import { describe, expect, it } from 'vitest';
import { TicketSchema, TraceEntrySchema, TriageResultSchema } from './triage';

const aTicket = (overrides: Record<string, unknown> = {}) => ({
  email: 'anna@example.com',
  subject: 'Where is my order?',
  body: 'I ordered a lamp a week ago.',
  ...overrides,
});

const aTriageResult = (overrides: Record<string, unknown> = {}) => ({
  category: 'refund_request',
  priority: 'high',
  action: 'propose_refund',
  replyDraft: 'We can refund your order.',
  citedArticles: ['refund-policy'],
  reasons: ['Delivered 5 days ago'],
  refund: { orderId: 'A-1002', amount: 89, currency: 'USD' },
  flags: { injectionSuspected: false, toolLimitReached: false, policyOverride: false, modelFailure: false },
  summary: 'Refund proposed.',
  ...overrides,
});

const aTraceEntry = (overrides: Record<string, unknown> = {}) => ({
  step: 'tool',
  tool: 'get_order',
  input: { orderId: 'A-1002' },
  output: { found: true },
  error: null,
  startedAt: '2026-11-13T10:00:00.000Z',
  durationMs: 3,
  ...overrides,
});

const issuePaths = (result: { error?: { issues: { path: PropertyKey[] }[] } }) =>
  result.error?.issues.map((issue) => issue.path.join('.'));

describe('TicketSchema', () => {
  it('accepts a ticket without an order id', () => {
    expect(TicketSchema.safeParse(aTicket()).success).toBe(true);
  });

  it('accepts an empty subject', () => {
    expect(TicketSchema.safeParse(aTicket({ subject: '' })).success).toBe(true);
  });

  it('accepts a subject of 200 and a body of 5000 characters', () => {
    const ticket = aTicket({ subject: 'x'.repeat(200), body: 'x'.repeat(5000) });

    expect(TicketSchema.safeParse(ticket).success).toBe(true);
  });

  it('accepts an order id of 32 letters, digits and dashes', () => {
    const ticket = aTicket({ orderId: 'A-1002-'.padEnd(32, '9') });

    expect(TicketSchema.safeParse(ticket).success).toBe(true);
  });

  it('trims the text fields', () => {
    const parsed = TicketSchema.parse(aTicket({ subject: ' Hi ', body: ' Help ', orderId: ' A-1 ' }));

    expect(parsed).toMatchObject({ subject: 'Hi', body: 'Help', orderId: 'A-1' });
  });

  it.each([
    ['malformed email', 'email', { email: 'not-an-email' }],
    ['missing email', 'email', { email: undefined }],
    ['missing body', 'body', { body: undefined }],
    ['null subject', 'subject', { subject: null }],
    ['whitespace-only body', 'body', { body: '   ' }],
    ['body of 5001 characters', 'body', { body: 'x'.repeat(5001) }],
    ['subject of 201 characters', 'subject', { subject: 'x'.repeat(201) }],
    ['order id with symbols', 'orderId', { orderId: 'drop table;' }],
    ['order id of 33 characters', 'orderId', { orderId: 'A'.repeat(33) }],
    ['empty order id', 'orderId', { orderId: '' }],
    ['whitespace-only order id', 'orderId', { orderId: '   ' }],
  ])('rejects a %s', (_case, field, overrides) => {
    expect(issuePaths(TicketSchema.safeParse(aTicket(overrides)))).toEqual([field]);
  });
});

describe('TriageResultSchema', () => {
  it('accepts a complete result', () => {
    expect(TriageResultSchema.safeParse(aTriageResult()).success).toBe(true);
  });

  it('accepts a refund of 0', () => {
    const result = aTriageResult({ refund: { orderId: 'A-1', amount: 0, currency: 'USD' } });

    expect(TriageResultSchema.safeParse(result).success).toBe(true);
  });

  it('accepts an escalation without a draft and without a refund', () => {
    const result = aTriageResult({ action: 'escalate', replyDraft: null, refund: null });

    expect(TriageResultSchema.safeParse(result).success).toBe(true);
  });

  it.each([
    ['action outside the closed list', 'action', { action: 'refund_now' }],
    ['unknown category', 'category', { category: 'billing' }],
    ['unknown priority', 'priority', { priority: 'critical' }],
    ['negative refund amount', 'refund.amount', { refund: { orderId: 'A-1', amount: -1, currency: 'USD' } }],
    ['missing flags', 'flags', { flags: undefined }],
  ])('rejects an %s', (_case, field, overrides) => {
    expect(issuePaths(TriageResultSchema.safeParse(aTriageResult(overrides)))).toEqual([field]);
  });
});

describe('TraceEntrySchema', () => {
  it('accepts a tool call entry', () => {
    expect(TraceEntrySchema.safeParse(aTraceEntry()).success).toBe(true);
  });

  it('accepts a failed step without a tool and with no duration', () => {
    const entry = aTraceEntry({ step: 'classify', tool: null, error: 'Model unavailable', durationMs: 0 });

    expect(TraceEntrySchema.safeParse(entry).success).toBe(true);
  });

  it.each([
    ['unknown step', 'step', { step: 'think' }],
    ['non-ISO start time', 'startedAt', { startedAt: 'yesterday' }],
    ['negative duration', 'durationMs', { durationMs: -1 }],
  ])('rejects a %s', (_case, field, overrides) => {
    expect(issuePaths(TraceEntrySchema.safeParse(aTraceEntry(overrides)))).toEqual([field]);
  });
});
