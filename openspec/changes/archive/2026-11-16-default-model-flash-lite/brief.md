# Brief: default-model-flash-lite

## Product

Goal: the agent works out of the box on the Gemini free tier: `gemini-3.8-flash` answered
`503 high demand` on a live run, while `gemini-flash-lite-latest` answered at once.

Behaviour:
- Without `GEMINI_MODEL`, the service (`npm run dev`) and the Compose stack use
  `gemini-flash-lite-latest`; each run records the model as provider `gemini`, name
  `gemini-flash-lite-latest`.
- `GEMINI_MODEL` still picks any other model, in `.env` or next to the key on the command line.
- `.env.example` and the README name `gemini-flash-lite-latest` as the default; the README's recorded
  live run (section 7) stays as recorded.

Not doing:
- No change to retries or backoff on `429`/`503` (a separate change if needed).
- No fallback to a second model when the first one is overloaded.
- No change to prompts, agent steps or the start check.

## Technical

As usual: the default lives in the Zod config and in `compose.yaml`; only the tests of the default
change, fixtures that merely name `gemini-3.8-flash` stay.
Reuses: `TriageConfigSchema`, the `GEMINI_MODEL` interpolation in `compose.yaml`, the start check
(`GeminiModelReadiness`), `compose-config.int.test.ts`, `triage.module.test.ts`.
New: nothing.
Risks:
- `gemini-flash-lite-latest` is an alias Google can point at a newer model without notice: the
  answers may change and the run records the alias, not the version. Pinning stays one variable
  away (`GEMINI_MODEL=gemini-3.5-flash-lite`), and the README says so.
Capabilities: `ticket-triage` (modified), `local-startup` (modified)

## To confirm
