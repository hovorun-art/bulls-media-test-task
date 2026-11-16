# Tasks

## 1. Images and the Compose stack

Owns: compose.yaml, compose.host-llm.yaml, .dockerignore, .env.example, apps/triage/Dockerfile, apps/web/Dockerfile, apps/web/nginx.conf, package.json (workspaces), package-lock.json, vitest.config.ts, tests/system-e2e/{package.json,tsconfig.json,eslint.config.js,vitest.config.ts,turbo.json,src/**} · Depends on: none · Done when: npm run check:full

- [x] 1.1 Workspace `tests/system-e2e` (`@triage/system-e2e`): package.json with `typecheck`, `lint`, `test:integration` (Vitest project `system-e2e:integration`) and `test:e2e:ui` (Playwright); add `tests/*` to the root `workspaces` and to the projects in the root `vitest.config.ts`; a workspace `turbo.json` whose `test:integration` inputs include the root `compose*.yaml`, `.dockerignore` and `apps/*/Dockerfile`
- [x] 1.2 Test "Triage waits for the model" (tests/system-e2e/src/compose-config.int.test.ts, reads `docker compose config --format json`)
- [x] 1.3 Test "Web waits for triage" (compose-config.int.test.ts)
- [x] 1.4 Test "Default model" (compose-config.int.test.ts)
- [x] 1.5 Test "Model from the environment" (compose-config.int.test.ts)
- [x] 1.6 Test "Models volume is shared across projects" (compose-config.int.test.ts)
- [x] 1.7 Test "Override leaves out the model containers" (compose-config.int.test.ts)
- [x] 1.8 Test "Override points the service at the host" (compose-config.int.test.ts)
- [x] 1.9 `compose.yaml`: `ollama` (`ollama/ollama`, healthcheck, models volume with a fixed `name:`), one-shot `ollama-pull` (`OLLAMA_MODEL`, default `qwen3:8b`), `triage` (HOST 0.0.0.0, `OLLAMA_BASE_URL=http://ollama:11434`, `DATABASE_PATH` in the runs volume, `/api/health` healthcheck, env from `.env` when present), `web`; host ports from `WEB_PORT` (8080) and `TRIAGE_PORT` (3000); `apps/triage/Dockerfile` (runs `npm start` with tsx), `apps/web/Dockerfile` (`vite build` served by nginx) with `apps/web/nginx.conf` (`/api` proxied to `triage:3000`, timeouts long enough for a run), `.dockerignore`; a Docker note in `.env.example`
- [x] 1.10 `compose.host-llm.yaml`: `ollama` and `ollama-pull` out of the default start, `triage.depends_on` reset, `OLLAMA_BASE_URL` defaulting to `http://host.docker.internal:11434` (with `host-gateway` for Linux)
- [x] 1.11 Test "Default host ports" (compose-config.int.test.ts)

## 2. System e2e and README

Owns: tests/system-e2e/{playwright.config.ts,e2e/**}, README.md · Depends on: 1 · Done when: npm run test:e2e -- --filter=@triage/system-e2e

- [x] 2.1 `tests/system-e2e/playwright.config.ts` with global setup and teardown: `docker compose -p triage-system-e2e up --build --wait` on free `WEB_PORT`/`TRIAGE_PORT`, then `down` and removal of that project's runs volume only (the shared models volume stays); per-test timeout 15 minutes for the ticket test
- [x] 2.2 Test "Web UI and service answer after compose up" (tests/system-e2e/e2e/startup.e2e.ts)
- [x] 2.3 Test "Web UI reaches the service through its own origin" (startup.e2e.ts)
- [x] 2.4 Test "Model is pulled on start" (startup.e2e.ts, the `ollama-pull` container exited with code 0)
- [x] 2.5 Test "A ticket is triaged from the web UI with the real model" (tests/system-e2e/e2e/triage.e2e.ts, a sample from samples/tickets.json)
- [x] 2.6 Test "Run is still listed after the stack is recreated" (triage.e2e.ts, `down` without volumes, `up --wait`, GET /api/runs)
- [x] 2.7 README: the setup section leads with `docker compose up` (URLs, first download size, CPU speed in Docker), the `compose.host-llm.yaml` variant for a native Ollama or Anthropic, `npm run dev` kept as the development path; the system e2e in the testing section
