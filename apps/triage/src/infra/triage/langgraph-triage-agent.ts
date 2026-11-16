import { Annotation, type BaseCheckpointSaver, Command, END, interrupt, START, StateGraph } from '@langchain/langgraph';
import type {
  Action,
  ApprovalDecision,
  RefundProposal,
  Ticket,
  TraceEntry,
  TraceStep,
  TriageResult,
} from '@triage/contracts';
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
import type {
  ResumeTriageAgentRequest,
  ResumeTriageAgentResponse,
  RunTriageAgentRequest,
  RunTriageAgentResponse,
  TriageAgent,
  TriageAgentOutcome,
  TriageStepListener,
} from '../../domain/triage/triage-agent';
import { AGENT_TOOLS } from './agent-tools';

/** The final decision after the policy step, before the draft. */
interface Decision {
  action: Action;
  reasons: string[];
  citedArticles: string[];
  refund: RefundProposal | null;
  policyOverride: boolean;
}

/** One invocation of the graph for a run: its deadline signal and where its steps are reported. */
interface RunSession {
  signal: AbortSignal;
  onStep: TriageStepListener;
  startedAt: number;
  /** Agent time the run spent before this invocation (before the approval pause). */
  spentMs: number;
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
  refundRejected: Annotation<boolean>({ reducer: (_, next) => next, default: () => false }),
  /** Agent time up to the policy step, kept so that the approval pause does not count toward the deadline. */
  agentMs: Annotation<number>({ reducer: (_, next) => next, default: () => 0 }),
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
  /** Keeps a run paused for approval, by run id; a persistent one lets the pause survive a restart. */
  checkpointer: BaseCheckpointSaver;
}

export interface LangGraphTriageAgentParams {
  /** Research stops and the ticket is escalated after this many tool calls. */
  maxToolCalls: number;
  knowledgeBaseResults: number;
  /** Agent time a run may take, without the approval pause; past it the run is escalated. */
  deadlineMs: number;
}

/**
 * The triage workflow as a LangGraph state graph:
 *
 *   guard → classify → research ⇄ tool → decide → policy → (approval) → draft → validate
 *
 * - guard: deterministic prompt-injection check; a suspected ticket skips research and decide.
 * - research: the model picks the next tool or says it is done; bounded by maxToolCalls.
 * - policy: deterministic rules over the model's proposal (refund eligibility, limits, injection).
 * - approval: a refund the policy allows pauses the run (a LangGraph interrupt) until a person decides.
 * - deadline: every step but validate stops once the run's agent time is over; the run escalates.
 * - validate: drops unknown citations and builds the result; a model failure anywhere lands here
 *   and becomes an escalation instead of an error.
 */
