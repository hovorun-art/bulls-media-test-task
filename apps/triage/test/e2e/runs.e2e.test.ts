import { randomUUID } from 'node:crypto';
import { RunSchema } from '@triage/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { aTicket as aBaseTicket, aStoredRun, TriageUnderTest } from './triage-under-test';

const aTicketAbout = (subject: string) => aBaseTicket({ subject });

describe('GET /api/runs', () => {
  const service = new TriageUnderTest();

  beforeAll(() => service.start());
  afterAll(() => service.stop());
  beforeEach(() => service.reset());

  it('Triaged ticket can be opened by its run id', async () => {
    service.scriptReply();
    const triaged = await service.triage(aTicketAbout('Lamp'));

    const response = await service.getRun(triaged.id);

    expect(response.status).toBe(200);
    expect(RunSchema.parse(await response.json())).toEqual(triaged);
  });

  it('Running run shows the trace so far', async () => {
    service.scriptHeldResearch();
    const id = await service.startTriage(aTicketAbout('Lamp'));

    const run = await service.waitForRun(id, (stored) => stored.trace.length === 2);

    expect(run.status).toBe('running');
    expect(run.trace.map((entry) => entry.step)).toEqual(['guard', 'classify']);
    expect(run.result).toBeNull();
  });

  it('Running run is listed with its status', async () => {
    service.model.describe.mockReturnValueOnce({ provider: 'ollama', name: 'qwen3:8b' });
    service.model.classify.mockReturnValueOnce(new Promise(() => {}));
    const id = await service.startTriage(aTicketAbout('Lamp'));

    const { runs } = await service.listRuns();

    expect(runs).toEqual([expect.objectContaining({ id, status: 'running', category: null, action: null })]);
  });

  it('Runs are listed newest first', async () => {
    service.scriptReply();
    const first = await service.triage(aTicketAbout('First'));
    service.scriptReply();
    const second = await service.triage(aTicketAbout('Second'));

    const { runs } = await service.listRuns();

    expect(runs).toMatchObject([
      { id: second.id, subject: 'Second', status: 'done', category: 'order_status', action: 'reply' },
      { id: first.id, subject: 'First', status: 'done', category: 'order_status', action: 'reply' },
    ]);
  });

  it('lists only the newest runs up to the limit', async () => {
    service.scriptReply();
    await service.triage(aTicketAbout('First'));
    service.scriptReply();
    const second = await service.triage(aTicketAbout('Second'));

    const { runs } = await service.listRuns('?limit=1');

    expect(runs.map((run) => run.id)).toEqual([second.id]);
  });

  it.each(['0', '101', 'abc'])('rejects limit=%s', async (limit) => {
    const response = await service.get(`/api/runs?limit=${limit}`);

    const error = await service.errorOf(response, 400);
    expect(error).toMatchObject({ code: 'VALIDATION_FAILED', details: { issues: [{ path: 'limit' }] } });
  });

  it('accepts the highest limit', async () => {
    const response = await service.get('/api/runs?limit=100');

    expect(response.status).toBe(200);
  });

  it('Unknown run id returns 404', async () => {
    const id = randomUUID();

    const response = await service.getRun(id);

    expect(await service.errorOf(response, 404)).toEqual({
      code: 'RUN_NOT_FOUND',
      message: `Run ${id} not found`,
      details: { id },
    });
  });

  it('Running run is closed on start', async () => {
    const left = aStoredRun({ status: 'running' });
    await service.store(left);

    await service.restart();

    const run = RunSchema.parse(await (await service.getRun(left.id)).json());
    expect(run).toMatchObject({
      status: 'done',
      result: { action: 'escalate', reasons: ['Service restarted during the run'] },
    });
  });

  it('Paused run is kept on start', async () => {
    const paused = aStoredRun({ status: 'awaiting_approval' });
    await service.store(paused);

    await service.restart();

    expect(RunSchema.parse(await (await service.getRun(paused.id)).json()).status).toBe('awaiting_approval');
  });
});
