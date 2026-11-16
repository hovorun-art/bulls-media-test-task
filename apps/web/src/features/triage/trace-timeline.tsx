import type { TraceEntry } from '@triage/contracts';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export function TraceTimeline({ trace }: { trace: TraceEntry[] }) {
  const { t } = useTranslation();
  return (
    <section className="card">
      <h2>{t('trace.title')}</h2>
      <ol className="trace">
        {trace.map((entry, index) => (
          <TraceStep key={`${entry.startedAt}-${index}`} entry={entry} />
        ))}
      </ol>
    </section>
  );
}

function TraceStep({ entry }: { entry: TraceEntry }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const name = entry.tool ? `${entry.step} · ${entry.tool}` : entry.step;
  return (
    <li className={entry.error ? 'failed' : undefined}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{name}</span>{' '}
        <span className="muted">{t('trace.duration', { ms: entry.durationMs })}</span>
      </button>
      {open && (
        <div className="trace-data">
          <h4>{t('trace.input')}</h4>
          <pre>{JSON.stringify(entry.input, null, 2)}</pre>
          <h4>{t('trace.output')}</h4>
          <pre>{JSON.stringify(entry.output, null, 2)}</pre>
          {entry.error && (
            <>
              <h4>{t('trace.error')}</h4>
              <pre>{entry.error}</pre>
            </>
          )}
        </div>
      )}
    </li>
  );
}
