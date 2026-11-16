# triage-web Specification

## Purpose
A web page where a support agent submits a ticket, reads the agent's decision and reply draft, follows its trace and reopens earlier runs.

## Requirements

### Requirement: Ticket form
The page SHALL offer a form for email, subject, body and an optional order id, and a picker that fills the form with a sample ticket.

#### Scenario: Picking a sample fills the form
- **WHEN** the user picks a sample ticket
- **THEN** the form fields hold that sample's email, subject, body and order id

#### Scenario: Validation errors are shown
- **WHEN** the user submits the form and the service answers 400
- **THEN** the page shows the error message next to the form and keeps the input

### Requirement: Result view
After a triage the page SHALL show the category, priority, action, reply draft, summary, reasons, cited articles and flags, and for a result with a refund a line saying that a person approved the refund, with its amount, currency and order id, and that approving does not pay it out.

#### Scenario: Result shows the decision
- **WHEN** the service returns a result with action propose_refund
- **THEN** the page shows the action, the reply draft and the summary

#### Scenario: Refund line says a person approved it
- **WHEN** the service returns a result with a refund of 89 USD for order A-1002
- **THEN** the page shows "Refund approved by a person: 89 USD for order A-1002. Approving does not pay it out." and no "(needs approval)"

#### Scenario: Escalation without a draft
- **WHEN** the service returns action escalate with an empty reply draft
- **THEN** the page shows the action and states that there is no draft

### Requirement: Trace timeline
The page SHALL show the run's trace as an ordered list of steps and tool calls with their durations, each expandable to its input and output.

#### Scenario: Trace step expands to its data
- **WHEN** the user expands a tool call in the trace
- **THEN** its input and output are shown

### Requirement: Run history
The page SHALL list earlier runs, including running and paused ones with their status, and open one on click.

#### Scenario: Opening a past run
- **WHEN** the user clicks a run in the history
- **THEN** the page shows that run's result and trace

#### Scenario: Running run shows its status in the history
- **WHEN** the history holds a run that is still running
- **THEN** that entry shows the running status

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
