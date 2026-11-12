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
- `src/shared/components/AddButton.tsx` — `AddButton` (the square icon-only «+», `label` = aria/title,
  `small` in a row of small buttons) and `AddHeader` (`label`, `onAdd`, `title`, `subtitle`): «+» pinned
  left, `h1.h5` title + one-line subtitle. Reference: `DebtsPage`, `BillsPage`. Never a text «+ Κάτι» button.
- `src/features/budget/components/GoalsWorkbench.tsx` — the Goals/Investments page frame (header with
  `action={<AddButton/>}`, `PageTabs`, overview/cards/list, `empty`). Use for another goal-like screen.
- `src/shared/hooks/usePageAdd.ts` — `usePageAdd(label, onAdd)`: tell the floating «+»
  (`src/features/layout/AddFab.tsx`) what this page adds; same words as the page's `AddButton`.
  `src/shared/components/PageAddProvider.tsx` provides it (app shell only).
- `index.css .stat-head` — a card's/section's title over its figure (hairline under). Not a hand-styled `h6`.
- `src/shared/components/ChartZoom.tsx` — `ZoomButton` (in a chart card header) + `ZoomModal` (end of
  tree): "see it bigger" for any chart. Styles: `src/shared/css/ChartZoom.module.css`.

## Tabs & in-page views

