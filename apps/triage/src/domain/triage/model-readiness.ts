/** Checks at start that the configured model can be reached; throws ModelUnavailableError with the fix. */
export interface ModelReadiness {
  check(): Promise<void>;
}

export const MODEL_READINESS = Symbol('ModelReadiness');
