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

- **A bank card's lettering is always light, and the card is never a flat colour under it**
  (2026-11-24, mockup Γ over «light ink only» (Α) and «darker finishes» (Β)): the card's ink is
  its own token, NOT `--on-brand`, which flips dark in the dark mode and dropped the name and
  the amount to 1,1:1 on the black finish. The finishes keep the colours he chose; a soft dark
  veil runs behind the top and bottom rows where the words sit, and a hairline edge keeps the
  black card from disappearing into the dark page. *Don't:* letter a card in `--on-brand`, or
  mute a finish to win contrast.
- **A wizard's steps are a straight rail with the word under every dot** (2026-11-24, his own
  shape over a vertical list (Α) and two columns (Β)): on a phone the words used to vanish for
  one «Βήμα 2/5 · Κατηγορία» line, so the reader could not see what was coming. The words now
  show at every width, small under each dot; where one does not fit it wraps, and only when
  even that fails is it cut with «…» (he accepted the «…»; wrapping is tried first because of
  «never truncate»).
- **A dialog's tone follows the answer, and a step back unanswers it** (2026-11-24): the band
  takes its colour the moment the kind tile is tapped — not a step later — and a step BACK to
  that question clears the mark, the colour and the way forward («διάλεξα αλλά γύρισα πίσω, άρα
  είμαι null ξανά»). The value is kept, so re-tapping the same answer throws nothing away.
  *Don't:* leave a dialog coloured for a question the reader is looking at unanswered.
- **No dialog takes the whole phone screen, and a picker grows with the screen** (2026-11-24):
  `AccountModal` was the only `fullscreen` dialog in the app; the category grid was pinned at
  216px, two rows on a phone. It now takes 46vh on a phone and 38vh from 576px up — lower on a
  laptop ON PURPOSE, because the same dialog in a shorter window would otherwise gain a second
  scrollbar beside the grid's.
- **«Πού πήγε ο μήνας» is bars in a row** (2026-11-24, Α over a doughnut): category, bar,
  amount — the same reading on a phone and on a desktop.
