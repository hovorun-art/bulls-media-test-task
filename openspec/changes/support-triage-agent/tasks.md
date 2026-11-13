# Tasks

## 1. Workspace foundations

Owns: package.json, package-lock.json, turbo.json, tsconfig.json, .nvmrc, .env.example, tooling/**, packages/** · Depends on: none · Done when: npm run check

- [x] 1.1 Root npm workspaces + Turborepo: `package.json` scripts `check`, `check:full`, `test:e2e`, `dev`; `turbo.json` tasks typecheck, lint, test:unit, test:integration, test:e2e, test:e2e:ui, build, dev
- [x] 1.2 `tooling/`: shared tsconfig, ESLint flat config with layer boundaries (`eslint-plugin-boundaries`), Vitest presets for unit, integration and e2e projects
- [x] 1.3 `packages/kernel`: ports `Clock`, `Random`, `Sleeper`, `Logger` with system implementations; `DomainError` and closed `ERROR_CODES`
- [x] 1.4 Test the ticket schema limits and the result schema (packages/contracts/src/triage.test.ts)
- [x] 1.5 `packages/contracts`: Zod schemas for the ticket, the triage result, the trace entry, the run, the run list and the error body
- [x] 1.6 Test the error-code to HTTP status mapping and the uniform error body (packages/service-kit/src/errors/domain-error.filter.test.ts)
- [x] 1.7 `packages/service-kit`: env config parser, pino `Logger`, exception filter, health module, `bootstrapService`

## 2. Triage tools and run storage

Owns: apps/triage/package.json, apps/triage/tsconfig.json, apps/triage/eslint.config.js, apps/triage/vitest.config.ts, apps/triage/data/**, apps/triage/migrations/**, apps/triage/src/domain/{knowledge-base,orders,refunds,guard,runs}/**, apps/triage/src/infra/{knowledge-base,orders,refunds,guard,runs}/** · Depends on: 1 · Done when: npm run check

- [x] 2.1 Mock data: knowledge-base articles (`apps/triage/data/kb/*.md`) and the order seed (`apps/triage/data/orders.json`)
- [x] 2.2 Test "Knowledge base search returns matching articles" (markdown-knowledge-base.test.ts)
- [x] 2.3 `KnowledgeBase` port and `MarkdownKnowledgeBase` (keyword search, known ids)
- [x] 2.4 Test "Order of another customer is not found" (seeded-order-store.test.ts)
- [x] 2.5 `OrderStore` port and `SeededOrderStore` (ownership by email, dates relative to the clock)
- [x] 2.6 Test "Refund of an undelivered order is not eligible" (refund-policy.impl.test.ts)
- [x] 2.7 `RefundPolicy` port and `RefundPolicyImpl` (delivered, window, not refunded, amount limit)
- [x] 2.8 `InjectionGuard` port and `PatternInjectionGuard` with its unit test (pattern-injection-guard.test.ts)
- [x] 2.9 `RunRepository` port, SQL migration and `SqliteRunRepository` with its integration test (sqlite-run-repository.int.test.ts)

## 3. Agent graph and model adapter

Owns: apps/triage/src/domain/triage/**, apps/triage/src/infra/triage/** · Depends on: 2 · Done when: npm run check:full

- [x] 3.1 Domain: `TicketTriage` use case, `TriageAgent` and `SupportModel` ports with their request and response types
- [x] 3.2 Test "Order status question is answered with a reply", "Trace lists the steps in order" and "Tool call appears in the trace" (langgraph-triage-agent.test.ts)
- [x] 3.3 `LangGraphTriageAgent`: StateGraph guard → classify → research ⇄ tools → decide → policy → draft → validate
- [x] 3.4 Test "Tool call limit stops research and escalates", "Injected instructions are flagged and escalated", "Out-of-scope request is refused" and "Unknown cited article is dropped" (langgraph-triage-agent.test.ts)
- [x] 3.5 Test "Eligible refund is proposed", "Refund outside the window is not proposed" and "Refund above the limit is escalated" (langgraph-triage-agent.test.ts)
- [x] 3.6 Test "Final decision is logged with the run id" (ticket-triage.impl.test.ts) and `TicketTriageImpl` (run id, agent, storage, decision log)
- [x] 3.7 Test "Invalid model output is repaired" (langchain-support-model.test.ts)
- [x] 3.8 `LangChainSupportModel` over any LangChain chat model: structured output with repair attempts, tool binding, configured retries; chat model factory for Ollama (default) and Anthropic
- [x] 3.9 Test "Model call is retried after a transient failure" against a local HTTP stub (langchain-support-model.int.test.ts)
- [x] 3.10 Test "Repeated tool call ends research" (langgraph-triage-agent.test.ts) and the repeat guard in `LangGraphTriageAgent`

## 4. HTTP API

Owns: apps/triage/src/app/**, apps/triage/src/main.ts, apps/triage/test/** · Depends on: 3 · Done when: npm run check && npm run test:e2e -- --filter=@triage/service

- [x] 4.0 Test "Hosted provider without a key does not start" (apps/triage/src/app/config.test.ts) and the triage config schema
- [x] 4.1 Wiring: `AppModule`, triage and runs modules with factories for every port, config, migrations at start
- [x] 4.2 Shared `triage-under-test.ts` (starts the app with temp storage and a mocked `SupportModel`)
- [x] 4.3 Test "Ticket with a malformed email is rejected", "Ticket with an empty body is rejected" and "Ticket body over the length limit is rejected" (test/e2e/triage.e2e.test.ts)
- [x] 4.4 `POST /api/triage` controller with Zod validation at the edge
- [x] 4.5 Test "Model unavailable ends in escalation" (test/e2e/triage.e2e.test.ts)
- [x] 4.6 Test "Triaged ticket can be opened by its run id", "Runs are listed newest first" and "Unknown run id returns 404" (test/e2e/runs.e2e.test.ts)
- [x] 4.7 `GET /api/runs` and `GET /api/runs/:id` controller

## 5. Web UI and documentation

Owns: apps/web/**, samples/**, README.md, docs/** · Depends on: 4 · Done when: npm run check && npm run test:e2e -- --filter=@triage/web

- [x] 5.1 Vite + React app shell, i18next with `locales/en.json`, TanStack Query, API client typed by contracts, dev proxy to the service
- [x] 5.2 Sample tickets with expected outcomes (`samples/tickets.json`)
- [x] 5.3 Test "Picking a sample fills the form" and "Validation errors are shown" (ticket-form.test.tsx)
- [x] 5.4 `TicketForm` with the sample picker
- [x] 5.5 Test "Result shows the decision" and "Escalation without a draft" (triage-result.test.tsx)
- [x] 5.6 `TriageResult` view
- [x] 5.7 Test "Trace step expands to its data" (trace-timeline.test.tsx) and `TraceTimeline`
- [x] 5.8 Test "Opening a past run" (app.test.tsx), `RunHistory` (run-history.test.tsx) and the `App` layout
- [x] 5.9 Playwright e2e of the submit flow with the API mocked at the network (apps/web/e2e/triage.spec.ts)
- [x] 5.10 README with every section the task asks for, example outputs from a live run, screenshots in `docs/`
