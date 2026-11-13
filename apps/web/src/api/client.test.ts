import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../test-server';
import { aRun } from '../test-utils';
import { ApiError, getRun, triageTicket } from './client';

const TICKET = { email: 'anna@example.com', subject: 'Lamp', body: 'Where is it?' };

describe('api client', () => {
  it('returns the run the service answers', async () => {
    const run = aRun();
    server.use(http.post('*/api/triage', () => HttpResponse.json(run)));

    expect(await triageTicket(TICKET)).toEqual(run);
  });

  it.each([400, 500])('turns a %i answer into an ApiError with the uniform body', async (status) => {
    const body = { code: 'INTERNAL_ERROR', message: 'Internal server error', details: {} };
    server.use(http.post('*/api/triage', () => HttpResponse.json(body, { status })));

    const error = await triageTicket(TICKET).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status, body, message: 'Internal server error' });
  });

  it('rejects an answer that does not match the run schema', async () => {
    server.use(http.get('*/api/runs/r1', () => HttpResponse.json({ id: 'r1' })));

    await expect(getRun('r1')).rejects.toThrow();
  });
});
