# Decisions: approved-refund-label

- 2026-11-16 Treat the label fix as a change, not a `fix/` branch - why: it changes text the user sees, which CLAUDE.md routes through OpenSpec; instead of: a small fix branch; by: agent (technical)
- 2026-11-16 Change only the web app's text, not the service or the contracts - why: a result with a refund only exists after a person approved it (the approval node always runs before the draft for propose_refund; reject sets refund to null), so the web app can state it without a new field; instead of: a new "approved" field in the result; by: agent (technical)
- 2026-11-16 The refund line reads "Refund approved by a person: {amount} {currency} for order {orderId}. Approving does not pay it out." - why: states what happened and that no money moved, since the agent only proposes refunds; instead of: "Proposed refund: … (approved by a person)", "Approved refund: …"; by: user
- 2026-11-16 Retake docs/screenshots/refund-proposed.png from the stored run in the bulls-media-test stack, opened in this branch's web app - why: same content with the new label and no model call; instead of: leaving the old picture; by: user
- 2026-11-16 The approval panel of a paused run stays unchanged - why: its text is right while the run waits; by: user confirmed assumption
- 2026-11-16 The action badge stays "Propose refund" in the decision and in Past runs - why: it names the action, which does not change; by: user confirmed assumption
- 2026-11-16 The service's summary and the model's reply draft stay unchanged - why: they come from the service and the model, not the web app's text; by: user confirmed assumption
- 2026-11-16 If the stored run is gone, ask before a new live run for the screenshot - why: a live run calls the hosted model; instead of: running it unasked; by: agent (technical)
