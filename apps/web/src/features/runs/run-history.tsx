import { useTranslation } from 'react-i18next';
import { useRuns } from './use-runs';

export function RunHistory({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string) => void }) {
  const { t } = useTranslation();
  const runs = useRuns();
  return (
    <section className="card">
      <h2>{t('history.title')}</h2>
      {runs.error && (
        <p role="alert" className="error">
          {t('errors.generic', { message: runs.error.message })}
        </p>
      )}
      {runs.data?.runs.length === 0 && <p className="muted">{t('history.empty')}</p>}
      <ul className="history">
        {runs.data?.runs.map((run) => (
          <li key={run.id}>
            <button type="button" aria-current={run.id === selectedId} onClick={() => onSelect(run.id)}>
              <span>{run.subject || run.id}</span>{' '}
              {run.action ? (
                <span className={`badge action-${run.action}`}>{t(`result.actions.${run.action}`)}</span>
              ) : (
                <span className="badge">{t(`history.status.${run.status}`)}</span>
              )}{' '}
              <span className="muted">{new Date(run.createdAt).toLocaleString()}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
