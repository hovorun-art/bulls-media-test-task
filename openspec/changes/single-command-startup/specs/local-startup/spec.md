# Spec Delta

## Purpose

Starts the whole triage system (local model, triage service, web UI) on any machine with one Docker
Compose command, with no Node.js or Ollama installed.

## ADDED Requirements

### Requirement: One command starts the whole system
Running `docker compose up` from the repository root SHALL start the local model server, the triage service and the web UI, with the web UI on host port 8080 and the triage service on host port 3000.

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

### Requirement: The model is downloaded once and reused
The stack SHALL download the configured model automatically when it is missing and keep it in a named volume shared by every Compose project, so a later start does not download it again.

#### Scenario: Model is pulled on start
- **WHEN** the stack starts
- **THEN** a one-shot service pulls the configured model from the model server and exits successfully

#### Scenario: Models volume is shared across projects
- **WHEN** the Compose configuration is rendered under two different project names
- **THEN** both use the same models volume name

### Requirement: Services start in dependency order
The triage service SHALL start only after the model server is healthy and the model pull has completed successfully, and the web UI only after the triage service is healthy.

#### Scenario: Triage waits for the model
- **WHEN** the Compose configuration is rendered
- **THEN** the triage service depends on the model server being healthy and on the model pull having completed successfully

#### Scenario: Web waits for triage
- **WHEN** the Compose configuration is rendered
- **THEN** the web UI depends on the triage service being healthy

### Requirement: The model is chosen by one variable
The model used by the pull and by the triage service SHALL come from `OLLAMA_MODEL`, defaulting to the same model as the local development run.

#### Scenario: Default model
- **WHEN** the Compose configuration is rendered without `OLLAMA_MODEL` set
- **THEN** the pull and the triage service both use `qwen3:8b`

#### Scenario: Model from the environment
- **WHEN** the Compose configuration is rendered with `OLLAMA_MODEL` set to another model
- **THEN** the pull and the triage service both use that model

### Requirement: Runs survive a restart
The triage service SHALL keep its stored runs in a named volume, so they remain after the containers are recreated.

#### Scenario: Run is still listed after the stack is recreated
- **WHEN** a ticket has been triaged and the stack is taken down without removing volumes and started again
- **THEN** GET /api/runs lists that run

### Requirement: Variant without the model containers
Adding `compose.host-llm.yaml` to the command SHALL start the triage service and the web UI without the model server and the model pull, with the service using the model server on the host or the provider set in `.env`.

#### Scenario: Override leaves out the model containers
- **WHEN** the Compose configuration is rendered with `compose.yaml` and `compose.host-llm.yaml`
- **THEN** it has no model server and no model pull service, and the triage service depends on neither

#### Scenario: Override points the service at the host
- **WHEN** the Compose configuration is rendered with `compose.yaml` and `compose.host-llm.yaml`
- **THEN** the triage service uses http://host.docker.internal:11434 as its model server
