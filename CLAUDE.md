# CLAUDE.md — working on MyFiWallet

Read this first. `README.md` says what the app is and how to set it up; `PERF_AUDIT.md`
(once written) holds the read/write and performance history. This file is the rules and
the traps.

## The situation

- A personal-finance PWA in daily use by real people: https://myfiwallet.netlify.app.
  React 19 + TypeScript + Vite, Bootstrap 5.3 / Reactstrap, TanStack Query, Firebase
  (Auth + Firestore), i18n in Greek and English.
- The owner (Ilias) talks in Greek/Greeklish → answer in Greek. He judges outcomes, not
  code: explain results and trade-offs in plain words.
- **Everything stays on free plans.** Firebase Spark: 50K reads and 20K writes per day for
  the whole project, no Cloud Functions. Every feature must cost few reads and writes.

## Hard rules

- **Do not commit or push** — the owner does that. Leave changes in the working tree.
- **Never change production data** without his explicit OK for that change. Reading it to
  check something is fine.
- **Money logic is tested hard**: every figure reconciled a second, independent way in the
  tests — not a second happy path. Ask before changing how money is stored or counted.
- Verify before claiming, and say plainly what failed or was skipped:
  - `npx tsc -b` (plain `tsc --noEmit` checks zero files here and always "passes")
  - `npx eslint <changed paths>`
  - `npx vitest run --dir src` (add `--testTimeout=30000` when the machine is busy)
  - the browser for anything visible: the public demo on `npm run dev:emu`,
    http://[::1]:5174 (dev-emu in `.claude/launch.json`)
- UI changes the owner will look at: show 2–3 mockups first and let him pick.

## Firestore

- Collections are flat, one per kind, every document carries `userId`: transactions,
  bills, billPayments, debts, debtPayments, investmentGoals, investmentContributions,
  categories, users. Per-user settings and the planner live on the `users/{uid}` document.
- **Rules live in the Firebase console**, not in the repo. A NEW collection is dead until
  the owner adds rules for it — say so while building it.
- Production rules refuse deleting or updating a document that does not exist, and that
  fails the WHOLE batch. In a batch, only name documents known to exist. The local emulator
  runs without rules and hides this.
- Lists are cached on the device and synced by delta (`updatedAt`); a deletion is recorded
  with `noteDeleted`. Keep new lists on the same path. Plan: date-windowed reads and stored
  monthly totals as data grows.
- Account deletion must remove every collection the app writes (one shared list).

### The live security rules (as of 2026-11-09)

Kept in the Firebase console by the owner, not in this repo. What they allow:

- `users/{uid}`: read and write only by that user.
- `categories`: read the shared defaults (`isDefault == true`) or your own; create/update
  only your own with `isDefault == false`; delete your own.
