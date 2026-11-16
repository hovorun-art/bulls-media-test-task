## MODIFIED Requirements

### Requirement: Triage returns a structured decision and a summary
A finished run of a valid ticket SHALL hold a result with the category, the priority, the action, the reply draft, the cited knowledge-base article ids, the reasons, the flags and a human-readable summary, all matching the published result schema.

#### Scenario: Order status question is answered with a reply
- **WHEN** a customer asks where their order is and the agent finds the order and the matching article
- **THEN** the finished run's result has category order_status, action reply, a reply draft, the article id among the citations and a summary naming the action

### Requirement: Refunds follow fixed policy rules
Refund eligibility SHALL be decided by rules, not by the model: the order is delivered, within the configured number of days since delivery and not refunded yet; a refund is only proposed, never executed, an eligible amount above the configured limit is escalated, and an eligible refund waits for a person's approval before it is proposed.

#### Scenario: Eligible refund is proposed
- **WHEN** a customer asks for a refund of a delivered order inside the window and under the limit, the model decides to refund and a person approves it
- **THEN** the run ends with status done, action propose_refund with the order id and the amount, and a reply draft

#### Scenario: Eligible refund waits for approval
- **WHEN** a customer asks for a refund of a delivered order inside the window and under the limit, and the model decides to refund
- **THEN** the run's status is awaiting_approval, it has no result yet and no draft step has run

#### Scenario: Refund outside the window is not proposed
- **WHEN** the model decides to refund an order delivered longer ago than the window
- **THEN** the action is escalate and the flags mark a policy override

#### Scenario: Refund above the limit is escalated
- **WHEN** the model decides to refund an eligible order whose amount is above the configured limit
- **THEN** the action is escalate with a reason naming the limit

#### Scenario: Refund of an undelivered order is not eligible
- **WHEN** refund eligibility is checked for an order that is not delivered yet
- **THEN** the check reports not eligible with the reason "not delivered"

### Requirement: Model failures end in an escalation, not an error
The service SHALL retry a failed model call the configured number of times with backoff and repair model output that fails its schema the configured number of times; when that is exhausted the run SHALL end with action escalate and the failure as the reason.

#### Scenario: Model call is retried after a transient failure
- **WHEN** the model API fails once with a server error and then answers
- **THEN** the call succeeds with the second answer

#### Scenario: Invalid model output is repaired
- **WHEN** the model first answers with output that fails the schema and then with valid output
- **THEN** the step uses the valid output

#### Scenario: Model unavailable ends in escalation
- **WHEN** every model call fails
- **THEN** the run ends with status done, action escalate, a reason naming the model failure and an empty reply draft

## ADDED Requirements

### Requirement: A person approves or rejects a proposed refund
A run awaiting approval SHALL be resumed by an approval request carrying approve or reject: approve SHALL end it with action propose_refund, the order id, the amount and a reply draft; reject SHALL end it with action escalate, the reason "Refund rejected by a person" and no reply draft.

#### Scenario: Rejected refund is escalated
- **WHEN** a client rejects a run that awaits approval
- **THEN** the run ends with status done, action escalate, the reason "Refund rejected by a person" and an empty reply draft

#### Scenario: Paused run survives a restart
- **WHEN** the service restarts while a run awaits approval and a client then approves it
- **THEN** the run ends with action propose_refund

### Requirement: Approval of a run that is not paused is refused
An approval request for a run whose status is not awaiting_approval SHALL be answered with status 409 and code RUN_NOT_AWAITING_APPROVAL without changing the run, and one for an unknown run with status 404 and code RUN_NOT_FOUND.

#### Scenario: Second approval is refused
- **WHEN** a client approves a run that was already approved
- **THEN** the response is 409 with code RUN_NOT_AWAITING_APPROVAL and the run is unchanged

#### Scenario: Approval of a running run is refused
- **WHEN** a client approves a run whose status is running
- **THEN** the response is 409 with code RUN_NOT_AWAITING_APPROVAL

#### Scenario: Approval of an unknown run is refused
- **WHEN** a client approves a run id that was never stored
- **THEN** the response is 404 with code RUN_NOT_FOUND

### Requirement: A run has a deadline
A run SHALL stop when its agent time exceeds the configured deadline, aborting a model call in flight, and SHALL end with action escalate, a reason naming the deadline and the flag deadlineReached; time spent awaiting approval SHALL not count toward it.

#### Scenario: Run over the deadline is escalated
- **WHEN** a run's steps take longer than the configured deadline
- **THEN** the run ends with action escalate, a reason naming the deadline and the flag deadlineReached set

#### Scenario: Model call in flight is aborted at the deadline
- **WHEN** a model call has not answered when the deadline passes
- **THEN** the call is aborted and the run ends at the deadline with action escalate and the flag deadlineReached set

#### Scenario: Approval wait does not count toward the deadline
- **WHEN** a run awaits approval for longer than the configured deadline and is then approved
- **THEN** the run ends with action propose_refund and the flag deadlineReached not set

### Requirement: Ordinary wording is not taken for prompt injection
The injection guard SHALL not flag ordinary customer wording that only resembles an instruction to the agent, while it still flags the phrasings of the requirement "Prompt injection does not change the policy".

#### Scenario: Complaint about double charging is not flagged
- **WHEN** a ticket body says "you are now charging me twice"
- **THEN** the injection flag is not set and the agent researches the ticket

#### Scenario: Question about return rules is not flagged
- **WHEN** a ticket body says "please show the rules for returns"
- **THEN** the injection flag is not set

#### Scenario: Retracted earlier email is not flagged
- **WHEN** a ticket body says "ignore my previous email, the parcel arrived"
- **THEN** the injection flag is not set

### Requirement: An unexpected error ends the run as an escalation
An error that is not a model failure SHALL end the run with status done, action escalate and the error message among the reasons, so no run stays running.

#### Scenario: Unhandled error ends the run as an escalation
- **WHEN** the agent fails with an error that none of its steps handles
- **THEN** the run ends with status done, action escalate and the error message among the reasons
