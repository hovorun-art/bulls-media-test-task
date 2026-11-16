# Tasks

## 1. Default model gemini-flash-lite-latest

Owns: apps/triage/src/app/config.ts, apps/triage/src/app/triage/triage.module.test.ts, compose.yaml, tests/system-e2e/src/compose-config.int.test.ts, .env.example, README.md · Depends on: none · Done when: npm run check:full

- [ ] 1.1 Test "Default Gemini model is recorded", "Configured Gemini model is recorded" and "Old provider settings are ignored" (apps/triage/src/app/triage/triage.module.test.ts: the default cases expect name "gemini-flash-lite-latest")
- [ ] 1.2 TriageConfigSchema in apps/triage/src/app/config.ts: `GEMINI_MODEL` default `gemini-flash-lite-latest`
- [ ] 1.3 Test "Default model" and "Model from the environment" (tests/system-e2e/src/compose-config.int.test.ts: the default case expects `gemini-flash-lite-latest`)
- [ ] 1.4 compose.yaml triage environment: `GEMINI_MODEL: ${GEMINI_MODEL:-gemini-flash-lite-latest}`
- [ ] 1.5 .env.example `GEMINI_MODEL=gemini-flash-lite-latest`; README: the architecture label names `gemini-flash-lite-latest`, and the Docker setup says it is an alias Google may move, pinned with `GEMINI_MODEL=gemini-3.5-flash-lite`; section 7 stays
