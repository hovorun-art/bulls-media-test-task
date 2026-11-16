import { type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Run, RunEvent } from '@triage/contracts';
import { useEffect } from 'react';
import { getRun, listRuns } from '../../api/client';
import { followRunEvents } from './run-events';

export function useRuns() {
  return useQuery({ queryKey: ['runs'], queryFn: listRuns });
}

/** A run; while it is running, its event stream keeps the cached run up to date step by step. */
export function useRun(id: string | null) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['run', id], queryFn: () => getRun(id ?? ''), enabled: id !== null });
  const running = query.data?.status === 'running';

  useEffect(() => {
    if (!id || !running) return;
    const stop = new AbortController();
    followRunEvents(id, (event) => applyRunEvent(queryClient, id, event), stop.signal)
      .catch(() => {})
      .finally(() => {
        // The stream broke off before the run moved on: read where it stands.
        const stillRunning = queryClient.getQueryData<Run>(['run', id])?.status === 'running';
        if (!stop.signal.aborted && stillRunning) void queryClient.invalidateQueries({ queryKey: ['run', id] });
      });
    return () => stop.abort();
  }, [id, running, queryClient]);

  return query;
}

/** A whole run replaces the cached one; a step goes to its place in the cached trace. */
function applyRunEvent(queryClient: QueryClient, id: string, event: RunEvent) {
  if (event.type === 'run') {
    queryClient.setQueryData(['run', id], event.run);
    if (event.run.status !== 'running') void queryClient.invalidateQueries({ queryKey: ['runs'] });
    return;
  }
  queryClient.setQueryData<Run>(['run', id], (run) => {
    if (!run) return run;
    const trace = [...run.trace];
    trace[event.index] = event.entry;
    return { ...run, trace };
  });
}
