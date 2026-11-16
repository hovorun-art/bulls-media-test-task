import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../test-server';
import { aRun, aTraceEntry, renderWithQuery } from '../../test-utils';
import { RefundApproval } from './refund-approval';

const POLICY = aTraceEntry('policy', {
  output: { action: 'propose_refund', refund: { orderId: 'A-1002', amount: 89, currency: 'USD' } },
});

describe('RefundApproval', () => {
  it('Paused run offers Approve and Reject', () => {
    renderWithQuery(<RefundApproval run={aRun({ status: 'awaiting_approval', result: null, trace: [POLICY] })} />);

    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
  });

  it('shows the refund that waits for approval', () => {
    renderWithQuery(<RefundApproval run={aRun({ status: 'awaiting_approval', result: null, trace: [POLICY] })} />);

    expect(screen.getByText('The agent would propose a refund of 89 USD for order A-1002.')).toBeInTheDocument();
  });

  it('names no amount when the proposal is not in the trace', () => {
    renderWithQuery(<RefundApproval run={aRun({ status: 'awaiting_approval', result: null, trace: [] })} />);

    expect(screen.getByText('The agent would propose a refund.')).toBeInTheDocument();
  });

  it('disables both buttons while the decision is sent', async () => {
    const run = aRun({ status: 'awaiting_approval', result: null, trace: [POLICY] });
    server.use(http.post(`*/api/runs/${run.id}/approval`, () => new Promise<never>(() => {})));
    renderWithQuery(<RefundApproval run={run} />);

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));

    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled();
  });

  it.each([
    ['Finished run offers no approval', aRun()],
    ['offers no approval while the run is running', aRun({ status: 'running', result: null, trace: [POLICY] })],
  ])('%s', (_name, run) => {
    const { container } = renderWithQuery(<RefundApproval run={run} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the error when the decision is refused', async () => {
    const run = aRun({ status: 'awaiting_approval', result: null, trace: [POLICY] });
    server.use(
      http.post(`*/api/runs/${run.id}/approval`, () =>
        HttpResponse.json(
          { code: 'RUN_NOT_AWAITING_APPROVAL', message: `Run ${run.id} is not awaiting approval`, details: {} },
          { status: 409 },
        ),
      ),
    );
    renderWithQuery(<RefundApproval run={run} />);

    await userEvent.click(screen.getByRole('button', { name: 'Approve' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(`Something went wrong: Run ${run.id} is not awaiting approval`);
  });
});
