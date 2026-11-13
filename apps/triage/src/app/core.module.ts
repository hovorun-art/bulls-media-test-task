import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { type DynamicModule, Module } from '@nestjs/common';
import { CLOCK, CryptoRandom, LOGGER, type Logger, RANDOM, SystemClock } from '@triage/kernel';
import { SCHEMA_MIGRATOR } from '../domain/runs/schema-migrator';
import { SqliteSchemaMigrator } from '../infra/runs/sqlite-schema-migrator';
import { APP_ROOT, TRIAGE_CONFIG, type TriageConfig } from './config';

export const DATABASE = Symbol('Database');

export interface CoreModuleOptions {
  config: TriageConfig;
  logger: Logger;
}

/** Shared providers for every feature: config, logger, time, ids and the SQLite database. */
@Module({})
export class CoreModule {
  static forRoot(options: CoreModuleOptions): DynamicModule {
    return {
      module: CoreModule,
      global: true,
      providers: [
        { provide: TRIAGE_CONFIG, useValue: options.config },
        { provide: LOGGER, useValue: options.logger },
        { provide: CLOCK, useValue: new SystemClock() },
        { provide: RANDOM, useValue: new CryptoRandom() },
        {
          provide: DATABASE,
          useFactory: () => {
            const path = resolve(APP_ROOT, options.config.DATABASE_PATH);
            mkdirSync(dirname(path), { recursive: true });
            return new DatabaseSync(path);
          },
        },
        {
          provide: SCHEMA_MIGRATOR,
          inject: [DATABASE],
          useFactory: (database: DatabaseSync) =>
            new SqliteSchemaMigrator({ database }, { directory: join(APP_ROOT, 'migrations') }),
        },
      ],
      exports: [TRIAGE_CONFIG, LOGGER, CLOCK, RANDOM, DATABASE, SCHEMA_MIGRATOR],
    };
  }
}
