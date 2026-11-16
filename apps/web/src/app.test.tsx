import { randomUUID } from 'node:crypto';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { App } from './app';
import { server } from './test-server';
import { anEventStream, aRun, aRunSummary, aTraceEntry, renderWithQuery } from './test-utils';

const noRuns = () => http.get('*/api/runs', () => HttpResponse.json({ runs: [] }));

/** Submits a ticket; the service accepts it as the given run. */
async function submitTicketAs(id: string) {
  server.use(http.post('*/api/triage', () => HttpResponse.json({ id }, { status: 202 })));
  await userEvent.type(screen.getByLabelText('Customer email'), 'anna@example.com');
  await userEvent.type(screen.getByLabelText('Message'), 'Where is my lamp?');
  await userEvent.click(screen.getByRole('button', { name: 'Triage ticket' }));
}

describe('App', () => {
  it('asks for a ticket before anything is selected', async () => {
    server.use(noRuns());

    renderWithQuery(<App />);

    expect(await screen.findByText("Submit a ticket or open a past run to see the agent's decision.")).toBeInTheDocument();
  });

  it('opens the result of a ticket just triaged and lists it in the history', async () => {
    const run = aRun({ result: { summary: 'Just triaged: the lamp ships tomorrow.' } });
    const summary = aRunSummary({ id: run.id, subject: 'Lamp question', category: 'order_status', action: 'reply' });
    let stored: unknown[] = [];
    server.use(
      http.get('*/api/runs', () => HttpResponse.json({ runs: stored })),
      http.get(`*/api/runs/${run.id}`, () => HttpResponse.json(run)),
      http.post('*/api/triage', () => {
        stored = [summary];
        return HttpResponse.json({ id: run.id }, { status: 202 });
      }),
    );
    renderWithQuery(<App />);
    await userEvent.type(screen.getByLabelText('Customer email'), 'anna@example.com');
    await userEvent.type(screen.getByLabelText('Message'), 'Where is my lamp?');

    await userEvent.click(screen.getByRole('button', { name: 'Triage ticket' }));

    expect(await screen.findByText('Just triaged: the lamp ships tomorrow.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Lamp question/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an error when a past run cannot be opened', async () => {
    const id = randomUUID();
    server.use(
      http.get('*/api/runs', () => HttpResponse.json({ runs: [aRunSummary({ id, subject: 'Gone' })] })),
      http.get(`*/api/runs/${id}`, () =>
        HttpResponse.json({ code: 'RUN_NOT_FOUND', message: `Run ${id} not found`, details: { id } }, { status: 404 }),
      ),
    );
    renderWithQuery(<App />);

    await userEvent.click(await screen.findByRole('button', { name: /Gone/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(`Something went wrong: Run ${id} not found`);
  });

  it('Opening a past run', async () => {
    const run = aRun({
      ticket: { email: 'chris@example.com', subject: 'Laptop refund', body: 'Screen flickers', orderId: 'C-3001' },
      result: { action: 'escalate', summary: 'refund_request, high priority. Action: escalate.' },
      trace: [{ step: 'guard', tool: null, input: null, output: null, error: null, startedAt: '2026-11-13T12:00:00.000Z', durationMs: 1 }],
    });
    server.use(
      http.get('*/api/runs', () => HttpResponse.json({ runs: [aRunSummary({ id: run.id, subject: 'Laptop refund' })] })),
      http.get(`*/api/runs/${run.id}`, () => HttpResponse.json(run)),
    );
    renderWithQuery(<App />);

    await userEvent.click(await screen.findByRole('button', { name: /Laptop refund/ }));

    expect(await screen.findByText('refund_request, high priority. Action: escalate.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /guard/ })).toBeInTheDocument();
  });

  it('shows a submitted ticket as running', async () => {
    const run = aRun({ status: 'running', result: null });
    server.use(
      noRuns(),
      http.get(`*/api/runs/${run.id}`, () => HttpResponse.json(run)),
      http.get(`*/api/runs/${run.id}/events`, () => anEventStream([{ type: 'run', run }], { open: true })),
    );
    renderWithQuery(<App />);

    await submitTicketAs(run.id);

    expect(await screen.findByRole('status')).toHaveTextContent('The agent is working on this ticket…');
  });

  it('Step appears while the run is running', async () => {
    const run = aRun({ status: 'running', result: null, trace: [aTraceEntry('guard')] });
    server.use(
      noRuns(),
      http.get(`*/api/runs/${run.id}`, () => HttpResponse.json(run)),
      http.get(`*/api/runs/${run.id}/events`, () =>
        anEventStream([{ type: 'run', run }, { type: 'step', index: 1, entry: aTraceEntry('classify') }], { open: true }),
      ),
    );
    renderWithQuery(<App />);

    await submitTicketAs(run.id);

    expect(await screen.findByRole('button', { name: /classify/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /guard/ })).toBeInTheDocument();
  });

  it('Result appears when the run is done', async () => {
    const running = aRun({ status: 'running', result: null });
    const done = aRun({ id: running.id, result: { summary: 'Just triaged: the lamp ships tomorrow.' } });
    server.use(
      noRuns(),
      http.get(`*/api/runs/${running.id}`, () => HttpResponse.json(running)),
      http.get(`*/api/runs/${running.id}/events`, () => anEventStream([{ type: 'run', run: running }, { type: 'run', run: done }])),
    );
    renderWithQuery(<App />);

    await submitTicketAs(running.id);

    expect(await screen.findByText('Just triaged: the lamp ships tomorrow.')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('reads the run again when its stream fails', async () => {
    const running = aRun({ status: 'running', result: null });
    const done = aRun({ id: running.id, result: { summary: 'Read again: the lamp ships tomorrow.' } });
    let reads = 0;
    server.use(
      noRuns(),
      http.get(`*/api/runs/${running.id}`, () => HttpResponse.json(reads++ === 0 ? running : done)),
      http.get(`*/api/runs/${running.id}/events`, () => HttpResponse.json({ code: 'INTERNAL', message: 'boom', details: {} }, { status: 500 })),
    );
    renderWithQuery(<App />);

    await submitTicketAs(running.id);

    expect(await screen.findByText('Read again: the lamp ships tomorrow.')).toBeInTheDocument();
  });

  it('updates the history when the run is done', async () => {
    const running = aRun({ status: 'running', result: null });
    const done = aRun({ id: running.id, result: { category: 'order_status', action: 'reply' } });
    let listed = 0;
    const summaries = [
      aRunSummary({ id: running.id, status: 'running', category: null, action: null }),
      aRunSummary({ id: running.id, status: 'done', category: 'order_status', action: 'reply' }),
    ];
    server.use(
      http.get('*/api/runs', () => HttpResponse.json({ runs: [summaries[Math.min(listed++, 1)]] })),
      http.get(`*/api/runs/${running.id}`, () => HttpResponse.json(running)),
      http.get(`*/api/runs/${running.id}/events`, () => anEventStream([{ type: 'run', run: done }])),
    );
    renderWithQuery(<App />);

    await submitTicketAs(running.id);

    expect(await screen.findByText('Reply')).toBeInTheDocument();
    expect(screen.queryByText('Running')).not.toBeInTheDocument();
  });

  it('stops following a run when another run is opened', async () => {
    const first = aRun({ status: 'running', result: null });
    const second = aRun({ result: { summary: 'The second run.' } });
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({ cancel: () => void (cancelled = true) });
    server.use(
      http.get('*/api/runs', () => HttpResponse.json({ runs: [aRunSummary({ id: second.id, subject: 'Second ticket' })] })),
      http.get(`*/api/runs/${first.id}`, () => HttpResponse.json(first)),
      http.get(`*/api/runs/${first.id}/events`, () => new HttpResponse(body, { headers: { 'content-type': 'text/event-stream' } })),
      http.get(`*/api/runs/${second.id}`, () => HttpResponse.json(second)),
    );
    renderWithQuery(<App />);
    await submitTicketAs(first.id);
    await screen.findByRole('status');

    await userEvent.click(screen.getByRole('button', { name: /Second ticket/ }));

    expect(await screen.findByText('The second run.')).toBeInTheDocument();
    await vi.waitFor(() => expect(cancelled).toBe(true));
  });

  it('Approve follows the run to its result', async () => {
    const policy = aTraceEntry('policy', { output: { action: 'propose_refund', refund: { orderId: 'A-1002', amount: 89, currency: 'USD' } } });
    const paused = aRun({ status: 'awaiting_approval', result: null, trace: [policy] });
    const resumed = { ...paused, status: 'running' as const };
    const done = aRun({
      id: paused.id,
      result: { action: 'propose_refund', refund: { orderId: 'A-1002', amount: 89, currency: 'USD' } },
      trace: [policy, aTraceEntry('approval'), aTraceEntry('draft')],
    });
    let sent: unknown;
    server.use(
      noRuns(),
      http.get(`*/api/runs/${paused.id}`, () => HttpResponse.json(paused)),
      http.post(`*/api/runs/${paused.id}/approval`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(resumed);
      }),
      http.get(`*/api/runs/${paused.id}/events`, () =>
        anEventStream([{ type: 'run', run: resumed }, { type: 'step', index: 1, entry: aTraceEntry('approval') }, { type: 'run', run: done }]),
      ),
    );
    renderWithQuery(<App />);
    await submitTicketAs(paused.id);

    await userEvent.click(await screen.findByRole('button', { name: 'Approve' }));

    expect(await screen.findByText('Proposed refund: 89 USD for order A-1002 (needs approval)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /approval/ })).toBeInTheDocument();
    expect(sent).toEqual({ decision: 'approve' });
  });

  it('Reject shows the escalation', async () => {
    const paused = aRun({ status: 'awaiting_approval', result: null });
    const resumed = { ...paused, status: 'running' as const };
    const done = aRun({ id: paused.id, result: { action: 'escalate', replyDraft: null, reasons: ['Refund rejected by a person'] } });
    let sent: unknown;
    server.use(
      noRuns(),
      http.get(`*/api/runs/${paused.id}`, () => HttpResponse.json(paused)),
      http.post(`*/api/runs/${paused.id}/approval`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(resumed);
      }),
      http.get(`*/api/runs/${paused.id}/events`, () => anEventStream([{ type: 'run', run: done }])),
    );
    renderWithQuery(<App />);
    await submitTicketAs(paused.id);

    await userEvent.click(await screen.findByRole('button', { name: 'Reject' }));

    expect(await screen.findByText('Escalate to a human')).toBeInTheDocument();
    expect(screen.getByText('No draft: a human writes this reply.')).toBeInTheDocument();
    expect(sent).toEqual({ decision: 'reject' });
  });
});
