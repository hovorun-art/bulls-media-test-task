## MODIFIED Requirements

### Requirement: Every run is stored with its trace
The service SHALL store each triage run from its start with its ticket, its status (running, awaiting_approval or done), its trace so far and, once done, its result, where each trace entry holds the step, the tool name for tool calls, the input, the output and the duration.

#### Scenario: Triaged ticket can be opened by its run id
- **WHEN** a ticket is triaged to the end and the client opens the returned run id
- **THEN** the run has status done and holds the same ticket, the result and the trace

#### Scenario: Tool call appears in the trace
- **WHEN** the agent looks up an order during a run
- **THEN** the trace has a tool entry named for the order lookup with its input and output

#### Scenario: Running run shows the trace so far
- **WHEN** a client opens a run whose agent has finished the classify step and is still researching
- **THEN** the run has status running, its trace lists the guard and classify steps and it has no result

### Requirement: Runs can be listed
The service SHALL list stored runs newest first with their id, time, subject, status, and once done their category and action.

#### Scenario: Runs are listed newest first
- **WHEN** two tickets are triaged one after the other and the client lists the runs
- **THEN** the second run comes first

#### Scenario: Running run is listed with its status
- **WHEN** a run is still running and the client lists the runs
- **THEN** the run is listed with status running and without a category or action

## ADDED Requirements

### Requirement: A ticket is accepted before the agent finishes
The service SHALL answer a valid ticket with status 202 and the new run id without waiting for the agent, which goes on in the background.

#### Scenario: Ticket is accepted at once
- **WHEN** a client posts a valid ticket while the model has not answered yet
- **THEN** the response is 202 with the run id and opening that id shows status running

### Requirement: Run events are streamed
The service SHALL offer a server-sent event stream per run that first sends the run as stored, then one event for each step that ends and each status change, sends a heartbeat at the configured interval, and closes once the status is awaiting_approval or done.

#### Scenario: Stream starts with the run so far
- **WHEN** a client opens the event stream of a run that has finished two steps
- **THEN** the first event holds the run with those two steps in its trace

#### Scenario: Each finished step is streamed
- **WHEN** a step of the run ends while a client follows its event stream
- **THEN** the client receives an event with that trace entry

#### Scenario: Stream closes when the run is done
- **WHEN** the run's status changes to done while a client follows its event stream
- **THEN** the client receives the done run with its result and the stream closes

#### Scenario: Stream closes when the run awaits approval
- **WHEN** the run's status changes to awaiting_approval while a client follows its event stream
- **THEN** the client receives that status and the stream closes

#### Scenario: Stream of a finished run closes at once
- **WHEN** a client opens the event stream of a run that is already done
- **THEN** it receives the run and the stream closes

#### Scenario: Heartbeat keeps an idle stream open
- **WHEN** no step ends for longer than the configured heartbeat interval
- **THEN** the client receives a heartbeat

#### Scenario: Stream of an unknown run is refused
- **WHEN** a client opens the event stream of a run id that was never stored
- **THEN** the response is 404 with code RUN_NOT_FOUND

### Requirement: Runs interrupted by a stop are closed on start
On start the service SHALL end every run left with status running with status done, action escalate and the reason "Service restarted during the run", and SHALL leave runs awaiting approval as they are.

#### Scenario: Running run is closed on start
- **WHEN** the service starts and a stored run has status running
- **THEN** that run has status done, action escalate and the reason "Service restarted during the run"

#### Scenario: Paused run is kept on start
- **WHEN** the service starts and a stored run has status awaiting_approval
- **THEN** that run still has status awaiting_approval
