import type { DatabaseSync } from 'node:sqlite';
import { Module } from '@nestjs/common';
import { RUN_EVENTS } from '../../domain/runs/run-events';
import { RUN_REPOSITORY } from '../../domain/runs/run-repository';
import { RxRunEvents } from '../../infra/runs/rx-run-events';
import { SqliteRunRepository } from '../../infra/runs/sqlite-run-repository';
import { DATABASE } from '../core.module';
import { RunsController } from './runs.controller';

@Module({
  controllers: [RunsController],
  providers: [
    {
      provide: RUN_REPOSITORY,
      inject: [DATABASE],
      useFactory: (database: DatabaseSync) => new SqliteRunRepository({ database }),
    },
    { provide: RUN_EVENTS, useFactory: () => new RxRunEvents() },
  ],
  exports: [RUN_REPOSITORY, RUN_EVENTS],
})
export class RunsModule {}
