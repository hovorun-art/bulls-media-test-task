## REMOVED Requirements

### Requirement: Model provider is configurable
**Reason**: Gemini is the only model provider; the local model and the other hosted provider are removed, so there is no provider to choose.
**Migration**: Set `GOOGLE_API_KEY` (and optionally `GEMINI_MODEL`); `LLM_PROVIDER`, `OLLAMA_*` and `ANTHROPIC_*` are no longer read.

## ADDED Requirements

### Requirement: Runs use the configured Gemini model
The service SHALL triage every ticket with the Gemini model named by `GEMINI_MODEL`, defaulting to `gemini-3.8-flash`, and SHALL record each run's model as provider `gemini` with that model name.

#### Scenario: Default Gemini model is recorded
- **WHEN** the service runs without `GEMINI_MODEL` set and a ticket is triaged
- **THEN** the run's model is provider "gemini" and name "gemini-3.8-flash"

#### Scenario: Configured Gemini model is recorded
- **WHEN** the service runs with `GEMINI_MODEL` set to "gemini-3.5-flash-lite" and a ticket is triaged
- **THEN** the run's model is provider "gemini" and name "gemini-3.5-flash-lite"

#### Scenario: Old provider settings are ignored
- **WHEN** the service starts with `LLM_PROVIDER` set to "ollama" and a valid Gemini key
- **THEN** the service starts and its runs record provider "gemini"

### Requirement: Service refuses to start without a usable Gemini key and model
The service SHALL refuse to start with a clear error when `GOOGLE_API_KEY` is not set, when the Gemini models API rejects the key, or when that API does not know the configured model, and SHALL check this once at start.

#### Scenario: Missing Gemini key does not start
- **WHEN** the service starts without `GOOGLE_API_KEY`
- **THEN** the service does not start and the error names `GOOGLE_API_KEY`

#### Scenario: Rejected Gemini key does not start
- **WHEN** the service starts and the Gemini models API rejects the key
- **THEN** the service does not start and the error says the Gemini API key was rejected

#### Scenario: Unknown Gemini model does not start
- **WHEN** the service starts and the Gemini models API does not know the configured model
- **THEN** the service does not start and the error names that model

#### Scenario: Usable key and model start
- **WHEN** the service starts and the Gemini models API returns the configured model for the key
- **THEN** the service starts and answers GET /api/health with 200
