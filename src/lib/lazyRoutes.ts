import { createElement, lazy } from "react";
import { pageChunks } from "./pageChunks";

// Route-level code splitting. Kept in its own module so router.tsx exports only
// the router object and this file exports only components — which is what React
// Fast Refresh needs to hot-reload cleanly. The chunks come from `pageChunks`,
// the same functions the idle prefetch calls, so a page fetched ahead of time is
// the very chunk the router later asks for.

export const OverviewPage = lazy(() => pageChunks.overview().then((m) => ({ default: m.OverviewPage })));
export const TransactionsPage = lazy(() => pageChunks.transactions().then((m) => ({ default: m.TransactionsPage })));
/** The same chunk as the list: one page in two views (see `TransactionsPage`). */
export const TransactionsCalendarPage = lazy(() => pageChunks.transactions().then((m) => ({ default: () => createElement<{ view?: "list" | "calendar" }>(m.TransactionsPage, { view: "calendar" }) })));
export const LegalPage = lazy(pageChunks.legal);
export const NewTransactionPage = lazy(() => pageChunks.newTransaction().then((m) => ({ default: m.NewTransactionPage })));
export const LedgerPage = lazy(() => pageChunks.ledger().then((m) => ({ default: m.LedgerPage })));
export const NamesPage = lazy(() => pageChunks.names().then((m) => ({ default: m.NamesPage })));
export const AnalyticsPage = lazy(() => pageChunks.analytics().then((m) => ({ default: m.AnalyticsPage })));
export const GoalsPage = lazy(pageChunks.goals);
export const SettingsPage = lazy(() => pageChunks.settings().then((m) => ({ default: m.SettingsPage })));
export const InvestmentsPage = lazy(pageChunks.investments);
export const BillsPage = lazy(pageChunks.bills);
export const IncomesPage = lazy(pageChunks.incomes);
export const CalendarPage = lazy(pageChunks.calendar);
export const PlannerPage = lazy(() => pageChunks.planner().then((m) => ({ default: m.PlannerPage })));
export const DebtsPage = lazy(pageChunks.debts);
// A person's / a bank loan's own page: the Debts chunk, as the list.
export const DebtPersonPage = lazy(() => pageChunks.debts().then((m) => ({ default: m.DebtPersonPage })));
export const AccountsPage = lazy(pageChunks.accounts);
export const BusinessPage = lazy(pageChunks.business);
// «Νέο κλείσιμο»: «Δουλειά»'s own chunk, as its other pages.
export const NewClosingPage = lazy(() => pageChunks.business().then((m) => ({ default: m.NewClosingPage })));
export const LoginPage = lazy(pageChunks.login);
export const RegisterPage = lazy(pageChunks.register);
