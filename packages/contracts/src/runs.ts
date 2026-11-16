import { z } from 'zod';
import { ActionSchema, CategorySchema, TicketSchema, TraceEntrySchema, TriageResultSchema } from './triage';

export const ModelInfoSchema = z.object({ provider: z.string(), name: z.string() });
export type ModelInfo = z.infer<typeof ModelInfoSchema>;

/** One triage run: the answer of POST /api/triage and GET /api/runs/:id. */
export const RunSchema = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  model: ModelInfoSchema,
  ticket: TicketSchema,
  result: TriageResultSchema,
  trace: z.array(TraceEntrySchema),
});
export type Run = z.infer<typeof RunSchema>;

export const RunSummarySchema = z.object({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  subject: z.string(),
  category: CategorySchema,
  action: ActionSchema,
});
export type RunSummary = z.infer<typeof RunSummarySchema>;

export const RunListSchema = z.object({ runs: z.array(RunSummarySchema) });
export type RunList = z.infer<typeof RunListSchema>;
