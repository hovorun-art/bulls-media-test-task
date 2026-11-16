import type { DatabaseSync } from 'node:sqlite';
import { Module } from '@nestjs/common';
import { RUN_REPOSITORY } from '../../domain/runs/run-repository';
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
  ],
  exports: [RUN_REPOSITORY],
})
export class RunsModule {}
