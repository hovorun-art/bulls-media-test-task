import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { MigrateSchemaMigratorResponse, SchemaMigrator } from '../../domain/runs/schema-migrator';

export interface SqliteSchemaMigratorDeps {
  database: DatabaseSync;
}

export interface SqliteSchemaMigratorParams {
  /** Folder of `NNN_name.sql` files, applied in name order. */
  directory: string;
}

/** Applies the SQL files not applied yet, each in its own transaction, and records them. */
export class SqliteSchemaMigrator implements SchemaMigrator {
  constructor(
    private readonly d: SqliteSchemaMigratorDeps,
    private readonly p: SqliteSchemaMigratorParams,
  ) {}

  migrate(): MigrateSchemaMigratorResponse {
    const { database } = this.d;
    database.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
    const done = new Set(
      database
        .prepare('SELECT name FROM schema_migrations')
        .all()
        .map((row) => String(row.name)),
    );
    const pending = readdirSync(this.p.directory)
      .filter((file) => file.endsWith('.sql') && !done.has(file))
      .sort();
    for (const file of pending) {
      database.exec('BEGIN');
      try {
        database.exec(readFileSync(join(this.p.directory, file), 'utf8'));
        database.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    }
    return { applied: pending };
  }
}
