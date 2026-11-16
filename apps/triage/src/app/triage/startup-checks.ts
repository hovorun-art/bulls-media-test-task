import { Inject, type OnApplicationBootstrap } from '@nestjs/common';
import { LOGGER, type Logger } from '@triage/kernel';
import { SCHEMA_MIGRATOR, type SchemaMigrator } from '../../domain/runs/schema-migrator';
import { MODEL_READINESS, type ModelReadiness } from '../../domain/triage/model-readiness';

/** Before the service listens: migrate its storage, then make sure the model can be reached. */
export class StartupChecks implements OnApplicationBootstrap {
  constructor(
    @Inject(SCHEMA_MIGRATOR) private readonly migrator: SchemaMigrator,
    @Inject(MODEL_READINESS) private readonly readiness: ModelReadiness,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const { applied } = this.migrator.migrate();
    if (applied.length > 0) this.logger.info({ message: 'migrations applied', context: { applied } });
    await this.readiness.check();
  }
}
