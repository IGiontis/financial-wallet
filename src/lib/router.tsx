import { Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { MainLayout } from "../features/layout/MainLayout";
import { NotFoundPage } from "../features/errors/NotFoundPage";
import { ErrorBoundary } from "../features/errors/ErrorBoundary";
// Route components and lazy page chunks live in their own modules so this file
// only exports `router` — otherwise React Fast Refresh can't hot-reload it.
import { PageLoader, ProtectedRoute, PublicOnlyRoute } from "./routeGuards";
import { OverviewPage, TransactionsPage, AnalyticsPage, GoalsPage, SettingsPage, InvestmentsPage, BillsPage, IncomesPage, PlannerPage, AllocationPage, DebtsPage, AccountsPage, LoginPage, RegisterPage } from "./lazyRoutes";

export const router = createBrowserRouter([
  {
    element: <PublicOnlyRoute />,
    children: [
      {
        path: "/login",
        element: (
          <Suspense fallback={<PageLoader />}>
            <LoginPage />
          </Suspense>
        ),
      },
      {
        path: "/register",
        element: (
          <Suspense fallback={<PageLoader />}>
            <RegisterPage />
          </Suspense>
        ),
      },
    ],
  },
  {
    path: "/",
    element: <MainLayout />,
    errorElement: <ErrorBoundary />,
    children: [
      {
        element: <ProtectedRoute />,
        children: [
          {
            index: true,
            element: (
              <Suspense fallback={<PageLoader />}>
                <OverviewPage />
              </Suspense>
            ),
          },
          {
            path: "transactions",
            element: (
              <Suspense fallback={<PageLoader />}>
                <TransactionsPage />
              </Suspense>
            ),
          },
          {
            path: "analytics",
            element: (
              <Suspense fallback={<PageLoader />}>
                <AnalyticsPage />
              </Suspense>
            ),
          },
          {
            path: "investments",
            element: (
              <Suspense fallback={<PageLoader />}>
                <InvestmentsPage />
              </Suspense>
            ),
          },
          {
            path: "goals",
            element: (
              <Suspense fallback={<PageLoader />}>
                <GoalsPage />
              </Suspense>
            ),
          },
          {
            path: "bills",
            element: (
              <Suspense fallback={<PageLoader />}>
                <BillsPage />
              </Suspense>
            ),
          },
          {
            path: "incomes",
            element: (
              <Suspense fallback={<PageLoader />}>
                <IncomesPage />
              </Suspense>
            ),
          },
          {
            path: "planner",
            element: (
              <Suspense fallback={<PageLoader />}>
                <PlannerPage />
              </Suspense>
            ),
          },
          {
            path: "allocation",
            element: (
              <Suspense fallback={<PageLoader />}>
                <AllocationPage />
              </Suspense>
            ),
          },
          {
            path: "debts",
            element: (
              <Suspense fallback={<PageLoader />}>
                <DebtsPage />
              </Suspense>
            ),
          },
          {
            path: "accounts",
            element: (
              <Suspense fallback={<PageLoader />}>
                <AccountsPage />
              </Suspense>
            ),
          },
          {
            // One address per tab, so a link can open Settings exactly where it
            // is needed — /settings/data for the statement, say. The page itself
            // turns an unknown tab back into Profile. Being one route with a
            // parameter, switching tabs keeps the same page mounted: a profile
            // edit left unsaved is still there when you come back to it.
            path: "settings",
            children: [
              { index: true, element: <Navigate to="profile" replace /> },
              {
                path: ":tab",
                element: (
                  <Suspense fallback={<PageLoader />}>
                    <SettingsPage />
                  </Suspense>
                ),
              },
            ],
          },
        ],
      },
      {
        path: "*",
        element: <NotFoundPage />,
      },
    ],
  },
]);
