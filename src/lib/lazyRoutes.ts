import { lazy } from "react";

// Route-level code splitting. Kept in its own module so router.tsx exports only
// the router object and this file exports only components — which is what React
// Fast Refresh needs to hot-reload cleanly.

export const OverviewPage = lazy(() => import("../features/overview/pages/OverviewPage").then((m) => ({ default: m.OverviewPage })));
export const TransactionsPage = lazy(() => import("../features/transactions/pages/TransactionPage").then((m) => ({ default: m.TransactionsPage })));
export const AnalyticsPage = lazy(() => import("../features/analytics/pages/AnalyticsPage").then((m) => ({ default: m.AnalyticsPage })));
export const GoalsPage = lazy(() => import("../features/goals/GoalsPage"));
export const SettingsPage = lazy(() => import("../features/settings/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
export const InvestmentsPage = lazy(() => import("../features/budget/InvestmentsPage"));
export const BillsPage = lazy(() => import("../features/bills/BillsPage"));
export const PlannerPage = lazy(() => import("../features/plannerPage/PlannerPage").then((m) => ({ default: m.PlannerPage })));
export const DebtsPage = lazy(() => import("../features/debts/DebtsPage"));
export const LoginPage = lazy(() => import("../features/auth/LoginPage"));
export const RegisterPage = lazy(() => import("../features/auth/RegisterPage"));