- Every other collection (transactions, investmentGoals, investmentContributions, bills,
  billPayments, debts, debtPayments, budgets): read/delete if the stored doc is yours,
  create if the new doc is yours, update if both are (the owner can't change).
- Every write passes `validDoc`: ≤ 80 fields; `amount` a number with |amount| ≤ 1e9;
  description/notes/name/label/person strings ≤ 1000 chars; goal `parts` a list ≤ 50.
  Transactions also need `type` in income / expense / investment (transfers are an income
  and an expense half).
- Anything not listed is denied, so a new collection needs a new `match` block. When
  building one, hand the owner the exact block to paste, in the same style.

## How the app is built — reuse these, don't reinvent

- **Add / record / edit forms are wizards**: numbered steps (`WizardSteps`), a final review
  step that shows every figure, Save only on review, delete far left, `{...FORM_MODAL}`
  (no close on backdrop). A yes/no question inside a step is two choice tiles (see
  `MoneyMovedPicker`); picking «Ναι» reveals what it needs in the same step.
- **No prefilled text in forms**: fields start empty with a placeholder only; an edit shows the
  stored values; a fallback name, if one is needed, is applied at save and shown in the review.
  Controls inside a form rest on the inputs' white `--surface`, never a beige page tone.
- **Every change that reaches Firestore is confirmed**: a delete dialog (`DeleteButton`),
  a before → after summary for edits, the wizard's review for new records. Bulk or
  cascading deletes say what else goes with them and how many.
- **Viewing a record** opens a read-only view first; editing is a step from there.
- **In-page views** use `ViewSwitch`; page tabs use the underline tabs (Goals/Investments);
  section titles `.stat-head`; legends sit behind an ⓘ (`InfoLegend`); row actions in
  `RowMenu`; lists of names in `ManageList`; long lists render in pages (`useLoadMore`).
- **The floating «+»** opens the page's own add (`usePageAdd`) or a new transaction.
- **Saves**: optimistic, through `saveWithoutWaiting` and the hooks' cache patches; a lost
  write shows a toast. Offline, deletes and settings are locked (`useOfflineGuard`).
- **Every successful submit answers** through ONE helper, `shared/feedback/saveFeedback.ts`
  (reference: `AddTransactionModal`). In the form, after the save resolved:
  `celebrateSave({ collection: "debts", id, milestone })` — the dialog pulses, the list's
  row lights up, and `milestone: true` (a goal reached, a debt paid off — nothing else)
  adds light confetti. On the list page: `const flashClass = useSavedFlash("debts",
  rows.map((r) => r.id))` and `className={flashClass(row.id)}` on each row; with no `id`
  (an optimistic new record) the row that appears is the one lit. Reduced motion keeps
  colour and fades only. Toasts stay as they are (lib/toastDefaults.ts: success 2.8 s,
  errors/warnings 6 s, tap or swipe to close; phones at the top).
- **Per-user settings** live on the user document (`useWorkspaceSetting`), costing no
  extra reads.
- **Money meanings**: tone colours through `toneChip` (a chip: its own visible ground
  `--{tone}-chip` + a 1px tone edge) and the tone scale in index.css;
  figures through the shared currency formatter; signs: − out / + in where meaningful.
- **Names** (payees, categories, goals …) are trimmed and compared ignoring case, accents
  and extra spaces; a near-duplicate (or the same word in Greeklish) is offered, not
  silently created.
- Money that moves between records (a transfer, a goal paid by a friend, a debt and its
  cash) is written in one batch, and the linked records are edited and deleted together.

## The public demo

Unknown devices see an invented account (src/demo/: an in-memory Firestore facade and
fixtures in `fixtures.ts`). It must make zero Firebase calls. Every new feature or field
needs sensible demo data, and `fixtures.test.ts` keeps the figures consistent.

## UI rules

- Bootstrap classes and variables first → a CSS module only for what Bootstrap can't do →
  plain CSS last.
- **Bootstrap sits in a cascade layer** (`@layer bootstrap`, top of index.css): any app rule,
  even one class, beats it whatever order the build links the files in — never double a
  class to win. theme.css's one-class rules on Bootstrap pieces sit in `@layer theme`
  (over Bootstrap, under modules). An app `!important` must go inside
  `@layer app-important { … }` or Bootstrap's own `!important` utilities beat it
  (`cssLayers.test.ts` checks all of it).
- **Colours come only from `src/styles/tokens.css`** (two colourways: blue, the default,
  and black & gold; each light and dark). Components use roles (`--surface`, `--text`,
  `--brand`, `--income`, `--expense-text` …), never hex. `src/styles/shape.css` holds radius,
  spacing, shadows and motion; `theme.css` wires Bootstrap to them.
- Never pure white or pure black. Decorative gradients run DARK at the top-left → LIGHT at
  the bottom-right.
- Text pairs ≥ 8:1 (`contrast.test.ts`). The owner's exact red #C4302B and green #12855A
  in light mode are named AA exceptions there. One red and one green, everywhere.
- Money figures never wrap; long words in labels do (central rule in theme.css).
- Reduced motion drops movement, not fades. Animations must play on phone, tablet,
  desktop and in the installed PWA.
- Add/record forms are wizards: numbered steps, a review step, Save only on review, delete
  far left, `{...FORM_MODAL}` (no close on backdrop). Choices inside steps are YES/NO tiles,
  not switches.
- Every write to Firestore gets a confirmation fitting it (delete dialog, before → after
  summary, or the wizard's review).
- Every string in Greek AND English; check both at 320–1366px.
- Names users type are trimmed and compared ignoring case, accents and extra spaces.

## Working with agents

- Several agents may share the working tree: give each disjoint files, and have them add
  locale keys without reordering the JSON files.
- Re-check any work done by a weaker model before building on it.
