// Sends every sample ticket to a running triage service, follows each run to its end and compares the
// outcome with the expectation. A refund a run waits for is approved, as a support agent would.
// Usage: npm run samples -- [baseUrl] [sampleId...]   (default http://127.0.0.1:3000)
import { setTimeout as sleep } from 'node:timers/promises';
import type { Run, Ticket, TriageAccepted } from '@triage/contracts';
import samples from '../tickets.json' with { type: 'json' };

/** Submits the ticket, then polls its run until it is done, approving the refund it may wait for. */
export async function triageSample({
  baseUrl,
  ticket,
  pollMs = 1000,
}: {
  baseUrl: string;
  ticket: Ticket;
  pollMs?: number;
}): Promise<Run> {
  const { id } = await call<TriageAccepted>('POST', `${baseUrl}/api/triage`, ticket);
  let run = await call<Run>('GET', `${baseUrl}/api/runs/${id}`);
  while (run.status !== 'done') {
    if (run.status === 'awaiting_approval') {
      run = await call<Run>('POST', `${baseUrl}/api/runs/${id}/approval`, { decision: 'approve' });
    } else {
      await sleep(pollMs);
      run = await call<Run>('GET', `${baseUrl}/api/runs/${id}`);
    }
  }
  return run;
}

async function call<T>(method: 'GET' | 'POST', url: string, body?: object): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method} ${url} answered ${response.status}: ${await response.text()}`);
  return (await response.json()) as T;
}

if (import.meta.main) {
  const [baseUrl = 'http://127.0.0.1:3000', ...only] = process.argv.slice(2);
  let mismatches = 0;
  for (const sample of samples.filter((s) => only.length === 0 || only.includes(s.id))) {
    const started = Date.now();
    const run = await triageSample({ baseUrl, ticket: sample.ticket });
    const seconds = ((Date.now() - started) / 1000).toFixed(0);
    const category = run.result?.category;
    const action = run.result?.action;
    const ok = category === sample.expected.category && action === sample.expected.action;
    if (!ok) mismatches += 1;
    console.log(
      `${ok ? 'OK  ' : 'DIFF'} ${sample.id.padEnd(22)} ${String(category).padEnd(16)} ${String(action).padEnd(15)}` +
        ` expected ${sample.expected.category}/${sample.expected.action}  ${seconds}s  run ${run.id}`,
    );
  }
  process.exitCode = mismatches > 0 ? 1 : 0;
}
