# Project map — where things are

MyFiWallet: a personal-finance PWA (React 19 + TypeScript + Vite, Firebase Auth + Firestore,
Greek/English, public demo). This file tells you which file to open; it does not explain
how things work — see `docs/ARCHITECTURE.md`.

- **Keep it updated in the same change** that adds, moves or removes a page, route or
  feature folder. `src/test/docsMap.test.ts` fails when a router path is missing here.
- **The code is the truth.** If this file and the code disagree, the code wins — fix this file.
- Rules: `CLAUDE.md`, `.claude/rules/ui.md`, `.claude/rules/firestore.md`,
  `.claude/rules/money-tests.md`. Why things are the way they are: `docs/DECISIONS.md`.
- Shared UI pieces: `docs/COMPONENTS.md`. Collections and fields: `docs/DATABASE.md`.
  Read/save/delete paths and linked money: `docs/DATA_FLOW.md`.

## `src/` at a glance

- `src/main.tsx`, `src/App.tsx` — boot and the app shell's providers (see ARCHITECTURE).
- `src/index.css` — Bootstrap cascade layer, global rules; imports `src/styles/*`.
- `src/context/` — `AuthContext.tsx`, `ThemeContext.tsx` (+ their `*ContextValue.ts`).
- `src/demo/` — the public demo: in-memory Firestore, fixtures, demo chrome, guided tour.
- `src/features/` — one folder per page/area (below).
- `src/firebase/` — the ONLY place that talks to Firebase (config, auth, Firestore calls).
- `src/i18n/` — i18next setup and `locales/el.json`, `locales/en.json`.
- `src/lib/` — router, lazy chunks, guards, query client, sync/cache helpers, PWA update.
- `src/shared/` — reusable `components/`, `hooks/`, `utils/`, `feedback/`, `types/`, `css/`.
- `src/styles/` — `tokens.css` (colours), `shape.css` (sizes, `--fs-*`), `theme.css`, style tests.
- `src/test/` — Vitest setup (`setup.ts`) and test helpers; `docsMap.test.ts`.
- `src/assets/` — Vite template leftovers, not imported anywhere.

## Routes

Defined in `src/lib/router.tsx`. Lazy components: `src/lib/lazyRoutes.ts`; chunk functions
(shared with the idle prefetch): `src/lib/pageChunks.ts`. Sidebar: `navGroups` in
`src/features/layout/Sidebar.tsx` — groups Standing («Where you stand»), Daily, Plan,
Holdings («What you own & owe»). Guards: `src/lib/routeGuards.tsx`.

