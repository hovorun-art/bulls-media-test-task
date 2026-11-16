import type { Ticket } from '@triage/contracts';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SAMPLE_TICKETS } from './samples';
import { useTriage } from './use-triage';

const EMPTY = { email: '', subject: '', body: '', orderId: '' };

/** `onTriaged` gets the id of the accepted run, which goes on in the background. */
export function TicketForm({ onTriaged }: { onTriaged: (id: string) => void }) {
  const { t } = useTranslation();
  const [fields, setFields] = useState(EMPTY);
  const triage = useTriage();

  const pickSample = (id: string) => {
    const sample = SAMPLE_TICKETS.find((candidate) => candidate.id === id);
    if (sample) setFields({ ...EMPTY, ...sample.ticket, orderId: sample.ticket.orderId ?? '' });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const { orderId, ...rest } = fields;
    const ticket: Ticket = orderId.trim() ? { ...rest, orderId } : rest;
    triage.mutate(ticket, { onSuccess: ({ id }) => onTriaged(id) });
  };

  const field = (name: keyof typeof EMPTY) => ({
    id: name,
    value: fields[name],
    onChange: (event: { target: { value: string } }) => setFields({ ...fields, [name]: event.target.value }),
  });

  return (
    <form className="card form" onSubmit={submit}>
      <h2>{t('form.title')}</h2>
      <label htmlFor="sample">{t('form.sample')}</label>
      <select id="sample" defaultValue="" onChange={(event) => pickSample(event.target.value)}>
        <option value="" disabled>
          {t('form.samplePlaceholder')}
        </option>
        {SAMPLE_TICKETS.map((sample) => (
          <option key={sample.id} value={sample.id}>
            {sample.title}
          </option>
        ))}
      </select>
      <label htmlFor="email">{t('form.email')}</label>
      <input type="text" {...field('email')} />
      <label htmlFor="subject">{t('form.subject')}</label>
      <input type="text" {...field('subject')} />
      <label htmlFor="body">{t('form.body')}</label>
      <textarea rows={6} {...field('body')} />
      <label htmlFor="orderId">{t('form.orderId')}</label>
      <input type="text" {...field('orderId')} />
      {triage.error && (
        <p role="alert" className="error">
          {triage.error.message}
        </p>
      )}
      <button type="submit" disabled={triage.isPending}>
        {triage.isPending ? t('form.pending') : t('form.submit')}
      </button>
    </form>
  );
}