- **Goals carry their year as a chip, with a year filter above the list** (2026-11-24, Α over
  sections per year): one list stays one list; the Planner groups by year on its own.
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
- **WHERE before HOW MUCH, built everywhere (2026-11-16).** Every form with both a card/cash/account
  and an amount asks the card first, and its review lists the card before the amount: transactions
  (new/edit/page: type → category → card → details; review card on top), transfers (from → to →
  amount), goal/investment deposits and withdrawals (use → card/who → amount → when), «Πληρώθηκε»
  and settling overdue (card → amount → when), «Ήρθε» (account above the amount), repayments and their
  corrections (did money move / card → amount → when), new/edit debt (who → money: did it move, which
  card, how much → interest → dates), gap records (a move's other account above the amount), business
  closing (day → «Πού» → incomes → expenses; before the amounts the card is asked for the profit — or
  the loss — and is required while there is one to pick), incomes (the account on the amount step,
  above the amount; the last step is now «Ως πότε»). Bills and planner lines carry no account.
  Validation, «no change, no Save» and run-once are unchanged; only the order of the checks follows
  the steps. A deposit's «not enough free money on this card» is now said on the amount step.
- **Yes/no starts on «Ναι» — the inventory (2026-11-16, his rule of 2026-11-12).** A new record's
  yes/no starts on «Ναι»; an edit shows what is stored. Unpicked only where «Ναι» takes money from a
  card, erases records, or would take something from another record.
  *Start on «Ναι»:* bill «Ενεργός;», «Αλλάζει το ποσό;», «Πληρώνεται αργότερα;» (shows the days),
  «Σταματά για λίγο;» (shows the months); goal/investment «Ενεργός;»; debt «Με τόκο;» (shows the
  loan's figures; no term = saved as a plain debt, as before); income «Αλλάζει το ποσό;», «Κάνει
  διάλειμμα;», «Είναι ο μισθός;» (only when no other income is the salary); planner «Κάθε χρόνο;»
  on «Μόνο κάποιους μήνες» (set on the draft, so it is what is saved).
  *Left unpicked:* «Πέρασαν λεφτά από κάρτα;» (`MoneyMovedPicker`: new debt, repayment, repayment
  correction — «Ναι» moves money through a card); goal delete «Του τα χρωστάω / σβήσ' τα» (erases
  records) and «what became of the money» (spent writes an expense from a card); «Είναι ο κύριος
  λογαριασμός;» on a new card (Ναι moves every record without a card onto it — money between cards);
  «Είναι ο μισθός;» while another income is the salary (Ναι takes the role from it); planner
  «Έρχονται ή φεύγουν;» (a kind, not a yes/no answer); goal deposit/withdrawal «use» (moves money).
  Not yes/no pairs, unchanged: debt direction, income «Λήγει;» (Ποτέ / Σε ημερομηνία, starts Ποτέ),
  the business picker. *Note:* a «Ναι» that reveals a required field (grace days, pause months) means
  a new record must fill it or answer «Όχι».
- **A goal's / investment's icon is one emoji (2026-11-16)**, as a category's: typed text is cut to
  its first character and refused as it is typed. Goals saved earlier with text for an icon are not
  migrated: they open and save as they are; only a CHANGED icon must be one emoji (touched, the field
  asks for an emoji in its place).
- **The screen never hangs (2026-11-13, SOS):** a save hung 15 s on his iPhone with no toast though it had gone through. New/edit never wait for the server (instant close + toast, failure reported later); online-only actions wait 7 s at most, then let go with «Συνεχίζει — θα σου πούμε», the record shown as pending (its clickable items disabled, Overview too), the real result as a toast.
- **What HAPPENED is dated today or earlier (2026-11-14, MUST; his report: a goal deposit could
  be dated in the future).** Happened = transactions (new/edit/quick add), transfers, goal and
  investment deposits/withdrawals, «πλήρωσε για μένα», the day a debt began, repayments,
  forgiveness, bill payments («Πληρώθηκε», settling overdue, corrections), «Ήρθε» and its
  corrections, bank readings and gap records, business closings, a goal's close/spent day.
  PLANNED may be future: bill due/start/anchor, income schedules, goal deadline/planFrom, debt
  due date, planner lines/one-offs/occurrences, pauses/«from month». Three layers: the calendar
  greys future days (`DateField happened`, from `useToday`), the form refuses one
  («Δεν γίνεται μελλοντική ημερομηνία — αυτό έχει ήδη γίνει»), the money writers refuse a day
  after tomorrow (`refuseFutureDates`, a day of slack for time zones). Records already stored
  with a future day are NOT changed; they open and save as they are — the check speaks only
  when the day is changed, and an unchanged day is not re-sent. Decided the safer way where
  unclear: the day a debt began is "happened" even when no money moved.
  *Don't:* relax it for a "happened" form, or add `happened` to a planned date.
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
- **Payees & categories layout** (2026-11-16, mockups): **Categories = option Β** — three columns by type (Έξοδα · Έσοδα · Και τα δύο), the column IS the type (no badge), name + count per row, ⋮ for actions; on phones the columns become filter chips (one list at a time) — must fit at 320. **Payees = option Α** — compact cards in a grid (4 per row desktop, 2 on phones) with filter chips «Όλοι · Στις προτάσεις · Διπλοί». «Πιθανά διπλά» stays on top. Same compact approach for business «Μέρες» on wide screens. *Built 2026-11-17:* «Μέρες» from `md` = the payees' card grid (3 per row tablet, 4 desktop; a phone keeps the one list) — chosen over a centred narrow list so the page reads like the payees beside it and a month of days fits one screen.
- **Debts & loans redesign = option Β «Ζυγαριά»** (2026-11-16, mockups; logic unchanged): AddHeader, PageTabs «Επισκόπηση · Σχέδιο αποπληρωμής · Αρχείο N»; a balance bar (owed by me red vs owed to me green, net figure); the two sides side by side on desktop, stacked on phones; each person/loan a compact row with initials, a mini «how much is repaid» bar and the amount left; the «which loan first» card moves to the «Σχέδιο αποπληρωμής» tab. **Archive**: settled debts move there automatically — hidden, NOT deleted; full detail only when opened (supersedes most of #90). Person/loan sheet: **Προβολή** (amount, progress, history) + «+ Επιστροφή»; everything else under **«Ενέργειες»** opened as a STEP inside the same dialog (no modal on modal).
- **Bills list = direction 2 «Ταινία ημερομηνιών»** (2026-11-16, three interactive mockups): each bill led by its DAY (a small pocket-calendar block, red when late), grouped by month, name + amount; a shared density switch «Απλό · Κανονικό · Πλήρες» (remembered per device): Απλό = day, name, amount; Κανονικό = + tags (late, cadence, range) and last payment; Πλήρες = + facts (last · each time · next) and the 6-month strip. Calm, airy, not stacked. Desktop: two months side by side. He confirmed: «στα πάγια διάλεξα το χρονολόγιο» — the date-led timeline IS the bills list. Planned with it unless he objects: views 7 → 4 (Λίστα/Χρονολόγιο with density · Ο μήνας · Η χρονιά), one line per payment on phones, bill sheet Προβολή + Ενέργειες as a step.
  *Built 2026-11-17:* the list strip with density (the shared `DensitySwitch`, so its third word is «Αναλυτικό», not «Πλήρες» — one word on every page); views 7 → 3 (he dropped «Χρονολόγιο» the same day): «Λίστα · Ο μήνας · Η χρονιά» («Η χρονιά» = the twelve months ahead + what each bill costs a year, so neither old view is lost); a remembered old view opens the one that took it in, the timeline/tree the list. Views left and density right on one row from 992px, both fixed: off «Λίστα» the density keeps its room, hidden — he disliked the controls moving. The bill sheet: «Προβολή» with «Πληρώθηκε» (primary) and «Ενέργειες» as a step in the same dialog (edit, pause, «τα έχω πληρώσει», undo the payment, delete far left). The figures are the ones the old list showed (the month grouping is gone — see the next entry).
- **2026-11-17: bills are one card per BILL; all unpaid dates listed inside** (owner — he had two unpaid periods of the water bill, every 2 months, and saw one row led by one day with the total; nothing said there were two). Month cards turned inside out: a card per bill, its head = icon · name · figure, the same at every density; inside, one line per date led by the same pocket-calendar day block (red past its deadline) and what it is — «Απλήρωτος · 38,60 €» (one line per unpaid period), «Πληρώθηκε · …», «Επόμενος · ~…», «Ξεκινά», «Σταμάτησε», «Συνεχίζει», «Τελευταία πληρωμή»; at each line's right a status icon with its label (✓ green paid · «!» amber due and still in time · ⚠ red late — the chips' tones, never colour alone). Paid cards on a very soft green ground with a thin green edge (`--paid-wash`/`--paid-edge`, stronger in light mode). Section titles in the app's section-title size (`--stat-label-size`). Cards sit in the sections with their totals, earliest date first, two side by side where each gets 22rem. Density adds only to a band at the card's FOOT, under the dated lines: Απλό = head + dated lines; Κανονικό = + chips/cadence/range/last paid; Αναλυτικό = + the three figures and the 6-month strip. Hover/focus = a calm brand wash + brand edge, visibly unlike the card in both themes — he liked it, and it became the app's ONE hover for every clickable card/row (`.hover-card` / `.hover-row`, `--hover-wash` / `--hover-edge`; COMPONENTS «Colours, type, spacing»). **Rule:** a late card's lines add up to its figure (what it owes now); a section's total stays current periods only, so it can be less than its cards added up when a bill is behind. *Don't:* group by month again, or show a late bill by one date.
- **At most ONE row of tabs/selectors-of-pages per page; section sub-pages only via the sidebar** (2026-11-17, owner): Bills' «Σύνοψη · Πληρωμές · Διαχείριση · Όλα» and Incomes' «Σύνοψη · Εισπράξεις · Διαχείριση · Όλα» link tabs removed — tabs over tabs over selectors left the inner views (view switch, density) no room. The sub-pages are the sidebar's children, as «Δουλειά» already did; the counts («Πληρωμές», «Εισπράξεις») stay on the sidebar. *Don't:* put a row of link tabs back over a page that has its own views.
- **A debt person/loan opens as its OWN PAGE** (2026-11-17, he agreed — he got lost in the dialog): «Χρέη › Δέσποινα» with «‹ Πίσω», tabs «Ενεργά · Εξοφλημένα», density «Απλό · Κανονικό · Αναλυτικό» (shared DensitySwitch, reused by Bills), «+ Επιστροφή» and «Ενέργειες». Prefer a page over a big dialog when a record has its own history and actions.
- **Opaque ids in addresses** (2026-11-17, he asked for «globalID» style): every URL that points at a record uses its random Firestore id or a hash, never a name — privacy, not access control (access is the security rules). No extra library: Firestore ids are already random; hashes via the browser's crypto.
- **Archive delete keeps transactions — no choice (owner 2026-11-17).** Deleting closed debts
  from «Αρχείο» (several via «Επιλογή», or one from its page's «Ενέργειες») deletes the debts and
  their repayment records only; their money stays in Συναλλαγές as it was — no card balance, no
  total, no history changes. The kept records are marked `debtKept`: no longer locked to a debt
  (ordinary, editable), never rewritten or removed by the debt sync/heal, still counted as a
  debt's money. A friend-paid goal: deposit and expense stay, the deposit unlinked from the debt.
  An OPEN debt deleted from «Ενέργειες» still goes with its money (typed by mistake), as before.
  The person key in `/debts/person/:key` is a small synchronous hash (cyrb53 of the name's compare
  key, 10 base-36 characters) so rows stay plain links — no library, no async crypto.
- **Deleting an OPEN debt erases its money records too** (2026-11-17, he confirmed) — but the confirmation must warn first, prominently: a red warning-triangle icon + a clear text («Σβήνονται και οι κινήσεις του στις Συναλλαγές· αλλάζουν τα υπόλοιπα των καρτών σου») with the amounts per card. Closed debts (archive) always keep their records.
- **Bills list, refined (2026-11-17):** keep the date-strip look he liked, but ONE CARD PER BILL: header = bill name + total; inside, one row per date/period led by the day block, with a short status text instead of the name («Απλήρωτος · 38,60 €», «Πληρώθηκε · 81,70 €», «Επόμενος …»). A bill with 2 unpaid periods shows both rows. Density word: «Αναλυτικό» (shared with Debts).
- **Default categories: per-user overrides, shared defaults untouched** (2026-11-19, proposed + agreed): each user may rename, re-icon or hide a built-in category; stored on his user doc (0 reads); hiding one with records asks where to move them. The shared default docs are NOT edited (he dropped the «Ψώνια» icon change — users change icons themselves).
- **Page header = option Α, a card** (2026-11-19, mockups): one shared PageHeader on every page — a soft card (cards' surface + edge) holding «+» left, title, subtitle, right-side actions, and the page's tabs/selectors INSIDE the same card.
- **An option not chosen sits on the cards' white** (2026-11-19, rule 11): every tab, segment, view and
  density option that is NOT selected takes `--surface` — the cards' near-white in daylight, the dark grey in
  the dark — never the page ground; the chosen one keeps the brand. One pair of tokens does it
  (`--segment-item` in theme.css), so PageTabs, the segmented control, ViewSwitch and DensitySwitch change
  together, on a page and inside a dialog alike. *Why:* a beige chip among white cards read as a different
  kind of thing — the same complaint he made about the unselected yes/no tile. *Don't:* give one control a
  resting ground of its own.
- **A money dialog's tone is on its HEADER, never its body** (2026-11-19, rule 15a; his complaint was the
  debts dialogs): money going out or owed by me wears a red header band, money coming in or owed to me a
  green one, and the BODY keeps the ordinary dialog surface — a red ground swallowed the red and green
  FIGURES written on it, which is the one thing those dialogs exist to show. The band is as strong as the
  body ink allows at 8:1 (`--dialog-tone-wash`, 14% / 18%); nothing on it is lettered in the tone, and a
  dialog header carries no secondary text (no band reaches 8:1 with it). Handed out by `moneyToneHead`.
  *Don't:* bring back a wash over a dialog's body (`.wash-expense` / `.wash-income`).
- **Delete is kept apart in every footer** (2026-11-19, corrected 2026-11-23): the footer has three slots —
  the bin far LEFT, a thin vertical rule with air on either side, then Back / Cancel; the RIGHT holds only
  the forward actions (Next / Save / Confirm). The rule belongs to the left group and sits BETWEEN its two
  buttons, never floating in the empty space between the slots, and it is drawn only when there are two
  buttons to keep apart. *Why:* the bin was pressed instead of «Πίσω», which stood flush against it.
  One shared piece does it (`DialogFooter`), not a `justify-content-between` per dialog. *Don't:* move
  Back/Cancel over to the Save side — that was a first reading of the rule and he corrected it.
- **Every figure that stands alone on a review step says what it is** (2026-11-19, rule 15c): a short quiet
  line under it (`Wizard.module.css` `.wizSub`). The review ROWS already carry their label beside the
  figure, so they satisfy it as they are; this is for a figure on its own — the big amount at the head of
  the transaction review, the sum drawn on a card.
- **Bills «Κανονικό» (2026-11-19, he confirmed the mockup):** header as now; middle = the unpaid periods (or the current one when paid) with their day blocks, as now; FOOTER = two boxes side by side, each with a day block — «Προηγούμενος» (date the last bill was paid + amount, green block) and «Επόμενος» (next due date + amount, dashed empty block). «Απλό» has no footer; «Αναλυτικό» adds the three figures and the 6-month strip below. Coloured dots: a general idea for elsewhere.
- **Goals by year** (2026-11-19): a goal's year comes from its deadline (chip «Στόχος 2028», no new field; an optional year only for goals without a deadline); Goals page gets a year filter; the PLANNER groups goals under their year (sub-groups 2026 · 2027 · 2028 …).
- **Debt form (2026-11-19):** the goal link is a yes/no «Πήγε σε στόχο;» — only «Ναι» reveals the goal picker (not the «πλήρωσε για μένα» picker shown up front); nothing pre-picked because it links money. «Με τόκο;» ALWAYS starts on «Απλό χρέος» (no interest) — this overrides the earlier «Ναι» default for it.
- **Forms are wizards** with a review step; Save only on review; delete far left; no close on
  backdrop. Yes/no inside a step = two choice tiles, not a switch.
- **In-page views use `ViewSwitch`**; full-width segmented tabs only at page level. Card titles
  `.stat-head`. **Never truncate** a name or a deadline. No tabs inside sheets (the debt sheet is
  a "receipt").
- **The Overview is view-only**: no buttons or modals there; rows link to their page.
- **The skeleton shows at most 8 seconds** (agreed 2026-11-12 at ~20 s; the owner chose 8 s on
  2026-11-16 — one constant, `SKELETON_MAX_MS` in `src/shared/hooks/usePageLoad.ts`). He saw
  pages keep their loading skeleton for ever. After the 8 s the page shows its natural state:
  the true empty state (invitation + add) when there is genuinely nothing, whatever is cached,
  or — never answered and nothing cached — the page's frame and add with a quiet neutral line
  (`PageWaiting`), never error/retry words and never an empty state that isn't true. Retries
  continue silently; the page fills in when the data arrives.
- **Sub-pages are child routes in the sidebar**, not inner tabs (e.g. Transactions →
  «Ημερολόγιο συναλλαγών», 2026-11-12).
- **320px: page tabs scroll sideways** rather than wrap (2026-11-12, "leave it").

## Demo backlog (one demo pass, ALWAYS the last task after all others — owner, 2026-11-14)

Real-user changes first; the public demo is updated in ONE batch later, to save tokens. Each
change that the demo doesn't show yet adds a line here:

- Guided tour: cover the new pages (Δουλειά, Δικαιούχοι & κατηγορίες, transactions calendar,
  Τράπεζες), 1–2 steps per page.
- «Νέο κλείσιμο» (`/business/new`, 2026-11-16): works with the demo's two businesses as they
  are; the tour does not show it yet.
- Forms reordered WHERE before HOW MUCH, yes/no on «Ναι», goal icon one emoji (2026-11-16): the
  demo runs them as they are; check the tour's form previews/steps still read in the new order.
- Debts «Ζυγαριά» + person/loan pages + archive delete (2026-11-17): the demo runs them as they are
  (same `debts` data); `useHealDebtCash`/`deleteClosedDebts` go through the facade. In the pass: a
  closed debt or two in the fixtures so «Αρχείο» is not empty, a bank loan for its own row/page,
  and tour steps for the balance bar, a person page and «Ενέργειες».
- Payees grid, categories in three columns, business «Μέρες» grid, the wizard's «Βήμα 2/5 · …» line on
  phones (2026-11-17): the demo shows them as they are (same components); the demo's categories are
  mostly expense ones, so the «Και τα δύο» column is short — consider a couple of two-way ones in the pass.
- Bills date strip (one card per bill, 2026-11-17) + density, views 7 → 3, the bill sheet's «Ενέργειες» step, no link tabs on Bills/Incomes
  (2026-11-17): the demo runs them as they are (same `bills` data). In the pass: a late bill, a variable one
  with a range and a paused one in the fixtures so every tag and the red day show; tour steps that pointed at
  the old views or the link tabs («Πληρωμές» tab) need re-pointing at the sidebar / the view switch.
- Shared page header card (`PageHeader`, 2026-11-19): the demo runs it as it is — no fixture or facade data is
  involved, every page simply draws the same card now. In the pass: the guided tour's steps that point at a
  page's title or its tabs («overview-tabs», «goal-views», the tabs of Δουλειά and Χρέη) now sit INSIDE the
  header card, so each highlight box covers the card — check each step's anchor and wording, and that the
  tour's own «+» steps still find the «+» (unmoved, still first on the left). `/transactions` gained a real
  title header and lost the «+» that sat beside its search field: a tour step pointing at that «+» must move
  to the header's.
- Sidebar sections + bills card foot (2026-11-24): «Ημερολόγιο» became a parent («Ημερολόγιο» `/calendar` ·
  «Ημερολόγιο συναλλαγών» `/calendar/transactions`) and «Δικαιούχοι & κατηγορίες» its own entry («Δικαιούχοι»
  `/names/payees` · «Κατηγορίες» `/names/categories`); the bills «Κανονικό» card gained a foot of two date
  blocks («Προηγούμενος» · «Επόμενος»). The demo runs all of it as it is — no fixture or facade data is
  involved, and the old addresses redirect. In the pass: the tour's planned steps for the names page and the
  transactions calendar (first backlog line) must point at the NEW addresses, not `/transactions/names` /
  `/transactions/calendar`; and a fixture bill with no payment history would show the foot's «—» case.
- Card ink, wizard rail, dialog heights (2026-11-24): the bank cards' lettering, the wizard steps' words on a
  phone, `AccountModal` no longer fullscreen and the taller category grid are all plain UI — the demo draws
  them with the data it already has. Nothing to add in the pass.