- `src/shared/components/PageTabs.tsx` — THE page tabs, the one tab look on every page (boxes, the chosen one
  in the brand, no icons; one row that scrolls sideways with snap when tight, never wraps). Straight under the
  header. Two modes, same markup:
  - state tabs — `base`, `label`, `tabs: {id,label}[]`, `value`, `onChange`: a real tablist (arrows, Home/End,
    roving tabIndex, `data-view={id}` on each). Label the panel with `src/shared/utils/pageTabIds.ts`
    (`pageTabIds(base, tab)` → `{tab, panel}`). Keep the tab in `?tab=`. Reference: `BusinessPage`, `NamesPage`,
    `GoalsWorkbench`, `OverviewPage`; `SettingsPage` (each tab its own route, `onChange` navigates).
  - link tabs — `label`, `links: {to,label,badge?,badgeTone?,badgeLabel?}[]`: a section's child routes
    («Σύνοψη · Πληρωμές · Όλα», `NavLink end`), a count on a tab's corner. Reference: `BillsPage`, `IncomesPage`.
  Optional `data-tour` for the guided tour. Styles: `src/shared/css/PageTabs.module.css` (Segmented's tokens).
- `src/shared/hooks/usePageTab.ts` — `usePageTab(tabs, first, storageKey)` → `[tab, choose]`: the open tab in
  `?tab=` (replace, not push), remembered on the device for a visit with no `?tab=`; the address wins.
  Reference: `OverviewPage`, `BusinessPage`. (`useGoalTab` is an older copy of the same idea.)
- `src/shared/components/ViewSwitch.tsx` — 2–3 ways of laying out the SAME rows («Λίστα | Ημερολόγιο»):
  `label`, `options: {id,label,icon?,short?}[]`, `value`, `onChange`, `stackOnPhone`, `block`. Not page tabs.
  Styles: `src/shared/css/ViewSwitch.module.css`.
- `src/features/settings/settingsTabs.ts` — Settings' tab ids/paths (`/settings/<id>`), drawn by `PageTabs`
  in `SettingsPage`.

## Forms & wizards

- `src/shared/components/formModal.ts` — `FORM_MODAL` (`{ backdrop: "static" }`): spread on every `<Modal>`
  that takes data. Read-only views keep closing on backdrop.
- `src/shared/components/modalMotion.ts` — `MODAL_MS` (dialog fade, = `--motion-modal`) and
  `installModalMotion()` (installed once at startup). Use `MODAL_MS` for anything timed to a dialog closing.
- `src/features/transactions/components/WizardSteps.tsx` — the numbered step rail: `steps`, `current`,
  `onGo`, `label?`, `open?`, `large?`; also exports `TypeBadge`. Every add/record/edit wizard.
  Reference: `AddTransactionModal`, `AddDebtModal`, `ClosingWizard`.
- `src/shared/css/Wizard.module.css` — the review step: `.wizCard` / `.wizRow` (a row that jumps back to its
  step) / `.wizLabel` / `.wizValue` / `.wizNote` / `.wizStatic`. Not a new review table.
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
- `src/features/accounts/AccountPicker.tsx` — the "which card / cash" step (required, nothing preselected).
- `src/features/accounts/ReviewCard.tsx` — the chosen card on the review step, optional before → after `delta`.
- `src/features/categories/CategoryPicker.tsx` — the category step grid (`value`, `type`, `onChange`,
  `manage: "create" | "link"`, `onPage`).
- `src/features/transactions/components/PayeeInput.tsx` — a name field with saved-list suggestions
  (payees, or other lists via `wording`); `MatchedName` highlights the match. Reused by debts, goals, names.

## Choices (yes/no, one-of-many, period pickers)

- `src/shared/components/YesNoChoice.tsx` — a yes/no question as two tiles: `question`, `value`
  (`undefined` = unanswered), `onChange`, `children` (shown on «Ναι»), `whenNo`, `required`, `hideQuestion`.
  Never a switch in a form. Styles: `src/shared/components/css/YesNoChoice.module.css`.
- `src/features/debts/MoneyMovedPicker.tsx` — "did money change hands, through which card?" — `YesNoChoice` +
  card pick (`value: null` unanswered, `""` yes-without-card). Any record that may or may not move cash.
- `src/shared/css/Segmented.module.css` — THE one-of-many control: `.group` > `.item` (+ `.active`);
  `.even` = equal halves for a two-way choice (+ `.owe` / `.lend` tints, see `AddDebtModal`).
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
  (`yyyy-MM-dd` or `""`); `month` for month mode, `clearable`, `minDate`/`maxDate`, `small`. Also
  `MonthPicker` (opens the month grid from any button, e.g. a month title). Never `<input type="date">`.
  Styles: `src/shared/components/css/DateField.module.css`; calendar theme in index.css «Date picker».
- `src/shared/components/RequiredMark.tsx` — `<Label>{t(..)}<RequiredMark /></Label>` on required fields only
  (field carries `aria-required`). Never a typed «*». Styles: `src/shared/components/css/RequiredMark.module.css`.
- `src/shared/components/SearchInput.tsx` — the one search field (icon, clear ×): `value`, `onChange`,
  `size="sm"`, `block`. Styles: `src/shared/components/css/SearchInput.module.css`.
- Money input: a Reactstrap `<Input type="number">` in the display currency; convert to base with
  `convertToBase` from `useCurrencyConverter` (reference: `AddTransactionModal`).
- `src/shared/utils/iconText.ts` — `isSingleIcon` / `iconProblem` / `graphemes`: an icon field takes one emoji.
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
- `src/lib/queryAutoRetry.ts` — `installQueryAutoRetry(client)`: failed loads retry on their own; the page
  keeps its skeleton. Never write a "didn't load / try again" message.
- Empty state: no shared component — an invitation with the page's own add (GoalsWorkbench `empty` prop).
- `src/shared/components/UpdatePrompt.tsx` + `src/shared/hooks/useAppUpdate.ts` — the blocking "new version"
  prompt (waits while a form is open). App shell only.

## Save / delete feedback & confirmation

- `src/shared/feedback/saveFeedback.ts` — after a save resolves: `celebrateSave({ collection, id?,
  milestone? })` (milestone only: goal reached, debt paid off). On the list: `const flashClass =
  useSavedFlash(collection, ids)` → `className={flashClass(row.id)}` (`kind: "card"` for cards). Reference:
  `AddTransactionModal` + `TransactionPage`. Also `afterDialogs`, `announceSaved`/`onSaved` (internals).
- `src/shared/hooks/useRowFlash.ts` — the low-level row light under `useSavedFlash`; use it directly only for a
  flash not tied to a save. `src/features/budget/components/useGoalFlash.ts` — goal cards' version.
- `src/shared/utils/saveWithoutWaiting.ts` — `saveWithoutWaiting(mutation, vars, onFailure?)`: optimistic
  save; the dialog closes at once, a lost write lands in `onFailure` (toast). Never `await` a Firestore write.
- `src/shared/components/DeleteButton.tsx` — every delete: asks first (`what` names it in the question);
  `opensConfirm` when the page opens its own fuller confirm (cascades); `iconOnly`, `wordFromSm`. Far left.
- `src/features/incomes/components/ConfirmSheet.tsx` — the best existing "are you sure" sheet for a cascading
  or irreversible action (`title`, `body`, `hint`, `confirmLabel`, `lockedReason`). Reuse rather than a new modal.
- `src/features/budget/components/GoalDeleteModal.tsx` — goal delete with "what happens to the money" choice.
- `src/lib/toastDefaults.ts` — toast timings per kind (success 2.8 s, error/warning 6 s), phone placement,
  installed once; just call `toast.success/error/warning` without an `autoClose` of your own.

## Money display & tones

- `src/shared/hooks/useCurrencyConverter.ts` — THE currency formatter: `format(amount, fromCurrency?)`
  (base → display currency, user's locale, 2 decimals), `convert`, `convertToBase`, `displayCurrency`,
  `baseCurrency`, `ratesMissing`. A figure already in display currency: `format(n, displayCurrency)`.
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
- `src/shared/utils/moneyModel.ts` — what counts as in/out: `isSpending`, `isEarning`, `isTransfer`,
  `isMoneyMove`… Every total. `src/shared/utils/balance.ts` — current balance from a reading
  (`currentBalance`, `affectsBalance`); `src/shared/hooks/useOpeningBalance.ts` supplies the opening figure.

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
- `src/shared/hooks/useMotionEffects.ts` — Settings «Κινούμενα εφέ» (this device); drives `--loop-play`.
- `src/shared/utils/dates.ts` — `firestoreToDate`, `toISODay`/`parseISODay`, `toISOMonth`, `dateFnsLocale`,
  `standaloneMonthName`. `src/features/transactions/transactionDates.ts` — `isSameDay`, `toDateKey`, `formatDisplay`.
- `src/shared/types/IndexTypes.ts` — every shared record type (Transaction, Bill, Debt, InvestmentGoal …).

## Colours, type, spacing

| Kind of value | Comes from | Enforced by |
|---|---|---|
| Colours (roles: `--surface`, `--text`, `--brand`, `--income`, `--expense-text` …; 2 colourways × light/dark) | `src/styles/tokens.css` | `src/styles/contrast.test.ts` (≥ 8:1), `src/styles/noPureColours.test.ts` |
| Tone tints, chips, `.stat-head`, `.tone-tile` | `src/index.css` («Tones», «Chips») | — |
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
2. **Hand-rolled page header** — `src/features/accounts/AccountsPage.tsx:477` `Header` duplicates `AddHeader`
   markup. `src/features/transactions/pages/TransactionPage.tsx:984`: `AddButton` sits beside the search field,
   no title header.
3. **Hand-rolled confirm dialogs** (no shared confirm; `ConfirmSheet` is the one to reuse/extract):
   `src/features/bills/BillsPage.tsx:1762`, `src/features/accounts/AccountsPage.tsx:495`,
   `src/features/budget/components/InvestmentsShared.tsx:665` (`DeleteConfirmModal`),
   `src/features/transactions/pages/TransactionPage.tsx:208` (another `DeleteConfirmModal`).
4. **Local currency formatting** instead of `useCurrencyConverter().format(n, displayCurrency)`:
   `src/features/transactions/components/AddTransactionModal.tsx:329`,
   `src/features/transactions/components/EditTransactionModal.tsx:315` (0–2 decimals, unlike everywhere else),
   `src/features/incomes/components/ArrivedSheet.tsx:127`, `src/features/categories/FuelDetailsPanel.tsx:167`
   (`fuelTypes.ts:22` formats a 3-decimal fuel price — legitimately different).
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
    used at `AddDebtModal.tsx:382`, `PersonDebtsModal.tsx:910`.
12. **Weekday as `<select>`** — `src/features/bills/AddBillModal.tsx:617` and
    `src/features/incomes/components/IncomeFormModal.tsx:314`: no shared weekday picker (the day-of-month one is
    `DayPicker`); a candidate for `Segmented`.
13. **Inline px/hard values** — `src/features/categories/FuelDetailsPanel.tsx:46,160` (`borderRadius: 10/8`,
    `padding: "8px 12px"`) instead of `--radius-*` / `--space-*`.
14. **Dead / damaged** — `src/features/overview/components/MetricCard.tsx` is imported nowhere (and formats
    with `toLocaleString`, `:13`); `src/features/overview/pages/css/OverviewPage.module.css:1` and other
    comment rules in it are mojibake.
15. **An underline strip as a filter** — `src/features/budget/components/InvestmentsShared.tsx:745`
    (`HistoryTabBar`, «Όλες · Καταθέσεις · Αναλήψεις» in a goal's history dialog): inline-styled underline
    buttons, no tab roles. A one-of-many filter, so `Segmented.module.css` (or `ViewSwitch`), not `PageTabs`.
