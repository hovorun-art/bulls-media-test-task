import type { Run, TraceEntry, TriageResult } from '@triage/contracts';
import type { Clock, Logger, Random } from '@triage/kernel';
import type { RunEvents } from '../../domain/runs/run-events';
import { RunNotAwaitingApprovalError } from '../../domain/runs/run-not-awaiting-approval.error';
import type { RunRepository } from '../../domain/runs/run-repository';
import type { SupportModel } from '../../domain/triage/support-model';
import type {
  CloseInterruptedTicketTriageResponse,
  DecideTicketTriageRequest,
  DecideTicketTriageResponse,
  TicketTriage,
  TriageTicketTriageRequest,
  TriageTicketTriageResponse,
} from '../../domain/triage/ticket-triage';
import type { TriageAgent, TriageAgentOutcome, TriageStepListener } from '../../domain/triage/triage-agent';

export interface TicketTriageImplDeps {
  agent: TriageAgent;
  runs: RunRepository;
  events: RunEvents;
  model: SupportModel;
  clock: Clock;
  random: Random;
  logger: Logger;
}

export class TicketTriageImpl implements TicketTriage {
  /** Runs whose decision is being stored: a second decision for one of them is refused, not run twice. */
  private readonly deciding = new Set<string>();

  constructor(private readonly d: TicketTriageImplDeps) {}

  async triage(req: TriageTicketTriageRequest): Promise<TriageTicketTriageResponse> {
    const run: Run = {
      id: this.d.random.uuid().value,
      createdAt: this.d.clock.now().instant.toISOString(),
      model: this.d.model.describe(),
      ticket: req.ticket,
      status: 'running',
      result: null,
      trace: [],
    };
    await this.d.runs.save({ run });
    void this.continue(run, (onStep) => this.d.agent.run({ runId: run.id, ticket: req.ticket, onStep }));
    return { run };
  }

  async decide(req: DecideTicketTriageRequest): Promise<DecideTicketTriageResponse> {
    const { run: paused } = await this.d.runs.get({ id: req.runId });
    if (paused.status !== 'awaiting_approval' || this.deciding.has(paused.id)) {
      throw new RunNotAwaitingApprovalError({ id: paused.id, status: paused.status });
    }
    const run: Run = { ...paused, status: 'running' };
    this.deciding.add(run.id);
    try {
      await this.store(run);
    } finally {
      this.deciding.delete(run.id);
    }
    void this.continue(run, (onStep) => this.d.agent.resume({ runId: run.id, decision: req.decision, onStep }));
    return { run };
  }

  async closeInterrupted(): Promise<CloseInterruptedTicketTriageResponse> {
    const { runs } = await this.d.runs.listRunning();
    for (const run of runs) {
      await this.store({ ...run, status: 'done', result: this.escalation('Service restarted during the run') });
    }
    return { closed: runs.map((run) => run.id) };
  }

  /**
   * Runs the agent in the background: each finished step is stored and published, then the outcome.
   * Nothing escapes: an unexpected error ends the run as an escalation, so no run stays running.
   */
  private async continue(run: Run, work: (onStep: TriageStepListener) => Promise<TriageAgentOutcome>): Promise<void> {
    let trace = run.trace;
    const onStep = async (entry: TraceEntry) => {
      trace = [...trace, entry];
      await this.d.runs.save({ run: { ...run, trace } });
      this.d.events.publish({ runId: run.id, event: { type: 'step', index: trace.length - 1, entry } });
    };
    try {
      const outcome = await work(onStep);
      await this.store({ ...run, ...outcome });
      if (outcome.status === 'done') this.logDecision(run, outcome.result);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      try {
        await this.store({ ...run, trace, status: 'done', result: this.escalation(reason) });
      } catch (storing) {
        const message = storing instanceof Error ? storing.message : String(storing);
        this.d.logger.error({ message: 'run could not be ended', context: { runId: run.id, error: message } });
      }
    }
  }

  /** Stores a new state of the run and publishes it whole. */
  private async store(run: Run): Promise<void> {
    await this.d.runs.save({ run });
    this.d.events.publish({ runId: run.id, event: { type: 'run', run } });
  }

  /** The result of a run the agent could not finish. */
  private escalation(reason: string): TriageResult {
    return {
      category: 'other',
      priority: 'normal',
      action: 'escalate',
      replyDraft: null,
      citedArticles: [],
      reasons: [reason],
      refund: null,
      flags: { injectionSuspected: false, toolLimitReached: false, policyOverride: false, modelFailure: false, deadlineReached: false },
      summary: `other, normal priority. Action: escalate. Why: ${reason}.`,
    };
  }

  private logDecision(run: Run, result: TriageResult): void {
    this.d.logger.info({
      message: 'triage decision',
      context: {
        runId: run.id,
        category: result.category,
        priority: result.priority,
        action: result.action,
        flags: result.flags,
        durationMs: this.d.clock.now().instant.getTime() - new Date(run.createdAt).getTime(),
      },
    });
  }
}
