import type { Run, RunSummary } from '@triage/contracts';

export interface SaveRunRepositoryRequest {
  run: Run;
}

export interface ListRunRepositoryRequest {
  limit: number;
}

export interface ListRunRepositoryResponse {
  /** Newest first. */
  runs: RunSummary[];
}

export interface ListRunningRunRepositoryResponse {
  runs: Run[];
}

export interface GetRunRepositoryRequest {
  id: string;
}

export interface GetRunRepositoryResponse {
  run: Run;
}

/**
 * Stored triage runs with their traces. `save` stores a new run or replaces its earlier state;
 * `get` throws RunNotFoundError for an unknown id.
 */
export interface RunRepository {
  save(req: SaveRunRepositoryRequest): Promise<void>;
  list(req: ListRunRepositoryRequest): Promise<ListRunRepositoryResponse>;
  /** The runs with status running, e.g. those a stopped service left behind. */
  listRunning(): Promise<ListRunningRunRepositoryResponse>;
  get(req: GetRunRepositoryRequest): Promise<GetRunRepositoryResponse>;
}

export const RUN_REPOSITORY = Symbol('RunRepository');
