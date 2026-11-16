import { HttpResponse, http } from 'msw';
import { ZodError } from 'zod';
import { describe, expect, it } from 'vitest';
import { server } from '../test-server';
import { aRun } from '../test-utils';
import { ApiError, decideRefund, getRun, runEventsUrl, triageTicket } from './client';

const TICKET = { email: 'anna@example.com', subject: 'Lamp', body: 'Where is it?' };

describe('api client', () => {
  it('returns the id of the run the service accepted', async () => {
    const id = crypto.randomUUID();
    server.use(http.post('*/api/triage', () => HttpResponse.json({ id }, { status: 202 })));

    expect(await triageTicket(TICKET)).toEqual({ id });
  });

  it('returns the run the service answers', async () => {
    const run = aRun();
    server.use(http.get(`*/api/runs/${run.id}`, () => HttpResponse.json(run)));

    expect(await getRun(run.id)).toEqual(run);
  });

  it('sends the decision on a refund and returns the resumed run', async () => {
    const run = aRun({ status: 'running', result: null });
    let sent: unknown;
    server.use(
      http.post(`*/api/runs/${run.id}/approval`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(run);
      }),
    );

    expect(await decideRefund(run.id, 'approve')).toEqual(run);
    expect(sent).toEqual({ decision: 'approve' });
  });

  it('builds the event stream address of a run', () => {
    expect(runEventsUrl('r1')).toBe(`${window.location.origin}/api/runs/r1/events`);
  });

  it.each([400, 500])('turns a %i answer into an ApiError with the uniform body', async (status) => {
    const body = { code: 'INTERNAL_ERROR', message: 'Internal server error', details: {} };
    server.use(http.post('*/api/triage', () => HttpResponse.json(body, { status })));

    const error = await triageTicket(TICKET).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status, body, message: 'Internal server error' });
  });

  it('rejects an answer that does not match the run schema', async () => {
    const id = crypto.randomUUID();
    server.use(http.get(`*/api/runs/${id}`, () => HttpResponse.json({ id })));

    await expect(getRun(id)).rejects.toBeInstanceOf(ZodError);
  });
});
