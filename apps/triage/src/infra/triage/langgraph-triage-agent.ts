import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import type { Action, RefundProposal, Ticket, TraceEntry, TraceStep, TriageResult } from '@triage/contracts';
import type { Clock, Logger } from '@triage/kernel';
import type { InjectionGuard, InspectInjectionGuardResponse } from '../../domain/guard/injection-guard';
import type { KnowledgeBase } from '../../domain/knowledge-base/knowledge-base';
import type { OrderStore } from '../../domain/orders/order-store';
import type { RefundPolicy } from '../../domain/refunds/refund-policy';
import type {
  Classification,
  DecideSupportModelResponse,
  Observation,
  SupportModel,
  ToolName,
} from '../../domain/triage/support-model';
import type { RunTriageAgentRequest, RunTriageAgentResponse, TriageAgent } from '../../domain/triage/triage-agent';
import { AGENT_TOOLS } from './agent-tools';

/** The final decision after the policy step, before the draft. */
interface Decision {
  action: Action;
  reasons: string[];
  citedArticles: string[];
  refund: RefundProposal | null;
  policyOverride: boolean;
}

/**
 * The graph state. Plain fields keep the last value written; `observations` and `trace` append.
 * Reducers are declared inline because the rules allow no free helper functions.
 */
const AgentState = Annotation.Root({
  runId: Annotation<string>,
  ticket: Annotation<Ticket>,
  injection: Annotation<InspectInjectionGuardResponse | null>({ reducer: (_, next) => next, default: () => null }),
  classification: Annotation<Classification | null>({ reducer: (_, next) => next, default: () => null }),
  pendingTool: Annotation<{ tool: ToolName; args: Record<string, unknown> } | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  toolCalls: Annotation<number>({ reducer: (_, next) => next, default: () => 0 }),
  toolLimitReached: Annotation<boolean>({ reducer: (_, next) => next, default: () => false }),
  observations: Annotation<Observation[]>({ reducer: (all, next) => all.concat(next), default: () => [] }),
  proposal: Annotation<DecideSupportModelResponse | null>({ reducer: (_, next) => next, default: () => null }),
  decision: Annotation<Decision | null>({ reducer: (_, next) => next, default: () => null }),
  replyDraft: Annotation<string | null>({ reducer: (_, next) => next, default: () => null }),
  failure: Annotation<string | null>({ reducer: (_, next) => next, default: () => null }),
  result: Annotation<TriageResult | null>({ reducer: (_, next) => next, default: () => null }),
  trace: Annotation<TraceEntry[]>({ reducer: (all, next) => all.concat(next), default: () => [] }),
});

type State = typeof AgentState.State;
type Update = typeof AgentState.Update;

export interface LangGraphTriageAgentDeps {
  model: SupportModel;
  knowledgeBase: KnowledgeBase;
  orders: OrderStore;
  refundPolicy: RefundPolicy;
  injectionGuard: InjectionGuard;
  clock: Clock;
  logger: Logger;
}

export interface LangGraphTriageAgentParams {
  /** Research stops and the ticket is escalated after this many tool calls. */
  maxToolCalls: number;
  knowledgeBaseResults: number;
}

/**
 * The triage workflow as a LangGraph state graph:
 *
 *   guard → classify → research ⇄ tool → decide → policy → draft → validate
 *
 * - guard: deterministic prompt-injection check; a suspected ticket skips research and decide.
 * - research: the model picks the next tool or says it is done; bounded by maxToolCalls.
 * - policy: deterministic rules over the model's proposal (refund eligibility, limits, injection).
 * - validate: drops unknown citations and builds the result; a model failure anywhere lands here
 *   and becomes an escalation instead of an error.
 */
export class LangGraphTriageAgent implements TriageAgent {
  private readonly graph;

  constructor(
    private readonly d: LangGraphTriageAgentDeps,
    private readonly p: LangGraphTriageAgentParams,
  ) {
    this.graph = new StateGraph(AgentState)
      .addNode('guard', (state) => this.guard(state))
      .addNode('classify', (state) => this.classify(state))
      .addNode('research', (state) => this.research(state))
      .addNode('tool', (state) => this.runTool(state))
      .addNode('decide', (state) => this.decide(state))
      .addNode('policy', (state) => this.policy(state))
      .addNode('draft', (state) => this.draft(state))
      .addNode('validate', (state) => this.validate(state))
      .addEdge(START, 'guard')
      .addEdge('guard', 'classify')
      .addConditionalEdges('classify', (state) => this.afterClassify(state), ['research', 'policy', 'validate'])
      .addConditionalEdges('research', (state) => this.afterResearch(state), ['tool', 'decide', 'policy', 'validate'])
      .addEdge('tool', 'research')
      .addConditionalEdges('decide', (state) => (state.failure ? 'validate' : 'policy'), ['policy', 'validate'])
      .addConditionalEdges('policy', (state) => (state.injection?.suspected ? 'validate' : 'draft'), ['draft', 'validate'])
      .addEdge('draft', 'validate')
      .addEdge('validate', END)
      .compile();
  }

