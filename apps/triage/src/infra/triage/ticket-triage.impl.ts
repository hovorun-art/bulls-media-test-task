import type { Clock, Logger, Random } from '@triage/kernel';
import type { RunRepository } from '../../domain/runs/run-repository';
import type { SupportModel } from '../../domain/triage/support-model';
import type {
  TicketTriage,
  TriageTicketTriageRequest,
  TriageTicketTriageResponse,
} from '../../domain/triage/ticket-triage';
import type { TriageAgent } from '../../domain/triage/triage-agent';

export interface TicketTriageImplDeps {
  agent: TriageAgent;
  runs: RunRepository;
  model: SupportModel;
  clock: Clock;
  random: Random;
  logger: Logger;
}

export class TicketTriageImpl implements TicketTriage {
  constructor(private readonly d: TicketTriageImplDeps) {}

  async triage(req: TriageTicketTriageRequest): Promise<TriageTicketTriageResponse> {
    const runId = this.d.random.uuid().value;
    const started = this.d.clock.now().instant;
    const { result, trace } = await this.d.agent.run({ runId, ticket: req.ticket });
    const run = {
      id: runId,
      createdAt: started.toISOString(),
      model: this.d.model.describe(),
      ticket: req.ticket,
      result,
      trace,
    };
    await this.d.runs.save({ run });
    this.d.logger.info({
      message: 'triage decision',
      context: {
        runId,
        category: result.category,
        priority: result.priority,
        action: result.action,
        flags: result.flags,
        durationMs: this.d.clock.now().instant.getTime() - started.getTime(),
      },
    });
    return { run };
  }
}
