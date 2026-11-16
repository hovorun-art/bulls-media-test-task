import { DomainError } from '@triage/kernel';

export interface RunNotFoundErrorParams {
  id: string;
}

export class RunNotFoundError extends DomainError {
  constructor(p: RunNotFoundErrorParams) {
    super({ code: 'RUN_NOT_FOUND', message: `Run ${p.id} not found`, details: { id: p.id } });
  }
}
