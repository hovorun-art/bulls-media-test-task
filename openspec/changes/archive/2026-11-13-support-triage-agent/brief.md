# Brief: support-triage-agent

## Product

Goal: an AI agent that triages e-commerce support tickets end-to-end (understand, look things up,
decide, draft a reply) so a human support agent only reviews and sends; delivered as the test task.

Behaviour:
- A ticket (customer email, subject, body, optional order id) is submitted from the web form or `POST /api/triage`.
- The result is one JSON object (category, priority, action, reply draft, cited knowledge-base articles, reasons) plus a human-readable summary.
- Categories: order_status, shipping_issue, refund_request, product_question, account, other; priority: low, normal, high, urgent.
- Actions: reply (answer drafted), propose_refund (refund suggested for a human to approve, never executed), escalate (to a human, with the reason), refuse (out of scope or abusive, polite refusal drafted).
- The agent works in several steps (a LangGraph graph): input guard, classify, gather facts with tools, decide, draft, validate the output.
- Tools: search the local knowledge base (shop policies), look up an order, check refund eligibility by fixed policy rules; at most 8 tool calls per run.
- A tool call the model repeats with the same arguments is not run again: research ends and the agent decides (added after the first approval, from the live run).
- Refund eligibility: order delivered, at most 30 days since delivery, not refunded yet; an eligible amount above 500 USD is escalated instead of proposed.
- An order is shown to the agent only if the ticket's email owns it; otherwise the agent gets "not found".
- Suspected prompt injection in the ticket (e.g. "ignore previous instructions") never changes the policy: the run is flagged and escalated.
- Invalid input (missing or bad email, empty body, subject over 200 or body over 5000 chars) is rejected with 400 and a clear error; the LLM is never called.
- LLM call failures are retried 3 times with exponential backoff, output that fails the schema gets 2 repair attempts; when retries run out the result is `escalate` with the reason, never a crash.
- Every run is stored with its trace (each step and tool call: input, output, duration) and can be listed and opened (`GET /api/runs`, `GET /api/runs/:id`) and in the web UI.
- Structured JSON logs for each step, tool call and the final decision.
- The model provider is chosen by `LLM_PROVIDER`: `ollama` (default, a free local model, no key) or `anthropic` (needs `ANTHROPIC_API_KEY`); a missing key or unreachable Ollama is reported at start with a clear error.
- Web UI: form with sample tickets to pick, the result (decision card, reply draft, summary), the trace timeline, the run history.
- README with every section the task asks for, sample tickets with expected outputs.

Not doing:
- Sending emails, executing refunds, real CRM/helpdesk integrations, auth, multi-turn chat with the customer.

## Technical

As usual: npm workspaces + Turborepo monorepo per `.claude/rules/`; one backend service `apps/triage`, `apps/web`, `packages/{kernel,contracts,service-kit}`.
Reuses: nothing yet: the repository has only the flow scaffold; this change creates the workspace tooling too.
New: LangGraph.js (`@langchain/langgraph`) + `@langchain/ollama` (default, model `qwen3:8b` by `OLLAMA_MODEL`) and `@langchain/anthropic` (optional, `claude-sonnet-5-5` by `ANTHROPIC_MODEL`) - user's choice: no paid credits; both behind one model port.
New: NestJS, Zod, pino, SQLite via built-in `node:sqlite` (runs and traces, no Docker), Vitest, ESLint, React + Vite, TanStack Query, Testing Library, MSW, Playwright, i18next - user allowed the standard set.
New: knowledge base as markdown files and orders as a JSON seed inside `apps/triage` (mock data).
Risks: LLM is non-deterministic - tests use a fake chat model; deterministic rules (eligibility, ownership, injection check, schema validation) decide what must not depend on the LLM.
Risks: a small local model is slower and weaker than Claude - deterministic rules guard the decisions, schema repair catches bad output; README states the expected speed and the Anthropic option.
Work: on branch `support-triage-agent` in this checkout and this session, not a separate worktree.
Capabilities: `ticket-triage` (new), `triage-runs` (new), `triage-web` (new).

## To confirm
