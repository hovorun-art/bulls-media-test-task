# triage-runs Specification

## Purpose
Keeps every triage run with its trace so a person can audit what the agent did, and logs each step for operations.

## Requirements

### Requirement: Every run is stored with its trace
The service SHALL store each triage run with its ticket, its result and its trace, where each trace entry holds the step, the tool name for tool calls, the input, the output and the duration.

#### Scenario: Triaged ticket can be opened by its run id
- **WHEN** a ticket is triaged and the client opens the returned run id
- **THEN** the run holds the same ticket, result and trace

#### Scenario: Tool call appears in the trace
- **WHEN** the agent looks up an order during a run
- **THEN** the trace has a tool entry named for the order lookup with its input and output

### Requirement: Runs can be listed
The service SHALL list stored runs newest first with their id, time, subject, category and action.

#### Scenario: Runs are listed newest first
- **WHEN** two tickets are triaged one after the other and the client lists the runs
- **THEN** the second run comes first

### Requirement: Unknown run is reported
The service SHALL answer a request for a run id that does not exist with status 404 and code RUN_NOT_FOUND.

#### Scenario: Unknown run id returns 404
- **WHEN** a client opens a run id that was never stored
- **THEN** the response is 404 with code RUN_NOT_FOUND

### Requirement: Steps and the decision are logged
The service SHALL write a structured log line for each step and tool call of a run and one for the final decision, each carrying the run id.

#### Scenario: Final decision is logged with the run id
- **WHEN** a ticket is triaged
- **THEN** a log line with the run id, the category and the action is written
