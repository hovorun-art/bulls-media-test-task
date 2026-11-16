import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { aTicket, TriageUnderTest } from './triage-under-test';

describe('GET /api/runs/:id/events', () => {
  const service = new TriageUnderTest();

  beforeAll(() => service.start({ env: { RUN_EVENTS_HEARTBEAT_SECONDS: '0.05' } }));
  afterAll(() => service.stop());
  beforeEach(() => service.reset());

  it('Stream starts with the run so far', async () => {
    service.scriptHeldResearch();
    const id = await service.startTriage(aTicket());
    await service.waitForRun(id, (run) => run.trace.length === 2);

    const { events } = await service.followEvents(id, { stopAfter: () => true });

    expect(events).toEqual([
      {
        type: 'run',
        run: expect.objectContaining({
          id,
          status: 'running',
          trace: [expect.objectContaining({ step: 'guard' }), expect.objectContaining({ step: 'classify' })],
        }),
      },
    ]);
  });

  it('Each finished step is streamed', async () => {
    const { release } = service.scriptHeldResearch();
    const id = await service.startTriage(aTicket());
    await service.waitForRun(id, (run) => run.trace.length === 2);

    const { events } = await service.followEvents(id, { onFirstEvent: release });

    expect(events).toContainEqual(expect.objectContaining({ type: 'step', index: 2, entry: expect.objectContaining({ step: 'research' }) }));
  });

  it('Stream closes when the run is done', async () => {
    const { release } = service.scriptHeldResearch();
    const id = await service.startTriage(aTicket());
    await service.waitForRun(id, (run) => run.trace.length === 2);

    const { events, closed } = await service.followEvents(id, { onFirstEvent: release });

    expect(closed).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'run', run: { status: 'done', result: { action: 'reply' } } });
  });

  it('Stream of a finished run closes at once', async () => {
    service.scriptReply();
    const run = await service.triage(aTicket());

    const { events, closed } = await service.followEvents(run.id);

    expect(closed).toBe(true);
    expect(events).toEqual([{ type: 'run', run }]);
  });

  it('Heartbeat keeps an idle stream open', async () => {
    service.scriptHeldResearch();
    const id = await service.startTriage(aTicket());

    const { events } = await service.followEvents(id, { stopAfter: (event) => event === 'heartbeat' });

    expect(events.at(-1)).toBe('heartbeat');
  });

  it('Stream of an unknown run is refused', async () => {
    const id = randomUUID();

    const response = await service.get(`/api/runs/${id}/events`);

    expect(await service.errorOf(response, 404)).toMatchObject({ code: 'RUN_NOT_FOUND', details: { id } });
  });
});