  async run(req: RunTriageAgentRequest): Promise<RunTriageAgentResponse> {
    const final = await this.graph.invoke(
      { runId: req.runId, ticket: req.ticket },
      { recursionLimit: 2 * this.p.maxToolCalls + 20 },
    );
    if (!final.result) throw new Error('Triage graph ended without a result');
    return { result: final.result, trace: final.trace };
  }

  // ---- nodes ----

  private async guard(state: State): Promise<Update> {
    const text = `${state.ticket.subject}\n${state.ticket.body}`;
    const { output, entry } = await this.traced(state, 'guard', null, { length: text.length }, async () =>
      this.d.injectionGuard.inspect({ text }),
    );
    return { injection: output, trace: [entry] };
  }

  private async classify(state: State): Promise<Update> {
    const { output, entry, error } = await this.traced(state, 'classify', null, { ticket: state.ticket }, () =>
      this.d.model.classify({ ticket: state.ticket }),
    );
    return { classification: output, failure: error, trace: [entry] };
  }

  private async research(state: State): Promise<Update> {
    if (state.toolCalls >= this.p.maxToolCalls) {
      return { toolLimitReached: true, pendingTool: null };
    }
    const classification = this.required(state.classification);
    const { output, entry, error } = await this.traced(
      state,
      'research',
      null,
      { observations: state.observations.length },
      () => this.d.model.nextStep({ ticket: state.ticket, classification, observations: state.observations }),
    );
    const step = output?.step;
    // A small model may ask for the same call again instead of moving on: a repeat ends research.
    const wantsNewTool = step?.kind === 'tool' && !this.alreadyCalled(state.observations, step.tool, step.args);
    return {
      pendingTool: wantsNewTool ? { tool: step.tool, args: step.args } : null,
      failure: error,
      trace: [entry],
    };
  }

  private async runTool(state: State): Promise<Update> {
    const { tool, args } = this.required(state.pendingTool);
    const { output, entry } = await this.traced(state, 'tool', tool, args, () => this.callTool(tool, args, state.ticket));
    return {
      observations: [{ tool, args, result: output ?? { error: entry.error } }],
      toolCalls: state.toolCalls + 1,
      pendingTool: null,
      trace: [entry],
    };
  }

  private async decide(state: State): Promise<Update> {
    const classification = this.required(state.classification);
    const { output, entry, error } = await this.traced(state, 'decide', null, { observations: state.observations.length }, () =>
      this.d.model.decide({ ticket: state.ticket, classification, observations: state.observations }),
    );
    return { proposal: output, failure: error, trace: [entry] };
  }

  private async policy(state: State): Promise<Update> {
    const { output, entry } = await this.traced(state, 'policy', null, { proposal: state.proposal }, () =>
      this.applyPolicy(state),
    );
    return { decision: output, trace: [entry] };
  }

  private async draft(state: State): Promise<Update> {
    const decision = this.required(state.decision);
    const { output, entry, error } = await this.traced(state, 'draft', null, { action: decision.action }, () =>
      this.d.model.draft({
        ticket: state.ticket,
        classification: this.required(state.classification),
        action: decision.action,
        reasons: decision.reasons,
        refund: decision.refund,
        observations: state.observations,
      }),
    );
    return { replyDraft: output?.replyDraft ?? null, failure: error, trace: [entry] };
  }

  private async validate(state: State): Promise<Update> {
    const { output, entry } = await this.traced(state, 'validate', null, null, () => this.buildResult(state));
    return { result: output, trace: [entry] };
  }

  // ---- routing ----

  private afterClassify(state: State): 'research' | 'policy' | 'validate' {
    if (state.failure) return 'validate';
    return state.injection?.suspected ? 'policy' : 'research';
  }

  private afterResearch(state: State): 'tool' | 'decide' | 'policy' | 'validate' {
    if (state.failure) return 'validate';
    if (state.toolLimitReached) return 'policy';
    return state.pendingTool ? 'tool' : 'decide';
  }

  // ---- deterministic parts ----

