import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { App } from './app';
import { server } from './test-server';
import { aRun, aRunSummary, renderWithQuery } from './test-utils';

const noRuns = () => http.get('*/api/runs', () => HttpResponse.json({ runs: [] }));

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
    const id = crypto.randomUUID();
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
});
