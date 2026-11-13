# Decisions: support-triage-agent

- 2026-11-13 Business case: e-commerce support ticket triage - why: many natural tools, clear guardrails, easy to show prompt-injection defence; instead of: refund decisions, invoice processing, lead qualification; by: user
- 2026-11-13 LLM provider: Anthropic Claude via `@anthropic-ai/sdk`-backed `@langchain/anthropic` - why: user's choice; instead of: OpenAI, both behind a switch; by: user
- 2026-11-13 Agent framework: LangChain family, LangGraph.js StateGraph - why: user does not want a hand-made orchestrator; explicit graph keeps step order deterministic; instead of: custom orchestrator, LangChain createAgent, Vercel AI SDK; by: user
- 2026-11-13 Interface: HTTP API + React web UI - why: best demo and screenshots, the template already plans apps/web; instead of: API + CLI only; by: user
- 2026-11-13 Brief approval: the user waits and approves the brief now, the rest runs unattended - why: the hook needs the user's approval; instead of: skipping OpenSpec; by: user
- 2026-11-13 GitHub: local repository only, nothing pushed - why: the user reviews first and publishes later; instead of: private or public repo with a PR; by: user
- 2026-11-13 Libraries: the agent picks the standard set (NestJS, Zod, pino, node:sqlite, Turborepo, Vitest, ESLint, React + Vite, TanStack Query, Testing Library, MSW, Playwright, i18next) and logs numbers and reasons - why: the user is away during implementation; instead of: Postgres + Testcontainers, Fastify; by: user
- 2026-11-13 Initial commit made on a bootstrap branch and `main` pointed at it (`git branch main <hash>`) - why: the hook denies commits on main and the repository had no commit yet; the user picked this path as an option; by: agent (technical)
- 2026-11-13 Correction of the line above: the user picked "I made the commit", but the repository still had no commit, so the agent took the other offered option (commit on a bootstrap branch, `main` set to it) - why: unblock the start; by: agent (technical)
- 2026-11-13 No offline demo mode; the user's real `ANTHROPIC_API_KEY` runs it for now; how reviewers run it without that key stays open (README next steps) - why: user's answer; instead of: deterministic scripted model when the key is missing; by: user
- 2026-11-13 Default model `claude-sonnet-5-5`, overridable by `ANTHROPIC_MODEL` - why: quality/price balance for triage; instead of: opus (cost), haiku (quality); by: agent (technical)
- 2026-11-13 Retries: 3 attempts per LLM call with exponential backoff, 2 repair attempts for schema-invalid output, then escalate - why: common defaults; by: user confirmed assumption
- 2026-11-13 Limits: subject <= 200 chars, body <= 5000 chars, <= 8 tool calls per run - why: stop runaway loops and cost; by: user confirmed assumption
- 2026-11-13 Refund rule: delivered, <= 30 days since delivery, not refunded; amount > 500 USD escalates - why: realistic simple policy; by: user confirmed assumption
- 2026-11-13 Work on a branch in this checkout and this session instead of a separate worktree and session - why: the user is away, and the approval hook reads this checkout; by: user confirmed assumption
- 2026-11-13 API key: the user puts `ANTHROPIC_API_KEY` into the root `.env`; the agent never reads it, the app loads it, and a live run feeds the README examples - by: user
