import type { ApprovalDecision, Ticket, TraceEntry, TriageResult } from '@triage/contracts';

/** Called with each trace entry as soon as its step ends. */
export type TriageStepListener = (entry: TraceEntry) => Promise<void>;

/** Where the agent stopped: paused for a person's approval of a refund, or done with a result. */
export type TriageAgentOutcome =
  | { status: 'awaiting_approval'; result: null; trace: TraceEntry[] }
  | { status: 'done'; result: TriageResult; trace: TraceEntry[] };

export interface RunTriageAgentRequest {
  runId: string;
  ticket: Ticket;
  onStep: TriageStepListener;
}

export type RunTriageAgentResponse = TriageAgentOutcome;

export interface ResumeTriageAgentRequest {
  runId: string;
  decision: ApprovalDecision;
  onStep: TriageStepListener;
}

export type ResumeTriageAgentResponse = TriageAgentOutcome;

/**
 * The multi-step agent: never throws for model failures, it escalates instead. A refund it would
 * propose pauses the run until `resume` brings a person's decision; the pause survives a restart.
 */
export interface TriageAgent {
  run(req: RunTriageAgentRequest): Promise<RunTriageAgentResponse>;
  resume(req: ResumeTriageAgentRequest): Promise<ResumeTriageAgentResponse>;
}

export const TRIAGE_AGENT = Symbol('TriageAgent');
