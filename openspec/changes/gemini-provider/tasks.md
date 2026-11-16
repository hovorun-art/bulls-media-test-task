# Tasks

## 1. Gemini as the only model in apps/triage

Owns: apps/triage/**, package-lock.json · Depends on: none · Done when: npm run check

- [ ] 1.1 Add `@langchain/google-genai` to apps/triage/package.json; remove `@langchain/ollama` and `@langchain/anthropic`; update package-lock.json
- [ ] 1.2 Test "Missing Gemini key does not start" and "Old provider settings are ignored" (apps/triage/src/app/config.test.ts); drop the Ollama and Anthropic cases
- [ ] 1.3 TriageConfigSchema in apps/triage/src/app/config.ts: `GOOGLE_API_KEY` (required, non-empty), `GEMINI_MODEL` (default `gemini-3.8-flash`); remove `LLM_PROVIDER`, `OLLAMA_*`, `ANTHROPIC_*` and the superRefine
- [ ] 1.4 Test "Rejected Gemini key does not start", "Unknown Gemini model does not start" and "Usable key and model start" at adapter level (apps/triage/src/infra/triage/gemini-model-readiness.int.test.ts, local HTTP stub of GET /v1beta/models/<model>)
- [ ] 1.5 GeminiModelReadiness (apps/triage/src/infra/triage/gemini-model-readiness.ts, params baseUrl, apiKey, model; ModelUnavailableError with a clear reason); delete ollama-model-readiness.ts and its int test
- [ ] 1.6 Test "Default Gemini model is recorded" and "Configured Gemini model is recorded" (apps/triage/src/app/triage/triage.module.test.ts: the SUPPORT_MODEL built from the parsed config describes provider "gemini" and the model name)
- [ ] 1.7 TriageModule.supportModel and modelReadiness in apps/triage/src/app/triage/triage.module.ts: ChatGoogleGenerativeAI (apiKey, model, temperature 0, maxRetries 0) and GeminiModelReadiness, no provider switch; main.ts logs provider "gemini"
- [ ] 1.8 Rewrite apps/triage/src/infra/triage/langchain-support-model.int.test.ts over the real ChatGoogleGenerativeAI against a local Gemini HTTP stub (same cases: retry, bounded attempts, repair, tool call, abort); if its base URL cannot be set, stub `fetch` and log the deviation in decisions.md
- [ ] 1.9 Replace provider `ollama` / `qwen3:8b` with `gemini` / `gemini-3.8-flash` in the remaining apps/triage tests and e2e setup (triage-under-test.ts, service.e2e.test.ts, ticket-triage.impl.test.ts, langchain-support-model.test.ts, sqlite-run-repository.int.test.ts) and update the LangChainSupportModelDeps comment

## 2. Compose without model containers

Owns: compose.yaml, compose.host-llm.yaml, tests/system-e2e/** · Depends on: none · Done when: npm run check:full

- [ ] 2.1 Test "No model containers", "Default host ports" and "Web waits for the healthy triage service" (tests/system-e2e/src/compose-config.int.test.ts; every render passes a dummy `GOOGLE_API_KEY`)
- [ ] 2.2 compose.yaml: remove the `ollama` and `ollama-pull` services, the models volume and triage's depends_on; update the header comment
- [ ] 2.3 Test "Default model" and "Model from the environment" (compose-config.int.test.ts, `GEMINI_MODEL`)
- [ ] 2.4 Test "Missing key stops compose" and "Key reaches the triage service" (compose-config.int.test.ts)
- [ ] 2.5 compose.yaml triage environment: `GEMINI_MODEL: ${GEMINI_MODEL:-gemini-3.8-flash}`, `GOOGLE_API_KEY: ${GOOGLE_API_KEY:?<message naming GOOGLE_API_KEY>}`; drop the OLLAMA_* variables
- [ ] 2.6 Delete compose.host-llm.yaml and its tests in compose-config.int.test.ts

## 3. Docs, .env.example and web fixtures

Owns: README.md, .env.example, apps/web/**, packages/contracts/src/runs.test.ts · Depends on: none · Done when: npm run check

- [ ] 3.1 .env.example: `GOOGLE_API_KEY`, `GEMINI_MODEL`; remove LLM_PROVIDER, OLLAMA_*, ANTHROPIC_*; update the Docker notes
- [ ] 3.2 README.md: Gemini (getting a key at AI Studio, free tier) replaces every Ollama and Anthropic section, the architecture diagram, the test-level table and the code tour; Docker run without model download and without compose.host-llm.yaml
- [ ] 3.3 Manual checks in README.md for "Web UI and service answer after compose up", "Web UI reaches the service through its own origin" and "A ticket is triaged from the web UI with the real model" (live stack with a real key)
- [ ] 3.4 Replace `ollama` / `qwen3:8b` with `gemini` / `gemini-3.8-flash` in apps/web/src/test-utils.tsx, apps/web/src/features/triage/triage-result.test.tsx, apps/web/e2e/triage.spec.ts and packages/contracts/src/runs.test.ts
