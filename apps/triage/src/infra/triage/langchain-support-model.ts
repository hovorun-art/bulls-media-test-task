import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { type AIMessage, type BaseMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { ActionSchema, CategorySchema, PrioritySchema, type Ticket } from '@triage/contracts';
import { z } from 'zod';
import { ModelUnavailableError } from '../../domain/triage/model-unavailable.error';
import {
  type ClassifySupportModelRequest,
  type ClassifySupportModelResponse,
  type DecideSupportModelRequest,
  type DecideSupportModelResponse,
  type DescribeSupportModelResponse,
  type DraftSupportModelRequest,
  type DraftSupportModelResponse,
  type NextStepSupportModelRequest,
  type NextStepSupportModelResponse,
  type Observation,
  type SupportModel,
  TOOL_NAMES,
  type ToolName,
} from '../../domain/triage/support-model';
import { AGENT_TOOLS } from './agent-tools';
import { SUPPORT_PROMPTS } from './support-prompts';

const ClassificationOutput = z.object({
  category: CategorySchema,
  priority: PrioritySchema,
  issueSummary: z.string().min(1),
});

const DecisionOutput = z.object({
  action: ActionSchema,
  reasons: z.array(z.string()).min(1),
  citedArticles: z.array(z.string()),
  refundOrderId: z.string().nullable(),
});

const DraftOutput = z.object({ replyDraft: z.string().min(1) });

export interface LangChainSupportModelDeps {
  /** Any LangChain chat model with tool calling (ChatOllama, ChatAnthropic), built without retries of its own. */
  chatModel: BaseChatModel;
}

export interface LangChainSupportModelParams {
  provider: string;
  modelName: string;
  /** Attempts per model call; failed calls are retried with exponential backoff. */
  maxAttempts: number;
  /** Extra attempts, with the validation error shown to the model, when its output fails the schema. */
  repairAttempts: number;
}

/** SupportModel over a LangChain chat model: structured output for decisions, tool calling for research. */
export class LangChainSupportModel implements SupportModel {
  private readonly tools = TOOL_NAMES.map((name) =>
    tool(async () => '', { name, description: AGENT_TOOLS[name].description, schema: AGENT_TOOLS[name].schema }),
  );

  constructor(
    private readonly d: LangChainSupportModelDeps,
    private readonly p: LangChainSupportModelParams,
  ) {}

  async classify(req: ClassifySupportModelRequest): Promise<ClassifySupportModelResponse> {
    return this.structured('classification', ClassificationOutput, req.signal, [
      new SystemMessage(SUPPORT_PROMPTS.classify),
      new HumanMessage(this.fence(req.ticket)),
    ]);
  }

  async nextStep(req: NextStepSupportModelRequest): Promise<NextStepSupportModelResponse> {
    if (!this.d.chatModel.bindTools) throw new ModelUnavailableError({ reason: 'the model does not support tools' });
    const messages = [
      new SystemMessage(SUPPORT_PROMPTS.research),
      new HumanMessage(`${this.fence(req.ticket)}\n\nCategory: ${req.classification.category}\n${this.facts(req.observations)}`),
    ];
    const withTools = this.d.chatModel.bindTools(this.tools).withRetry({ stopAfterAttempt: this.p.maxAttempts });
    const answer = (await this.call(req.signal, () => withTools.invoke(messages, { signal: req.signal }))) as AIMessage;
    const call = answer.tool_calls?.[0];
    if (!call || !this.isToolName(call.name)) return { step: { kind: 'done' } };
    return { step: { kind: 'tool', tool: call.name, args: call.args } };
  }

  async decide(req: DecideSupportModelRequest): Promise<DecideSupportModelResponse> {
    return this.structured('decision', DecisionOutput, req.signal, [
      new SystemMessage(SUPPORT_PROMPTS.decide),
      new HumanMessage(
        `${this.fence(req.ticket)}\n\nClassification: ${JSON.stringify(req.classification)}\n${this.facts(req.observations)}`,
      ),
    ]);
  }

  async draft(req: DraftSupportModelRequest): Promise<DraftSupportModelResponse> {
    const decision = { action: req.action, reasons: req.reasons, refund: req.refund };
    return this.structured('reply', DraftOutput, req.signal, [
      new SystemMessage(SUPPORT_PROMPTS.draft),
      new HumanMessage(
        `${this.fence(req.ticket)}\n\nDecision: ${JSON.stringify(decision)}\n${this.facts(req.observations)}`,
      ),
    ]);
  }

  describe(): DescribeSupportModelResponse {
    return { provider: this.p.provider, name: this.p.modelName };
  }

  /**
   * Asks for output matching the schema. Output that fails it is sent back with the validation error,
   * up to `repairAttempts` times. Failed calls are retried first, up to `maxAttempts`.
   */
  private async structured<T extends z.ZodObject>(
    name: string,
    schema: T,
    signal: AbortSignal | undefined,
    messages: BaseMessage[],
  ): Promise<z.infer<T>> {
    const attempts = this.p.repairAttempts + 1;
    let conversation = messages;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      this.stopIfAborted(signal);
      const runnable = this.d.chatModel
        .withStructuredOutput(schema, { name, includeRaw: true })
        .withRetry({ stopAfterAttempt: this.p.maxAttempts });
      const answer = await this.call(signal, () => runnable.invoke(conversation, { signal }));
      const parsed = schema.safeParse(answer.parsed);
      if (parsed.success) return parsed.data;
      const problems = parsed.error.issues.map((issue) => `${issue.path.join('.') || 'output'} ${issue.message}`);
      conversation = [
        ...messages,
        new HumanMessage(
          `Your previous answer was not valid: ${problems.join('; ')}. Answer again, following the schema exactly.`,
        ),
      ];
    }
    throw new ModelUnavailableError({ reason: `invalid output after ${attempts} attempts` });
  }

  private async call<T>(signal: AbortSignal | undefined, work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      this.stopIfAborted(signal);
      throw new ModelUnavailableError({ reason: error instanceof Error ? error.message : String(error) });
    }
  }

  private stopIfAborted(signal: AbortSignal | undefined): void {
    if (signal?.aborted) throw new ModelUnavailableError({ reason: 'the call was aborted' });
  }

  /** The ticket as untrusted data: angle brackets inside it are neutralised so it cannot close the fence. */
  private fence(ticket: Ticket): string {
    const clean = (text: string) => text.replaceAll('<', '‹').replaceAll('>', '›');
    return [
      '<ticket>',
      `email: ${clean(ticket.email)}`,
      `order id: ${clean(ticket.orderId ?? 'not given')}`,
      `subject: ${clean(ticket.subject)}`,
      'body:',
      clean(ticket.body),
      '</ticket>',
    ].join('\n');
  }

  private facts(observations: Observation[]): string {
    return `<facts>\n${observations.length ? JSON.stringify(observations, null, 1) : 'none yet'}\n</facts>`;
  }

  private isToolName(name: string): name is ToolName {
    return (TOOL_NAMES as readonly string[]).includes(name);
  }
}
