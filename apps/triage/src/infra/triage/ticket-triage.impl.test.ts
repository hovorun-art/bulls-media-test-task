import { randomUUID } from 'node:crypto';
import type { Run, Ticket, TraceEntry, TriageResult } from '@triage/contracts';
import type { Clock, Logger, Random } from '@triage/kernel';
import { describe, expect, it, vi } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';
import type { RunEvents } from '../../domain/runs/run-events';
import { RunNotAwaitingApprovalError } from '../../domain/runs/run-not-awaiting-approval.error';
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
  flags: { injectionSuspected: false, toolLimitReached: false, policyOverride: false, modelFailure: false, deadlineReached: false },
  summary: 'refund_request, high priority. Action: propose_refund.',
};

const anEntry = (step: TraceEntry['step']): TraceEntry => ({
  step,
  tool: null,
  input: {},
  output: {},
  error: null,
  startedAt: '2026-11-13T12:00:01.000Z',
  durationMs: 1,
});

const aStoredRun = (overrides: Partial<Run> = {}): Run => ({
  id: RUN_ID,
  createdAt: '2026-11-13T12:00:00.000Z',
  model: { provider: 'gemini', name: 'gemini-3.8-flash' },
  ticket: TICKET,
  status: 'awaiting_approval',
  result: null,
  trace: [anEntry('guard')],
  ...overrides,
});

function aTriage() {
  const deps = {
    agent: mockDeep<TriageAgent>(),
    runs: mockDeep<RunRepository>(),
    events: mockDeep<RunEvents>(),
    model: mockDeep<SupportModel>(),
    clock: mockDeep<Clock>(),
    random: mockDeep<Random>(),
    logger: mockDeep<Logger>(),
  };
  return { triage: new TicketTriageImpl(deps), ...deps };
}

/** The escalation the agent builds for a run it could not finish. */
const anEscalation = (reason: string): TriageResult => ({
  ...RESULT,
  category: 'other',
  action: 'escalate',
  replyDraft: null,
  reasons: [reason],
  refund: null,
  summary: `Escalated: ${reason}`,
});

/** A new ticket: its id, its start time and its model are scripted. */
function aNewTicketTriage() {
  const setup = aTriage();
  setup.random.uuid.mockReturnValueOnce({ value: RUN_ID });
  setup.clock.now.mockReturnValueOnce({ instant: new Date('2026-11-13T12:00:00.000Z') });
  setup.model.describe.mockReturnValueOnce({ provider: 'gemini', name: 'gemini-3.8-flash' });
  return setup;
}

/** A restart that finds one run left running, one minute after it started. */
function aRestartWithARunLeftRunning() {
  const setup = aTriage();
  setup.runs.listRunning.mockResolvedValueOnce({ runs: [aStoredRun({ status: 'running' })] });
  setup.agent.escalate.mockReturnValueOnce({ result: anEscalation('Service restarted during the run') });
  setup.clock.now.mockReturnValueOnce({ instant: new Date('2026-11-13T12:01:00.000Z') });
  return setup;
}

/** The stored states of the run, in the order they were saved. */
const savedStates = (runs: ReturnType<typeof mockDeep<RunRepository>>) => runs.save.mock.calls.map(([req]) => req.run);

