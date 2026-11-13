import type { Run, Ticket } from '@triage/contracts';

export interface TriageTicketTriageRequest {
  ticket: Ticket;
}

export interface TriageTicketTriageResponse {
  run: Run;
}

/** Use case: triage one ticket and store the run. */
export interface TicketTriage {
  triage(req: TriageTicketTriageRequest): Promise<TriageTicketTriageResponse>;
}

export const TICKET_TRIAGE = Symbol('TicketTriage');
