import { randomUUID } from 'node:crypto';
import { HttpResponse, http } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../../test-server';
import { anEventStream, aRun, aTraceEntry } from '../../test-utils';
import { followRunEvents } from './run-events';

describe('followRunEvents', () => {
  it('hands over each event of the stream and skips heartbeats', async () => {
    const run = aRun({ status: 'running', result: null });
    const step = { type: 'step' as const, index: 0, entry: aTraceEntry('guard') };
    server.use(http.get(`*/api/runs/${run.id}/events`, () => anEventStream([{ type: 'run', run }, step])));
    const received: unknown[] = [];

    await followRunEvents(run.id, (event) => received.push(event), new AbortController().signal);

    expect(received).toEqual([{ type: 'run', run }, step]);
  });

  it('hands over an event that arrives in two chunks once', async () => {
    const run = aRun({ status: 'running', result: null });
    const line = `data: ${JSON.stringify({ type: 'run', run })}\n\n`;
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(line.slice(0, 20)));
        controller.enqueue(encoder.encode(line.slice(20)));
        controller.close();
      },
    });
    server.use(http.get(`*/api/runs/${run.id}/events`, () => new HttpResponse(body, { headers: { 'content-type': 'text/event-stream' } })));
    const received: unknown[] = [];

    await followRunEvents(run.id, (event) => received.push(event), new AbortController().signal);

    expect(received).toEqual([{ type: 'run', run }]);
  });

  it('fails on an error answer', async () => {
    const id = randomUUID();
    server.use(
      http.get(`*/api/runs/${id}/events`, () =>
        HttpResponse.json({ code: 'RUN_NOT_FOUND', message: `Run ${id} not found`, details: { id } }, { status: 404 }),
      ),
    );

    await expect(followRunEvents(id, () => {}, new AbortController().signal)).rejects.toThrow(`Run ${id} not found`);
  });
});
