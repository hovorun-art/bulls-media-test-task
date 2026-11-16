# Spec Delta

## MODIFIED Requirements

### Requirement: The model is chosen by one variable
The model used by the triage service SHALL come from `GEMINI_MODEL`, defaulting to the same model as the local development run.

#### Scenario: Default model
- **WHEN** the Compose configuration is rendered without `GEMINI_MODEL` set
- **THEN** the triage service uses `gemini-flash-lite-latest`

#### Scenario: Model from the environment
- **WHEN** the Compose configuration is rendered with `GEMINI_MODEL` set to another model
- **THEN** the triage service uses that model
