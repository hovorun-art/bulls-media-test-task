# Spec Delta

## MODIFIED Requirements

### Requirement: Runs use the configured Gemini model
The service SHALL triage every ticket with the Gemini model named by `GEMINI_MODEL`, defaulting to `gemini-flash-lite-latest`, and SHALL record each run's model as provider `gemini` with that model name.

#### Scenario: Default Gemini model is recorded
- **WHEN** the service runs without `GEMINI_MODEL` set and a ticket is triaged
- **THEN** the run's model is provider "gemini" and name "gemini-flash-lite-latest"

#### Scenario: Configured Gemini model is recorded
- **WHEN** the service runs with `GEMINI_MODEL` set to "gemini-3.5-flash-lite" and a ticket is triaged
- **THEN** the run's model is provider "gemini" and name "gemini-3.5-flash-lite"

#### Scenario: Old provider settings are ignored
- **WHEN** the service starts with `LLM_PROVIDER` set to "ollama" and a valid Gemini key
- **THEN** the service starts and its runs record provider "gemini"

