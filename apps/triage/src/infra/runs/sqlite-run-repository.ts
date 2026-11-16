import type { DatabaseSync } from 'node:sqlite';
import { RunSchema, RunSummarySchema } from '@triage/contracts';
import { RunNotFoundError } from '../../domain/runs/run-not-found.error';
import type {
  GetRunRepositoryRequest,
  GetRunRepositoryResponse,
  ListRunRepositoryRequest,
  ListRunRepositoryResponse,
  RunRepository,
  SaveRunRepositoryRequest,
} from '../../domain/runs/run-repository';

export interface SqliteRunRepositoryDeps {
  database: DatabaseSync;
}

export class SqliteRunRepository implements RunRepository {
  constructor(private readonly d: SqliteRunRepositoryDeps) {}

  async save(req: SaveRunRepositoryRequest): Promise<void> {
    const { run } = req;
    this.d.database
      .prepare('INSERT INTO runs (id, created_at, subject, category, action, document) VALUES (?, ?, ?, ?, ?, ?)')
      .run(run.id, run.createdAt, run.ticket.subject, run.result.category, run.result.action, JSON.stringify(run));
  }

  async list(req: ListRunRepositoryRequest): Promise<ListRunRepositoryResponse> {
    const rows = this.d.database
      .prepare(
        'SELECT id, created_at AS createdAt, subject, category, action FROM runs ORDER BY created_at DESC, rowid DESC LIMIT ?',
      )
      .all(req.limit);
    return { runs: rows.map((row) => RunSummarySchema.parse(row)) };
  }

  async get(req: GetRunRepositoryRequest): Promise<GetRunRepositoryResponse> {
    const row = this.d.database.prepare('SELECT document FROM runs WHERE id = ?').get(req.id);
    if (!row) throw new RunNotFoundError({ id: req.id });
    return { run: RunSchema.parse(JSON.parse(String(row.document))) };
  }
}
