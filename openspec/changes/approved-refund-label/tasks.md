# Tasks

## 1. Approved refund line in the decision panel

Owns: apps/web/locales/en.json, apps/web/src/features/triage/triage-result.test.tsx, apps/web/src/app.test.tsx, docs/screenshots/refund-proposed.png · Depends on: none · Done when: npm run check

- [x] 1.1 Test "Refund line says a person approved it" (apps/web/src/features/triage/triage-result.test.tsx: a result with a refund of 89 USD for order A-1002 shows the new line and no "(needs approval)"; the refund assertion leaves "Result shows the decision")
- [x] 1.2 Test "Result shows the decision" and "Escalation without a draft" (apps/web/src/features/triage/triage-result.test.tsx: kept as they are, minus the moved refund assertion); "shows no refund line without a refund" queries the new text
- [x] 1.3 `result.refund` in apps/web/locales/en.json: "Refund approved by a person: {{amount}} {{currency}} for order {{orderId}}. Approving does not pay it out."
- [x] 1.4 apps/web/src/app.test.tsx "Approve follows the run to its result": expects the new line after Approve
- [x] 1.5 docs/screenshots/refund-proposed.png: retaken at the same size from run b44a532f-cdf1-4ae2-806b-bb2dc51b6df0 of the bulls-media-test stack (service on :3000), opened in this branch's web app (`npm run dev -w apps/web`, proxied to :3000); no model call
