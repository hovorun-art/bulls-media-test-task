import type { ApprovalDecision, Run, Ticket } from '@triage/contracts';

export interface TriageTicketTriageRequest {
  ticket: Ticket;
}

export interface TriageTicketTriageResponse {
  /** The stored run, still running: the agent goes on in the background. */
  run: Run;
}

export interface DecideTicketTriageRequest {
  runId: string;
  decision: ApprovalDecision;
}

export interface DecideTicketTriageResponse {
  /** The run, running again: the agent goes on in the background. */
  run: Run;
}

export interface CloseInterruptedTicketTriageResponse {
  closed: string[];
}

/**
 * Use case: triage tickets as stored runs. A run is stored from its start and after each step;
 * `decide` throws RunNotFoundError or RunNotAwaitingApprovalError.
 */
export interface TicketTriage {
  triage(req: TriageTicketTriageRequest): Promise<TriageTicketTriageResponse>;
  /** Resumes a run paused for a refund approval with a person's decision. */
  decide(req: DecideTicketTriageRequest): Promise<DecideTicketTriageResponse>;
  /** Ends, as escalations, the runs a stopped service left running. */
  closeInterrupted(): Promise<CloseInterruptedTicketTriageResponse>;
}

export const TICKET_TRIAGE = Symbol('TicketTriage');
