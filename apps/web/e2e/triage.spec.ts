import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

const RUN_ID = randomUUID();

const RUN = {
  id: RUN_ID,
  createdAt: '2026-11-13T12:00:00.000Z',
  model: { provider: 'ollama', name: 'qwen3:8b' },
  ticket: {
    email: 'anna@example.com',
    subject: 'Refund for my headphones',
    body: 'The wireless headphones I received last week stopped charging. I would like my money back, please.',
    orderId: 'A-1002',
  },
  result: {
    category: 'refund_request',
    priority: 'high',
    action: 'propose_refund',
    replyDraft: 'Hi Anna, we are reviewing a refund of 89 USD for order A-1002.',
    citedArticles: ['refund-policy'],
    reasons: ['Delivered 5 days ago, inside the 30-day window'],
    refund: { orderId: 'A-1002', amount: 89, currency: 'USD' },
    flags: { injectionSuspected: false, toolLimitReached: false, policyOverride: false, modelFailure: false },
    summary: 'refund_request, high priority. Action: propose_refund (89 USD for order A-1002).',
  },
  trace: [
    {
      step: 'tool',
      tool: 'check_refund_eligibility',
      input: { orderId: 'A-1002' },
      output: { found: true, eligible: true },
      error: null,
      startedAt: '2026-11-13T12:00:01.000Z',
      durationMs: 2,
    },
  ],
};

test('a support agent triages a sample ticket and sees the decision, the trace and the run in the history', async ({ page }) => {
  let runs: unknown[] = [];
  await page.route('**/api/runs', (route) => route.fulfill({ json: { runs } }));
  await page.route(`**/api/runs/${RUN_ID}`, (route) => route.fulfill({ json: RUN }));
  await page.route('**/api/triage', (route) => {
    runs = [{ id: RUN_ID, createdAt: RUN.createdAt, subject: RUN.ticket.subject, category: 'refund_request', action: 'propose_refund' }];
    return route.fulfill({ json: RUN });
  });
  await page.goto('/');

  await page.getByLabel('Sample ticket').selectOption({ label: 'Refund inside the window' });
  await page.getByRole('button', { name: 'Triage ticket' }).click();

  await expect(page.getByText('Hi Anna, we are reviewing a refund of 89 USD for order A-1002.')).toBeVisible();
  await expect(page.getByRole('button', { name: /tool · check_refund_eligibility/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Refund for my headphones/ })).toHaveAttribute('aria-current', 'true');
});
