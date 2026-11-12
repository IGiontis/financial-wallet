---
name: verify
description: The checks to run in MyFiWallet before saying a change is done — types, lint, tests, demo screenshots beside existing pages, docs updated. Use at the end of every change.
---

# Before saying "done"

Report each result plainly, including what failed or was skipped.

1. `npx tsc -b` — the real type check (plain `tsc --noEmit` checks zero files here).
2. `npx eslint <changed paths>`.
3. `npx vitest run --dir src` (add `--testTimeout=30000` when the machine is busy). Includes
   the convention tests: `uiConventions`, `contrast`, `typeScale`, `cssLayers`,
   `reducedMotion`, `fixtures`, and the docs-map test.
4. **Anything visible**: the public demo via `preview_start` "dev-emu" (http://[::1]:5174, or
   localhost:5174 if [::1] is refused). Screenshot the changed screen **beside Goals and
   Debts/Bills** at 320px and 1366px, light and dark, Greek (and a glance in English). Fix every
   difference in header, tabs, tiles, rows, buttons, spacing. Check the console for errors.
5. **Docs** updated in the same change (`PROJECT_MAP`, `COMPONENTS`, `DATABASE`, `DATA_FLOW`,
   `DECISIONS` — whichever the change touched).
6. A stale "does not provide an export named …" in the dev server after many edits is Vite's
   hot reload, not the code: reload the page; `npx vite build` proves it.
7. Don't commit. Tell the owner in Greek what changed, what he should look at, and anything
   only he can do (Console rules, indexes).
