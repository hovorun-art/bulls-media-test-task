# Brief: gemini-provider

## Product

Goal: the agent runs on Google Gemini (free tier) instead of a local Ollama model, so the system needs
no 5 GB model download and no local model server. Gemini is the only provider: Ollama and Anthropic go.

Behaviour:
- The model is `GEMINI_MODEL`, default `gemini-3.8-flash` (stable, has a free tier).
- `LLM_PROVIDER`, `OLLAMA_*` and `ANTHROPIC_*` are no longer read (one provider, nothing to choose).
- With no `GOOGLE_API_KEY` set, the service does not start and the error names the missing key.
- At start the service calls the Gemini models API once: a rejected key or an unknown model stops the
  start with a clear message naming the problem.
- Each run records the model as provider `gemini` and the model name (shown in the web UI as today).
- `docker compose up` starts only the triage service and the web UI (no model containers, no model
  download); the Gemini key and model come from `.env`. `compose.host-llm.yaml` is deleted.
- Without `GOOGLE_API_KEY`, `docker compose up` refuses to start at once with a message naming the key.
- Test fixtures and samples that show `ollama` / `qwen3:8b` show `gemini` / `gemini-3.8-flash`.
- README and `.env.example` describe getting a Gemini API key and running with it; Ollama steps go.

Not doing:
- Vertex AI / Google Cloud credentials; only the Gemini API key.
- Any change to prompts, agent steps, retries or the escalation on model failure.
- Migrating stored runs that recorded provider `ollama` (they stay as stored).

## Technical

As usual: the chat model is built in `TriageModule` from the Zod config, as today.
Reuses: `LangChainSupportModel` (any LangChain chat model), the `ModelReadiness` port and
`StartupChecks`, the config `superRefine` for the required key, `compose-config.int.test.ts`.
New: `@langchain/google-genai` (`ChatGoogleGenerativeAI`, chosen by the user), built with
`maxRetries: 0` and temperature 0; `GeminiModelReadiness` replaces `OllamaModelReadiness` (one GET
to the Gemini models endpoint for the configured model). Removed: `@langchain/ollama`,
`@langchain/anthropic`, `OllamaModelReadiness`, the provider switch, the `ollama`/`ollama-pull` services, the models volume.
Risks: free-tier rate limits (429) - covered by the existing retries with backoff, then an escalation;
the adapter integration test needs `ChatGoogleGenerativeAI` pointed at a local HTTP stub (its base URL
option) - if it cannot be, the test stubs `fetch` instead.
Capabilities: `ticket-triage` (modified), `local-startup` (modified).

## To confirm
