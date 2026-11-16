# Brief: approved-refund-label

## Product

Goal: the refund line of the decision panel says what happened: a person approved the refund. Today
it says "(needs approval)" on every `propose_refund` result, though a run only ends that way after
Approve (a rejection ends as `escalate`); seen on 2026-11-16 in a fresh-clone Docker run.

Behaviour:
- A result with a refund shows "Refund approved by a person: 89 USD for order A-1002. Approving
  does not pay it out." instead of "Proposed refund: 89 USD for order A-1002 (needs approval)".
- The README's top screenshot `docs/screenshots/refund-proposed.png` is retaken with the new line:
  the same stored run (in the running `bulls-media-test` stack's database), opened in this
  branch's web app, no model call.

Not doing:
- No change to the service, the API or the contracts: only the web app's text.
- The approval panel of a paused run stays ("Refund needs your approval", "The agent would propose
  a refund of …"): it is right while the run waits.
- The action badge stays "Propose refund", in the decision and in Past runs.
- The service's summary ("Action: propose_refund (89 USD for order A-1002)") and the model's reply
  draft stay as they are.

## Technical

As usual: the text is the `result.refund` string in `apps/web/locales/en.json`, shown by
`TriageResult`; tests are updated to the new text.
Reuses: `apps/web/src/features/triage/triage-result.tsx`, the `result.refund` key.
New: nothing.
Risks: the stored run may be gone from the stack's database - then retaking the screenshot needs a
new live run, which is asked first.
Capabilities: `triage-web` (modified: Result view, the refund line of an approved refund).

## To confirm
