import { filter, Subject } from 'rxjs';
import type {
  PublishRunEventsRequest,
  RunEvents,
  SubscribeRunEventsRequest,
  SubscribeRunEventsResponse,
} from '../../domain/runs/run-events';

/** Run events within this process: one subject that every subscriber filters by run id. */
export class RxRunEvents implements RunEvents {
  private readonly events = new Subject<PublishRunEventsRequest>();

  publish(req: PublishRunEventsRequest): void {
    this.events.next(req);
  }

  subscribe(req: SubscribeRunEventsRequest): SubscribeRunEventsResponse {
    const subscription = this.events
      .pipe(filter((published) => published.runId === req.runId))
      .subscribe((published) => req.listener(published.event));
    return { unsubscribe: () => subscription.unsubscribe() };
  }
}