| Path | Page component (file) | Chunk | Sidebar (group › parent) | Query / params |
|---|---|---|---|---|
| `/terms` | `LegalPage doc="terms"` (`features/legal/LegalPage.tsx`) | `legal` | — (footer, sign-in pages) | — |
| `/privacy` | `LegalPage doc="privacy"` | `legal` | — (footer, sign-in pages) | — |
| `/login` | `LoginPage` (`features/auth/LoginPage.tsx`) | `login` | — (`PublicOnlyRoute`) | — |
| `/register` | `RegisterPage` (`features/auth/RegisterPage.tsx`) | `register` | — (`PublicOnlyRoute`) | — |
| `/` | `OverviewPage` (`features/overview/pages/OverviewPage.tsx`) | `overview` | Standing › Overview | `?quick=expense` (app-icon shortcut, read by `AddFab`), `?tour=1` (`TourGate`); `?tab=all` (default) \| `today` \| `month` \| `flow` \| `position` (`usePageTab`; the last one also remembered on the device, localStorage `overview-tab`) |
| `/transactions` | `TransactionsPage` (`features/transactions/pages/TransactionPage.tsx`) | `transactions` | Daily › Transactions › All | `?category=<id>`; old `?tab=calendar` redirects to `/transactions/calendar` |
| `/transactions/new` | `NewTransactionPage` (`features/transactions/pages/NewTransactionPage.tsx`) | `newTransaction` | Daily › Transactions › New | — |
| `/transactions/calendar` | `TransactionsPage view="calendar"` (same file) | `transactions` | Daily › Transactions › Calendar | — |
| `/transactions/ledger` | `LedgerPage` (`features/transactions/pages/LedgerPage.tsx`) | `ledger` | Daily › Transactions › Ledger | — |
| `/transactions/names` | `NamesPage` (`features/names/NamesPage.tsx`) | `names` | Daily › Transactions › Names | `?tab=payees` (default) \| `categories` |
| `/analytics` | `AnalyticsPage` (`features/analytics/pages/AnalyticsPage.tsx`) | `analytics` | Standing › Analytics | — |
| `/investments` | default export of `features/budget/InvestmentsPage.tsx` | `investments` | Holdings › Investments | `?tab=overview` \| `cards` \| `list` (`useGoalTab`) |
| `/goals` | default export of `features/goals/GoalsPage.tsx` | `goals` | Plan › Goals | `?tab=overview` \| `cards` \| `list` (`useGoalTab`) |
| `/bills` | `BillsPage view="overview"` (`features/bills/BillsPage.tsx`) | `bills` | Daily › Bills › Overview | — |
| `/bills/pay` | `BillsPage view="pay"` | `bills` | Daily › Bills › Pay (badge) | — |
| `/bills/manage` | `BillsPage view="manage"` | `bills` | Daily › Bills › Manage | — |
| `/bills/all` | `BillsPage view="all"` | `bills` | Daily › Bills › All | — |
| `/incomes` | `IncomesPage view="overview"` (`features/incomes/IncomesPage.tsx`) | `incomes` | Daily › Incomes › Overview | — |
| `/incomes/record` | `IncomesPage view="record"` | `incomes` | Daily › Incomes › Record (badge) | — |
| `/incomes/manage` | `IncomesPage view="manage"` | `incomes` | Daily › Incomes › Manage | — |
| `/incomes/all` | `IncomesPage view="all"` | `incomes` | Daily › Incomes › All | — |
| `/planner` | `PlannerPage` (`features/plannerPage/PlannerPage.tsx`) | `planner` | Plan › Planner | in-page `ViewSwitch` (state only) |
| `/calendar` | default export of `features/calendar/CalendarPage.tsx` | `calendar` | Plan › Calendar | — |
| `/allocation` | `<Navigate to="/planner">` (old page, merged into Planner) | — | — | — |
| `/debts` | default export of `features/debts/DebtsPage.tsx` | `debts` | Holdings › Debts | — |
| `/accounts` | default export of `features/accounts/AccountsPage.tsx` | `accounts` | Holdings › Accounts | — |
| `/business` | default export of `features/business/BusinessPage.tsx` (`view="main"`) | `business` | Daily › Business › Summary (only if `useHasAccess("business")`) | `?tab=overview` \| `days` \| `calendar` (`usePageTab`); `?business=<id>` (absent = all); old `?tab=businesses` redirects to `/business/manage` |
| `/business/manage` | `BusinessPage view="manage"` (same file) — «Οι δουλειές μου» | `business` | Daily › Business › My businesses | — |
| `/settings` | `<Navigate to="profile">` | — | `settingsItem` (own item below the groups) + Topbar menu | — |
| `/settings/:tab` | `SettingsPage` (`features/settings/pages/SettingsPage.tsx`) | `settings` | same | `:tab` = `profile` \| `preferences` \| `data` \| `account` (`features/settings/settingsTabs.ts`); unknown → profile |
| `*` | `NotFoundPage` (`features/errors/NotFoundPage.tsx`) | eager | — | `ErrorBoundary` is the `errorElement` of `/` |

Guard nesting: `/terms`, `/privacy` open to all → `PublicOnlyRoute` (`/login`, `/register`)
→ `SessionGate` → `MainLayout` → `ProtectedRoute` (every app page). `/business` and
`/business/manage` render `NotFoundPage` themselves when the feature is off.

## Feature folders (`src/features/*`)

Firebase files are in `src/firebase/`. "User doc" = fields on `users/{uid}` read through
`useWorkspaceSetting` (`src/shared/hooks/useWorkspaceSetting.ts`). Collections in detail:
`docs/DATABASE.md`.

### `accounts` — «Τράπεζες & μετρητά», bank/cash check-ins
- Page `AccountsPage.tsx`; pieces `BankCard`, `CushionCard`, `ReviewCard`, `CheckInModal`, `AccountModal`, `GapRecordSheet`, `AccountPicker` (used by forms elsewhere).
- Hooks `useMoneyAccounts.ts` (accounts + check-ins on the user doc), `useGapRecords.ts` (writes the "unlogged gap" as transactions via `saveGapRecords`).
- Firebase `firestore.ts`; data: user doc, `transactions`.
- Logic `accountsUtils.ts`, `cushion.ts`, `gapRecords.ts`; tests `accountsUtils.test.ts`, `gapRecords.test.ts`, `adjustCheckIns.test.ts`.

