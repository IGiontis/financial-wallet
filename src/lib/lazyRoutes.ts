import { lazy } from "react";
import { pageChunks } from "./pageChunks";

// Route-level code splitting. Kept in its own module so router.tsx exports only
// the router object and this file exports only components — which is what React
// Fast Refresh needs to hot-reload cleanly. The chunks come from `pageChunks`,
// the same functions the idle prefetch calls, so a page fetched ahead of time is
// the very chunk the router later asks for.

export const OverviewPage = lazy(() => pageChunks.overview().then((m) => ({ default: m.OverviewPage })));
export const TransactionsPage = lazy(() => pageChunks.transactions().then((m) => ({ default: m.TransactionsPage })));
export const LegalPage = lazy(pageChunks.legal);
export const NewTransactionPage = lazy(() => pageChunks.newTransaction().then((m) => ({ default: m.NewTransactionPage })));
export const LedgerPage = lazy(() => pageChunks.ledger().then((m) => ({ default: m.LedgerPage })));
export const AnalyticsPage = lazy(() => pageChunks.analytics().then((m) => ({ default: m.AnalyticsPage })));
export const GoalsPage = lazy(pageChunks.goals);
export const SettingsPage = lazy(() => pageChunks.settings().then((m) => ({ default: m.SettingsPage })));
export const InvestmentsPage = lazy(pageChunks.investments);
export const BillsPage = lazy(pageChunks.bills);
export const IncomesPage = lazy(pageChunks.incomes);
export const CalendarPage = lazy(pageChunks.calendar);
export const PlannerPage = lazy(() => pageChunks.planner().then((m) => ({ default: m.PlannerPage })));
export const DebtsPage = lazy(pageChunks.debts);
export const AccountsPage = lazy(pageChunks.accounts);
export const LoginPage = lazy(pageChunks.login);
export const RegisterPage = lazy(pageChunks.register);
