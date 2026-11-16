# Decisions: default-model-flash-lite

- 2026-11-16 Default model `gemini-flash-lite-latest` - why: `gemini-3.8-flash` answered 503 "high demand" on a live run; a probe with the user's key gave 200 for gemini-flash-lite-latest, gemini-3.5-flash, gemini-3.5-flash-lite, gemini-3.6-flash and gemini-3-flash-preview; instead of: keep gemini-3.8-flash and override GEMINI_MODEL per run; by: user
- 2026-11-16 Change the default through OpenSpec, not as a fix - why: the default is in the ticket-triage and local-startup specs; by: user
- 2026-11-16 Move the user's uncommitted `.env.example` edit on main into this change - why: nothing is changed on main; by: user
- 2026-11-16 Retries on 429/503 and a fallback model stay out of scope - why: the user asked only for the default model; by: agent (technical), in the brief for approval
- 2026-11-16 Fixtures that only name gemini-3.8-flash stay; only the tests of the default change - why: any model name works there, smaller diff; by: user confirmed assumption
- 2026-11-16 README section 7 (recorded live run) stays; only the architecture label and setup text change - why: it documents a past run, a new live run will replace it; by: user confirmed assumption
