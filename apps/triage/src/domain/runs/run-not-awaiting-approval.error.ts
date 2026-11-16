import type { RunStatus } from '@triage/contracts';
import { DomainError } from '@triage/kernel';

export interface RunNotAwaitingApprovalErrorParams {
  id: string;
  status: RunStatus;
}

/** An approval or rejection for a run that is not paused for one. */
export class RunNotAwaitingApprovalError extends DomainError {
  constructor(p: RunNotAwaitingApprovalErrorParams) {
    super({
      code: 'RUN_NOT_AWAITING_APPROVAL',
      message: `Run ${p.id} is not awaiting approval`,
      details: { id: p.id, status: p.status },
    });
  }
}
