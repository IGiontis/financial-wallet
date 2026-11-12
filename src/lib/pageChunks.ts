// Every page's code chunk, by name — the ONE list of them.
//
// The router's lazy pages (lazyRoutes.ts) and the idle prefetch
// (prefetchPages.ts) both load a page through the function here, so they share
// the same chunk: once the prefetch has fetched it, the first tap on that page
// finds it already on the device. A page added to the router is added here, and
// the prefetch picks it up without a second list to keep in step.

export const pageChunks = {
  overview: () => import("../features/overview/pages/OverviewPage"),
  transactions: () => import("../features/transactions/pages/TransactionPage"),
  newTransaction: () => import("../features/transactions/pages/NewTransactionPage"),
  ledger: () => import("../features/transactions/pages/LedgerPage"),
  names: () => import("../features/names/NamesPage"),
  analytics: () => import("../features/analytics/pages/AnalyticsPage"),
  goals: () => import("../features/goals/GoalsPage"),
  settings: () => import("../features/settings/pages/SettingsPage"),
  investments: () => import("../features/budget/InvestmentsPage"),
  bills: () => import("../features/bills/BillsPage"),
  incomes: () => import("../features/incomes/IncomesPage"),
  calendar: () => import("../features/calendar/CalendarPage"),
  planner: () => import("../features/plannerPage/PlannerPage"),
  debts: () => import("../features/debts/DebtsPage"),
  accounts: () => import("../features/accounts/AccountsPage"),
  legal: () => import("../features/legal/LegalPage"),
  login: () => import("../features/auth/LoginPage"),
  register: () => import("../features/auth/RegisterPage"),
} as const;

export type PageChunk = keyof typeof pageChunks;

/**
 * The pages of the signed-in app, in the order the prefetch fetches them —
 * roughly how often they are opened. Signing in and the legal pages are left
 * out: whoever is inside the app has no use for them.
 */
export const APP_PAGES: readonly PageChunk[] = [
  "overview",
  "transactions",
  "newTransaction",
  "bills",
  "incomes",
  "planner",
  "goals",
  "investments",
  "debts",
  "accounts",
  "analytics",
  "calendar",
  "ledger",
  "names",
  "settings",
];
