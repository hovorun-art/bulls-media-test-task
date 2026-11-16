import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

const RUN_ID = randomUUID();

const TICKET = {
  email: 'anna@example.com',
  subject: 'Refund for my headphones',
  body: 'The wireless headphones I received last week stopped charging. I would like my money back, please.',
  orderId: 'A-1002',
};

const REFUND = { orderId: 'A-1002', amount: 89, currency: 'USD' };

const step = (name: string, extra: Record<string, unknown> = {}) => ({
  step: name,
  tool: null,
  input: {},
  output: {},
  error: null,
  startedAt: '2026-11-13T12:00:01.000Z',
  durationMs: 2,
  ...extra,
});

const ELIGIBILITY = step('tool', {
  tool: 'check_refund_eligibility',
  input: { orderId: 'A-1002' },
  output: { found: true, eligible: true },
});
const POLICY = step('policy', { output: { action: 'propose_refund', refund: REFUND } });

const RUN = {
  id: RUN_ID,
  createdAt: '2026-11-13T12:00:00.000Z',
  model: { provider: 'gemini', name: 'gemini-3.8-flash' },
  ticket: TICKET,
  status: 'running',
  result: null,
  trace: [],
};

const PAUSED = { ...RUN, status: 'awaiting_approval', trace: [step('guard'), ELIGIBILITY, POLICY] };

const DONE = {
  ...RUN,
  status: 'done',
  result: {
    category: 'refund_request',
    priority: 'high',
    action: 'propose_refund',
    replyDraft: 'Hi Anna, we are reviewing a refund of 89 USD for order A-1002.',
    citedArticles: ['refund-policy'],
    reasons: ['Delivered 5 days ago, inside the 30-day window'],
    refund: REFUND,
    flags: { injectionSuspected: false, toolLimitReached: false, policyOverride: false, modelFailure: false, deadlineReached: false },
    summary: 'refund_request, high priority. Action: propose_refund (89 USD for order A-1002).',
  },
  trace: [...PAUSED.trace, step('approval', { output: { decision: 'approve' } }), step('draft'), step('validate')],
};

/** A server-sent event stream as the service sends it. */
const eventStream = (...events: unknown[]) => events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');

/** Serves the given server-sent events on the run's stream. */
const streamOf = (...events: unknown[]) => ({ contentType: 'text/event-stream', body: eventStream(...events) });

test('a support agent triages a sample ticket, follows its steps, approves the refund and sees the decision', async ({ page }) => {
  const summary = { id: RUN_ID, createdAt: RUN.createdAt, subject: TICKET.subject };
  await page.route('**/api/runs', (route) => route.fulfill({ json: { runs: [] } }));
  await page.route(`**/api/runs/${RUN_ID}`, (route) => route.fulfill({ json: RUN }));
  await page.route(`**/api/runs/${RUN_ID}/events`, (route) =>
    route.fulfill(
      streamOf(
        { type: 'run', run: RUN },
        { type: 'step', index: 0, entry: step('guard') },
        { type: 'step', index: 1, entry: ELIGIBILITY },
        { type: 'run', run: PAUSED },
      ),
    ),
  );
  await page.route('**/api/triage', async (route) => {
    await page.route('**/api/runs', (list) => list.fulfill({ json: { runs: [{ ...summary, status: 'running', category: null, action: null }] } }));
    await route.fulfill({ status: 202, json: { id: RUN_ID } });
  });
  await page.route(`**/api/runs/${RUN_ID}/approval`, async (route) => {
    await page.route('**/api/runs', (list) =>
      list.fulfill({ json: { runs: [{ ...summary, status: 'done', category: 'refund_request', action: 'propose_refund' }] } }),
    );
    await page.route(`**/api/runs/${RUN_ID}`, (run) => run.fulfill({ json: DONE }));
    await page.route(`**/api/runs/${RUN_ID}/events`, (events) =>
      events.fulfill(streamOf({ type: 'run', run: { ...PAUSED, status: 'running' } }, { type: 'run', run: DONE })),
    );
    await route.fulfill({ json: { ...PAUSED, status: 'running' } });
  });
  await page.goto('/');

  await page.getByLabel('Sample ticket').selectOption({ label: 'Refund inside the window' });
  await page.getByRole('button', { name: 'Triage ticket' }).click();

  await expect(page.getByRole('button', { name: /tool · check_refund_eligibility/ })).toBeVisible();
  await expect(page.getByText('The agent would propose a refund of 89 USD for order A-1002.')).toBeVisible();

  await page.getByRole('button', { name: 'Approve' }).click();

  await expect(page.getByText('Hi Anna, we are reviewing a refund of 89 USD for order A-1002.')).toBeVisible();
  await expect(page.getByRole('button', { name: /approval/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Refund for my headphones/ })).toHaveAttribute('aria-current', 'true');
});
