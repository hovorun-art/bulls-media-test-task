import type { Action, Category, Priority, RefundProposal, Ticket } from '@triage/contracts';

export const TOOL_NAMES = ['search_knowledge_base', 'get_order', 'check_refund_eligibility'] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

/** One tool call the agent made and what it got back. */
export interface Observation {
  tool: ToolName;
  args: Record<string, unknown>;
  result: unknown;
}

export interface Classification {
  category: Category;
  priority: Priority;
  /** One sentence for the human agent. */
  issueSummary: string;
}

export interface ClassifySupportModelRequest {
  ticket: Ticket;
}

export type ClassifySupportModelResponse = Classification;

export interface NextStepSupportModelRequest {
  ticket: Ticket;
  classification: Classification;
  observations: Observation[];
}

export interface NextStepSupportModelResponse {
  /** The tool to call next, or done when the facts are enough to decide. */
  step: { kind: 'tool'; tool: ToolName; args: Record<string, unknown> } | { kind: 'done' };
}

export interface DecideSupportModelRequest {
  ticket: Ticket;
  classification: Classification;
  observations: Observation[];
}

export interface DecideSupportModelResponse {
  action: Action;
  reasons: string[];
  citedArticles: string[];
  /** The order to refund when the action is propose_refund. */
  refundOrderId: string | null;
}

export interface DraftSupportModelRequest {
  ticket: Ticket;
  classification: Classification;
  action: Action;
  reasons: string[];
  refund: RefundProposal | null;
  observations: Observation[];
}

export interface DraftSupportModelResponse {
  replyDraft: string;
}

export interface DescribeSupportModelResponse {
  provider: string;
  name: string;
}

/**
 * The language model behind the agent, one method per step that needs it. Implementations retry failed
 * calls and repair output that fails its schema; when that is exhausted they throw ModelUnavailableError.
 */
export interface SupportModel {
  classify(req: ClassifySupportModelRequest): Promise<ClassifySupportModelResponse>;
  nextStep(req: NextStepSupportModelRequest): Promise<NextStepSupportModelResponse>;
  decide(req: DecideSupportModelRequest): Promise<DecideSupportModelResponse>;
  draft(req: DraftSupportModelRequest): Promise<DraftSupportModelResponse>;
  describe(): DescribeSupportModelResponse;
}

export const SUPPORT_MODEL = Symbol('SupportModel');
