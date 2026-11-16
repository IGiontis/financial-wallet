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
- **Deleting a goal someone paid for — two answers per person** (2026-11-12, he decided):
  «Του τα χρωστάω ακόμα» (debt + expense stay) · «Δεν του χρωστάω τίποτα — σβήσ' τα»
  (refunded OR entered by mistake: debt, expense, deposit and the debt's cash records are
  deleted — he does NOT want a closed «ακυρώθηκε» debt left in Debts). Nothing pre-picked.
  The goal's loans are found by their stored links, so a goal deleted right after it was
  created can't leave a loan behind; goals with 2+ loans are tested per combination.
  Asked per LOAN (the same person twice = two questions, with the day). A loan already partly
  repaid can't be erased from the goal delete (it would change a card for money that really
  left it): the dialog says so — delete the repayments in Debts first (confirmed by him
  2026-11-13).
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
- **A business record is found like any other** (2026-11-13, his «SOS»: he could not find one in
  Συναλλαγές). The category filters (list and «Βιβλίο κινήσεων») offer «🏪 Δουλειά» — and the other
  categories with no document, «Μεταφορά», «Δάνεια», «Τόκοι δανείου» — once some record carries
  them; the search also matches the category's name in Greek and English, the business's current
  name and «Κέρδος»/«Ζημιά», accents aside. Never offered when writing a NEW record: only the
  business page writes them. *Don't:* add «Δουλειά» to the category pickers of the forms.
- **The business overview opens up** (2026-11-13, his description): the «Μέρες» tile lists the
  month's closing days (date, business in «Όλες», profit or loss, a loss marked in words); each
  «Πού πήγαν τα έξοδα» line lists the closings it came from, adding up to the bar. Read-only
  sheets; each row opens the closing's view.

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
- **Forms and actions (2026-11-12, MUST):** the card/cash/account is chosen BEFORE the amount,
  everywhere; a yes/no choice starts on «Ναι» (never pre-pick something that takes money from
  a card); every new/edit/delete shows a toast; an action waits for its answer — buttons
  locked while it runs (he could press «delete goal» twice and saw an error for an action that
  had gone through), honest success/failure.
- **The screen never hangs (2026-11-13, SOS):** a save hung 15 s on his iPhone with no toast though it had gone through. New/edit never wait for the server (instant close + toast, failure reported later); online-only actions wait 7 s at most, then let go with «Συνεχίζει — θα σου πούμε», the record shown as pending (its clickable items disabled, Overview too), the real result as a toast.
- **No change, no Save (2026-11-13, MUST, «SOS»):** edit forms let him save without changing anything — every edit form's Save stays disabled until something really changed; new-record forms until the required answers are there.
- **Business: «Οι δουλειές μου» is its own sub-page** in the menu (like Πάγια's pages), the
  other tabs on the main page; a business keeps at least one income line (it can be 0 €), the
  first line can't be removed (2026-11-12). Built: «Δουλειά» opens into «Σύνοψη» (`/business`,
  tabs Επισκόπηση · Μέρες · Ημερολόγιο) and «Οι δουλειές μου» (`/business/manage`). Unlike
  Πάγια, no link tabs at the top of either page: the main page already has its own tab row,
  and a page never shows two — the menu is the way between them.
- **Signing out lands on the public demo** (2026-11-12): «Αποσύνδεση» clears the account's keys
  from the device, makes it unknown again and loads the demo, as a visitor sees it; the next
  sign-in makes it known again. A session that ends by itself still opens on the sign-in form,
  and account deletion still ends on the sign-in form (a full wallet of made-up money right
  after deleting yours would read as "it didn't work"). *Don't:* send sign-out back to /login.
- **Forms are wizards** with a review step; Save only on review; delete far left; no close on
  backdrop. Yes/no inside a step = two choice tiles, not a switch.
- **In-page views use `ViewSwitch`**; full-width segmented tabs only at page level. Card titles
  `.stat-head`. **Never truncate** a name or a deadline. No tabs inside sheets (the debt sheet is
  a "receipt").
- **The Overview is view-only**: no buttons or modals there; rows link to their page.
- **Sub-pages are child routes in the sidebar**, not inner tabs (e.g. Transactions →
  «Ημερολόγιο συναλλαγών», 2026-11-12).
- **320px: page tabs scroll sideways** rather than wrap (2026-11-12, "leave it").

## Demo backlog (one demo pass, ALWAYS the last task after all others — owner, 2026-11-14)

Real-user changes first; the public demo is updated in ONE batch later, to save tokens. Each
change that the demo doesn't show yet adds a line here:

- Guided tour: cover the new pages (Δουλειά, Δικαιούχοι & κατηγορίες, transactions calendar,
  Τράπεζες), 1–2 steps per page.
