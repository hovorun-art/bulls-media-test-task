import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { Run, RunEvent, RunSummary, TraceEntry } from '@triage/contracts';
import { HttpResponse } from 'msw';
import type { ReactElement } from 'react';

export function renderWithQuery(ui: ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

/** A run summary as GET /api/runs lists it. */
export function aRunSummary(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    id: crypto.randomUUID(),
    createdAt: '2026-11-13T12:00:00.000Z',
    subject: 'Laptop refund',
    status: 'done',
    category: 'refund_request',
    action: 'escalate',
    ...overrides,
  };
}

type RunOverrides = Partial<Omit<Run, 'result'>> & { result?: Partial<NonNullable<Run['result']>> | null };

/** A done run; tests override only what they look at (`result: null` for a run that is not done). */
export function aRun(overrides: RunOverrides = {}): Run {
  const { result, ...rest } = overrides;
  return {
    status: 'done',
    id: crypto.randomUUID(),
    createdAt: '2026-11-13T12:00:00.000Z',
    model: { provider: 'ollama', name: 'qwen3:8b' },
    ticket: { email: 'anna@example.com', subject: 'Where is my order?', body: 'Lamp is late', orderId: 'A-1001' },
    trace: [],
    ...rest,
    result: result === null ? null : {
      category: 'order_status',
      priority: 'normal',
      action: 'reply',
      replyDraft: 'Your lamp ships today.',
      citedArticles: [],
      reasons: ['Order is shipped'],
      refund: null,
      flags: {
        injectionSuspected: false,
        toolLimitReached: false,
        policyOverride: false,
        modelFailure: false,
        deadlineReached: false,
      },
      summary: 'order_status, normal priority. Action: reply.',
      ...result,
    },
  };
}

/**
 * A server-sent event stream of a run, as GET /api/runs/:id/events answers. `open: true` keeps it
 * open after the events, like a run that is still going.
 */
export function anEventStream(events: RunEvent[], { open = false } = {}) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('event: heartbeat\ndata: \n\n'));
      for (const event of events) controller.enqueue(encoder.encode(`id: 1\ndata: ${JSON.stringify(event)}\n\n`));
      if (!open) controller.close();
    },
  });
  return new HttpResponse(body, { headers: { 'content-type': 'text/event-stream' } });
}

/** One trace entry of a step that just ended. */
export function aTraceEntry(step: TraceEntry['step'], overrides: Partial<TraceEntry> = {}): TraceEntry {
  return { step, tool: null, input: {}, output: {}, error: null, startedAt: '2026-11-13T12:00:01.000Z', durationMs: 1, ...overrides };
}
