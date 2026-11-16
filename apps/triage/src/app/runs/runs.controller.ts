import { Controller, Get, Inject, type MessageEvent, Param, Query, Sse } from '@nestjs/common';
import type { Run, RunEvent, RunList } from '@triage/contracts';
import { ZodValidationPipe } from '@triage/service-kit';
import { Observable } from 'rxjs';
import { z } from 'zod';
import { RUN_EVENTS, type RunEvents } from '../../domain/runs/run-events';
import { RUN_REPOSITORY, type RunRepository } from '../../domain/runs/run-repository';
import { TRIAGE_CONFIG, type TriageConfig } from '../config';

const ListQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) });

@Controller('runs')
export class RunsController {
  constructor(
    @Inject(RUN_REPOSITORY) private readonly runs: RunRepository,
    @Inject(RUN_EVENTS) private readonly events: RunEvents,
    @Inject(TRIAGE_CONFIG) private readonly config: TriageConfig,
  ) {}

  @Get()
  list(@Query(new ZodValidationPipe({ schema: ListQuerySchema })) query: z.infer<typeof ListQuerySchema>): Promise<RunList> {
    return this.runs.list({ limit: query.limit });
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<Run> {
    return (await this.runs.get({ id })).run;
  }

  /**
   * The run as stored, then each finished step and each new state, until the run awaits approval or
   * is done. It listens before it reads, so nothing falls in between; the client applies the run
   * whole and a step at its index. Heartbeats keep proxies from closing a quiet stream.
   */
  @Sse(':id/events')
  async follow(@Param('id') id: string): Promise<Observable<MessageEvent>> {
    await this.runs.get({ id }); // an unknown run is a 404, before the stream starts
    return new Observable<MessageEvent>((subscriber) => {
      const send = (event: RunEvent) => {
        subscriber.next({ data: event });
        if (event.type === 'run' && event.run.status !== 'running') subscriber.complete();
      };
      const { unsubscribe } = this.events.subscribe({ runId: id, listener: send });
      this.runs.get({ id }).then(({ run }) => send({ type: 'run', run }), (error: unknown) => subscriber.error(error));
      const heartbeat = setInterval(
        () => subscriber.next({ type: 'heartbeat', data: '' }),
        this.config.RUN_EVENTS_HEARTBEAT_SECONDS * 1000,
      );
      return () => {
        unsubscribe();
        clearInterval(heartbeat);
      };
    });
  }
}