  private async callTool(tool: ToolName, args: Record<string, unknown>, ticket: Ticket): Promise<unknown> {
    const parsed = AGENT_TOOLS[tool].schema.safeParse(args);
    if (!parsed.success) {
      throw new Error(`Invalid arguments: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
    }
    const input = parsed.data as Record<string, string>;
    if (tool === 'search_knowledge_base') {
      return this.d.knowledgeBase.search({ query: input.query ?? '', limit: this.p.knowledgeBaseResults });
    }
    const { order } = await this.d.orders.findForCustomer({ orderId: input.orderId ?? '', email: ticket.email });
    if (!order) return { found: false };
    if (tool === 'get_order') return { found: true, order };
    return { found: true, ...this.d.refundPolicy.check({ order }) };
  }

  /** The model proposes, the rules decide: refunds, injection and the tool limit are never up to the model. */
  private async applyPolicy(state: State): Promise<Decision> {
    if (state.injection?.suspected) {
      const phrases = state.injection.matches.map((match) => `"${match}"`).join(', ');
      return this.escalation([`Possible prompt injection: ${phrases}`], false);
    }
    if (state.toolLimitReached) {
      return this.escalation([`Research stopped after ${this.p.maxToolCalls} tool calls`], false);
    }
    const proposal = this.required(state.proposal);
    const decision: Decision = {
      action: proposal.action,
      reasons: proposal.reasons,
      citedArticles: proposal.citedArticles,
      refund: null,
      policyOverride: false,
    };
    if (proposal.action !== 'propose_refund') return decision;

    const refusal = (reason: string): Decision => ({
      ...decision,
      action: 'escalate',
      reasons: [...proposal.reasons, reason],
      policyOverride: true,
    });
    const orderId = proposal.refundOrderId ?? state.ticket.orderId;
    if (!orderId) return refusal('Refund not allowed: no order id');
    const { order } = await this.d.orders.findForCustomer({ orderId, email: state.ticket.email });
    if (!order) return refusal(`Refund not allowed: order ${orderId} not found for this customer`);
    const eligibility = this.d.refundPolicy.check({ order });
    if (!eligibility.eligible) return refusal(`Refund not allowed: ${eligibility.reason}`);
    if (eligibility.overLimit) {
      return refusal(
        `Refund of ${eligibility.amount} ${eligibility.currency} is above the ${eligibility.maxAutoAmount} ${eligibility.currency} limit for automatic proposals`,
      );
    }
    return { ...decision, refund: { orderId: order.id, amount: eligibility.amount, currency: eligibility.currency } };
  }

  private alreadyCalled(observations: Observation[], tool: ToolName, args: Record<string, unknown>): boolean {
    const call = JSON.stringify(args);
    return observations.some((observation) => observation.tool === tool && JSON.stringify(observation.args) === call);
  }

  private escalation(reasons: string[], policyOverride: boolean): Decision {
    return { action: 'escalate', reasons, citedArticles: [], refund: null, policyOverride };
  }

  private async buildResult(state: State): Promise<TriageResult> {
    const classification = state.classification ?? { category: 'other', priority: 'normal', issueSummary: '' };
    const decision = state.failure ? this.escalation([state.failure], false) : this.required(state.decision);
    const { ids: citedArticles } = await this.d.knowledgeBase.filterKnown({ ids: decision.citedArticles });
    const result: TriageResult = {
      category: classification.category,
      priority: classification.priority,
      action: decision.action,
      replyDraft: state.failure ? null : state.replyDraft,
      citedArticles,
      reasons: decision.reasons,
      refund: decision.refund,
      flags: {
        injectionSuspected: state.injection?.suspected ?? false,
        toolLimitReached: state.toolLimitReached,
        policyOverride: decision.policyOverride,
        modelFailure: state.failure !== null,
      },
      summary: '',
    };
    return { ...result, summary: this.summarize(result, classification.issueSummary) };
  }

  /** A deterministic one-paragraph summary for the human agent. */
  private summarize(result: TriageResult, issueSummary: string): string {
    const action = result.refund
      ? `${result.action} (${result.refund.amount} ${result.refund.currency} for order ${result.refund.orderId})`
      : result.action;
    return [
      `${result.category}, ${result.priority} priority.`,
      `Action: ${action}.`,
      issueSummary,
      `Why: ${result.reasons.map((reason) => reason.trim().replace(/\.$/, '')).join('; ')}.`,
    ]
      .filter((part) => part.length > 0)
      .join(' ');
  }

  // ---- tracing ----

  /**
   * Runs one step, measures it, logs it and turns it into a trace entry. A failure of the step is
   * caught: the entry carries the error and the caller routes to an escalation.
   */
  private async traced<T>(
    state: State,
    step: TraceStep,
    tool: string | null,
    input: unknown,
    work: () => Promise<T> | T,
  ): Promise<{ output: T | null; entry: TraceEntry; error: string | null }> {
    const started = this.d.clock.now().instant;
    let output: T | null = null;
    let error: string | null = null;
    try {
      output = await work();
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
    const entry: TraceEntry = {
      step,
      tool,
      input,
      output,
      error,
      startedAt: started.toISOString(),
      durationMs: this.d.clock.now().instant.getTime() - started.getTime(),
    };
    const log = error ? this.d.logger.warn.bind(this.d.logger) : this.d.logger.info.bind(this.d.logger);
    log({ message: 'agent step', context: { runId: state.runId, step, tool, durationMs: entry.durationMs, error } });
    return { output, entry, error };
  }

  private required<T>(value: T | null): T {
    if (value === null) throw new Error('Triage graph reached a step without its input');
    return value;
  }
}
