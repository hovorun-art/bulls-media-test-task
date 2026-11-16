import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { aTraceEntry } from '../../test-utils';
import { TraceTimeline } from './trace-timeline';

describe('TraceTimeline', () => {
  it('Trace step expands to its data', async () => {
    const toolCall = aTraceEntry('tool', {
      tool: 'get_order',
      input: { orderId: 'A-1001' },
      output: { found: true, carrier: 'UPS' },
    });
    render(<TraceTimeline trace={[toolCall]} />);

    await userEvent.click(screen.getByRole('button', { name: /tool · get_order/ }));

    expect(screen.getByText(/"orderId": "A-1001"/)).toBeVisible();
    expect(screen.getByText(/"carrier": "UPS"/)).toBeVisible();
  });

  it('starts with every step collapsed', () => {
    render(<TraceTimeline trace={[aTraceEntry('classify', { output: { category: 'other' } })]} />);

    expect(screen.getByRole('button', { name: /classify/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/"category": "other"/)).not.toBeInTheDocument();
  });

  it('collapses a step on a second click', async () => {
    render(<TraceTimeline trace={[aTraceEntry('classify', { output: { category: 'other' } })]} />);
    const step = screen.getByRole('button', { name: /classify/ });
    await userEvent.click(step);

    await userEvent.click(step);

    expect(step).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/"category": "other"/)).not.toBeInTheDocument();
  });

  it('shows the error of a failed step', async () => {
    render(<TraceTimeline trace={[aTraceEntry('decide', { error: 'Model unavailable: timeout' })]} />);

    await userEvent.click(screen.getByRole('button', { name: /decide/ }));

    expect(screen.getByText('Model unavailable: timeout')).toBeVisible();
  });

  it('lists the steps in order with their durations', () => {
    render(
      <TraceTimeline
        trace={[aTraceEntry('classify', { durationMs: 900 }), aTraceEntry('tool', { tool: 'get_order', durationMs: 3 })]}
      />,
    );

    const steps = screen.getAllByRole('button');
    expect(steps[0]).toHaveAccessibleName('classify 900 ms');
    expect(steps[1]).toHaveAccessibleName('tool · get_order 3 ms');
  });
});
