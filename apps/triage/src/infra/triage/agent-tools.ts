import { z } from 'zod';
import type { ToolName } from '../../domain/triage/support-model';

/**
 * The tools the model may ask for: their description and argument schema. The graph validates the
 * arguments with these schemas before running a tool; the model adapter shows them to the model.
 */
export const AGENT_TOOLS: Record<ToolName, { description: string; schema: z.ZodObject }> = {
  search_knowledge_base: {
    description: 'Search the shop policy articles (refunds, shipping, tracking, warranty, account). Returns ids, titles and excerpts.',
    schema: z.object({ query: z.string().min(1).describe('Keywords to search for') }),
  },
  get_order: {
    description: "Look up one of the customer's orders by its id. Returns found: false for orders of other customers.",
    schema: z.object({ orderId: z.string().min(1).describe('Order id, e.g. A-1001') }),
  },
  check_refund_eligibility: {
    description: "Check the refund rules for one of the customer's orders. Returns eligible, reason and amount.",
    schema: z.object({ orderId: z.string().min(1).describe('Order id, e.g. A-1002') }),
  },
};
