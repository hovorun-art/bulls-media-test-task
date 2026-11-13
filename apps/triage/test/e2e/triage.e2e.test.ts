import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { aTicket, TriageUnderTest } from './triage-under-test';

describe('POST /api/triage', () => {
  const service = new TriageUnderTest();

  beforeAll(() => service.start());
  afterAll(() => service.stop());
  beforeEach(() => service.reset());

  it('Ticket with a malformed email is rejected', async () => {
    const response = await service.postTicket(aTicket({ email: 'not-an-email' }));

    const error = await service.errorOf(response, 400);
    expect(error).toMatchObject({ code: 'VALIDATION_FAILED', details: { issues: [{ path: 'email' }] } });
    expect(service.model.classify).not.toHaveBeenCalled();
    expect(await service.listRuns()).toEqual({ runs: [] });
  });

  it('Ticket with an empty body is rejected', async () => {
    const response = await service.postTicket(aTicket({ body: '' }));

    const error = await service.errorOf(response, 400);
    expect(error).toMatchObject({ code: 'VALIDATION_FAILED', details: { issues: [{ path: 'body' }] } });
    expect(service.model.classify).not.toHaveBeenCalled();
  });

  it('Ticket body over the length limit is rejected', async () => {
    const response = await service.postTicket(aTicket({ body: 'x'.repeat(5001) }));

    const error = await service.errorOf(response, 400);
    expect(error).toMatchObject({ code: 'VALIDATION_FAILED', details: { issues: [{ path: 'body' }] } });
    expect(service.model.classify).not.toHaveBeenCalled();
  });

  it('accepts a body of exactly 5000 characters', async () => {
    service.scriptReply();

    const response = await service.postTicket(aTicket({ body: 'x'.repeat(5000) }));

    expect(response.status).toBe(200);
  });

  it('rejects a body that is not JSON', async () => {
    const response = await service.postRaw('{"email": ');

    expect((await service.errorOf(response, 400)).code).toBe('VALIDATION_FAILED');
  });

  it('Model unavailable ends in escalation', async () => {
    service.scriptModelDown();

    const run = await service.triage(aTicket());

    expect(run.result).toMatchObject({
      action: 'escalate',
      replyDraft: null,
      reasons: ['Model unavailable: connect ECONNREFUSED'],
      flags: { modelFailure: true },
    });
    expect((await service.listRuns()).runs.map((stored) => stored.id)).toEqual([run.id]);
  });

  it('Order status question is answered with a reply', async () => {
    service.scriptReply();

    const run = await service.triage(aTicket());

    expect(service.model.classify).toHaveBeenCalledWith({ ticket: aTicket() });
    expect(run).toMatchObject({
      model: { provider: 'ollama', name: 'qwen3:8b' },
      ticket: aTicket(),
      result: {
        category: 'order_status',
        action: 'reply',
        replyDraft: 'Your order is on its way.',
        citedArticles: ['order-tracking'],
        summary: 'order_status, normal priority. Action: reply. Order status. Why: The order is on its way.',
      },
    });
  });

  it('Trace lists the steps in order', async () => {
    service.scriptReply();

    const run = await service.triage(aTicket());

    expect(run.trace.map((entry) => entry.step)).toEqual(['guard', 'classify', 'research', 'decide', 'policy', 'draft', 'validate']);
  });
});

describe('start-up', () => {
  it('does not start when the model is not reachable', async () => {
    const service = new TriageUnderTest();

    await expect(service.start({ modelReady: false })).rejects.toThrow('Model unavailable: Ollama is not reachable');

    await service.stop();
  });
});
