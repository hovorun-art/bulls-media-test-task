import { randomUUID } from 'node:crypto';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { server } from '../../test-server';
import { aRunSummary, renderWithQuery } from '../../test-utils';
import { RunHistory } from './run-history';

const RUN_ID = randomUUID();

const aSummary = (overrides: Parameters<typeof aRunSummary>[0] = {}) => aRunSummary({ id: RUN_ID, ...overrides });

describe('RunHistory', () => {
  it('lists past runs and reports the one clicked', async () => {
    server.use(http.get('*/api/runs', () => HttpResponse.json({ runs: [aSummary()] })));
    const onSelect = vi.fn();
    renderWithQuery(<RunHistory selectedId={null} onSelect={onSelect} />);

    await userEvent.click(await screen.findByRole('button', { name: /Laptop refund Escalate to a human/ }));

    expect(onSelect).toHaveBeenCalledWith(RUN_ID);
  });

  it('Running run shows its status in the history', async () => {
    server.use(http.get('*/api/runs', () => HttpResponse.json({ runs: [aSummary({ status: 'running', category: null, action: null })] })));

    renderWithQuery(<RunHistory selectedId={null} onSelect={vi.fn()} />);

    expect(await screen.findByRole('button', { name: /Laptop refund Running/ })).toBeInTheDocument();
  });

  it('shows a paused run as awaiting approval', async () => {
    server.use(
      http.get('*/api/runs', () =>
        HttpResponse.json({ runs: [aSummary({ status: 'awaiting_approval', category: null, action: null })] }),
      ),
    );

    renderWithQuery(<RunHistory selectedId={null} onSelect={vi.fn()} />);

    expect(await screen.findByRole('button', { name: /Laptop refund Awaiting approval/ })).toBeInTheDocument();
  });

  it('says when there are no runs yet', async () => {
    server.use(http.get('*/api/runs', () => HttpResponse.json({ runs: [] })));

    renderWithQuery(<RunHistory selectedId={null} onSelect={vi.fn()} />);

    expect(await screen.findByText('No runs yet.')).toBeInTheDocument();
  });

  it('marks the selected run', async () => {
    server.use(http.get('*/api/runs', () => HttpResponse.json({ runs: [aSummary(), aRunSummary({ subject: 'Broken lamp' })] })));

    renderWithQuery(<RunHistory selectedId={RUN_ID} onSelect={vi.fn()} />);

    expect(await screen.findByRole('button', { name: /Laptop refund/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: /Broken lamp/ })).toHaveAttribute('aria-current', 'false');
  });

  it('names a run without a subject by its id', async () => {
    server.use(http.get('*/api/runs', () => HttpResponse.json({ runs: [aSummary({ subject: '' })] })));

    renderWithQuery(<RunHistory selectedId={null} onSelect={vi.fn()} />);

    expect(await screen.findByRole('button', { name: new RegExp(RUN_ID) })).toBeInTheDocument();
  });

  it('shows an error when the runs cannot be loaded', async () => {
    server.use(
      http.get('*/api/runs', () =>
        HttpResponse.json({ code: 'INTERNAL_ERROR', message: 'Internal server error', details: {} }, { status: 500 }),
      ),
    );

    renderWithQuery(<RunHistory selectedId={null} onSelect={vi.fn()} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong: Internal server error');
  });
});
