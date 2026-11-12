# CLAUDE.md — working on MyFiWallet

Read this first. It holds the hard rules and points to the map. Read the map instead of
exploring the tree; open code to confirm a detail, not to discover what exists.

## The situation

- A personal-finance PWA in daily use by real people: https://myfiwallet.netlify.app.
  React 19 + TypeScript + Vite, Bootstrap 5.3 / Reactstrap, TanStack Query, Firebase
  (Auth + Firestore), i18n in Greek and English, a public demo for unknown devices.
- The owner (Ilias) talks in Greek/Greeklish → answer in Greek. He judges outcomes, not
  code: explain results and trade-offs in plain words.
- **Everything stays on free plans.** Firebase Spark: 50K reads and 20K writes per day for
  the whole project, no Cloud Functions. Every feature must cost few reads and writes.

## Hard rules

- **Do not commit or push** — the owner does that. Leave changes in the working tree.
- **Never change production data** without his explicit OK for that change. Reading it to
  check something is fine.
- **Money logic is tested hard**: every figure reconciled a second, independent way. Ask
  before changing how money is stored or counted.
- **Anything visible: show 2–3 rendered options first** and let him pick (skill `mockups`).
- **Every page looks like the others** — the MUST rules in `.claude/rules/ui.md`.
- **A new Firestore collection is dead until he pastes its rules** in the console — hand him
  the block (skill `new-collection`).
- Verify before claiming, and say plainly what failed or was skipped (skill `verify`):
  `npx tsc -b` (plain `tsc --noEmit` checks nothing here) · `npx eslint <changed paths>` ·
  `npx vitest run --dir src` · the demo for anything visible (`preview_start` "dev-emu").

## The map — read before working

| Need | Read |
|---|---|
| Where a page, route or feature lives | `docs/PROJECT_MAP.md` |
| Which piece to reuse (tabs, wizard, choices, rows, dialogs, tokens) | `docs/COMPONENTS.md` |
| How the app works (boot, routing, PWA, auth, demo, offline, theming) | `docs/ARCHITECTURE.md` |
| Collections, fields, indexes, the live security rules | `docs/DATABASE.md` |
| Reads, saves, deletes, linked money (transfers, goals, debts, business) | `docs/DATA_FLOW.md` |
| What the owner decided and why — don't "fix" these | `docs/DECISIONS.md` |
| What the app is, setup | `README.md` |

Rules that load by area: `.claude/rules/ui.md` (pages, CSS, strings),
`.claude/rules/firestore.md` (data, sync, demo), `.claude/rules/money-tests.md` (tests).

Skills: `new-feature` (the checklist for anything new), `new-collection`, `mockups`, `verify`.

Agents (Opus, high effort): `page-builder` (UI from the existing pieces), `money-tester`
(figures reconciled a second way), `data-security` (Firestore, rules, cost, privacy),
`reviewer` (read-only check of a finished change, side-by-side screenshots). Add a new agent
only when the same brief has been written three times.

## Keeping the map true — part of every change

- A change is not done until the docs it touched are updated **in the same change**: new
  route/folder → `PROJECT_MAP`; new or changed shared piece → `COMPONENTS`; new field,
  collection, index, rule or linked write → `DATABASE` / `DATA_FLOW`; anything the owner
  decides → `DECISIONS`, dated, with the why.
- `src/test/docsMap.test.ts` fails when a shared file, a collection or a route is missing from
  the map. Fix the map, never the test.
- If the map and the code disagree, the code is the truth — fix the map, and tell the owner
  if it looks like a bug.

## Working with agents

- Several agents may share the working tree: give each disjoint files, and have them add
  locale keys without reordering the JSON files.
- Brief an agent by pointing it at the map and the rules, not by retyping them.
- **Real users first, the demo after**: build and verify a feature for signed-in users, then
  its demo data. Short on budget, ship the real-user part and report the demo as pending.
- Re-check any agent's work before building on it or reporting it.
