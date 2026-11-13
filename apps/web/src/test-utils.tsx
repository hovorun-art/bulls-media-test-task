import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { Run } from '@triage/contracts';
import type { ReactElement } from 'react';

export function renderWithQuery(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

type RunOverrides = Partial<Omit<Run, 'result'>> & { result?: Partial<Run['result']> };

/** A complete run; tests override only what they look at. */
export function aRun(overrides: RunOverrides = {}): Run {
  const { result, ...rest } = overrides;
  return {
    id: crypto.randomUUID(),
    createdAt: '2026-11-13T12:00:00.000Z',
    model: { provider: 'ollama', name: 'qwen3:8b' },
    ticket: { email: 'anna@example.com', subject: 'Where is my order?', body: 'Lamp is late', orderId: 'A-1001' },
    trace: [],
    ...rest,
    result: {
      category: 'order_status',
      priority: 'normal',
      action: 'reply',
      replyDraft: 'Your lamp ships today.',
      citedArticles: [],
      reasons: ['Order is shipped'],
      refund: null,
      flags: { injectionSuspected: false, toolLimitReached: false, policyOverride: false, modelFailure: false },
      summary: 'order_status, normal priority. Action: reply.',
      ...result,
    },
  };
}