### `analytics` — «Αναλύσεις», where the money goes
- Page `pages/AnalyticsPage.tsx`; charts in `components/` (Recharts; `MoneyFlowSankey` + `EChart`/`echartsSetup.ts` for ECharts).
- Hook `useFixedMonth.ts`; read-only — reuses transactions, bills, incomes, goals queries.
- Logic `analyticsUtils.ts`, `dashboardUtils.ts`, `netWorthUtils.ts`, `categoryTrend.ts`, `twoWay.ts`, `incomesVsBills.ts`; tests next to each.

### `auth` — sign-in and sign-up
- Pages `LoginPage.tsx` / `RegisterPage.tsx` with `LoginForm`, `RegisterForm`, `PasswordResetStep`, `AuthLanguagePicker`, `AuthSkeleton`, `WelcomeSplash`.
- Logic `authActions.ts`, `googleProfile.ts` + `pendingSignUp.ts` (create `users/{uid}` via `createUser`), `passwordReset.ts`, `inAppBrowser.ts`.
- Firebase `auth.ts`, `firestore.ts`; tests `RegisterPage.test.tsx`, `pendingSignUp.test.ts`, `passwordReset.test.ts`.

### `bills` — «Λογαριασμοί», recurring payments ticked off when paid
- Page `BillsPage.tsx` (four routes = four views); `AddBillModal` (wizard), `MarkPaidModal`, `SettleOverdueModal`, `BillManage`, `BillMonthTimeline`, `BillYearAhead`, `BillYearGrid`, `BillAlertPopup` (mounted in `MainLayout`).
- Hooks `useBills.ts` (+ `billCache.ts` keys/patches), `useBillAlerts.ts`; `useBillsNeedingAttention` feeds the sidebar badge.
- Firebase `firestore.ts`; collections `bills`, `billPayments`, `transactions`.
- Logic `billsUtils.ts`, `monthTimeline.ts`, `yearCost.ts`, `billAlerts.ts`; tests `billsUtils.test.ts`, `useBills.test.tsx`, `billPause.test.ts`, `billInstalments.test.ts`, `billsBadge.test.tsx` (menu badge = «Πληρωμές» tab), `BillsPage.*.test.tsx`.

### `budget` — goals AND investments logic (despite the name)
- Page `InvestmentsPage.tsx`; shared screen `components/GoalsWorkbench.tsx` (tabs: shared `PageTabs`, `useGoalTab.ts`), `GoalsOverview`, `GoalCard`/`InvestmentsShared`, `GoalStacks`, `GoalWizard`, `GoalDeleteModal`.
- Forms `AddNewGoalModal.tsx`, `EditGoalModal.tsx`, `ContributionWizard.tsx`; parts `goalParts.ts`, `components/GoalPartsEditor.tsx`.
- Hooks `useInvestments.ts`, `useCoveredLink.ts`, `useCoveredFunding.ts` (goal paid by a friend → debt).
- Firebase `firestore.ts`; collections `investmentGoals`, `investmentContributions`, `transactions`, `debts`.
- Tests `investmentsUtils.test.ts`, `goalParts.test.ts`, `goalHolding.test.ts`, `coveredLink.test.ts`, `GoalWizards.test.tsx`, `components/GoalsWorkbench.test.tsx`.

### `goals` — «Στόχοι» page only
- `GoalsPage.tsx` is the only file; everything else imports from `../budget/`.

