import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { server } from '../../test-server';
import { aRun, renderWithQuery } from '../../test-utils';
import { TicketForm } from './ticket-form';

describe('TicketForm', () => {
  it('Picking a sample fills the form', async () => {
    renderWithQuery(<TicketForm onTriaged={vi.fn()} />);

    await userEvent.selectOptions(screen.getByLabelText('Sample ticket'), 'Refund inside the window');

    expect(screen.getByLabelText('Customer email')).toHaveValue('anna@example.com');
    expect(screen.getByLabelText('Subject')).toHaveValue('Refund for my headphones');
    expect(screen.getByLabelText('Message')).toHaveValue(
      'The wireless headphones I received last week stopped charging. I would like my money back, please.',
    );
    expect(screen.getByLabelText('Order id (optional)')).toHaveValue('A-1002');
  });

  it('Validation errors are shown', async () => {
    server.use(
      http.post('*/api/triage', () =>
        HttpResponse.json(
          { code: 'VALIDATION_FAILED', message: 'Invalid input: email: Invalid email address', details: {} },
          { status: 400 },
        ),
      ),
    );
    const onTriaged = vi.fn();
    renderWithQuery(<TicketForm onTriaged={onTriaged} />);
    await userEvent.type(screen.getByLabelText('Customer email'), 'anna-at-example');
    await userEvent.type(screen.getByLabelText('Message'), 'Where is my lamp?');

    await userEvent.click(screen.getByRole('button', { name: 'Triage ticket' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid input: email: Invalid email address');
    expect(screen.getByLabelText('Customer email')).toHaveValue('anna-at-example');
    expect(onTriaged).not.toHaveBeenCalled();
  });

  it('leaves the order id empty for a sample without one', async () => {
    renderWithQuery(<TicketForm onTriaged={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText('Sample ticket'), 'Refund inside the window');

    await userEvent.selectOptions(screen.getByLabelText('Sample ticket'), 'Out of scope');

    expect(screen.getByLabelText('Order id (optional)')).toHaveValue('');
  });

  it('sends a typed order id', async () => {
    let sent: unknown;
    server.use(
      http.post('*/api/triage', async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(aRun());
      }),
    );
    renderWithQuery(<TicketForm onTriaged={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Customer email'), 'anna@example.com');
    await userEvent.type(screen.getByLabelText('Message'), 'Refund please');
    await userEvent.type(screen.getByLabelText('Order id (optional)'), 'A-1002');

    await userEvent.click(screen.getByRole('button', { name: 'Triage ticket' }));

    await vi.waitFor(() => expect(sent).toEqual({ email: 'anna@example.com', subject: '', body: 'Refund please', orderId: 'A-1002' }));
  });

  it('leaves out an order id of only spaces', async () => {
    let sent: unknown;
    server.use(
      http.post('*/api/triage', async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(aRun());
      }),
    );
    renderWithQuery(<TicketForm onTriaged={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Customer email'), 'anna@example.com');
    await userEvent.type(screen.getByLabelText('Message'), 'Lamp');
    await userEvent.type(screen.getByLabelText('Order id (optional)'), '   ');

    await userEvent.click(screen.getByRole('button', { name: 'Triage ticket' }));

    await vi.waitFor(() => expect(sent).toEqual({ email: 'anna@example.com', subject: '', body: 'Lamp' }));
  });

  it('clears the error after a later success', async () => {
    server.use(
      http.post('*/api/triage', () =>
        HttpResponse.json({ code: 'VALIDATION_FAILED', message: 'Invalid input', details: {} }, { status: 400 }), { once: true }),
      http.post('*/api/triage', () => HttpResponse.json(aRun())),
    );
    renderWithQuery(<TicketForm onTriaged={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Message'), 'Lamp');
    await userEvent.click(screen.getByRole('button', { name: 'Triage ticket' }));
    await screen.findByRole('alert');

    await userEvent.click(screen.getByRole('button', { name: 'Triage ticket' }));

    await vi.waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('disables the button while the agent works', async () => {
    server.use(http.post('*/api/triage', () => new Promise<Response>(() => undefined)));
    renderWithQuery(<TicketForm onTriaged={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Customer email'), 'anna@example.com');
    await userEvent.type(screen.getByLabelText('Message'), 'Where is my lamp?');

    await userEvent.click(screen.getByRole('button', { name: 'Triage ticket' }));

    expect(await screen.findByRole('button', { name: 'Triaging… a local model can take a minute or two' })).toBeDisabled();
  });

  it('sends the ticket without an empty order id and hands over the run', async () => {
    const run = aRun();
    let sent: unknown;
    server.use(
      http.post('*/api/triage', async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(run);
      }),
    );
    const onTriaged = vi.fn();
    renderWithQuery(<TicketForm onTriaged={onTriaged} />);
    await userEvent.type(screen.getByLabelText('Customer email'), 'anna@example.com');
    await userEvent.type(screen.getByLabelText('Subject'), 'Lamp');
    await userEvent.type(screen.getByLabelText('Message'), 'Where is my lamp?');

    await userEvent.click(screen.getByRole('button', { name: 'Triage ticket' }));

    await vi.waitFor(() => expect(onTriaged).toHaveBeenCalledWith(run));
    expect(sent).toEqual({ email: 'anna@example.com', subject: 'Lamp', body: 'Where is my lamp?' });
  });
});
