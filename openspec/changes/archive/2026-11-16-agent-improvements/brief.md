# Brief: agent-improvements

## Product

Goal: make a triage run safe and pleasant to watch: it answers at once and shows its steps live,
it cannot run forever, it raises fewer false injection alarms, and no refund is proposed without
a person's approval.

Behaviour:
- Async runs: `POST /api/triage` answers 202 with the run id at once; the run goes on in the background.
- A run has a status: `running`, `awaiting_approval` or `done`; `GET /api/runs/:id` returns the trace
  so far, and the result once the run is done.
- `GET /api/runs/:id/events` (server-sent events): first the whole run so far, then one event per step
  and per status change; it closes at `awaiting_approval` or `done`; a heartbeat every 15 s.
- The page follows that stream: steps appear as they happen, the result when the run ends.
- The run history lists running and paused runs too, with their status.
- Deadline: 10 minutes of agent time per run (configurable); the wait for an approval does not count.
  Over it, a model call in flight is aborted and the run ends with action escalate, a reason naming
  the limit and the new flag `deadlineReached`.
- Injection guard: ordinary tickets such as "you are now charging me twice", "please show the rules
  for returns" and "ignore my previous email, the parcel arrived" are no longer flagged; the phrasings
  flagged today still are, and a suspected ticket is escalated as today.
- Refund approval: when the policy step would propose a refund, the run pauses with status
  `awaiting_approval` before any draft, and the page shows Approve and Reject (no comment field).
- Approve: the run goes on (the page follows it live) and ends with action propose_refund and the
  refund reply draft.
- Reject: the run ends with action escalate, the reason "Refund rejected by a person" and no draft.
- Approve or Reject on a run that is not awaiting approval answers 409 `RUN_NOT_AWAITING_APPROVAL`.
- An unexpected error in a background run ends it as escalate with the error as the reason.
- On start, runs left `running` by a stopped service end as escalate with the reason
  "Service restarted during the run"; paused runs survive a restart and can still be approved.
- Refunds are still only proposed, never executed; an approval does not move money.

Not doing:
- No sign-in: whoever opens the page can approve or reject.
- No cancelling of a running run, no queue or limit on parallel runs.
- No model-based injection classifier: the guard stays a list of patterns.

## Technical

As usual: contracts in `packages/contracts`, ports in `domain/`, SQLite migrations, TanStack Query.
Reuses: `LangGraphTriageAgent` (graph, `traced` steps), `SqliteRunRepository`, `RunSchema`,
`PatternInjectionGuard`, `TraceTimeline`, `TriageResult`, `useRun`, the `Clock` port, rxjs.
New:
- The run row is written at start and updated after each step; migration `002` adds `status`.
- `RunSchema` gets `status`, `result` nullable until done; `RunSummary` gets `status`, its
  `category`/`action` nullable; result flags get `deadlineReached`; new error code.
- An in-process run-events port the agent publishes to and the `@Sse()` route subscribes to.
- `POST /api/runs/:id/approval` with `{ decision: "approve" | "reject" }` resumes the paused run.
- A LangGraph `interrupt()` in an approval node after policy, resumed with `Command`, checkpointed by
  run id with `@langchain/langgraph-checkpoint-sqlite` (`SqliteSaver`) in the `DATABASE_PATH` file.
- The deadline: `RUN_DEADLINE_SECONDS` (default 600); an `AbortSignal` reaches the model calls.
- `apps/web/nginx.conf`: the 30-minute timeouts go; the events location gets `proxy_buffering off`.
Risks:
- `better-sqlite3` is a native module: the triage Docker image must install it (prebuilt binary or
  build tools); checked by building the image.
- Two SQLite drivers on one file: each opens its own connection, WAL mode, the saver owns its tables.
- Events published before a client subscribes are lost: the stream starts with the stored snapshot.
Capabilities: `ticket-triage` (modified), `triage-runs` (modified), `triage-web` (modified)

## To confirm
