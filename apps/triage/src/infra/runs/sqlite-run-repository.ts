import type { DatabaseSync } from 'node:sqlite';
import { RunSchema, RunSummarySchema } from '@triage/contracts';
import { RunNotFoundError } from '../../domain/runs/run-not-found.error';
import type {
  GetRunRepositoryRequest,
  GetRunRepositoryResponse,
  ListRunRepositoryRequest,
  ListRunRepositoryResponse,
  ListRunningRunRepositoryResponse,
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
      .prepare(
        `INSERT INTO runs (id, created_at, subject, status, category, action, document) VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           status = excluded.status, category = excluded.category, action = excluded.action, document = excluded.document`,
      )
      .run(
        run.id,
        run.createdAt,
        run.ticket.subject,
        run.status,
        run.result?.category ?? null,
        run.result?.action ?? null,
        JSON.stringify(run),
      );
  }

  async listRunning(): Promise<ListRunningRunRepositoryResponse> {
    const rows = this.d.database.prepare("SELECT document FROM runs WHERE status = 'running' ORDER BY rowid").all();
    return { runs: rows.map((row) => RunSchema.parse(JSON.parse(String(row.document)))) };
  }

  async list(req: ListRunRepositoryRequest): Promise<ListRunRepositoryResponse> {
    const rows = this.d.database
      .prepare(
        'SELECT id, created_at AS createdAt, subject, status, category, action FROM runs ORDER BY created_at DESC, rowid DESC LIMIT ?',
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
