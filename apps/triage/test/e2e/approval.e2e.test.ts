import { randomUUID } from 'node:crypto';
import { RunSchema } from '@triage/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { aTicket, TriageUnderTest } from './triage-under-test';

const REFUND_TICKET = aTicket({ email: 'anna@example.com', orderId: 'A-1002', body: 'Refund please' });

describe('POST /api/runs/:id/approval', () => {
  const service = new TriageUnderTest();

  beforeAll(() => service.start());
  afterAll(() => service.stop());
  beforeEach(() => service.reset());

  it('answers a rejection with the run running again, which then ends as an escalation', async () => {
    service.scriptRefundDecision('A-1002');
    const paused = await service.triage(REFUND_TICKET, 'awaiting_approval');

    const response = await service.decide(paused.id, { decision: 'reject' });

    expect(response.status).toBe(200);
    expect(RunSchema.parse(await response.json())).toMatchObject({ id: paused.id, status: 'running' });
    const run = await service.waitForRun(paused.id, (stored) => stored.status === 'done');
    expect(run.result).toMatchObject({ action: 'escalate', replyDraft: null, reasons: expect.arrayContaining(['Refund rejected by a person']) });
  });

  it('streams the resumed run to its result, with the decision in the trace', async () => {
    service.scriptRefundDecision('A-1002');
    const paused = await service.triage(REFUND_TICKET, 'awaiting_approval');
    await service.decide(paused.id, { decision: 'approve' });

    const { events, closed } = await service.followEvents(paused.id);

    expect(closed).toBe(true);
    expect(events.at(-1)).toMatchObject({
      type: 'run',
      run: { status: 'done', result: { action: 'propose_refund' }, trace: expect.arrayContaining([expect.objectContaining({ step: 'approval' })]) },
    });
  });

  it('accepts only one of two approvals sent together', async () => {
    service.scriptRefundDecision('A-1002');
    const paused = await service.triage(REFUND_TICKET, 'awaiting_approval');

    const responses = await Promise.all([
      service.decide(paused.id, { decision: 'approve' }),
      service.decide(paused.id, { decision: 'approve' }),
    ]);

    expect(responses.map((response) => response.status)).toEqual(expect.arrayContaining([200, 409]));
    const refused = responses.find((response) => response.status === 409);
    expect((await service.errorOf(refused ?? responses[0], 409)).code).toBe('RUN_NOT_AWAITING_APPROVAL');
    const run = await service.waitForRun(paused.id, (stored) => stored.status === 'done');
    expect(run.result?.action).toBe('propose_refund');
    expect(run.trace.filter((entry) => entry.step === 'approval')).toHaveLength(1);
    expect(service.model.draft).toHaveBeenCalledTimes(1);
  });

  it('Second approval is refused', async () => {
    service.scriptRefundDecision('A-1002');
    const paused = await service.triage(REFUND_TICKET, 'awaiting_approval');
    await service.decide(paused.id, { decision: 'approve' });
    const done = await service.waitForRun(paused.id, (run) => run.status === 'done');

    const response = await service.decide(paused.id, { decision: 'approve' });

    expect(await service.errorOf(response, 409)).toEqual({
      code: 'RUN_NOT_AWAITING_APPROVAL',
      message: `Run ${paused.id} is not awaiting approval`,
      details: { id: paused.id, status: 'done' },
    });
    expect(RunSchema.parse(await (await service.getRun(paused.id)).json())).toEqual(done);
  });

  it('Approval of a running run is refused', async () => {
    service.scriptModelNeverAnswers();
    const id = await service.startTriage(REFUND_TICKET);

    const response = await service.decide(id, { decision: 'approve' });

    expect((await service.errorOf(response, 409)).code).toBe('RUN_NOT_AWAITING_APPROVAL');
    expect(RunSchema.parse(await (await service.getRun(id)).json())).toMatchObject({ status: 'running', trace: [{ step: 'guard' }] });
  });

  it('Approval of an unknown run is refused', async () => {
    const response = await service.decide(randomUUID(), { decision: 'approve' });

    expect((await service.errorOf(response, 404)).code).toBe('RUN_NOT_FOUND');
  });

  it('rejects an unknown decision', async () => {
    const response = await service.decide(randomUUID(), { decision: 'maybe' });

    expect(await service.errorOf(response, 400)).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { issues: [{ path: 'decision' }] },
    });
  });

  it('Paused run survives a restart', async () => {
    service.scriptRefundDecision('A-1002');
    const paused = await service.triage(REFUND_TICKET, 'awaiting_approval');
    await service.restart();

    await service.decide(paused.id, { decision: 'approve' });

    const run = await service.waitForRun(paused.id, (stored) => stored.status === 'done');
    expect(run.result).toMatchObject({ action: 'propose_refund', refund: { orderId: 'A-1002', amount: 89, currency: 'USD' } });
  });
});
