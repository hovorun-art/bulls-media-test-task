import { ErrorBodySchema, type RunEvent, RunEventSchema } from '@triage/contracts';
import { ApiError, runEventsUrl } from '../../api/client';

/**
 * Reads the server-sent event stream of a run and hands over each event, until the service closes
 * it or `signal` aborts. Heartbeats are skipped. Read with fetch, so the tests fake it like any call.
 */
export async function followRunEvents(id: string, onEvent: (event: RunEvent) => void, signal: AbortSignal): Promise<void> {
  const response = await fetch(runEventsUrl(id), { signal, headers: { accept: 'text/event-stream' } });
  if (!response.ok || !response.body) throw new ApiError(response.status, ErrorBodySchema.parse(await response.json()));
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffered += decoder.decode(value, { stream: true });
    const blocks = buffered.split('\n\n');
    buffered = blocks.pop() ?? '';
    for (const block of blocks) {
      const lines = block.split('\n');
      const data = lines.find((line) => line.startsWith('data: '))?.slice('data: '.length);
      if (!lines.includes('event: heartbeat') && data) onEvent(RunEventSchema.parse(JSON.parse(data)));
    }
  }
}
