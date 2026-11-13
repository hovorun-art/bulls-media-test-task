---
paths:
  - "apps/web/**"
---

# Web app (functional React)

- Feature folders (`src/features/<feature>/`), each with its own components, hooks and API calls.
  Components, hooks and plain functions only: no layers, classes, interface-plus-implementation
  pairs or DI (those are backend rules).
- Data through the feature's hooks and API calls, typed with `packages/contracts`; dependencies
  through arguments, props or context. Server state: TanStack Query. No UI kit and no
  global store (only when a real need appears); plain CSS in `src/styles.css`.
- Text shown to users comes from the translation files (`locales/`), never hardcoded.
- Unit tests (`*.test.tsx` next to the component) go through what the user sees and does
  (@testing-library/react + user-event); components get their data through their
  feature's hooks and API calls, and the test fakes the network at `fetch`
  (MSW, `src/test-server.ts`).
- Web e2e: Playwright in `apps/web` (task `test:e2e:ui`), main agent only.
