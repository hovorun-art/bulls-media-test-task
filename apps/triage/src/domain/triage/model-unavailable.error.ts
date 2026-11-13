import { DomainError } from '@triage/kernel';

export interface ModelUnavailableErrorParams {
  reason: string;
}

/** The model failed after the configured retries or repair attempts. */
export class ModelUnavailableError extends DomainError {
  constructor(p: ModelUnavailableErrorParams) {
    super({ code: 'MODEL_UNAVAILABLE', message: `Model unavailable: ${p.reason}`, details: { reason: p.reason } });
  }
}
