---
paths:
  - "src/**/*.test.ts"
  - "src/**/*.test.tsx"
  - "src/features/**/*Utils.ts"
  - "src/features/**/*utils.ts"
  - "src/shared/utils/**"
---

# Tests — money is tested hard

- **Every money figure is reconciled a second, independent way** — by hand in a comment, or a
  different route to the same number (sum of rows vs the tile, before/after balance vs the
  record written). A second happy path through the same function is not a check.
- Test the edges that have bitten before: month and year boundaries, transfers (two halves —
  never counted as income or spending), goal deposits (gross) and withdrawals (income),
  refunds, debts with no money moved, a loss as well as a profit, rounding to the cent.
- Ask the owner before changing how money is stored or counted (`docs/DECISIONS.md`).
- Mutation checks (breaking code to prove a test catches it) run in a throwaway copy — a
  `git worktree` or a scratch copy — never in the working tree: the owner commits mid-session.
- Tests sit next to the file they test. Fake time with `vi.useFakeTimers({ toFake: ["Date"] })`
  + `vi.setSystemTime`. Run `npx vitest run --dir src` (`--testTimeout=30000` when busy).
- A failing check is fixed at its cause, never by weakening the check.