### `business` — «Δουλειά», several businesses, a day's closing each
- Page `BusinessPage.tsx` — two routes = two views: `main` (`/business`, tabs via `usePageTab`, business picker `?business=` via `GoalPickMenu`, «+» = new closing) and `manage` (`/business/manage`, «Οι δουλειές μου», «+» = new business); `BusinessDialogs` (a business's wizard and delete, shared by both). `ClosingWizard` (closing), `BusinessWizard` (a business and its lines; the first income line has no ✕), `BusinessesTab` (the «Οι δουλειές μου» cards, `DeleteBusinessModal`, `FirstBusinessInvite`), `BusinessCalendar`, `BusinessEntryView` (+ `BusinessDeleteModal`), `BusinessListSheet` (the overview's «Μέρες» tile and each «Πού πήγαν τα έξοδα» line opened into their closings, read-only, each row → `BusinessEntryView`), `businessShared.tsx` (`MonthNav`).
- Hook `useBusiness.ts` (`useBusinesses`, closings, save/delete, `useDeleteBusiness`); switched on per account (`useHasAccess`, keys in `businessKeys.ts`).
- Firebase `business.ts`; collection `businessEntries` + linked `transactions` (virtual category `BUSINESS_CATEGORY_ID`); businesses on the user doc (`businesses`).
- Logic `businessSummary.ts` (figures, `personalRecord`, `expenseLineClosings`, `lossDays`), `businessEdit.ts` (a business as the form leaves it, `linesReady`, `INCOME_LINES_MIN`), `businessFormat.ts` (names, signs); tests `businessSummary.test.ts`, `businessEdit.test.ts`, `BusinessWizard.test.tsx`, `businessRecord.test.ts`, `src/firebase/business.test.ts`, `src/firebase/syncBusiness.test.ts`.

### `calendar` — «Ημερολόγιο», the month day by day
- Page `CalendarPage.tsx`; `components/MonthCalendar`, `MoneyTimeline`, `CalendarTimeline`.
- Hook `useCalendarSources.ts`; read-only (bills, debts, incomes, goals, planner one-offs).
- Logic `calendarDays.ts`, `dayTone.ts`; tests `calendarDays.test.ts`, `CalendarPage.test.tsx`.

### `categories` — category manager and pickers
- No route of its own: `CategoryManager.tsx` is the «Κατηγορίες» tab of `/transactions/names`; `CategoryPicker`, `CategoryModal`, `NewCategoryButton` used by forms.
- Hooks live in `transactions/hooks/useTransactions.ts` (`useCategories` …); collection `categories`.
- Tests `CategoryManager.test.tsx`, `categoryUsage.test.ts`.

### `debts` — «Χρέη & δάνεια», people and bank loans
- Page `DebtsPage.tsx`; `PersonDebtsModal`, `AddDebtModal` (wizard), `RepaymentWizard`, `ForgiveDebtModal`, `LoanCards`, `MoneyMovedPicker` (the yes/no tile pattern).
- Hook `useDebts.ts` (incl. `useHealDebtCash`).
- Firebase `firestore.ts`; collections `debts`, `debtPayments`, `transactions`, `investmentContributions` (covered goals).
- Logic `debtsUtils.ts`, `debtCash.ts`, `rateExample.ts`; tests `debtsUtils.test.ts`, `debtCash.test.ts`, `AddDebtModal.*.test.tsx`.

### `errors`
- `ErrorBoundary.tsx` (route `errorElement`), `NotFoundPage.tsx` (`*`, and `/business` when off).

### `incomes` — «Έσοδα», expected incomes and their arrival
- Page `IncomesPage.tsx` (four routes = four views); `components/IncomeFormModal`, `IncomeManage`, `IncomeMonthsAhead`, `ArrivedSheet`, `ConfirmSheet`.
- Hooks `useIncomes.ts` (`useIncomesNeedingAttention` feeds the sidebar badge), `useSalaryIncome.ts`, `useIncomesMigration.ts`.
- Data: income list on the user doc; an arrival is a `transactions` record.
- Logic `incomesUtils.ts`, `incomeMigration.ts`, `detectSalary.ts`; tests `incomesUtils.test.ts`, `IncomesPage.test.tsx`, `incomeMigration.test.ts`.

### `layout` — the frame around every signed-in page
- `MainLayout.tsx` (mounts `Sidebar`, `Topbar`, `AppFooter`, `AddFab`, `BillAlertPopup`, `TourGate`, `NavPendingBar`, `PageAddProvider`; starts the idle prefetch).
- `Sidebar.tsx` (nav groups), `Topbar.tsx` (theme toggle, `LanguageToggle`, demo badge), `usePendingNav.ts`, `useProfile.ts`, `pageEnter.ts`.
- Tests `MainLayout.test.tsx`, `AddFab.test.tsx`, `NavPendingBar.test.tsx`.

### `legal` — terms, privacy, cookies
- Page `LegalPage.tsx` (text in `legalContent.ts`); `CookieBanner` (analytics consent), `LegalLinks`, `AgeTermsConsent`, `RecaptchaNotice`.

