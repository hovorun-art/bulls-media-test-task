export interface MigrateSchemaMigratorResponse {
  /** File names applied by this call, in order. */
  applied: string[];
}

/** Brings the service's own storage to the latest schema; run at start. */
export interface SchemaMigrator {
  migrate(): MigrateSchemaMigratorResponse;
}

export const SCHEMA_MIGRATOR = Symbol('SchemaMigrator');
