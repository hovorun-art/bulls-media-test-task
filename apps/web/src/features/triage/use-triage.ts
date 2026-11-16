import { useMutation, useQueryClient } from '@tanstack/react-query';
import { triageTicket } from '../../api/client';

/** Sends a ticket to the agent; the new run goes into the cache and the history is refreshed. */
export function useTriage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: triageTicket,
    onSuccess: (run) => {
      queryClient.setQueryData(['run', run.id], run);
      void queryClient.invalidateQueries({ queryKey: ['runs'] });
    },
  });
}
