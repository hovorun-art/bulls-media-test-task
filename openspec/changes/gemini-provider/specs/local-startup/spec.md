## MODIFIED Requirements

### Requirement: One command starts the whole system
Running `docker compose up` from the repository root SHALL start the triage service and the web UI, with no model server, with the web UI on host port 8080 and the triage service on host port 3000.

#### Scenario: Web UI and service answer after compose up
- **WHEN** `docker compose up --wait` has finished
- **THEN** http://localhost:8080 serves the web UI and http://localhost:3000/api/health answers 200 with status "ok"

#### Scenario: Default host ports
- **WHEN** the Compose configuration is rendered without host port overrides
- **THEN** the web UI is published on host port 8080 and the triage service on host port 3000

#### Scenario: Web UI reaches the service through its own origin
- **WHEN** the stack is up and a client calls http://localhost:8080/api/health
- **THEN** the answer is 200 with status "ok"

#### Scenario: A ticket is triaged from the web UI with the real model
- **WHEN** the stack is up and a sample ticket is submitted through the web UI
- **THEN** the web UI shows the decision for that ticket

#### Scenario: No model containers
- **WHEN** the Compose configuration is rendered
- **THEN** its only services are the triage service and the web UI

### Requirement: The model is chosen by one variable
The model used by the triage service SHALL come from `GEMINI_MODEL`, defaulting to the same model as the local development run.

#### Scenario: Default model
- **WHEN** the Compose configuration is rendered without `GEMINI_MODEL` set
- **THEN** the triage service uses `gemini-3.8-flash`

#### Scenario: Model from the environment
- **WHEN** the Compose configuration is rendered with `GEMINI_MODEL` set to another model
- **THEN** the triage service uses that model

## ADDED Requirements

### Requirement: Web UI starts after the triage service
The web UI SHALL start only after the triage service is healthy, and the triage service SHALL depend on no other service.

#### Scenario: Web waits for the healthy triage service
- **WHEN** the Compose configuration is rendered
- **THEN** the web UI depends on the triage service being healthy and the triage service depends on nothing

### Requirement: Compose requires the Gemini key
The Compose configuration SHALL refuse to start or render without `GOOGLE_API_KEY`, with a message naming it, and SHALL pass the key to the triage service.

#### Scenario: Missing key stops compose
- **WHEN** the Compose configuration is rendered without `GOOGLE_API_KEY`
- **THEN** the command fails and its error names `GOOGLE_API_KEY`

#### Scenario: Key reaches the triage service
- **WHEN** the Compose configuration is rendered with `GOOGLE_API_KEY` set
- **THEN** the triage service receives that key

## REMOVED Requirements

### Requirement: Services start in dependency order
**Reason**: With no model server the triage service waits for nothing; the remaining order is the requirement "Web UI starts after the triage service".
**Migration**: None.

### Requirement: The model is downloaded once and reused
**Reason**: The model is hosted by Gemini; nothing is downloaded.
**Migration**: None; the old `triage-ollama-models` volume can be removed with `docker volume rm triage-ollama-models`.

### Requirement: Variant without the model containers
**Reason**: There are no model containers left, so `compose.host-llm.yaml` is deleted.
**Migration**: Use `docker compose up`.
