import {
  type ApprovalDecision,
  type ErrorBody,
  ErrorBodySchema,
  type Run,
  type RunList,
  RunListSchema,
  RunSchema,
  type Ticket,
  type TriageAccepted,
  TriageAcceptedSchema,
} from '@triage/contracts';
import type { z } from 'zod';

/** An error answer of the service, with its uniform body. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ErrorBody,
  ) {
    super(body.message);
  }
}

async function request<T extends z.ZodType>(schema: T, path: string, init?: RequestInit): Promise<z.infer<T>> {
  const response = await fetch(new URL(path, window.location.origin), init);
  const json: unknown = await response.json();
  if (!response.ok) throw new ApiError(response.status, ErrorBodySchema.parse(json));
  return schema.parse(json);
}

export function triageTicket(ticket: Ticket): Promise<TriageAccepted> {
  return request(TriageAcceptedSchema, '/api/triage', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(ticket),
  });
}

export function listRuns(): Promise<RunList> {
  return request(RunListSchema, '/api/runs');
}

export function getRun(id: string): Promise<Run> {
  return request(RunSchema, `/api/runs/${id}`);
}

export function decideRefund(id: string, decision: ApprovalDecision): Promise<Run> {
  return request(RunSchema, `/api/runs/${id}/approval`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ decision }),
  });
}

/** The server-sent event stream of a run (see RunEventSchema). */
export function runEventsUrl(id: string): string {
  return new URL(`/api/runs/${id}/events`, window.location.origin).toString();
}
