import { z } from 'zod';

export const TICKET_LIMITS = { subject: 200, body: 5000 } as const;

export const TicketSchema = z.object({
  email: z.email(),
  subject: z.string().trim().max(TICKET_LIMITS.subject),
  body: z.string().trim().min(1).max(TICKET_LIMITS.body),
  orderId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{1,32}$/, 'Order id has letters, digits and dashes only')
    .optional(),
});
export type Ticket = z.infer<typeof TicketSchema>;

export const CATEGORIES = [
  'order_status',
  'shipping_issue',
  'refund_request',
  'product_question',
  'account',
  'other',
] as const;
export const CategorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof CategorySchema>;

export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export const PrioritySchema = z.enum(PRIORITIES);
export type Priority = z.infer<typeof PrioritySchema>;

export const ACTIONS = ['reply', 'propose_refund', 'escalate', 'refuse'] as const;
export const ActionSchema = z.enum(ACTIONS);
export type Action = z.infer<typeof ActionSchema>;

export const RefundProposalSchema = z.object({
  orderId: z.string(),
  amount: z.number().nonnegative(),
  currency: z.string(),
});
export type RefundProposal = z.infer<typeof RefundProposalSchema>;

export const TriageFlagsSchema = z.object({
  injectionSuspected: z.boolean(),
  toolLimitReached: z.boolean(),
  policyOverride: z.boolean(),
  modelFailure: z.boolean(),
  deadlineReached: z.boolean(),
});
export type TriageFlags = z.infer<typeof TriageFlagsSchema>;

export const TriageResultSchema = z.object({
  category: CategorySchema,
  priority: PrioritySchema,
  action: ActionSchema,
  replyDraft: z.string().nullable(),
  citedArticles: z.array(z.string()),
  reasons: z.array(z.string()),
  refund: RefundProposalSchema.nullable(),
  flags: TriageFlagsSchema,
  summary: z.string(),
});
export type TriageResult = z.infer<typeof TriageResultSchema>;

export const TRACE_STEPS = [
  'guard',
  'classify',
  'research',
  'tool',
  'decide',
  'policy',
  'approval',
  'draft',
  'validate',
] as const;
export const TraceStepSchema = z.enum(TRACE_STEPS);
export type TraceStep = z.infer<typeof TraceStepSchema>;

export const TraceEntrySchema = z.object({
  step: TraceStepSchema,
  tool: z.string().nullable(),
  input: z.unknown(),
  output: z.unknown(),
  error: z.string().nullable(),
  startedAt: z.iso.datetime(),
  durationMs: z.number().nonnegative(),
});
export type TraceEntry = z.infer<typeof TraceEntrySchema>;
