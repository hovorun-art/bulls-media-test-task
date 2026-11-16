import { Inject, type OnApplicationBootstrap } from '@nestjs/common';
import { LOGGER, type Logger } from '@triage/kernel';
import { SCHEMA_MIGRATOR, type SchemaMigrator } from '../../domain/runs/schema-migrator';
import { MODEL_READINESS, type ModelReadiness } from '../../domain/triage/model-readiness';
import { TICKET_TRIAGE, type TicketTriage } from '../../domain/triage/ticket-triage';

/**
 * Before the service listens: migrate its storage, end the runs a stopped service left running, then
 * make sure the model can be reached.
 */
export class StartupChecks implements OnApplicationBootstrap {
  constructor(
    @Inject(SCHEMA_MIGRATOR) private readonly migrator: SchemaMigrator,
    @Inject(TICKET_TRIAGE) private readonly tickets: TicketTriage,
    @Inject(MODEL_READINESS) private readonly readiness: ModelReadiness,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const { applied } = this.migrator.migrate();
    if (applied.length > 0) this.logger.info({ message: 'migrations applied', context: { applied } });
    const { closed } = await this.tickets.closeInterrupted();
    if (closed.length > 0) this.logger.warn({ message: 'interrupted runs closed', context: { closed } });
    await this.readiness.check();
  }
}
