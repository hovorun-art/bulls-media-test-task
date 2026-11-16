import { useMutation, useQueryClient } from '@tanstack/react-query';
import { triageTicket } from '../../api/client';

/** Sends a ticket to the agent, which answers at once with the new run's id; the history is refreshed. */
export function useTriage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: triageTicket,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['runs'] });
    },
  });
}
