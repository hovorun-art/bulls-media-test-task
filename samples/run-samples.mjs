// Sends every sample ticket to a running triage service and compares the outcome with the expectation.
// Usage: node samples/run-samples.mjs [baseUrl] [sampleId...]   (default http://127.0.0.1:3000)
import { readFileSync } from 'node:fs';
import { request } from 'node:http';

const [baseUrl = 'http://127.0.0.1:3000', ...only] = process.argv.slice(2);
const samples = JSON.parse(readFileSync(new URL('./tickets.json', import.meta.url), 'utf8'));

let mismatches = 0;
for (const sample of samples.filter((s) => only.length === 0 || only.includes(s.id))) {
  const started = Date.now();
  const run = await post(`${baseUrl}/api/triage`, sample.ticket);
  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  const got = run.result ?? {};
  const ok = got.category === sample.expected.category && got.action === sample.expected.action;
  if (!ok) mismatches += 1;
  console.log(
    `${ok ? 'OK  ' : 'DIFF'} ${sample.id.padEnd(22)} ${String(got.category).padEnd(16)} ${String(got.action).padEnd(15)}` +
      ` expected ${sample.expected.category}/${sample.expected.action}  ${seconds}s  run ${run.id}`,
  );
}
process.exitCode = mismatches > 0 ? 1 : 0;

/** POST with node:http: a local model can take minutes, longer than fetch's header timeout. */
function post(url, body) {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}
