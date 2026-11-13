import { useQuery } from '@tanstack/react-query';
import { getRun, listRuns } from '../../api/client';

export function useRuns() {
  return useQuery({ queryKey: ['runs'], queryFn: listRuns });
}

export function useRun(id: string | null) {
  return useQuery({ queryKey: ['run', id], queryFn: () => getRun(id ?? ''), enabled: id !== null });
}
