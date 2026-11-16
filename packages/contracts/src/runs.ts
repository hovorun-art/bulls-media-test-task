import { z } from 'zod';
import { ActionSchema, CategorySchema, TicketSchema, TraceEntrySchema, TriageResultSchema } from './triage';

export const ModelInfoSchema = z.object({ provider: z.string(), name: z.string() });
export type ModelInfo = z.infer<typeof ModelInfoSchema>;

export const RUN_STATUSES = ['running', 'awaiting_approval', 'done'] as const;
export const RunStatusSchema = z.enum(RUN_STATUSES);
export type RunStatus = z.infer<typeof RunStatusSchema>;

/** One triage run: the answer of GET /api/runs/:id. It has a result only once it is done. */
export const RunSchema = z
  .object({
    id: z.uuid(),
    createdAt: z.iso.datetime(),
    model: ModelInfoSchema,
    ticket: TicketSchema,
    status: RunStatusSchema,
    result: TriageResultSchema.nullable(),
    trace: z.array(TraceEntrySchema),
  })
  .refine((run) => (run.status === 'done') === (run.result !== null), {
    path: ['result'],
    message: 'A run has a result exactly when it is done',
  });
export type Run = z.infer<typeof RunSchema>;

/** The answer of POST /api/triage: the run goes on in the background. */
export const TriageAcceptedSchema = z.object({ id: z.uuid() });
export type TriageAccepted = z.infer<typeof TriageAcceptedSchema>;

export const RunSummarySchema = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  subject: z.string(),
  status: RunStatusSchema,
  category: CategorySchema.nullable(),
  action: ActionSchema.nullable(),
});
export type RunSummary = z.infer<typeof RunSummarySchema>;

export const RunListSchema = z.object({ runs: z.array(RunSummarySchema) });
export type RunList = z.infer<typeof RunListSchema>;

/** The body of POST /api/runs/:id/approval. */
export const ApprovalRequestSchema = z.object({ decision: z.enum(['approve', 'reject']) });
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;
export type ApprovalDecision = ApprovalRequest['decision'];

/**
 * One event of GET /api/runs/:id/events: the whole run (first, and at every status change) or a
 * finished step with its place in the trace.
 */
export const RunEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('run'), run: RunSchema }),
  z.object({ type: z.literal('step'), index: z.number().int().nonnegative(), entry: TraceEntrySchema }),
]);
export type RunEvent = z.infer<typeof RunEventSchema>;
