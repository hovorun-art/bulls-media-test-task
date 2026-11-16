import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { triageSample } from './run-samples';

const BASE_URL = 'http://127.0.0.1:3000';
const RUN_ID = randomUUID();
const TICKET = { email: 'anna@example.com', subject: 'Refund', body: 'Refund please', orderId: 'A-1002' };
const RESULT = { category: 'refund_request', action: 'propose_refund' };

/** The fields of a run the runner reads; the rest of the run does not matter to it. */
function aRun({ status, result = null }: { status: string; result?: object | null }) {
  return { id: RUN_ID, status, result };
}

function stubFetch() {
  return vi.spyOn(globalThis, 'fetch');
}

describe('triageSample', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('follows the accepted run until it is done', async () => {
    stubFetch()
      .mockResolvedValueOnce(Response.json({ id: RUN_ID }, { status: 202 }))
      .mockResolvedValueOnce(Response.json(aRun({ status: 'running' })))
      .mockResolvedValueOnce(Response.json(aRun({ status: 'done', result: RESULT })));

    const run = await triageSample({ baseUrl: BASE_URL, ticket: TICKET, pollMs: 0 });

    expect(run).toEqual(aRun({ status: 'done', result: RESULT }));
  });

  it('approves the refund a run waits for, then follows the run until it is done', async () => {
    const fetchSpy = stubFetch()
      .mockResolvedValueOnce(Response.json({ id: RUN_ID }, { status: 202 }))
      .mockResolvedValueOnce(Response.json(aRun({ status: 'awaiting_approval' })))
      .mockResolvedValueOnce(Response.json(aRun({ status: 'running' })))
      .mockResolvedValueOnce(Response.json(aRun({ status: 'done', result: RESULT })));

    const run = await triageSample({ baseUrl: BASE_URL, ticket: TICKET, pollMs: 0 });

    expect(fetchSpy).toHaveBeenNthCalledWith(
      3,
      `${BASE_URL}/api/runs/${RUN_ID}/approval`,
      expect.objectContaining({ method: 'POST', body: '{"decision":"approve"}' }),
    );
    expect(run).toEqual(aRun({ status: 'done', result: RESULT }));
  });

  it('stops with the status and body of an error answer', async () => {
    stubFetch().mockResolvedValueOnce(
      Response.json({ code: 'VALIDATION_FAILED', message: 'Invalid ticket', details: {} }, { status: 400 }),
    );

    const triage = triageSample({ baseUrl: BASE_URL, ticket: TICKET, pollMs: 0 });

    await expect(triage).rejects.toThrow(`POST ${BASE_URL}/api/triage answered 400: {"code":"VALIDATION_FAILED"`);
  });
});
