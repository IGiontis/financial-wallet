import { lazy, Suspense } from "react";
import { createBrowserRouter } from "react-router-dom";
import { MainLayout } from "../features/layout/MainLayout";
import { NotFoundPage } from "../features/errors/NotFoundPage";
import { ErrorBoundary } from "../features/errors/ErrorBoundary";
// Route components live in their own module so this file only exports `router`
// — otherwise React Fast Refresh can't hot-reload it.
import { PageLoader, ProtectedRoute, PublicOnlyRoute } from "./routeGuards";

const OverviewPage = lazy(() => import("../features/overview/pages/OverviewPage").then((m) => ({ default: m.OverviewPage })));
const TransactionsPage = lazy(() => import("../features/transactions/pages/TransactionPage").then((m) => ({ default: m.TransactionsPage })));
const GoalsPage = lazy(() => import("../features/goals/GoalsPage"));
const SettingsPage = lazy(() => import("../features/settings/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const InvestmentsPage = lazy(() => import("../features/budget/InvestmentsPage"));
const BillsPage = lazy(() => import("../features/bills/BillsPage"));
const PlannerPage = lazy(() => import("../features/plannerPage/PlannerPage").then((m) => ({ default: m.PlannerPage })));
const LoginPage = lazy(() => import("../features/auth/LoginPage"));
const RegisterPage = lazy(() => import("../features/auth/RegisterPage"));

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
            path: "planner",
            element: (
              <Suspense fallback={<PageLoader />}>
                <PlannerPage />
              </Suspense>
            ),
          },
          {
            path: "settings",
            element: (
              <Suspense fallback={<PageLoader />}>
                <SettingsPage />
              </Suspense>
            ),
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
