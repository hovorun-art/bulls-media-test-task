## MODIFIED Requirements

### Requirement: Run history
The page SHALL list earlier runs, including running and paused ones with their status, and open one on click.

#### Scenario: Opening a past run
- **WHEN** the user clicks a run in the history
- **THEN** the page shows that run's result and trace

#### Scenario: Running run shows its status in the history
- **WHEN** the history holds a run that is still running
- **THEN** that entry shows the running status

## ADDED Requirements

### Requirement: Live progress
While a shown run is running the page SHALL follow its event stream, adding each step to the trace as it arrives and showing the result when the run is done.

#### Scenario: Submitted ticket opens its run at once
- **WHEN** the user submits a ticket and the service answers 202 with a run id
- **THEN** the page shows that run as running

#### Scenario: Step appears while the run is running
- **WHEN** the stream of the shown run sends a finished step
- **THEN** the trace timeline shows that step without a reload

#### Scenario: Result appears when the run is done
- **WHEN** the stream of the shown run sends the done run
- **THEN** the page shows its result

### Requirement: Refund approval
For a run awaiting approval the page SHALL show Approve and Reject; Approve SHALL send approve and follow the resumed run live to its result, Reject SHALL send reject and show the ended run.

#### Scenario: Paused run offers Approve and Reject
- **WHEN** the shown run has status awaiting_approval
- **THEN** the page shows the Approve and Reject buttons

#### Scenario: Approve follows the run to its result
- **WHEN** the user clicks Approve
- **THEN** the service receives approve for that run and the page shows the steps that follow and the propose_refund result

#### Scenario: Reject shows the escalation
- **WHEN** the user clicks Reject
- **THEN** the service receives reject for that run and the page shows the escalate result without a draft

#### Scenario: Finished run offers no approval
- **WHEN** the shown run has status done
- **THEN** the page shows neither Approve nor Reject
