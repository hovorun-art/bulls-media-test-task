import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type ApprovalDecision, RefundProposalSchema, type Run } from '@triage/contracts';
import { useTranslation } from 'react-i18next';
import { decideRefund } from '../../api/client';

/** Approve and Reject for a run paused before a refund; the resumed run replaces the cached one. */
export function RefundApproval({ run }: { run: Run }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const decide = useMutation({
    mutationFn: (decision: ApprovalDecision) => decideRefund(run.id, decision),
    onSuccess: (resumed) => queryClient.setQueryData(['run', run.id], resumed),
  });
  if (run.status !== 'awaiting_approval') return null;

  const policy = run.trace.findLast((entry) => entry.step === 'policy')?.output as { refund?: unknown } | undefined;
  const refund = RefundProposalSchema.safeParse(policy?.refund);

  return (
    <section className="card approval">
      <h2>{t('approval.title')}</h2>
      <p>{refund.success ? t('approval.refund', refund.data) : t('approval.unknownRefund')}</p>
      <div className="approval-actions">
        <button type="button" disabled={decide.isPending} onClick={() => decide.mutate('approve')}>
          {t('approval.approve')}
        </button>
        <button type="button" className="secondary" disabled={decide.isPending} onClick={() => decide.mutate('reject')}>
          {t('approval.reject')}
        </button>
      </div>
      {decide.error && (
        <p role="alert" className="error">
          {t('errors.generic', { message: decide.error.message })}
        </p>
      )}
    </section>
  );
}
