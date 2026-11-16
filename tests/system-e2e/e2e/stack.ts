import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const PROJECT = 'triage-system-e2e';
// Other ports than the default stack, so a stack the user runs keeps working.
const WEB_PORT = '18080';
const TRIAGE_PORT = '13000';

export const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;
export const TRIAGE_URL = `http://127.0.0.1:${TRIAGE_PORT}`;

/** Runs `docker compose` on the repository's compose.yaml under the system e2e's own project name. */
export function compose(...args: string[]): string {
  return execFileSync('docker', ['compose', '-p', PROJECT, ...args], {
    cwd: REPO_ROOT,
    env: { ...process.env, WEB_PORT, TRIAGE_PORT },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
}

/** The first start pulls the model (several GB), so waiting has no short limit. */
export function startStack(): void {
  compose('up', '--build', '--detach', '--wait', '--wait-timeout', '3600');
}

/** "exited 0" once a one-shot service has finished successfully. */
export function containerState(service: string): string {
  const id = compose('ps', '--all', '--quiet', service).trim();
  return execFileSync('docker', ['inspect', '--format', '{{.State.Status}} {{.State.ExitCode}}', id], { encoding: 'utf8' }).trim();
}

/** Keeps the shared models volume: only this project's runs volume is removed. */
export function removeStack(): void {
  compose('down');
  execFileSync('docker', ['volume', 'rm', '--force', `${PROJECT}_runs`], { stdio: 'ignore' });
}
