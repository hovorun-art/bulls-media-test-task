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

export interface GetRunRepositoryRequest {
  id: string;
}

export interface GetRunRepositoryResponse {
  run: Run;
}

/** Stored triage runs with their traces. `get` throws RunNotFoundError for an unknown id. */
export interface RunRepository {
  save(req: SaveRunRepositoryRequest): Promise<void>;
  list(req: ListRunRepositoryRequest): Promise<ListRunRepositoryResponse>;
  get(req: GetRunRepositoryRequest): Promise<GetRunRepositoryResponse>;
}

export const RUN_REPOSITORY = Symbol('RunRepository');
