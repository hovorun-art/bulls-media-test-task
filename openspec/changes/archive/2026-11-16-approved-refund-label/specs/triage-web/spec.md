# Spec Delta

## MODIFIED Requirements

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
