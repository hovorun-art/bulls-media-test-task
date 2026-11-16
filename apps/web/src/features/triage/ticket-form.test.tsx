import { randomUUID } from 'node:crypto';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { server } from '../../test-server';
import { renderWithQuery } from '../../test-utils';
import { TicketForm } from './ticket-form';

/** The service accepts the ticket as a new run; `sent` receives the body the form posted. */
function acceptTicket() {
  const id = randomUUID();
  const sent = vi.fn();
  server.use(
    http.post('*/api/triage', async ({ request }) => {
      sent(await request.json());
      return HttpResponse.json({ id }, { status: 202 });
    }),
  );
  return { id, sent };
}

/** Types the two fields every ticket needs. */
async function typeTicket({ email, message }: { email: string; message: string }) {
  await userEvent.type(screen.getByLabelText('Customer email'), email);
  await userEvent.type(screen.getByLabelText('Message'), message);
}

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
    await typeTicket({ email: 'anna-at-example', message: 'Where is my lamp?' });

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

  it('sends a typed subject', async () => {
    const { sent } = acceptTicket();
    renderWithQuery(<TicketForm onTriaged={vi.fn()} />);
    await typeTicket({ email: 'anna@example.com', message: 'Where is my lamp?' });
    await userEvent.type(screen.getByLabelText('Subject'), 'Lamp');

    await userEvent.click(screen.getByRole('button', { name: 'Triage ticket' }));

    await vi.waitFor(() => expect(sent).toHaveBeenCalledWith({ email: 'anna@example.com', subject: 'Lamp', body: 'Where is my lamp?' }));
  });

  it('sends a typed order id', async () => {
    const { sent } = acceptTicket();
    renderWithQuery(<TicketForm onTriaged={vi.fn()} />);
    await typeTicket({ email: 'anna@example.com', message: 'Refund please' });
    await userEvent.type(screen.getByLabelText('Order id (optional)'), 'A-1002');

    await userEvent.click(screen.getByRole('button', { name: 'Triage ticket' }));

    await vi.waitFor(() => expect(sent).toHaveBeenCalledWith({ email: 'anna@example.com', subject: '', body: 'Refund please', orderId: 'A-1002' }));
  });

  it('leaves out an order id of only spaces', async () => {
    const { sent } = acceptTicket();
    renderWithQuery(<TicketForm onTriaged={vi.fn()} />);
    await typeTicket({ email: 'anna@example.com', message: 'Lamp' });
    await userEvent.type(screen.getByLabelText('Order id (optional)'), '   ');

    await userEvent.click(screen.getByRole('button', { name: 'Triage ticket' }));

    await vi.waitFor(() => expect(sent).toHaveBeenCalledWith({ email: 'anna@example.com', subject: '', body: 'Lamp' }));
  });

  it('clears the error after a later success', async () => {
    server.use(
      http.post('*/api/triage', () =>
        HttpResponse.json({ code: 'VALIDATION_FAILED', message: 'Invalid input', details: {} }, { status: 400 }), { once: true }),
      http.post('*/api/triage', () => HttpResponse.json({ id: randomUUID() }, { status: 202 })),
    );
    renderWithQuery(<TicketForm onTriaged={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Message'), 'Lamp');
    await userEvent.click(screen.getByRole('button', { name: 'Triage ticket' }));
    await screen.findByRole('alert');

    await userEvent.click(screen.getByRole('button', { name: 'Triage ticket' }));

    await vi.waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('disables the button while the ticket is sent', async () => {
    server.use(http.post('*/api/triage', () => new Promise<Response>(() => undefined)));
    renderWithQuery(<TicketForm onTriaged={vi.fn()} />);
    await typeTicket({ email: 'anna@example.com', message: 'Where is my lamp?' });

    await userEvent.click(screen.getByRole('button', { name: 'Triage ticket' }));

    expect(await screen.findByRole('button', { name: 'Sending…' })).toBeDisabled();
  });

  it('hands the accepted run id to the page', async () => {
    const { id } = acceptTicket();
    const onTriaged = vi.fn();
    renderWithQuery(<TicketForm onTriaged={onTriaged} />);
    await typeTicket({ email: 'anna@example.com', message: 'Where is my lamp?' });

    await userEvent.click(screen.getByRole('button', { name: 'Triage ticket' }));

    await vi.waitFor(() => expect(onTriaged).toHaveBeenCalledWith(id));
  });
});
