import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { App } from './app';
import { server } from './test-server';
import { aRun, renderWithQuery } from './test-utils';

const noRuns = () => http.get('*/api/runs', () => HttpResponse.json({ runs: [] }));

describe('App', () => {
  it('asks for a ticket before anything is selected', async () => {
    server.use(noRuns());

    renderWithQuery(<App />);

    expect(await screen.findByText("Submit a ticket or open a past run to see the agent's decision.")).toBeInTheDocument();
  });

  it('opens the result of a ticket just triaged', async () => {
    const run = aRun({ result: { summary: 'order_status, normal priority. Action: reply.' } });
    server.use(noRuns(), http.post('*/api/triage', () => HttpResponse.json(run)));
    renderWithQuery(<App />);
    await userEvent.type(screen.getByLabelText('Customer email'), 'anna@example.com');
    await userEvent.type(screen.getByLabelText('Message'), 'Where is my lamp?');

    await userEvent.click(screen.getByRole('button', { name: 'Triage ticket' }));

    expect(await screen.findByText('order_status, normal priority. Action: reply.')).toBeInTheDocument();
  });

  it('shows an error when a past run cannot be opened', async () => {
    const id = crypto.randomUUID();
    server.use(
      http.get('*/api/runs', () =>
        HttpResponse.json({ runs: [{ id, createdAt: '2026-11-13T12:00:00.000Z', subject: 'Gone', category: 'other', action: 'reply' }] }),
      ),
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
      http.get('*/api/runs', () =>
        HttpResponse.json({
          runs: [{ id: run.id, createdAt: run.createdAt, subject: 'Laptop refund', category: 'refund_request', action: 'escalate' }],
        }),
      ),
      http.get(`*/api/runs/${run.id}`, () => HttpResponse.json(run)),
    );
    renderWithQuery(<App />);

    await userEvent.click(await screen.findByRole('button', { name: /Laptop refund/ }));

    expect(await screen.findByText('refund_request, high priority. Action: escalate.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /guard/ })).toBeInTheDocument();
  });
});
