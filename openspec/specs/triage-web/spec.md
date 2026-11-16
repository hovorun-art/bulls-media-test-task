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
After a triage the page SHALL show the category, priority, action, reply draft, summary, reasons, cited articles and flags.

#### Scenario: Result shows the decision
- **WHEN** the service returns a result with action propose_refund
- **THEN** the page shows the action, the reply draft and the summary

#### Scenario: Escalation without a draft
- **WHEN** the service returns action escalate with an empty reply draft
- **THEN** the page shows the action and states that there is no draft

### Requirement: Trace timeline
The page SHALL show the run's trace as an ordered list of steps and tool calls with their durations, each expandable to its input and output.

#### Scenario: Trace step expands to its data
- **WHEN** the user expands a tool call in the trace
- **THEN** its input and output are shown

### Requirement: Run history
The page SHALL list earlier runs and open one on click.

#### Scenario: Opening a past run
- **WHEN** the user clicks a run in the history
- **THEN** the page shows that run's result and trace
