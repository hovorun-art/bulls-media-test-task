import { randomUUID } from 'node:crypto';
import type { RunEvent } from '@triage/contracts';
import { describe, expect, it, vi } from 'vitest';
import { RxRunEvents } from './rx-run-events';

const RUN_ID = randomUUID();

const aStepEvent = (index: number): RunEvent => ({
  type: 'step',
  index,
  entry: { step: 'classify', tool: null, input: {}, output: {}, error: null, startedAt: '2026-11-13T12:00:00.000Z', durationMs: 1 },
});

describe('RxRunEvents', () => {
  it('passes the events of a run to its listeners', () => {
    const events = new RxRunEvents();
    const listener = vi.fn();
    events.subscribe({ runId: RUN_ID, listener });

    events.publish({ runId: RUN_ID, event: aStepEvent(0) });

    expect(listener).toHaveBeenCalledWith(aStepEvent(0));
  });

  it('does not pass the events of another run', () => {
    const events = new RxRunEvents();
    const listener = vi.fn();
    events.subscribe({ runId: RUN_ID, listener });

    events.publish({ runId: randomUUID(), event: aStepEvent(0) });

    expect(listener).not.toHaveBeenCalled();
  });

  it('stops passing events after unsubscribe', () => {
    const events = new RxRunEvents();
    const listener = vi.fn();
    const { unsubscribe } = events.subscribe({ runId: RUN_ID, listener });
    unsubscribe();

    events.publish({ runId: RUN_ID, event: aStepEvent(0) });

    expect(listener).not.toHaveBeenCalled();
  });
});
