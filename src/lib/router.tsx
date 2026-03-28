import { createBrowserRouter } from "react-router-dom";
import { MainLayout } from "../features/layout/MainLayout";
import { OverviewPage } from "../features/overview/pages/OverviewPage";
import { TransactionsPage } from "../features/transactions/pages/TransactionPage";
import { BudgetsPage } from "../features/budget/BudgetPage";
import { SettingsPage } from "../features/settings/pages/SettingsPage";

/**
 * Application Router Configuration
 *
 * 2025/2026 Pattern: Data Router (createBrowserRouter)
 * - Better error handling
 * - Nested layouts
 * - Type-safe
 */
export const router = createBrowserRouter([
  {
    path: "/",
    element: <MainLayout />,
    children: [
      {
        index: true,
        element: <OverviewPage />,
      },
      {
        path: "transactions",
        element: <TransactionsPage />,
      },
      {
        path: "budgets",
        element: <BudgetsPage />,
      },
      {
        path: "settings",
        element: <SettingsPage />,
      },
    ],
  },
]);
