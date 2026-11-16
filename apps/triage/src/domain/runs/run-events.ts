import type { RunEvent } from '@triage/contracts';

export interface PublishRunEventsRequest {
  runId: string;
  event: RunEvent;
}

export interface SubscribeRunEventsRequest {
  runId: string;
  listener: (event: RunEvent) => void;
}

export interface SubscribeRunEventsResponse {
  unsubscribe: () => void;
}

/** What happens to the runs of this process, as it happens: the source of the run event streams. */
export interface RunEvents {
  publish(req: PublishRunEventsRequest): void;
  subscribe(req: SubscribeRunEventsRequest): SubscribeRunEventsResponse;
}

export const RUN_EVENTS = Symbol('RunEvents');
