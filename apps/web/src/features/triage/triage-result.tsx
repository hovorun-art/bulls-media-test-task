import type { Run, TriageFlags } from '@triage/contracts';
import { useTranslation } from 'react-i18next';

export function TriageResult({ run }: { run: Run }) {
  const { t } = useTranslation();
  const { result } = run;
  if (!result) return null;
  const raised = (Object.keys(result.flags) as (keyof TriageFlags)[]).filter((flag) => result.flags[flag]);

  return (
    <section className="card">
      <h2>{t('result.title')}</h2>
      <div className="badges">
        <span className={`badge action-${result.action}`}>{t(`result.actions.${result.action}`)}</span>
        <span className="badge">
          {t('result.category')}: {result.category}
        </span>
        <span className={`badge priority-${result.priority}`}>
          {t('result.priority')}: {result.priority}
        </span>
        {raised.map((flag) => (
          <span key={flag} className="badge flag">
            {t(`result.flags.${flag}`)}
          </span>
        ))}
      </div>
      <h3>{t('result.summary')}</h3>
      <p>{result.summary}</p>
      {result.refund && <p className="refund">{t('result.refund', result.refund)}</p>}
      <h3>{t('result.replyDraft')}</h3>
      {result.replyDraft ? <pre className="draft">{result.replyDraft}</pre> : <p className="muted">{t('result.noDraft')}</p>}
      <h3>{t('result.reasons')}</h3>
      <ul>
        {result.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      <p className="muted">
        {t('result.citedArticles')}: {result.citedArticles.length ? result.citedArticles.join(', ') : t('result.none')}
        {' · '}
        {t('result.model', run.model)}
      </p>
    </section>
  );
}
