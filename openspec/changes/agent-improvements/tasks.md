# Tasks

## 1. Narrower injection patterns

Owns: apps/triage/src/infra/guard/** · Depends on: none · Done when: npm run check

- [x] 1.1 Test "Question about return rules is not flagged" and "Retracted earlier email is not flagged" (pattern-injection-guard.test.ts); the cases flagged today stay flagged there
- [x] 1.2 Narrow `PATTERNS` in `pattern-injection-guard.ts` (e.g. `you are now` only with a role or mode after it, `ignore ... previous` only with instructions/rules/prompts after it, `show ... rules` only for your/the system's rules)

## 2. Async runs, run events, deadline and refund approval in the triage service

Owns: packages/contracts/src/**, packages/kernel/src/errors/**, apps/triage/** except apps/triage/src/infra/guard/**, package-lock.json, apps/web/nginx.conf, apps/web/src/api/**, apps/web/src/test-utils.tsx, apps/web/src/test-server.ts, apps/web/src/features/triage/triage-result.tsx, apps/web/src/features/triage/triage-result.test.tsx · Depends on: 1 · Done when: npm run check

- [ ] 2.1 Contracts (`runs.ts`, `triage.ts` and their tests): `RunStatusSchema` (running, awaiting_approval, done), `Run.status`, `Run.result` nullable, `RunSummary.status` with nullable `category`/`action`, `TriageAcceptedSchema` `{ id }`, `ApprovalRequestSchema` `{ decision: approve | reject }`, `RunEventSchema` (run snapshot, trace entry, status change), `flags.deadlineReached`; `RUN_NOT_AWAITING_APPROVAL` in the kernel `ERROR_CODES`
- [ ] 2.2 Config `RUN_DEADLINE_SECONDS` (600) and `RUN_EVENTS_HEARTBEAT_SECONDS` (15) in `config.ts` and `config.test.ts`; web `api/client.ts` (+ test): `triageTicket` returns `TriageAccepted`, `decideRefund(id, decision)`, `runEventsUrl(id)`; web fixtures in `test-utils.tsx`/`test-server.ts` carry a status; `triage-result.tsx` renders nothing for a run without a result
- [ ] 2.3 Test "Ticket is accepted at once", "Order status question is answered with a reply", "Model unavailable ends in escalation", "Unhandled error ends the run as an escalation", "Complaint about double charging is not flagged" (triage.e2e.test.ts) and "Running run shows the trace so far", "Running run is listed with its status", "Triaged ticket can be opened by its run id", "Runs are listed newest first" (runs.e2e.test.ts); `triage-under-test.ts` waits for a run to reach a status
- [ ] 2.4 Background runs: migration `002_run_status.sql` (status column, nullable category/action), `RunRepository` create/update/list with status in `sqlite-run-repository.ts` (+ int test); `TicketTriageImpl` stores the run as running, returns its id, runs the agent in the background, stores each step from the agent's step callback, ends it done, and turns an unexpected error into an escalation; `TriageController` answers 202 `TriageAccepted`
- [ ] 2.5 Test "Stream starts with the run so far", "Each finished step is streamed", "Stream closes when the run is done", "Stream of a finished run closes at once", "Heartbeat keeps an idle stream open", "Stream of an unknown run is refused" (run-events.e2e.test.ts)
- [ ] 2.6 `RunEvents` port (`domain/runs/run-events.ts`) and `RxRunEvents` (`infra/runs/rx-run-events.ts` + test), published by `TicketTriageImpl`; `GET /api/runs/:id/events` with `@Sse()` in `RunsController`: stored snapshot first, then events until awaiting_approval or done, heartbeat at the configured interval; `apps/web/nginx.conf`: remove the 30-minute timeouts, `proxy_buffering off` for the events location
- [ ] 2.7 Test "Run over the deadline is escalated", "Model call in flight is aborted at the deadline", "Approval wait does not count toward the deadline", "Eligible refund waits for approval", "Eligible refund is proposed", "Rejected refund is escalated", "Refund outside the window is not proposed", "Refund above the limit is escalated", "Tool call appears in the trace" (langgraph-triage-agent.test.ts), "Invalid model output is repaired" (langchain-support-model.test.ts), "Model call is retried after a transient failure" (langchain-support-model.int.test.ts), "Refund of an undelivered order is not eligible" (refund-policy.impl.test.ts, unchanged)
- [ ] 2.8 `LangGraphTriageAgent`: `TriageAgent` port gets start and resume with a step callback; deadline from `RUN_DEADLINE_SECONDS` counting agent time only, an `AbortSignal` in the `SupportModel` requests passed on by `LangChainSupportModel`, escalation with `deadlineReached`; an approval node after policy calling `interrupt()` for propose_refund, resumed with `Command`; `SqliteSaver` from `@langchain/langgraph-checkpoint-sqlite` (added to `apps/triage/package.json`) on the `DATABASE_PATH` file, thread id = run id, wired in `triage.module.ts`
- [ ] 2.9 Test "Second approval is refused", "Approval of a running run is refused", "Approval of an unknown run is refused", "Paused run survives a restart", "Stream closes when the run awaits approval" (approval.e2e.test.ts) and "Running run is closed on start", "Paused run is kept on start" (runs.e2e.test.ts); `triage-under-test.ts` can restart on the same database file
- [ ] 2.10 `POST /api/runs/:id/approval` (`ApprovalRequestSchema`): `RunNotAwaitingApprovalError` (409) in `domain/triage/`, `TicketTriage.decide` in `ticket-triage.impl.ts` resumes the agent in the background; `StartupChecks` ends runs left running with "Service restarted during the run"; check that the triage Docker image builds with `better-sqlite3`

## 3. Live progress and refund approval on the page

Owns: apps/web/src/app.tsx, apps/web/src/app.test.tsx, apps/web/src/features/runs/**, apps/web/src/features/triage/ticket-form.tsx, apps/web/src/features/triage/ticket-form.test.tsx, apps/web/src/features/triage/trace-timeline.tsx, apps/web/src/features/triage/trace-timeline.test.tsx, apps/web/src/features/triage/refund-approval.tsx, apps/web/src/features/triage/refund-approval.test.tsx, apps/web/src/features/triage/use-triage.ts, apps/web/locales/**, apps/web/e2e/** · Depends on: 2 · Done when: npm run check

- [ ] 3.1 Test "Submitted ticket opens its run at once" (ticket-form.test.tsx)
- [ ] 3.2 `use-triage.ts` and `ticket-form.tsx`: the 202 id opens the run, its cache entry starts as running
- [ ] 3.3 Test "Step appears while the run is running" and "Result appears when the run is done" (app.test.tsx)
- [ ] 3.4 `useRunEvents` in `features/runs/use-runs.ts`: an `EventSource` on `runEventsUrl` while the run is running, each event written into the `['run', id]` cache, closed at awaiting_approval or done; `trace-timeline.tsx` shows a running state
- [ ] 3.5 Test "Running run shows its status in the history" and "Opening a past run" (run-history.test.tsx, app.test.tsx)
- [ ] 3.6 Status in each `run-history.tsx` entry, with the strings in `locales/en.json`
- [ ] 3.7 Test "Paused run offers Approve and Reject", "Approve follows the run to its result", "Reject shows the escalation", "Finished run offers no approval" (refund-approval.test.tsx)
- [ ] 3.8 `RefundApproval` component (`refund-approval.tsx`) shown by `app.tsx` for a run awaiting approval: Approve and Reject call `decideRefund`, then follow the run again; strings in `locales/en.json`
- [ ] 3.9 Playwright `apps/web/e2e/triage.spec.ts`: the mocked API answers 202 and streams the run
