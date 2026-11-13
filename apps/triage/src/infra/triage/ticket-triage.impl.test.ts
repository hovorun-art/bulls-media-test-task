import { randomUUID } from 'node:crypto';
import type { Ticket, TriageResult } from '@triage/contracts';
import type { Clock, Logger, Random } from '@triage/kernel';
import { describe, expect, it } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import type { RunRepository } from '../../domain/runs/run-repository';
import type { SupportModel } from '../../domain/triage/support-model';
import type { TriageAgent } from '../../domain/triage/triage-agent';
import { TicketTriageImpl } from './ticket-triage.impl';

const RUN_ID = randomUUID();

const TICKET: Ticket = { email: 'anna@example.com', subject: 'Refund', body: 'Please refund A-1002', orderId: 'A-1002' };

const RESULT: TriageResult = {
  category: 'refund_request',
  priority: 'high',
  action: 'propose_refund',
  replyDraft: 'We will refund 89 USD.',
  citedArticles: ['refund-policy'],
  reasons: ['Delivered 5 days ago'],
  refund: { orderId: 'A-1002', amount: 89, currency: 'USD' },
  flags: { injectionSuspected: false, toolLimitReached: false, policyOverride: false, modelFailure: false },
  summary: 'refund_request, high priority. Action: propose_refund.',
};

function aTriage({ agentFails = false } = {}) {
  const deps = {
    agent: mockDeep<TriageAgent>(),
    runs: mockDeep<RunRepository>(),
    model: mockDeep<SupportModel>(),
    clock: mockDeep<Clock>(),
    random: mockDeep<Random>(),
    logger: mockDeep<Logger>(),
  };
  deps.random.uuid.mockReturnValueOnce({ value: RUN_ID });
  deps.clock.now.mockReturnValueOnce({ instant: new Date('2026-11-13T12:00:00.000Z') });
  deps.clock.now.mockReturnValueOnce({ instant: new Date('2026-11-13T12:00:04.000Z') });
  deps.model.describe.mockReturnValueOnce({ provider: 'ollama', name: 'qwen3:8b' });
  if (agentFails) deps.agent.run.mockRejectedValueOnce(new Error('graph broke'));
  else deps.agent.run.mockResolvedValueOnce({ result: RESULT, trace: [] });
  return { triage: new TicketTriageImpl(deps), ...deps };
}

describe('TicketTriageImpl', () => {
  it('Final decision is logged with the run id', async () => {
    const { triage, logger } = aTriage();

    await triage.triage({ ticket: TICKET });

    expect(logger.info).toHaveBeenCalledWith({
      message: 'triage decision',
      context: {
        runId: RUN_ID,
        category: 'refund_request',
        priority: 'high',
        action: 'propose_refund',
        flags: RESULT.flags,
        durationMs: 4000,
      },
    });
  });

  it('runs the agent under a new run id and stores the run', async () => {
    const { triage, agent, runs } = aTriage();

    const { run } = await triage.triage({ ticket: TICKET });

    expect(agent.run).toHaveBeenCalledWith({ runId: RUN_ID, ticket: TICKET });
    expect(run).toEqual({
      id: RUN_ID,
      createdAt: '2026-11-13T12:00:00.000Z',
      model: { provider: 'ollama', name: 'qwen3:8b' },
      ticket: TICKET,
      result: RESULT,
      trace: [],
    });
    expect(runs.save).toHaveBeenCalledWith({ run });
  });

  it('fails and logs no decision when the run cannot be stored', async () => {
    const { triage, runs, logger } = aTriage();
    runs.save.mockRejectedValueOnce(new Error('disk full'));

    await expect(triage.triage({ ticket: TICKET })).rejects.toThrow('disk full');

    expect(logger.info).not.toHaveBeenCalled();
  });

  it('stores and logs nothing when the agent fails unexpectedly', async () => {
    const { triage, runs, logger } = aTriage({ agentFails: true });

    await expect(triage.triage({ ticket: TICKET })).rejects.toThrow('graph broke');

    expect(runs.save).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });
});
