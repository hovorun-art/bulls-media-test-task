import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RunHistory } from './features/runs/run-history';
import { useRun } from './features/runs/use-runs';
import { TicketForm } from './features/triage/ticket-form';
import { TraceTimeline } from './features/triage/trace-timeline';
import { TriageResult } from './features/triage/triage-result';

export function App() {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const run = useRun(selectedId);

  return (
    <main>
      <header>
        <h1>{t('app.title')}</h1>
        <p className="muted">{t('app.subtitle')}</p>
      </header>
      <div className="layout">
        <div className="column">
          <TicketForm onTriaged={setSelectedId} />
          <RunHistory selectedId={selectedId} onSelect={setSelectedId} />
        </div>
        <div className="column">
          {run.error && <p role="alert" className="error">{t('errors.generic', { message: run.error.message })}</p>}
          {run.data ? (
            <>
              <TriageResult run={run.data} />
              <TraceTimeline trace={run.data.trace} />
            </>
          ) : (
            <section className="card muted">{t('result.empty')}</section>
          )}
        </div>
      </div>
    </main>
  );
}
