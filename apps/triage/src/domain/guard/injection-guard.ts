export interface InspectInjectionGuardRequest {
  text: string;
}

export interface InspectInjectionGuardResponse {
  suspected: boolean;
  /** The phrases that matched, for the trace. */
  matches: string[];
}

/** Spots text that tries to instruct the agent instead of describing a support problem. */
export interface InjectionGuard {
  inspect(req: InspectInjectionGuardRequest): InspectInjectionGuardResponse;
}

export const INJECTION_GUARD = Symbol('InjectionGuard');
