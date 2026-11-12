# Decisions — what was chosen, and why

The owner's (Ilias's) product decisions and the reasons behind them, so nobody "fixes"
one by accident. Each entry: **Decided** · **Why** · **Don't**. Newest last within a section.

**Keep it updated:** when the owner decides something about how the app counts money, what
it shows or how it is built, add or change the entry in the same change, dated. If code and
this file disagree, ask him — one of them is a bug.

## Running the project

- **Free plans only** (2026-10-28, standing). Firebase Spark: 50K reads / 20K writes a day
  for the whole project, no Cloud Functions. Every feature says what it costs in reads and
  writes; reuse loaded queries; per-user settings on the user doc (`useWorkspaceSetting`);
  never poll. *Why:* real users on a free tier; 3 users once burned 12–15K reads/day.
  *Don't:* add a collection, a listener or a periodic read without counting it.
- **Security rules live in the Firebase console**, not in the repo (2026-07). A new
  collection is dead until he pastes its `match` block. *Don't:* add a `firestore.rules` file.
- **He commits and pushes; agents never do.** He commits mid-session, so mutation tests run
  in a throwaway copy, never in the working tree (a live mutant was committed once, 2026-09-28).
- **Visual changes: show 2–3 rendered options first** and let him pick (rejected finished work
  twice when built from prose; rejected a bottom-bar nav built on "I trust you"). "I trust you"
  covers logic and fixes, not looks. Exceptions only when he describes the change exactly.
- **Improve the look he already has** rather than replacing its structure.

## Money model

- **Withdrawals count as income; deposits are counted gross** (2026-08-03). A deposit to a goal
  or investment leaves the spendable pool, a withdrawal comes back — `overviewUtils.ts`.
  *Don't:* net deposits *and* count withdrawals as income (double count).
- **Banks & cash = model A, check-ins** (2026-09-28). Readings compare only the **total** of
  banks + cash with what the records predict; the gap shows as «χωρίς εγγραφή», live. Each
  reading is a balance anchor. Stored on the user doc (`money-accounts`, `balance-check-ins`).
  *Why:* he forgets to log things; a per-account ledger breaks more the more must be logged.
  *Don't:* rebuild as a ledger; if per-account tracking is wanted, grow into "optional account
  on transactions".
- **Goal money stays in the banks; investment money leaves them.** Goal money can be handed to
  a person (`heldBy`): it leaves the card, is not spending. Never pre-select a card where money
  leaves one.
- **The «ήρθε ήδη;» bank question is for the salary only** (2026-10-16). Every other income and
  planner one-off counts on its own day.
- **Forecasts come from his figures, never trailing averages.** He types what he expects; every
  row has an on/off switch. Facts the app holds (bills, goals, incomes) may be read
  automatically. *Why:* irregular spending; an average can't tell "stopped" from "not today".
- **Allocation merged into the Planner** (2026-10-19, option B). A Planner line with categories
  is a **limit**: rest of the month = max(limit − spent, 0). `/allocation` → `/planner`.
  *Don't:* bring back a separate budgeting screen.
- **Planner counts money owed back** on its due date (owed_to_me debts); undated ones are listed,
  counted nowhere; late ones held on today.
- **Goal paid by a friend** (2026-10-19): the expense is recorded when the friend pays, with no
  card moving; a debt to the friend (no money moved); the goal reads complete with a debt mark.
  Repaying is a debt payment (card moves, expense not doubled). Strings «Χρέος · Νίκος»
  (Greek names don't decline).
- **Goal parts with ranges** (2026-10-27): target = Σ «έως»; a deposit fills each «από» in
  order, then up to each «έως»; 👁 on the card. Single-amount goals are not migrated.
- **Bills with custom intervals** (2026-08-03): `frequency` × `intervalCount` from `anchorDate`;
  period keys unchanged for interval 1.
- **Subscriptions: PAUSED.** Don't build on them until he restarts it.
- **Business («Δουλειά»)** (2026-11-12): off by default, turned on in Settings. A day's closing =
  turnover − expense lines = profit; the profit goes **automatically** into personal money as a
  linked income; a loss writes a personal **expense**. Several businesses per user, each with
  its own income and expense lines, **all created by the user from zero — no presets, no
  templates, no auto-created categories** (no «Κέρδος δουλειάς» in his categories). The closing
  form asks which business first, then shows its lines. Closings in their own collection
  (`businessEntries`); business definitions on the user doc.
  Mockups 2026-11-12, he picked **A**: one business picker under the page title («Όλες οι
  δουλειές ▾», totals of all), then the usual tabs Επισκόπηση · Μέρες · Ημερολόγιο · «Οι
  δουλειές μου». The personal record of a day carries **no category of his**: it reads
  «Κέρδος · Φαρμακείο» / «Ζημιά · Λαϊκή» with a shop icon and counts as «Δουλειά» in the
  analytics (option A; the alternative — each business pointing at one of his own categories —
  was not chosen).

## How it looks

- **Two colourways only**: blue (default) and black & gold; each light and dark. Normal, not
  desaturated colours. Never pure white or black (warm off-white; dark grey, not near-black).
- **Gradients run dark top-left → light bottom-right.**
- **One red #C4302B and one green #12855A in light mode**, everywhere; named AA exceptions to
  the 8:1 rule in `contrast.test.ts`.
- **Type scale B** (`--fs-*`, 2026-11-11); px only for the named exceptions in `typeScale.test.ts`.
- **One tab look on every page: boxes** (2026-11-12, mockup Γ over underline and
  underline-with-icons): `PageTabs`, the Overview's boxed segmented look, no icons, for page
  tabs and section sub-pages alike (Overview, Settings, Goals, Investments, Bills, Incomes,
  Names, Business). Never two rows: they scroll sideways when tight. *Don't:* bring back
  underline tabs or a second tab style.
- **Choices inside forms use the shared segmented control** (2026-11-12), the chosen one in
  the brand colour — never a hand-made grey Bootstrap button group.
- **Every page looks like the others** (2026-11-12, MUST): `AddHeader` with the square «+» left;
  page tabs straight under the header; reuse tiles/rows; saves and «Ήρθε»/«Πληρώθηκε» in the
  brand colour, never green; required fields marked (*); never a "didn't load / retry" message —
  retries are silent; empty state = invitation. See CLAUDE.md and `docs/COMPONENTS.md`.
- **Forms are wizards** with a review step; Save only on review; delete far left; no close on
  backdrop. Yes/no inside a step = two choice tiles, not a switch.
- **In-page views use `ViewSwitch`**; full-width segmented tabs only at page level. Card titles
  `.stat-head`. **Never truncate** a name or a deadline. No tabs inside sheets (the debt sheet is
  a "receipt").
- **The Overview is view-only**: no buttons or modals there; rows link to their page.
- **Sub-pages are child routes in the sidebar**, not inner tabs (e.g. Transactions →
  «Ημερολόγιο συναλλαγών», 2026-11-12).
- **320px: page tabs scroll sideways** rather than wrap (2026-11-12, "leave it").
