import type { Ticket, TraceEntry, TriageResult } from '@triage/contracts';

export interface RunTriageAgentRequest {
  runId: string;
  ticket: Ticket;
}

export interface RunTriageAgentResponse {
  result: TriageResult;
  trace: TraceEntry[];
}

/** The multi-step agent: never throws for model failures, it escalates instead. */
export interface TriageAgent {
  run(req: RunTriageAgentRequest): Promise<RunTriageAgentResponse>;
}

export const TRIAGE_AGENT = Symbol('TriageAgent');
