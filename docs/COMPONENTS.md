# Components — the registry: "need X → use Y at path Z, not W"

Before building any UI, find the need here. If nothing fits, ask — then add the new piece here in the same change.
Paths are the truth; if this file and the code disagree, the code wins — fix this file.

Rules (what a page must look like, and why) are not repeated here: `.claude/rules/ui.md` (the
rules), `docs/DECISIONS.md` (the owner's reasons), `CLAUDE.md`. Data paths: `.claude/rules/firestore.md`.
Each entry: `path` — what it is — when to use it — (not / instead of).

## Page frame & header

- `src/shared/components/PageShell.tsx` — the box every routed page sits in: one width, one padding;
  `narrow` for a form or reading column. Every page, loading state included (`PageShell.test.ts` checks the router).
  Styles: `src/shared/css/PageShell.module.css`.
- `src/shared/components/PageHeader.tsx` — **THE header of every page** (owner, 2026-11-19, «option Α»):
  one soft card (the cards' `--surface` + `--border-soft` + `--radius-card` + `--shadow-sm`) holding, in one row,
  the square icon-only «+» (`addLabel` + `onAdd`, optional, `addDisabled` greys it), the `h1.h5` `title`, the
  one-line `subtitle` (optional) and an `actions` slot on the right (optional) — plus `backTo` / `backLabel`,
  the «‹ Πίσω» link a record page needs; and, as `children` INSIDE the same card, the page's ONE row of
  tabs/selectors (`PageTabs`, a `ViewSwitch`, a `DensitySwitch`, a `GoalPickMenu`). The last control's own
  bottom margin is taken back, so the card's padding is the gap. Phone-first: the «+» keeps its 44px, the
  title wraps (never truncates), the actions drop to their own line before anything is squeezed.
  Reference: `DebtsPage`, `OverviewPage`, `DebtPersonPage` (the back link). Styles:
  `src/shared/css/PageHeader.module.css`. Tests: `PageHeader.test.tsx`, `pageHeader.convention.test.ts`
  (every routed page of the signed-in app draws its header with it). Never a header of a page's own.
- `src/shared/components/AddButton.tsx` — `AddButton` (the square icon-only «+», `label` = aria/title,
  `small` in a row of small buttons). `PageHeader` draws the one in a page's header; use `AddButton`
  directly only elsewhere (an empty state, a card's own add). Never a text «+ Κάτι» button.
- `src/features/budget/components/GoalsWorkbench.tsx` — the Goals/Investments page frame (`PageHeader` with
  `addLabel`/`onAdd` and `PageTabs` inside it, overview/cards/list, `empty`). Use for another goal-like screen.
- `src/shared/hooks/usePageAdd.ts` — `usePageAdd(label, onAdd)`: tell the floating «+»
  (`src/features/layout/AddFab.tsx`) what this page adds; same words as the page's `AddButton`.
  `src/shared/components/PageAddProvider.tsx` provides it (app shell only).
- `index.css .stat-head` — a card's/section's title over its figure (hairline under). Not a hand-styled `h6`.
  Where the hairline and the stacked layout don't fit (a title beside its figure, a card many to a grid), take the
  SIZES and nothing else: `--stat-label-size` / `--stat-label-weight`, or `--stat-card-title-size` for a card in a
  grid (`GoalCard` `.bandName`, Analytics' `.cardTitle`, Overview's `Panel`). Never a small bold line
  (`.claude/rules/ui.md` 12).
- `src/shared/components/ChartZoom.tsx` — `ZoomButton` (in a chart card header) + `ZoomModal` (end of
  tree): "see it bigger" for any chart. Styles: `src/shared/css/ChartZoom.module.css`.

## Tabs & in-page views

- `src/shared/components/PageTabs.tsx` — THE page tabs, the one tab look on every page (boxes, the chosen one
  in the brand, no icons; one row that scrolls sideways with snap when tight, never wraps). Straight under the
  header. Two modes, same markup:
  - state tabs — `base`, `label`, `tabs: {id,label}[]`, `value`, `onChange`: a real tablist (arrows, Home/End,
    roving tabIndex, `data-view={id}` on each). Label the panel with `src/shared/utils/pageTabIds.ts`
    (`pageTabIds(base, tab)` → `{tab, panel}`). Keep the tab in `?tab=`. Reference: `BusinessPage`,
    `GoalsWorkbench`, `OverviewPage`; `SettingsPage` (each tab its own route, `onChange` navigates).
  - link tabs — `label`, `links: {to,label,badge?,badgeTone?,badgeLabel?}[]`: child routes as tabs (`NavLink end`),
    a count on a tab's corner. **No page uses them since 2026-11-17**: a section's sub-pages are reached from the
    sidebar only, and a page has at most ONE row of tabs/selectors-of-pages (`.claude/rules/ui.md`). Bills and
    Incomes dropped theirs; their counts stay on the sidebar.
  Optional `data-tour` for the guided tour. Styles: `src/shared/css/PageTabs.module.css` (Segmented's tokens).
- `src/shared/hooks/usePageTab.ts` — `usePageTab(tabs, first, storageKey)` → `[tab, choose]`: the open tab in
  `?tab=` (replace, not push), remembered on the device for a visit with no `?tab=`; the address wins.
  Reference: `OverviewPage`, `BusinessPage`. (`useGoalTab` is an older copy of the same idea.)
- `src/shared/components/ViewSwitch.tsx` — 2–3 ways of laying out the SAME rows («Λίστα | Ημερολόγιο»):
  `label`, `options: {id,label,icon?,short?}[]`, `value`, `onChange`, `stackOnPhone`, `block`. Not page tabs.
  Styles: `src/shared/css/ViewSwitch.module.css`.
- `src/shared/components/DensitySwitch.tsx` + `src/shared/hooks/useDensity.ts` — «Απλό · Κανονικό · Αναλυτικό»: how much each
  row of a list says (simple = figure + one line; normal = + progress, dates, last event; detailed = + full history).
  `const [density, setDensity] = useDensity(pageKey)` (remembered per device, `density:<pageKey>`, anything else stored reads
  as the default `normal`) → `<DensitySwitch value={density} onChange={setDensity} />` (a `ViewSwitch` with these three words).
  Reference: `features/debts/DebtPersonPage.tsx`, `features/bills/BillsPage.tsx` (`useDensity("bills")`, beside the
  view switch: views left, density right from 992px, stacked on a phone; off «Λίστα» it keeps its room hidden —
  `visibility: hidden` + `inert` — so nothing shifts). Not page tabs.
- `src/features/bills/BillsPage.tsx` `BillStrip` / `BillStripCard` / `BillFootDay` + `src/features/bills/billStrip.ts` —
  the bills list: one card per bill (head = name + figure, the same at every density; inside, a line per date led
  by a pocket-calendar day block, red when late — every unpaid period on its own line — and a status icon
  ✓/!/⚠ with its label at its right; paid cards on `--paid-wash`), cards two side by side where each gets 22rem,
  more with the density. «Κανονικό» ends in a foot of two `BillFootDay` boxes — «Προηγούμενος» (the last
  payment's day, the paid green) and «Επόμενος» (the next due day, dashed and empty), each the same square
  date block with its figure under the word, «—» and the word when there is no such day.
  Feature-local: for another date-led list, lift it into `shared/` first rather than copy it.
- `src/features/settings/settingsTabs.ts` — Settings' tab ids/paths (`/settings/<id>`), drawn by `PageTabs`
  in `SettingsPage`.

## Forms & wizards

- `src/shared/components/formModal.ts` — `FORM_MODAL` (`{ backdrop: "static" }`): spread on every `<Modal>`
  that takes data. Read-only views keep closing on backdrop. Also **`moneyToneHead(tone)`** (`MoneyTone` =
  `"expense" | "income"`) — the class for a money dialog's HEADER band (rule 15a): red for money going out or
  owed by me, green for money coming in or owed to me; the BODY stays the plain surface so the red and green
  figures in it stay readable. `<ModalHeader className={moneyToneHead(borrowed ? "expense" : "income")} …>`;
  nothing passed = a plain header (a transfer, a bank reading, a confirmation). Colours: `styles/theme.css`
  «A money dialog's tone goes on its HEADER». Replaced the old body wash `.wash-expense`/`.wash-income`
  (index.css) — **never tint a dialog's body**.
- `src/shared/components/DialogFooter.tsx` — **THE footer of every dialog and wizard**, three slots:
  `[🗑 remove] │ [‹ back] ……… [children]`. `remove` (the `DeleteButton`) goes first on the far LEFT, then a
  thin vertical rule with air on either side, then `back` — the way out of this step (Πίσω / Ακύρωση /
  Κλείσιμο). `children` are the FORWARD actions (Next / Save / Confirm) and they alone sit on the right;
  they render in their order, so Save comes last. The rule is drawn only when the left slot really holds
  two buttons — no `remove`, or `remove` with no `back`, and there is nothing to keep apart (rule 15b: a
  button flush against the bin gets pressed by mistake). `bare` + `className` draws the same three slots in
  a plain `<div>` for a wizard laid out as a PAGE (`TransactionWizard.module.css .pageFooter`; reference:
  `AddTransactionModal`'s `FrameFooter`, `TransferWizard`, `ClosingWizard`). The delete inside it is the bin
  alone (`iconOnly`) or `wordFromSm`, so the row still fits 320px. Styles:
  `src/shared/css/DialogFooter.module.css`. Never a `ModalFooter className="justify-content-between"` with a
  `d-flex gap-2` of a dialog's own.
- `src/shared/components/modalMotion.ts` — `MODAL_MS` (dialog fade, = `--motion-modal`) and
  `installModalMotion()` (installed once at startup). Use `MODAL_MS` for anything timed to a dialog closing.
- `src/features/transactions/components/WizardSteps.tsx` — the numbered step rail: `steps`, `current`,
  `onGo`, `label?`, `open?`, `large?`; also exports `TypeBadge`. Every add/record/edit wizard.
  Reference: `AddTransactionModal`, `AddDebtModal`, `ClosingWizard`. **Every step shows its word at
  every width** (owner, 2026-11-24, rule 17): under 576px a rail of 4+ steps shrinks its dots and
  rail to make room (`.stepsMany`), and only a word that still does not fit is cut with «…» — the
  button's own name and its `title` keep it whole. It used to hide the words for one «Βήμα 2/5 ·
  Κατηγορία» line; that line and its key are gone.
- `src/shared/css/Wizard.module.css` — the review step: `.wizCard` / `.wizRow` (a row that jumps back to its
  step) / `.wizLabel` / `.wizValue` / `.wizNote` / `.wizStatic` / **`.wizSub`** (the short line UNDER a figure
  that stands on its own, rule 15c — the rows already carry their label beside the figure; reference:
  `TransactionReviewBody`'s hero amount). Not a new review table.
- `src/features/transactions/components/css/TransactionWizard.module.css` — the transaction wizard's
  page/step/type-card/saved-panel classes; shared by `MarkPaidModal`, `ContributionWizard`, `GoalDeleteModal`.
- `src/features/transactions/components/SavedCheck.tsx` — the drawn tick for a wizard's "saved" panel.
- `src/shared/hooks/useStepTried.ts` — `{ tried(step), mark(step), reset() }`: show a step's errors only after
  Next/Save was refused there. Not one global `submitted` flag.
- `src/shared/utils/typedBlur.ts` — `typedBlur(formik.handleBlur)`: a blur counts as touched only once
  something was typed (no red on open).
- `src/shared/utils/validationMessage.ts` — `validationMessage(msg, t)`: render a Yup message stored as an
  i18n key (`"validation.maxChars|40"`).
- `src/shared/utils/cleanText.ts` — `cleanText` (multi-line), `cleanLine` (one line), `textKey` (compare key),
  `cleanTextFields(obj)`. `saveWithoutWaiting` already cleans; use these for anything saved another way.
- `src/shared/hooks/useFormChanged.ts` — **«No change, no Save»**, THE check every edit form makes:
  `const { unchanged } = useFormChanged(isEdit ? opened : undefined, current, normalize?)` → Save
  `disabled={… || unchanged}`, `if (unchanged) return` in the save handler, and `<UnchangedHint show={unchanged} />`
  straight before Save. `opened` = the record as the form shows it (formik: `formik.initialValues`); `undefined` for a
  new record (never «unchanged» — it is gated on its required answers). `normalize` picks the saved fields / maps
  a «no»-hidden answer away / `asNumber` a figure typed as text / `asSet` a list whose order means nothing.
  Every edit form uses it (`noChangeNoSave.test.ts` checks). Not formik's `dirty` (strict: «50» ≠ 50, «a » ≠ «a»).
- `src/shared/utils/sameValues.ts` — the comparison behind it: `sameValues(a, b)` (text trimmed + inner spaces
  folded, numbers as numbers incl. «50,00» vs 50, dates as local calendar days, ""/null/[]/{} = absent, lists by
  content in order, objects by fields), `asNumber`, `asSet`, `canonical`; and `sameAsStored(stored, update)` — the
  data layer's net (`useOnceMutation`'s `unchangedWhen`).
- `src/shared/components/UnchangedHint.tsx` — `UnchangedHint` (`show`, `className`): «Δεν άλλαξε τίποτα» / "Nothing
  has changed" beside a disabled Save (`common.nothingChanged`). Inline row editors put it under the row (`d-block`).
- `src/features/accounts/AccountPicker.tsx` — the "which card / cash" step (required, nothing preselected).
- `src/features/accounts/ReviewCard.tsx` — the chosen card on the review step, optional before → after `delta`.
  On the transaction wizards it goes in `TransactionReviewBody`'s `lead` slot (under the subtitle, before the
  amount): the review lists the card before the amount, as the steps ask them (WHERE before HOW MUCH).
- `src/features/categories/CategoryPicker.tsx` — the category step grid (`value`, `type`, `onChange`,
  `manage: "create" | "link"`, `onPage`).
- `src/features/transactions/components/PayeeInput.tsx` — a name field with saved-list suggestions
  (payees, or other lists via `wording`); `MatchedName` highlights the match. Reused by debts, goals, names.

## Choices (yes/no, one-of-many, period pickers)

- `src/shared/components/YesNoChoice.tsx` — a yes/no question as two tiles: `question`, `value`
  (`undefined` = unanswered), `onChange`, `children` (shown on «Ναι»), `whenNo`, `required`, `hideQuestion`.
  A new record passes `true` (starts on «Ναι») unless «Ναι» takes money from a card or erases records —
  the inventory is in `docs/DECISIONS.md`. Never a switch in a form. Styles: `src/shared/components/css/YesNoChoice.module.css`.
- `src/features/debts/MoneyMovedPicker.tsx` — "did money change hands, through which card?" — `YesNoChoice` +
  card pick (`value: null` unanswered, `""` yes-without-card). Any record that may or may not move cash.
- `src/shared/css/Segmented.module.css` — THE one-of-many control: `.group` > `.item` (+ `.active`);
  `.even` = equal halves for a two-way choice (+ `.owe` / `.lend` tints, see `AddDebtModal`).
  A filter row with counts («Όλοι 21 · Στις προτάσεις 7 · Διπλοί 2»): `.group` + `.item` with
  `Names.module.css` `.chips` / `.chip` / `.chipCount` — equal thirds that wrap inside the chip on a
  phone (fits 320px, no sideways scroll), natural width from `md`. Reference: `PayeesTab`, `CategoryManager`.
  Period pickers, filters, scopes. Never a Bootstrap `btn-group`, and never page tabs (`PageTabs`;
  `uiConventions.test.ts` refuses `aria-selected`/`NavLink` beside it).
- `src/shared/css/ChoiceSwitch.module.css` — sizing for a segmented control in a settings row
  (`ThemeSwitch`, `MotionEffectsSetting`, `BusinessSetting`).
- `src/shared/components/EveryPicker.tsx` — «Κάθε πότε»: count + unit, both picked (`unit`, `count`,
  `units`, `onChange`); `carryEvery`, `EVERY_MAX`. Bills, incomes, planner lines.
- `src/shared/components/DayPicker.tsx` — day of month 1–31 as a 7-column grid (`value`, `onChange`,
  `clearable`). Not a 31-row `<select>`. Styles: `src/shared/components/css/DayPicker.module.css`.
- `src/shared/components/ThemeSwitch.tsx` — `ThemeSwitch` (Light/Dark/Auto) and `ThemeCycleButton`.
  Settings and sidebar only.

## Fields (dates, money, names, required mark)

- `src/shared/components/DateField.tsx` — `DateField`: every date input; value is an ISO day string
  (`yyyy-MM-dd` or `""`); `month` for month mode, `clearable`, `minDate`/`maxDate`, `small`;
  **`happened`** for the date of something that happened — the days after today are greyed out
  (today from `useToday`, so it moves at midnight; the earlier of it and `maxDate` wins). The form
  still checks the value with `happenedDayError` (a stored future day may stay, only a changed one
  is refused). Planned dates leave it off; every field's kind is listed in
  `shared/components/dateFieldKinds.test.ts` (see `.claude/rules/ui.md` «Dates»). Also
  `MonthPicker` (opens the month grid from any button, e.g. a month title). Never `<input type="date">`.
  Styles: `src/shared/components/css/DateField.module.css`; calendar theme in index.css «Date picker».
- `src/shared/components/RequiredMark.tsx` — `<Label>{t(..)}<RequiredMark /></Label>` on required fields only
  (field carries `aria-required`). Never a typed «*». Styles: `src/shared/components/css/RequiredMark.module.css`.
- `src/shared/components/SearchInput.tsx` — the one search field (icon, clear ×): `value`, `onChange`,
  `size="sm"`, `block`. Styles: `src/shared/components/css/SearchInput.module.css`.
- Money input: a Reactstrap `<Input type="number">` in the display currency; convert to base with
  `convertToBase` from `useCurrencyConverter` (reference: `AddTransactionModal`).
- `src/shared/utils/currency.ts` — THE currency sign: `currencySymbol(code)` → «€» / «$» / «£» for an input's
  suffix or a decorative money sign (`useCurrencyConverter().symbol` = the display currency's);
  `currencyLabel` (Settings picker); `MONEY_MARKS` (strip signs/codes before parsing, used by `parseAmount`).
  Never a typed «€» in a `.ts`/`.tsx`/locale string — `currency.test.ts` refuses one (comments, tests and the
  demo's data aside); a figure inside a sentence is `{{amount}}` filled with `format(…)`.
- `src/shared/utils/iconText.ts` — `isSingleIcon` / `iconProblem` / `graphemes`: an icon field takes one emoji.
  Every icon field cuts what is typed to `firstGrapheme` (`shared/utils/categoryNames.ts`) and shows `iconProblem`
  as it is typed: `CategoryModal`, and goals/investments (`GoalLookStep` in `budget/components/GoalWizard.tsx`,
  `storedIcon` = an older text icon that still opens and saves unchanged; touched, it is asked to be replaced).
- `src/shared/utils/upperCase.ts` — `localeUpperCase(text, lang)`: Greek capitals without tonos. Not `toUpperCase()`.

## Lists, rows & row actions

- `src/shared/components/RowMenu.tsx` — the ⋮ menu on a row: `label`, `entries: RowMenuItem[]` (`danger`
  for delete) with
  `MENU_DIVIDER`. Floating UI, not reactstrap `Dropdown` (Popper misplaces it here).
  Styles: `src/shared/css/RowMenu.module.css`.
- `src/features/budget/components/GoalPickMenu.tsx` — «Όλοι ▾»: a small button opening a one-of-many
  choice under it (`label`, `value`, `options: {id,label,count?}[]`, `onChange`, `icon`, `compact`), built on
  `RowMenu` (✓ on the chosen; the toggle's name says the current choice). A filter that applies to a whole page or toolbar. Reference:
  `GoalsWorkbench` (status, group by), `BusinessPage` («Όλες οι δουλειές ▾», `?business=`).
- `src/shared/components/ManageList.tsx` — «Διαχείριση»: grouped names with edit, bin, optional on/off
  (`groups`, `onEdit`, `onDelete`, `onToggle`, `flash`). Bills/Incomes manage tabs, categories.
  Styles: `src/shared/css/ManageList.module.css`.
- `src/shared/hooks/useLoadMore.ts` — `useLoadMore(total, page, resetKey)` → `{ limit, hasMore, more,
  sentinel }`: draw a long in-memory list a page at a time; put `ref={sentinel}` after the last row.
- `src/features/analytics/components/DetailsTable.tsx` — the figures behind a chart as columns (`DetailsColumn`:
  figure, signed colour, `sm`-up only, total row) — what a chart's zoom sheet ends on.

## Empty, loading, skeletons

- `src/shared/components/Skeletons.tsx` — `SkeletonPageHeader`, `SkeletonHeading`, `SkeletonRows`,
  `SkeletonStats`, `SkeletonCard`, `SkeletonChartCard`, `SkeletonTable`, `SkeletonCardGrid`, re-exported
  `Skeleton`. Shaped like what is coming; never a spinner. Colours come from index.css «Loading skeletons».
- `src/shared/hooks/usePageLoad.ts` — **every page's loading branch**: `const load = usePageLoad(missing)` →
  `"loading"` (the skeleton) / `"ready"` (the page, its true empty state included) / `"waiting"` (still nothing
  after `SKELETON_MAX_MS` — the ONE constant, 8 s: the page's frame and add, `PageWaiting` where the content goes).
  `missing` = `noAnswerYet(query, …)` (a query with no `data`: never answered, or only failed — not TanStack's
  `isLoading`, which turns false on a failure; a hook whose `data` is always filled says `missing` itself:
  `useInvestmentGoals`, `useContributions`), or a data hook's own `missing` (`useMoneyAccounts`,
  `useOpeningBalance`, `useIncomeList`, `useIncomes` + `listMissing`, `useCalendarSources`). Never
  `if (isLoading || isError)` (that was the endless skeleton) and never `data = []` shown before it came.
  Reference: `DebtsPage`, `BillsPage`, `GoalsWorkbench` (`load` prop). Tests: `usePageLoad.test.tsx`.
- `src/shared/components/PageWaiting.tsx` — `PageWaiting` (`className`): the one quiet line for `"waiting"`
  («Τα στοιχεία σου θα εμφανιστούν εδώ μόλις έρθουν.», `common.pageWaiting`), `role="status"`. Not an error, not
  an empty state; no "retry" words. Replaced by the page the moment the data comes.
- `useWorkspaceMissing(...keys)` (`src/shared/hooks/useWorkspaceSetting.ts`) — the account's settings have not
  come and this device holds none of `keys`. A list kept on the user doc (accounts, incomes, businesses, planner
  lines) is saved WHOLE, so its add stays disabled while this is true — adding to an unread list would write over it.
- `src/lib/queryAutoRetry.ts` — `installQueryAutoRetry(client)`: failed loads retry on their own while the
  page shows its skeleton, then `PageWaiting`. Never write a "didn't load / try again" message.
- Empty state: no shared component — an invitation with the page's own add (GoalsWorkbench `empty` prop,
  `BillsPage`, `IncomesPage`, `BusinessPage` `invite`, `TransactionPage` `invite`). Shown only when `load === "ready"`.
- `src/shared/components/UpdatePrompt.tsx` + `src/shared/hooks/useAppUpdate.ts` — the blocking "new version"
  prompt (waits while a form is open). App shell only.

## Save / delete feedback & confirmation

- `src/shared/feedback/saveFeedback.ts` — after a save resolves: `celebrateSave({ collection, id?,
  milestone? })` (milestone only: goal reached, debt paid off). On the list: `const flashClass =
  useSavedFlash(collection, ids)` → `className={flashClass(row.id)}` (`kind: "card"` for cards; the class also
  carries `.row-pending` while an online-only action runs on that record — `{ withPending: false }` for the
  flash alone). Reference: `AddTransactionModal` + `TransactionPage`. Also `afterDialogs`, `announceSaved`/`onSaved` (internals).
- `src/shared/hooks/useRowFlash.ts` — the low-level row light under `useSavedFlash`; use it directly only for a
  flash not tied to a save. `src/features/budget/components/useGoalFlash.ts` — goal cards' version.
- `src/shared/utils/saveWithoutWaiting.ts` — `saveWithoutWaiting(mutation, vars, onFailure?, records?)`: THE way
  every new record / edit saves. Optimistic (the mutation needs an `onMutate` cache patch + rollback); the dialog
  closes at once with its toast, a lost write lands in `onFailure` (toast) — off the write's own promise, so it
  is said after the dialog has gone. `records` (`[["bills", id]]`) are marked `"save"` pending until the server
  has them. Never `await` a Firestore write (`actionsRunOnce.test.ts`).
- `src/shared/utils/pendingRecords.ts` — `answerOrLetGo(work, { records, succeeded, failed, close, letGo? })`: THE
  way an online-only action (delete, bulk, reset, merge, rename everywhere) runs. Return it to `DeleteButton` /
  `ConfirmSheet` / `GoalDeleteModal` / `useRunOnce`: locked while it runs, `LET_GO_MS` (7 s) at most — then
  `close` (or `letGo`), the info toast `toasts.stillRunning`, and `succeeded` / `failed` (with their toasts) when
  it settles. Report the result there, never after the await. Never rejects. Also the store: `markPending`,
  `pendingKindOf` (`"action"` / `"save"`).
- `src/shared/hooks/usePendingRecords.ts` — `const { busy, writing, pendingClass } = usePendingRecords()`: `busy`
  (an online-only action runs on the record) → disable its row and actions, `pendingClass` → `.row-pending`
  (theme.css: faded, no presses); `writing` (any write, a save not yet acknowledged too) → what the Overview's
  clickable items check. `useSavedFlash` already adds `.row-pending`, so a list that lights its saves needs
  nothing more; goal cards/rows add it themselves (`useGoalFlash` is the flash alone).
- `src/shared/components/DeleteButton.tsx` — every delete: asks first (`what` names it in the question);
  `opensConfirm` when the page opens its own fuller confirm (cascades); `iconOnly`, `wordFromSm`. Far left.
  **Runs once**: return `answerOrLetGo(() => remove.mutateAsync(id), {…})` from `onClick` and the question stays
  up, «Διαγραφή…», every button and its close/Esc locked, until the answer — 7 s at most; `busy` draws it
  working when the delete runs elsewhere. Never `mutate(…, { onSuccess })` for a delete.
- `src/features/incomes/components/ConfirmSheet.tsx` — the best existing "are you sure" sheet for a cascading
  or irreversible action (`title`, `body`, `hint`, `confirmLabel`, `lockedReason`, `busyLabel`). Reuse rather
  than a new modal. Same lock as `DeleteButton` when `onConfirm` returns a promise.
- A dialog's forms as STEPS of one dialog (never a dialog on a dialog): `AddDebtModal` / `ForgiveDebtModal` take `embedded`
  (their header, body and footer only) and `onSaved` (after a save; `onClose` then means Cancel). Reference:
  `src/features/debts/DebtActionsSheet.tsx` (menu → edit / forgive / delete as steps, Esc and Cancel back to the menu).
- `src/features/budget/components/GoalDeleteModal.tsx` — goal delete with "what happens to the money" choice;
  locked while `onConfirm`'s promise runs.
- `src/shared/hooks/useRunOnce.ts` — `const [run, running] = useRunOnce()`: a button's lock while its action runs.
  `run(action)` refuses a second call at once (a ref — a double-click lands before React draws `disabled`);
  `running` for `disabled` / «Αποθήκευση…» / the dialog's `keyboard={!running}` + `backdrop="static"` + no ✕.
  The action toasts its own result; `run` never rejects. Every save/delete/confirm that is not already a
  `DeleteButton` / `ConfirmSheet`: a save inside it calls `saveWithoutWaiting` and closes (reference:
  `ForgiveDebtModal`); an online-only action returns `answerOrLetGo(…)` (reference: `BillsPage` delete).
- `src/shared/hooks/useOnceMutation.ts` — THE way to declare a write (never TanStack's `useMutation`;
  `actionsRunOnce.test.ts` checks): `useMutation` + `onceBy` (required) — a second call that is the same action
  while the first is in flight starts nothing (`mutate` drops it, `mutateAsync` returns the first promise).
  `onceBy: (id) => id` for a delete / online-only change; `sameCall` (identity) for an optimistic save, where two
  equal deposits are two records. `unchangedWhen` (optional, on every update hook): an update equal to the cached
  record (`sameAsStored`) runs nothing — no cache patch, no write; see `docs/DATA_FLOW.md` «No change, no write».
- `src/lib/toastDefaults.ts` — toast timings per kind (success 2.8 s, error/warning 6 s), phone placement,
  installed once; just call `toast.success/error/warning` without an `autoClose` of your own. Wording for the
  plain «it went» of a record lives under `toasts.*` in the locales («Ο στόχος «…» διαγράφηκε», «Αποθηκεύτηκε»);
  older feature keys (`goals.createdSuccess`, `business.deleted` …) stay where they are.
- `src/styles/theme.css` «A dialog on its way out takes no more presses» — `.modal.fade:not(.show)
  .modal-content { pointer-events: none }`: a second tap on a Save whose dialog is fading out lands nowhere.

## Money display & tones

- `src/shared/hooks/useCurrencyConverter.ts` — THE currency formatter: `format(amount, fromCurrency?)`
  (base → display currency, user's locale, 2 decimals), `convert`, `convertToBase`, `displayCurrency`,
  `baseCurrency`, `symbol` (the display currency's sign, `shared/utils/currency.ts`), `ratesMissing`.
  A figure already in display currency: `format(n, displayCurrency)`.
  Never `new Intl.NumberFormat(..., {style:"currency"})` or `toFixed` for money on screen.
- `src/features/calendar/signedMoney.ts` — `signedMoney(n, format)` → «+70,00 €» / «−25,98 €»; `signOf`.
- `src/features/analytics/components/chartTheme.ts` — chart axes/ticks/series: `compactNumber`, `moneyAxis`,
  `amountTicks`, `signedWith`, `seriesColor`, `AXIS_TICK`. Every Recharts chart.
- `src/shared/utils/tone.ts` — `Tone` (income/expense/goal/invest/pending) and `toneChip(tone, strong?)`: a
  chip's style. Not hand-mixed tints.
- index.css «Tones» / «Chips» — `var(--{tone}-wash|edge|chip)`; `.tone-tile` + `.tone-tile-income|expense` for a
  total in its meaning's colour (DebtsPage, MonthCalendar).
- `src/features/budget/components/GoalsOverview.tsx` — overview tab: `OverviewTile[]` (`label`, `value`,
  `sub`, `tone` edge, `icon`) + "nearest" list + `MonthBars`. Tiles for any page's overview; Business
  reuses its classes (`GoalsWorkbench.module.css .overviewTile*`, `.nearList` for «Πού πήγαν τα έξοδα»).
  A tile or a line that opens a list is a `<button>` with the same classes + `Business.module.css`
  `.tileButton` / `.lineButton` and a «›» (`.opens`); what it opens is a read-only sheet of the records
  behind the figure, adding up to it — `LedgerCategoryModal` (ledger), `BusinessListSheet` (business).
- `src/shared/utils/moneyModel.ts` — what counts as in/out: `isSpending`, `isEarning`, `isTransfer`,
  `isMoneyMove`… Every total. `src/shared/utils/balance.ts` — current balance from a reading
  (`currentBalance`, `affectsBalance`); `src/shared/hooks/useOpeningBalance.ts` supplies the opening figure.
  Banks & cash figures (Banks page, Overview money card, «Περιουσία» → «Από τι αποτελείται») all come from
  `features/accounts/accountsUtils.ts`: `projectedTotal` (banks & cash now), `expectedByAccount` (each card),
  `goalHeldTotal` (goal money inside them); the Overview lines are `positionParts` (`overview/overviewTabs.ts`).

## Names & duplicates

- `src/shared/utils/nameMatch.ts` — `matchName(typed, items, namesOf, ignore?)` → `{kind: "same"|"similar"}`
  (case, accents, spaces, Greeklish, one typo); `matchNameIn` for strings; `sameName`, `nameKey`, `similarPairs`.
- `src/shared/components/NameCheck.tsx` — under a name field: refuses the same, offers the similar
  (`match`, `label`, `onUse`, `useLabel`). Reference: `CategoryModal`, `AccountModal`.
- `src/shared/hooks/useCachedList.ts` — `useCachedList(queryKey)` / `useCachedWorkspaceList(key)` /
  `useCachedData`: names already loaded, zero reads — for `matchName` in a form.
- `src/shared/utils/categoryNames.ts` — category key/aliases, `findScopeDuplicates`, `groupCategories`,
  `CategoryScope`. `src/shared/utils/categories.ts` — `categoryLabel(name, t)` (translated defaults),
  `findCategory`, virtual ids (`DEBT_CATEGORY_ID`, `TRANSFER_CATEGORY_ID`, `BUSINESS_CATEGORY_ID` = «🏪 Δουλειά»):
  a record under one of them shows its name and icon everywhere `findCategory` is used.
- `src/features/transactions/transactionFilter.ts` — `categoryChoices` (a category FILTER: the user's
  categories one per shown name + the virtual ones some record uses) and `matchesSearch` /
  `buildSearchNames` (search by description, category name in el+en, business name, «Κέρδος»/«Ζημιά»);
  names via `hooks/useSearchNames()` (user doc, no read). Any screen that filters or searches records.

## Calendars & charts

- `src/features/calendar/components/MonthCalendar.tsx` — a month grid with header ‹ month ›, in/out totals and
  the picked day's list: say `dayOf` / `renderDay`. Any month calendar (Calendar, Business, transactions).
- `src/features/calendar/dayTone.ts` — `dayTone({...})`: a day square's colour classes; `dayKey`
  (`src/features/calendar/components/dayKey.tsx`) builds the matching `InfoLegend` line.
- `src/shared/components/InfoLegend.tsx` — what colours mean, behind an ⓘ: `title`, `entries: LegendEntry[]`
  (`id`, `swatch` drawn with the real classes, `text`), `children`. Never a key laid out under a chart.
  Styles: `src/shared/css/InfoLegend.module.css`.
- `src/shared/components/MoneyTree.tsx` — days as a trunk with in/out leaves (`TreeDay[]`); via
  `src/features/calendar/components/CalendarTimeline.tsx` on Bills/Incomes. Styles: `src/shared/css/MoneyTree.module.css`.
- `src/shared/components/MonthBars.tsx` — a run of months as bars (`MonthBar[]`, tone) — Bills, Incomes,
  GoalsOverview; `src/shared/utils/monthExtremes.ts` picks the highs/lows. Styles: `src/shared/css/MonthBars.module.css`.
- `src/shared/components/SegmentedBar.tsx` — one bar, a piece per item, done ones filled (`BarSegment[]`,
  `segmentLayout`). Styles: `src/shared/css/SegmentedBar.module.css`.
- `src/shared/css/SummaryPanel.module.css` — the strong summary panel beside a list; `composes:` it from the
  page module (Bills, Incomes).

## Data hooks (cache, sync, offline, settings)

Read/save paths and costs: `docs/DATA_FLOW.md`, `docs/DATABASE.md`, `.claude/rules/firestore.md`.
- `src/shared/hooks/useAuth.ts` — `const { currentUser } = useAuth()`.
- `src/shared/hooks/useWorkspaceSetting.ts` — `useWorkspaceSetting(key, initial)` → `[value, set]` like
  `useState`, stored on `users/{uid}` (zero extra reads). Per-user settings and small definitions; `useWorkspace`.
- `src/shared/hooks/useLocalStorage.ts` — per-device only (a remembered view). Never for user data.
- `src/shared/hooks/useOfflineGuard.ts` — `useOfflineGuard("delete"|"settings"|"bulk")` → `{ locked, reason }`:
  disable + say why. Policy in `src/shared/utils/offlinePolicy.ts` (`requireConnection` in the data layer).
- `src/shared/hooks/useOnlineStatus.ts` — raw online flag (prefer `useOfflineGuard` for controls).
- `src/shared/hooks/useHasAccess.ts` — `useHasAccess("business")`: opt-in pages; menu, route and page ask it.
- `src/lib/listCache.ts` — `editList` / `restoreList` / `upsertById` / `removeWhere`: patch a cached list on save,
  never `invalidateQueries` a whole list. `src/firebase/syncList.ts` — `syncedList`, `noteDeleted`.
- `src/shared/hooks/useNarrowScreen.ts` — `useNarrowScreen()` (< `sm`): turn anchored menus into sheets.
- `src/shared/hooks/useDebounce.ts` — `useDebounce(value, ms)` for typing that drives heavy work.
- `src/shared/hooks/useToday.ts` — `useToday()`: the app's ONE "now" for figures that turn on the day (bills late /
  due, the current period). Shared object, moves only at midnight or when the app returns on a later day. The
  bills badge (`useBillsNeedingAttention`), the Bills page and the Overview read it — never a clock of their own.
- `src/shared/hooks/useMotionEffects.ts` — Settings «Κινούμενα εφέ» (this device); drives `--loop-play`.
- `src/shared/utils/dates.ts` — **the ONE place for date logic and date display: use these, never format
  a date or count a day yourself** (`dateHelpers.convention.test.ts` refuses `new Intl.DateTimeFormat`,
  `toLocaleDateString`, `setHours(0, 0, 0, 0)`, a local `sameDay`/`startOfDay`/`daysBetween`, an inline
  `new Date(d.getFullYear(), d.getMonth(), d.getDate())` and date-fns display patterns outside dates.ts).
  Reading/keys: `firestoreToDate`, `toISODay`/`parseISODay`/`dayToDate`, `toISOMonth`/`parseISOMonth`, `monthKey`.
  Calendar days (pure, give them `now`/`useToday()`): `startOfDay`, `endOfDay`, `today(now)`, `tomorrow(now)`,
  `sameDay(a, b)` (a missing date is never the same), `isToday(d, now)`, `daysBetween(from, to)` (calendar
  days, signed, DST-safe), `isFutureDay(day, now?)`.
  **Showing a date** — every formatter takes `(date, language)` with `language` = `i18n.resolvedLanguage`;
  Greek is el-GR, English is en-GB (day before month, like the date fields — "16 Nov 2026"):
  | Formatter | Greek / English | Where |
  |---|---|---|
  | `formatDay` | 16 Νοε 2026 / 16 Nov 2026 | the default look for a date |
  | `formatDayShort` | 16 Νοε / 16 Nov | dates near now, chart ticks by day |
  | `formatWeekdayDay` · `formatWeekdayDayYear` | Δευ 16 Νοε (2026) | day-by-day lists, plans |
  | `formatDayMonthWeekday` | Δευτέρα 16 Νοεμβρίου | page subtitles, a day's title |
  | `formatDayLong` · `formatDayLongYear` | 16 Νοεμβρίου (2026) | documents (statement, terms) |
  | `formatNumericDay` | 16/11/2026 | numbers only |
  | `formatMonthYear` | Νοέμβριος 2026 | month titles (Greek nominative) |
  | `formatMonthYearShort` · `formatMonthYearCompact` | Νοε 2026 · Νοε 26 | facts · chart axes |
  | `formatMonthShort` · `formatMonthName` · `formatMonthOf` | Νοε · Νοέμβριος · Νοεμβρίου | axes · a month alone · inside a phrase («από τέλος Νοεμβρίου») |
  | `formatWeekday(d, lang, "long"/"short"/"narrow")` · `formatDayNumber` | Δευτέρα/Δευ/Δ · 16 | calendar heads and cells |
  | `formatTime` · `formatDayShortTime` · `formatClock` | 14:05 · 16 Νοε, 14:05 · 14:05:22 | when a record was written · the Overview clock |
  | `formatRecordDay` | 06, Σεπτ 2026 / 06, Sep 2026 | the transactions table and every wizard's review step |
  | `formatRelativeDays(days, lang)` | σήμερα, αύριο, σε 3 ημέρες, πριν από 3 ημέρες | a day counted from today |
  Where an `Intl.DateTimeFormat` must be handed on (a chart, a child's prop), `dateFormat(look, lang)` gives
  the cached one for a look in `DATE_LOOKS` (`"day"`, `"dayShort"`, `"weekdayDay"`, `"monthYear"` …). A new
  look is added there, never built in a screen. `dateLocale(lang)`, `dateFnsLocale(lang)` (date-fns pickers),
  `standaloneMonthName(locale, date)`. «Happened» dates (today or earlier): `isFutureDay(day, now?)` (an ISO day or a Date),
  `happenedDayError(iso, today?, stored?)` → `NOT_IN_FUTURE` (`validation.notInFuture`) or undefined;
  the writers' guard `refuseFutureDates(dates, { now?, stored? })` → `FutureDateError`, with
  `happenedLimit` (start of the day after tomorrow: a day of slack for time zones). Date helpers live
  here, never as local copies in forms.
  **The one rule for "a day" (2026-11-16):** a form READS a stored date as its local calendar day,
  `toISODay(value)` (it takes a Timestamp, a Date or a millis value), and SAVES a picked day as local
  midnight, `dayToDate(iso)` (= `parseISODay`, but an Invalid Date instead of null). Local midnight,
  not noon: almost every writer already stored it (no record or figure moves), it exists on both DST
  Sundays in Greece (clocks change at 03:00/04:00), and money code compares by local day. Older
  records at UTC midnight (`new Date("yyyy-MM-dd")`) still read as the right day. Never
  `toISOString().slice/split` or `new Date(values.x)` for a day — `shared/utils/dayValues.test.ts`
  fails on them outside dates.ts; tests on Greek time in `dates.dayRule.test.ts` and
  `EditTransactionModal.day.test.tsx`.
- `src/shared/types/IndexTypes.ts` — every shared record type (Transaction, Bill, Debt, InvestmentGoal …).

## Colours, type, spacing

| Kind of value | Comes from | Enforced by |
|---|---|---|
| Colours (roles: `--surface`, `--text`, `--brand`, `--income`, `--expense-text` …; 2 colourways × light/dark) | `src/styles/tokens.css` | `src/styles/contrast.test.ts` (≥ 8:1), `src/styles/noPureColours.test.ts` |
| Tone tints, chips, `.stat-head`, `.tone-tile` | `src/index.css` («Tones», «Chips») | — |
| The shared hover/focus of anything clickable: `.hover-card` (wash + edge) / `.hover-row` (wash only, ring inside); a module opts in with `composes: hover-card from global;` — never a `:hover` of its own. Bootstrap `a.card`/`button.card`/`.card[role=button]` get it by themselves. Colours `--hover-wash` / `--hover-edge` (and the bills paid cards `--paid-wash` / `--paid-edge`), stronger in light mode | `src/styles/theme.css` («The shared hover», «Hover and paid») | — |
| Every one-of-many control's resting option: `--segment-item` (the CARDS' `--surface`, never the page ground — rule 11) + `--segment-item-border` / `--segment-item-hover-border`, the chosen one `--color-segment-active*` / `--view-switch-on*`. ONE pair for `PageTabs`, `Segmented`, `ViewSwitch`, `DensitySwitch`, `YesNoChoice` and the feature copies that read them (`PlannerPage.module.css`, `MobileDateFilter.module.css`) — change it here, not in a module | `src/styles/theme.css` (top, «Tabs, segments…») | `src/styles/contrast.test.ts` (`text-2`/`text` on `surface`) |
| A money dialog's header band `.tone-head-expense` / `.tone-head-income`, handed out by `moneyToneHead` (rule 15a) | `src/styles/theme.css` («A money dialog's tone goes on its HEADER») | `src/styles/contrast.test.ts` (`text` on «{tone} strong over surface») |
| Font sizes `--fs-caption…--fs-display`, radius `--radius-*`, spacing `--space-0…8`, shadows, motion `--motion-*` | `src/styles/shape.css` | `src/styles/typeScale.test.ts` (px exceptions listed by name) |
| Bootstrap wired to tokens; `.row-flash`, `.save-pulse`, `.card-flash` | `src/styles/theme.css` (`@layer theme` for one-class rules) | `src/styles/cssLayers.test.ts` |
| Layer order `app-important, app-base, bootstrap, theme` | top of `src/index.css` | `src/styles/cssLayers.test.ts` |
| Motion: reduced motion drops movement, endless loops use `var(--loop-play, running)` | each module | `src/styles/reducedMotion.test.ts` |
| Green buttons, retry messages, page rules a test can see | — | `src/styles/uiConventions.test.ts` |

Order: Bootstrap class/variable → CSS module → plain CSS. Inline TSX sizes: `fontSize: "var(--fs-text)"`.
Account card skins (`src/features/accounts/accountTones.ts`) and flags (`src/shared/components/Flags.tsx`,
`GreekFlag`/`BritishFlag`) are the only places with fixed colours.

## Internals (no direct use in a feature)

- `src/shared/components/PageAddProvider.tsx`, `src/shared/components/UpdatePrompt.tsx`,
  `src/shared/hooks/useAppUpdate.ts`, `src/shared/components/modalMotion.ts` (`installModalMotion`) — app shell.
- `src/shared/hooks/useTheme.ts` — theme context (`useTheme`, `THEME_PREFERENCES`); use `ThemeSwitch` in UI.
- `src/shared/hooks/useRowFlash.ts` — under `useSavedFlash`.
- `src/shared/utils/offlinePolicy.ts` — the rule table behind `useOfflineGuard`.
- `src/lib/deltaSync.ts`, `src/lib/localStore.ts`, `src/lib/readMeter.ts`, `src/lib/queryClient.ts` — sync/cache plumbing.

## Known drift — fix, don't copy

Places that do not use the shared piece today. Do not copy them; fix one when you touch it.

1. **Hand-made `btn-group`** — `src/features/categories/CategoryModal.tsx:134`: the scope picker
   («Έξοδο / Έσοδο / Και τα δύο») is a Bootstrap `btn-group` of `color="secondary"` buttons (grey active).
   Should be `Segmented.module.css` (`.group .even`).
2. **Hand-rolled page header** — fixed 2026-11-19: every routed page of the signed-in app now draws the shared
   `PageHeader` card (`AccountsPage`'s own `Header` and `AddHeader` are gone; `TransactionPage` has a real title
   header and no longer keeps an `AddButton` beside the search field). `pageHeader.convention.test.ts` keeps it so.
   Still outside it on purpose: `LegalPage` (a public document, its own reading layout) and the sign-in /
   sign-up pages, which sit outside the app shell.
3. **Hand-rolled confirm dialogs** (no shared confirm; `ConfirmSheet` is the one to reuse/extract):
   `src/features/bills/BillsPage.tsx:1762`, `src/features/accounts/AccountsPage.tsx:495`,
   `src/features/budget/components/InvestmentsShared.tsx:665` (`DeleteConfirmModal`),
   `src/features/transactions/pages/TransactionPage.tsx:208` (another `DeleteConfirmModal`).
4. **Local currency formatting** — fixed 2026-11-16 (the transaction wizards, `ArrivedSheet`,
   `FuelDetailsPanel` now use `format(n, displayCurrency)`). `fuelTypes.ts` `formatUnitPrice` keeps its own
   3-decimal pump price, in the user's currency — legitimately different.
5. **Copied number helpers** — `src/features/overview/components/CashFlowChart.tsx:157` has its own
   `compactNumber` (use `chartTheme.compactNumber`); `const round2 = …` is re-declared in 43 files
   (e.g. `src/features/accounts/accountsUtils.ts:65`, `src/features/analytics/analyticsUtils.ts:14`) — no shared helper yet.
6. **Copied wizard review CSS** — `src/features/plannerPage/css/PlannerPage.module.css:955` re-declares
   `.wizCard/.wizRow/.wizLabel/.wizValue` (used at `src/features/plannerPage/components/EntryEditor.tsx:460`);
   use `src/shared/css/Wizard.module.css`.
7. **Two overview-tile looks** — `src/features/overview/components/OverviewTabs.tsx:371` (`OverviewTile`,
    `TileGrid`, own classes) vs `GoalsOverview`'s `OverviewTile`; `src/features/business/BusinessPage.tsx`
    (`MonthTiles`) rebuilds the Goals tile markup from `GoalsWorkbench.module.css`. No shared `Tile` component yet.
8. **Month ‹ › steppers hand-rolled** — `MonthCalendar.tsx:104` is the reference; copies at
    `src/features/business/businessShared.tsx:14` (`MonthNav`), `src/features/transactions/pages/LedgerPage.tsx:207`,
    `src/features/plannerPage/components/PlannerTiles.tsx:174` (+ a month `<select>` at :179),
    `src/features/incomes/components/IncomeCalendar.tsx:135`,
    `src/features/transactions/components/TransactionCalendar.tsx:376`,
    `src/features/analytics/components/CategoryTrendCard.tsx:93`, `src/features/analytics/components/IncomesBillsCard.tsx:49`,
    `src/features/plannerPage/components/LineSpendSheet.tsx:87`, `src/features/calendar/components/MoneyTimeline.tsx:168`.
9. **reactstrap Dropdown** — `src/features/plannerPage/components/PlannerPaydayCard.tsx:97`
    (`UncontrolledDropdown`); `RowMenu.tsx` explains why Popper misplaces menus in this app.
10. **Switches inside forms** (rule: YES/NO tiles) — `src/features/accounts/ReviewCard.tsx:101` («adjust
    reading» switch on a wizard's review step). Settings toggles (`BillAlertSetting.tsx:131`) and
    `TwoWayCard.tsx:157` are page controls, not forms.
11. **A "try again" message** (rule 6) — `src/features/debts/CoveredLoadFailed.tsx:12` («Δοκίμασε ξανά»),
    used in `AddDebtModal.tsx` and `DebtActionsSheet.tsx` (delete step of an open covered debt).
12. **Weekday as `<select>`** — `src/features/bills/AddBillModal.tsx:617` and
    `src/features/incomes/components/IncomeFormModal.tsx:314`: no shared weekday picker (the day-of-month one is
    `DayPicker`); a candidate for `Segmented`.
13. **Inline px/hard values** — `src/features/categories/FuelDetailsPanel.tsx:46,160` (`borderRadius: 10/8`,
    `padding: "8px 12px"`) instead of `--radius-*` / `--space-*`.
14. **Dead / damaged** — `src/features/overview/components/MetricCard.tsx` is imported nowhere (and formats
    with `toLocaleString`, `:13`); `src/features/overview/pages/css/OverviewPage.module.css:1` and other
    comment rules in it are mojibake.
15. **Footers still laid out by hand** (rule 15b is `DialogFooter`'s now) — the dialogs with nothing to
    delete that a page owns or that are two-row by design: `src/features/accounts/CheckInModal.tsx:179`
    (`ModalFooter className="d-block"`, the answer line over two half-width buttons — nothing to keep apart),
    and the hand-rolled confirms of #3 above (`BillsPage`, `AccountsPage`, `InvestmentsShared`
    `DeleteConfirmModal`, `TransactionPage`), `ConfirmSheet`, `GoalDeleteModal`, `EditReadingModal`,
    `MonthBreakdownModal`, `CustomRangeModal`, `HorizonPicker`, `LineSpendSheet`, `PlanRowSheet`,
    `CategoryMergeModal`, `BusinessesTab`, `CategoryManager`, `PayeesTab`, `WelcomeTour`, the Settings
    sheets. None holds a `DeleteButton` beside another button, so none breaks the rule; move them to
    `DialogFooter` when you touch them.
16. **An underline strip as a filter** — `src/features/budget/components/InvestmentsShared.tsx:745`
    (`HistoryTabBar`, «Όλες · Καταθέσεις · Αναλήψεις» in a goal's history dialog): inline-styled underline
    buttons, no tab roles. A one-of-many filter, so `Segmented.module.css` (or `ViewSwitch`), not `PageTabs`.