describe('TicketTriageImpl', () => {
  it('stores the run as running and answers before the agent ends', async () => {
    const { triage, agent, runs } = aNewTicketTriage();
    agent.run.mockReturnValueOnce(new Promise(() => {}));

    const { run } = await triage.triage({ ticket: TICKET });

    expect(run).toEqual({
      id: RUN_ID,
      createdAt: '2026-11-13T12:00:00.000Z',
      model: { provider: 'gemini', name: 'gemini-3.8-flash' },
      ticket: TICKET,
      status: 'running',
      result: null,
      trace: [],
    });
    expect(runs.save).toHaveBeenCalledWith({ run });
  });

  it('stores and publishes each step as it ends', async () => {
    const { triage, agent, runs, events } = aNewTicketTriage();
    agent.run.mockImplementationOnce(async ({ onStep }) => {
      await onStep(anEntry('guard'));
      return new Promise(() => {});
    });

    await triage.triage({ ticket: TICKET });

    await vi.waitFor(() => expect(savedStates(runs).at(-1)?.trace).toEqual([anEntry('guard')]));
    expect(events.publish).toHaveBeenCalledWith({ runId: RUN_ID, event: { type: 'step', index: 0, entry: anEntry('guard') } });
  });

  it('ends the run with the result of the agent and publishes it', async () => {
    const { triage, agent, runs, events } = aNewTicketTriage();
    agent.run.mockResolvedValueOnce({ status: 'done', result: RESULT, trace: [anEntry('validate')] });

    await triage.triage({ ticket: TICKET });

    const done = aStoredRun({ status: 'done', result: RESULT, trace: [anEntry('validate')] });
    await vi.waitFor(() => expect(savedStates(runs).at(-1)).toEqual(done));
    expect(events.publish).toHaveBeenLastCalledWith({ runId: RUN_ID, event: { type: 'run', run: done } });
  });

  it('Final decision is logged with the run id', async () => {
    const { triage, agent, logger, clock } = aNewTicketTriage();
    clock.now.mockReturnValueOnce({ instant: new Date('2026-11-13T12:00:04.000Z') });
    agent.run.mockResolvedValueOnce({ status: 'done', result: RESULT, trace: [] });

    await triage.triage({ ticket: TICKET });

    await vi.waitFor(() =>
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
      }),
    );
  });

  it('keeps a paused run awaiting approval and publishes it', async () => {
    const { triage, agent, runs, events } = aNewTicketTriage();
    agent.run.mockResolvedValueOnce({ status: 'awaiting_approval', result: null, trace: [anEntry('policy')] });

    await triage.triage({ ticket: TICKET });

    const paused = aStoredRun({ status: 'awaiting_approval', trace: [anEntry('policy')] });
    await vi.waitFor(() => expect(savedStates(runs).at(-1)).toEqual(paused));
    expect(events.publish).toHaveBeenLastCalledWith({ runId: RUN_ID, event: { type: 'run', run: paused } });
  });

  it('does not log a paused run as a decision', async () => {
    const { triage, agent, runs, logger } = aNewTicketTriage();
    agent.run.mockResolvedValueOnce({ status: 'awaiting_approval', result: null, trace: [anEntry('policy')] });

    await triage.triage({ ticket: TICKET });

    await vi.waitFor(() => expect(savedStates(runs).at(-1)?.status).toBe('awaiting_approval'));
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('ends the run as an escalation with the error when the agent fails, keeping its steps', async () => {
    const { triage, agent, runs, events } = aNewTicketTriage();
    agent.run.mockImplementationOnce(async ({ onStep }) => {
      await onStep(anEntry('guard'));
      throw new Error('graph broke');
    });
    agent.escalate.mockReturnValueOnce({ result: anEscalation('graph broke') });

    await triage.triage({ ticket: TICKET });

    const escalated = { status: 'done', trace: [anEntry('guard')], result: anEscalation('graph broke') };
    await vi.waitFor(() => expect(savedStates(runs).at(-1)).toMatchObject(escalated));
    expect(agent.escalate).toHaveBeenCalledWith({ reason: 'graph broke' });
    expect(events.publish.mock.lastCall?.[0]).toMatchObject({ runId: RUN_ID, event: { type: 'run', run: escalated } });
  });

  it('logs the escalation as the decision when the agent fails', async () => {
    const { triage, agent, logger, clock } = aNewTicketTriage();
    clock.now.mockReturnValueOnce({ instant: new Date('2026-11-13T12:00:02.000Z') });
    agent.run.mockRejectedValueOnce(new Error('graph broke'));
    agent.escalate.mockReturnValueOnce({ result: anEscalation('graph broke') });

    await triage.triage({ ticket: TICKET });

    await vi.waitFor(() =>
      expect(logger.info).toHaveBeenCalledWith({
        message: 'triage decision',
        context: { runId: RUN_ID, category: 'other', priority: 'high', action: 'escalate', flags: RESULT.flags, durationMs: 2000 },
      }),
    );
  });

  it('logs the error when even the escalation cannot be stored', async () => {
    const { triage, agent, runs, logger } = aNewTicketTriage();
    agent.run.mockRejectedValueOnce(new Error('graph broke'));
    agent.escalate.mockReturnValueOnce({ result: anEscalation('graph broke') });
    runs.save.mockResolvedValueOnce();
    runs.save.mockRejectedValueOnce(new Error('disk full'));

    await triage.triage({ ticket: TICKET });

    await vi.waitFor(() =>
      expect(logger.error).toHaveBeenCalledWith({ message: 'run could not be ended', context: { runId: RUN_ID, error: 'disk full' } }),
    );
  });

  it('fails when the run cannot be stored at its start', async () => {
    const { triage, runs, agent } = aNewTicketTriage();
    runs.save.mockRejectedValueOnce(new Error('disk full'));

    await expect(triage.triage({ ticket: TICKET })).rejects.toThrow('disk full');

    expect(agent.run).not.toHaveBeenCalled();
  });

  it('resumes a paused run with the decision, running again', async () => {
    const { triage, agent, runs } = aTriage();
    runs.get.mockResolvedValueOnce({ run: aStoredRun() });
    agent.resume.mockReturnValueOnce(new Promise(() => {}));

    const { run } = await triage.decide({ runId: RUN_ID, decision: 'reject' });

    expect(run).toEqual(aStoredRun({ status: 'running' }));
    expect(runs.save).toHaveBeenCalledWith({ run: aStoredRun({ status: 'running' }) });
    expect(agent.resume).toHaveBeenCalledWith({ runId: RUN_ID, decision: 'reject', onStep: expect.any(Function) });
  });

  it('numbers the steps after the pause after the stored ones', async () => {
    const { triage, agent, events, runs } = aTriage();
    runs.get.mockResolvedValueOnce({ run: aStoredRun() });
    agent.resume.mockImplementationOnce(async ({ onStep }) => {
      await onStep(anEntry('approval'));
      return new Promise(() => {});
    });

    await triage.decide({ runId: RUN_ID, decision: 'approve' });

    await vi.waitFor(() =>
      expect(events.publish).toHaveBeenCalledWith({ runId: RUN_ID, event: { type: 'step', index: 1, entry: anEntry('approval') } }),
    );
  });

  it('refuses a second decision that comes while the first is being stored', async () => {
    const { triage, agent, runs } = aTriage();
    runs.get.mockResolvedValueOnce({ run: aStoredRun() });
    runs.get.mockResolvedValueOnce({ run: aStoredRun() });
    agent.resume.mockReturnValueOnce(new Promise(() => {}));

    const [first, second] = await Promise.allSettled([
      triage.decide({ runId: RUN_ID, decision: 'approve' }),
      triage.decide({ runId: RUN_ID, decision: 'approve' }),
    ]);

    expect(first.status).toBe('fulfilled');
    expect(second).toMatchObject({ status: 'rejected', reason: expect.any(RunNotAwaitingApprovalError) });
    expect(agent.resume).toHaveBeenCalledTimes(1);
  });

  it('accepts the decision again when storing the first one failed', async () => {
    const { triage, agent, runs } = aTriage();
    runs.get.mockResolvedValueOnce({ run: aStoredRun() });
    runs.save.mockRejectedValueOnce(new Error('disk full'));
    await expect(triage.decide({ runId: RUN_ID, decision: 'approve' })).rejects.toThrow('disk full');
    expect(agent.resume).not.toHaveBeenCalled();
    runs.get.mockResolvedValueOnce({ run: aStoredRun() });
    agent.resume.mockReturnValueOnce(new Promise(() => {}));

    const { run } = await triage.decide({ runId: RUN_ID, decision: 'approve' });

    expect(run.status).toBe('running');
  });

  it('refuses a decision for a run that is not awaiting approval', async () => {
    const { triage, agent, runs } = aTriage();
    runs.get.mockResolvedValueOnce({ run: aStoredRun({ status: 'running' }) });

    await expect(triage.decide({ runId: RUN_ID, decision: 'approve' })).rejects.toBeInstanceOf(RunNotAwaitingApprovalError);

    expect(agent.resume).not.toHaveBeenCalled();
    expect(runs.save).not.toHaveBeenCalled();
  });

  it('ends the runs left running as escalations of the restart', async () => {
    const { triage, runs, agent } = aRestartWithARunLeftRunning();

    const { closed } = await triage.closeInterrupted();

    expect(closed).toEqual([RUN_ID]);
    expect(savedStates(runs)[0]).toEqual(
      aStoredRun({ status: 'done', trace: [anEntry('guard')], result: anEscalation('Service restarted during the run') }),
    );
    expect(agent.escalate).toHaveBeenCalledWith({ reason: 'Service restarted during the run' });
  });

  it('logs the escalation of a run left running as its decision', async () => {
    const { triage, logger } = aRestartWithARunLeftRunning();

    await triage.closeInterrupted();

    expect(logger.info).toHaveBeenCalledWith({
      message: 'triage decision',
      context: { runId: RUN_ID, category: 'other', priority: 'high', action: 'escalate', flags: RESULT.flags, durationMs: 60000 },
    });
  });

  it('closes nothing when no run was left running', async () => {
    const { triage, runs } = aTriage();
    runs.listRunning.mockResolvedValueOnce({ runs: [] });

    expect(await triage.closeInterrupted()).toEqual({ closed: [] });
    expect(runs.save).not.toHaveBeenCalled();
  });
});
