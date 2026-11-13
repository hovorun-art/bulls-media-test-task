import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SqliteSchemaMigrator } from './sqlite-schema-migrator';

describe('SqliteSchemaMigrator', () => {
  let directory: string;
  let database: DatabaseSync;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'migrations-'));
    database = new DatabaseSync(':memory:');
  });

  afterEach(() => {
    database.close();
    rmSync(directory, { recursive: true });
  });

  const aMigration = (name: string, sql: string) => writeFileSync(join(directory, name), sql);
  const tables = () =>
    database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'schema_%' ORDER BY name")
      .all()
      .map((row) => row.name);

  it('applies the SQL files in name order and ignores other files', () => {
    aMigration('002_b.sql', 'CREATE TABLE b (id TEXT REFERENCES a (id));');
    aMigration('001_a.sql', 'CREATE TABLE a (id TEXT PRIMARY KEY);');
    aMigration('README.md', 'not sql');

    const result = new SqliteSchemaMigrator({ database }, { directory }).migrate();

    expect(result).toEqual({ applied: ['001_a.sql', '002_b.sql'] });
    expect(tables()).toEqual(['a', 'b']);
  });

  it('applies each file once', () => {
    aMigration('001_a.sql', 'CREATE TABLE a (id TEXT);');
    new SqliteSchemaMigrator({ database }, { directory }).migrate();

    const result = new SqliteSchemaMigrator({ database }, { directory }).migrate();

    expect(result).toEqual({ applied: [] });
  });

  it('rolls back a failing file and records nothing for it', () => {
    aMigration('001_bad.sql', 'CREATE TABLE a (id TEXT); CREATE TABLE broken (;');

    expect(() => new SqliteSchemaMigrator({ database }, { directory }).migrate()).toThrow();

    expect(tables()).toEqual([]);
    expect(database.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get()).toEqual({ count: 0 });
  });
});