### `names` — «Δικαιούχοι & κατηγορίες»
- Page `NamesPage.tsx` (tabs `payees` → `PayeesTab.tsx`, `categories` → `categories/CategoryManager.tsx`).
- Hook `useNameActions.ts` (rename payee everywhere, merge categories); Firebase `names.ts`; collections `transactions`, `bills`, `categories`, user doc.
- Tests `NamesPage.test.tsx`, `categoryMerge.test.ts`.

### `overview` — «Επισκόπηση», the home page
- Page `pages/OverviewPage.tsx`; `components/OverviewHero`, `OverviewTabs`, `MoneyBreakdown`, `PaydayCard`, `CashFlowChart`, `BankStrip`, `MetricCard`.
- Hook `usePaydayOutlook.ts`; read-only.
- Logic `overviewUtils.ts`, `overviewTabs.ts`; tests `overviewUtils.test.ts`, `overviewTabs.test.ts`, `overviewTabs.position.test.ts` («Περιουσία» lines vs the Banks page), `pages/OverviewPage.test.tsx`.

### `plannerPage` — «Θα τα βγάλω;», the planner (Allocation merged in)
- Page `PlannerPage.tsx`; `components/PlanMonthRows`, `PlannerTimeline`, `EntryEditor`, `MonthFlowSheet`, `PlannerTiles`, `HorizonPicker`; `BalanceLine.tsx` at the root.
- Inputs `plannerInputs.ts` (`PLANNER_KEYS`, on the user doc); no hook file — reads other features' hooks.
- Logic `plannerUtils.ts`, `plannerActuals.ts`, `payCycles.ts`, `lineSpending.ts`, `planDays.ts`, `allocationMigration.ts`; tests next to each, `planReconciliation.test.ts`.

### `settings` — «Ρυθμίσεις»
- Page `pages/SettingsPage.tsx` (tabs `settingsTabs.ts`, drawn by the shared `PageTabs`); `components/NavStylePicker` (colourway), `MotionEffectsSetting`, `BusinessSetting`, `BillAlertSetting`, `ResetDataSection`, `StatementSection`.
- Firebase `firestore.ts` (`updateUser`, `resetUserData`), `auth.ts`, `accountDeletion.ts`.
- Tests `pages/SettingsPage.test.tsx`, `displayName.test.ts`.

### `statement` — printable statement
- `StatementModal.tsx`, lazy-loaded from Settings › Data (`StatementSection`); logic `statementUtils.ts`, `statementPdf.ts` (+ tests).

### `tour` — first-run welcome tour of the signed-in app
- `TourGate.tsx` (mounted in `MainLayout`, `?tour=1` reopens it), `WelcomeTour.tsx`, `tourState.ts`; "seen" flag on the user doc.
- The demo's separate guided tour (driver.js) is `src/demo/guidedTour/`.

### `transactions` — «Συναλλαγές»
- Pages `pages/TransactionPage.tsx` (list + calendar view), `pages/NewTransactionPage.tsx`, `pages/LedgerPage.tsx`.
- Forms `components/AddTransactionModal.tsx` (reference wizard), `EditTransactionModal`, `TransferWizard`, `WizardSteps`, `PayeeInput`, `TransactionsViewModal`.
- Hooks in `hooks/`: `useTransactions.ts` (also categories), `useTransfers.ts`, `usePayees.ts` (user doc), `useRecordLocks.ts`.
- Firebase `firestore.ts`; collections `transactions`, `categories`, user doc.
- Logic `transfers.ts`, `linkedRecords.ts`, `ledger.ts`, `transactionInsights.ts`, `payeeStore.ts`, `transactionFilter.ts` (the category filter's choices — the user's categories one per name plus the used virtual ones: «Δουλειά», «Μεταφορά», «Δάνεια», «Τόκοι» — and the search: description, category name in both languages, a business's name, «Κέρδος»/«Ζημιά»; used by the list and the ledger; names from `hooks/useSearchNames.ts`); tests next to each, `hooks/useTransactions.test.tsx`.

## Locales

- `src/i18n/locales/el.json` and `src/i18n/locales/en.json`; setup `src/i18n/index.ts`.
- Every string exists in BOTH files. Add keys without reordering the files (agents share them).
- Each language is its own build chunk (`locale-el`, `locale-en` in `vite.config.ts`).
