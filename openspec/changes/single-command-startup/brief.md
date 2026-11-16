# Brief: single-command-startup

## Product

Goal: anyone who clones the repository starts the whole triage system (service, web UI, local
model) with one command, `docker compose up`, with no Node.js or Ollama installed, so a reviewer
can run and verify it without manual setup.

Behaviour:
- `docker compose up` from the repository root starts Ollama, the triage service and the web UI;
  the web UI is on http://localhost:8080, the service on :3000 (so `npm run samples` works against it).
- On the first start the model is downloaded automatically into a Docker volume; later starts reuse it.
- The triage service starts only after Ollama is healthy and the model is downloaded; the web UI
  only after the service is healthy.
- The model is set by `OLLAMA_MODEL` in `.env`; the default stays `qwen3:8b`, the same as `npm run dev`.
- Runs stored by the service survive a restart of the containers.
- `docker compose -f compose.yaml -f compose.host-llm.yaml up` starts everything except the Ollama
  containers; the service then uses the native Ollama on the host (`host.docker.internal:11434`,
  fast on a Mac, where Docker has no GPU) or Anthropic, as `.env` says.
- `npm run dev` keeps working as it does today.
- The README's setup section leads with the Docker start and states the first download size and
  the speed on CPU.

Not doing:
- A new LLM provider or a change of the agent's behaviour.
- Production deployment, TLS, scaling, a published image registry, CI.

## Technical

As usual: the service reads its config through the existing `TriageConfigSchema`; only env values change.
Reuses: `apps/triage` (`npm start` via tsx, `/api/health`, the start-up model check), `apps/web`
(`vite build`), `.env.example`.
New: `compose.yaml` with `ollama` (image `ollama/ollama`), a one-shot `ollama-pull`, `triage`,
`web`; a Dockerfile per app: `triage` runs with tsx like `npm start` (no build step), `web` is the
`vite build` output served by nginx, which proxies `/api` to the service; named volumes for the
SQLite file and for the models (the models volume has a fixed name, so every Compose project shares
it); `compose.host-llm.yaml` for the variant without Ollama.
Risks: Ollama on CPU in Docker is several times slower than native Metal (a ticket takes 1-2.5 min
natively on an M1) - handled by the variant without Ollama and stated in the README; the first
start downloads several GB - stated in the README.
Tests: a system e2e (Playwright, `tests/system-e2e`) starts the stack itself with
`docker compose up --wait` under its own project name, triages one sample ticket through the web UI
with the real model (15 minutes allowed), checks the decision is shown, and tears the stack down.
Capabilities: `local-startup` (new)

## To confirm