export class LangGraphTriageAgent implements TriageAgent {
  private readonly graph;
  private readonly sessions = new Map<string, RunSession>();

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
      .addNode('approval', (state) => this.approval(state))
      .addNode('draft', (state) => this.draft(state))
      .addNode('validate', (state) => this.validate(state))
      .addEdge(START, 'guard')
      .addEdge('guard', 'classify')
      .addConditionalEdges('classify', (state) => this.afterClassify(state), ['research', 'policy', 'validate'])
      .addConditionalEdges('research', (state) => this.afterResearch(state), ['tool', 'decide', 'policy', 'validate'])
      .addEdge('tool', 'research')
      .addConditionalEdges('decide', (state) => (state.failure ? 'validate' : 'policy'), ['policy', 'validate'])
      .addConditionalEdges('policy', (state) => this.afterPolicy(state), ['approval', 'draft', 'validate'])
      .addConditionalEdges('approval', (state) => (state.refundRejected ? 'validate' : 'draft'), ['draft', 'validate'])
      .addEdge('draft', 'validate')
      .addEdge('validate', END)
      .compile({ checkpointer: d.checkpointer });
  }

  async run(req: RunTriageAgentRequest): Promise<RunTriageAgentResponse> {
    return this.invoke(req.runId, req.onStep, 0, (config) => this.graph.invoke({ runId: req.runId, ticket: req.ticket }, config));
  }

  async resume(req: ResumeTriageAgentRequest): Promise<ResumeTriageAgentResponse> {
    const { values } = await this.graph.getState(this.threadOf(req.runId));
    return this.invoke(req.runId, req.onStep, values.agentMs, (config) =>
      this.graph.invoke(new Command({ resume: req.decision }), config),
    );
  }

  /** Runs the graph until it pauses for approval or ends, within what is left of the deadline. */
  private async invoke(
    runId: string,
    onStep: TriageStepListener,
    spentMs: number,
    start: (config: ReturnType<LangGraphTriageAgent['threadOf']> & { recursionLimit: number }) => Promise<State>,
  ): Promise<TriageAgentOutcome> {
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(), this.p.deadlineMs - spentMs);
    this.sessions.set(runId, { signal: deadline.signal, onStep, startedAt: this.d.clock.now().instant.getTime(), spentMs });
    try {
      const final = await start({ ...this.threadOf(runId), recursionLimit: 2 * this.p.maxToolCalls + 20 });
      const paused = (await this.graph.getState(this.threadOf(runId))).next.length > 0;
      if (paused) return { status: 'awaiting_approval', result: null, trace: final.trace };
      if (!final.result) throw new Error('Triage graph ended without a result');
      return { status: 'done', result: final.result, trace: final.trace };
    } finally {
      clearTimeout(timer);
      this.sessions.delete(runId);
    }
  }

  private threadOf(runId: string) {
    return { configurable: { thread_id: runId } };
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
    const { output, entry, error } = await this.traced(state, 'classify', null, { ticket: state.ticket }, (signal) =>
      this.d.model.classify({ ticket: state.ticket, signal }),
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
      (signal) => this.d.model.nextStep({ ticket: state.ticket, classification, observations: state.observations, signal }),
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
    const { output, entry, error } = await this.traced(state, 'decide', null, { observations: state.observations.length }, (signal) =>
      this.d.model.decide({ ticket: state.ticket, classification, observations: state.observations, signal }),
    );
    return { proposal: output, failure: error, trace: [entry] };
  }

  private async policy(state: State): Promise<Update> {
    const { output, entry, error } = await this.traced(state, 'policy', null, { proposal: state.proposal }, () =>
      this.applyPolicy(state),
    );
    const session = this.session(state.runId);
    const agentMs = session.spentMs + this.d.clock.now().instant.getTime() - session.startedAt;
    return { decision: output, failure: error, agentMs, trace: [entry] };
  }

  /** Pauses until a person approves or rejects the refund; LangGraph runs the node again on resume. */
  private async approval(state: State): Promise<Update> {
    const decision = this.required(state.decision);
    const answer: ApprovalDecision = interrupt({ refund: decision.refund });
    const entry: TraceEntry = {
      step: 'approval',
      tool: null,
      input: { refund: decision.refund },
      output: { decision: answer },
      error: null,
      startedAt: this.d.clock.now().instant.toISOString(),
      durationMs: 0,
    };
    this.d.logger.info({ message: 'agent step', context: { runId: state.runId, step: 'approval', decision: answer } });
    await this.session(state.runId).onStep(entry);
    if (answer === 'approve') return { trace: [entry] };
    return {
      decision: { ...decision, action: 'escalate', reasons: [...decision.reasons, 'Refund rejected by a person'], refund: null },
      refundRejected: true,
      trace: [entry],
    };
  }

  private async draft(state: State): Promise<Update> {
    const decision = this.required(state.decision);
    const { output, entry, error } = await this.traced(state, 'draft', null, { action: decision.action }, (signal) =>
      this.d.model.draft({
        ticket: state.ticket,
        classification: this.required(state.classification),
        action: decision.action,
        reasons: decision.reasons,
        refund: decision.refund,
        observations: state.observations,
        signal,
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

  private afterPolicy(state: State): 'approval' | 'draft' | 'validate' {
    if (state.failure || state.injection?.suspected) return 'validate';
    return state.decision?.action === 'propose_refund' ? 'approval' : 'draft';
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
    const deadlineReached = state.failure === this.deadlineReason();
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
        modelFailure: state.failure !== null && !deadlineReached,
        deadlineReached,
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
   * Runs one step, measures it, logs it, turns it into a trace entry and reports it. A failure of the
   * step is caught: the entry carries the error and the caller routes to an escalation. Past the
   * deadline a step does not start, and one in flight is given up; only validate always runs.
   */
  private async traced<T>(
    state: State,
    step: TraceStep,
    tool: string | null,
    input: unknown,
    work: (signal: AbortSignal) => Promise<T> | T,
  ): Promise<{ output: T | null; entry: TraceEntry; error: string | null }> {
    const session = this.session(state.runId);
    const bounded = step !== 'validate';
    const started = this.d.clock.now().instant;
    let output: T | null = null;
    let error: string | null = null;
    try {
      if (bounded && session.signal.aborted) throw new Error(this.deadlineReason());
      const result = Promise.resolve(work(session.signal));
      output = bounded ? await Promise.race([this.whenAborted(session.signal), result]) : await result;
    } catch (caught) {
      error = bounded && session.signal.aborted ? this.deadlineReason() : caught instanceof Error ? caught.message : String(caught);
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
    await session.onStep(entry);
    return { output, entry, error };
  }

  private whenAborted(signal: AbortSignal): Promise<never> {
    return new Promise((_, reject) => {
      const stop = () => reject(new Error(this.deadlineReason()));
      if (signal.aborted) stop();
      else signal.addEventListener('abort', stop, { once: true });
    });
  }

  private deadlineReason(): string {
    return `Run stopped at its deadline of ${this.p.deadlineMs / 1000} seconds`;
  }

  private session(runId: string): RunSession {
    const session = this.sessions.get(runId);
    if (!session) throw new Error(`No active invocation for run ${runId}`);
    return session;
  }

  private required<T>(value: T | null): T {
    if (value === null) throw new Error('Triage graph reached a step without its input');
    return value;
  }
}
