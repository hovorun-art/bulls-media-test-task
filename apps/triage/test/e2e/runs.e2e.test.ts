import { randomUUID } from 'node:crypto';
import { RunSchema } from '@triage/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { aTicket as aBaseTicket, TriageUnderTest } from './triage-under-test';

const aTicket = (subject: string) => aBaseTicket({ subject });

describe('GET /api/runs', () => {
  const service = new TriageUnderTest();

  beforeAll(() => service.start());
  afterAll(() => service.stop());
  beforeEach(() => service.reset());

  it('Triaged ticket can be opened by its run id', async () => {
    service.scriptReply();
    const triaged = await service.triage(aTicket('Lamp'));

    const response = await service.getRun(triaged.id);

    expect(response.status).toBe(200);
    expect(RunSchema.parse(await response.json())).toEqual(triaged);
  });

  it('Runs are listed newest first', async () => {
    service.scriptReply();
    const first = await service.triage(aTicket('First'));
    service.scriptReply();
    const second = await service.triage(aTicket('Second'));

    const { runs } = await service.listRuns();

    expect(runs.map((run) => [run.id, run.subject, run.category, run.action])).toEqual([
      [second.id, 'Second', 'order_status', 'reply'],
      [first.id, 'First', 'order_status', 'reply'],
    ]);
  });

  it('lists only the newest runs up to the limit', async () => {
    service.scriptReply();
    await service.triage(aTicket('First'));
    service.scriptReply();
    const second = await service.triage(aTicket('Second'));

    const { runs } = await service.listRuns('?limit=1');

    expect(runs.map((run) => run.id)).toEqual([second.id]);
  });

  it.each(['0', '101', 'abc'])('rejects limit=%s', async (limit) => {
    const response = await service.get(`/api/runs?limit=${limit}`);

    const error = await service.errorOf(response, 400);
    expect(error).toMatchObject({ code: 'VALIDATION_FAILED', details: { issues: [{ path: 'limit' }] } });
  });

  it('lists nothing before the first triage', async () => {
    expect(await service.listRuns()).toEqual({ runs: [] });
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

  it('answers an unknown route with 404 NOT_FOUND', async () => {
    const response = await service.get('/api/nothing');

    expect((await service.errorOf(response, 404)).code).toBe('NOT_FOUND');
  });
});
