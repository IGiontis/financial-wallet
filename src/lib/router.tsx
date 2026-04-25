import { lazy, Suspense } from "react";
import { Navigate, Outlet, createBrowserRouter, useLocation } from "react-router-dom";
import { MainLayout } from "../features/layout/MainLayout";
import { NotFoundPage } from "../features/errors/NotFoundPage";
import { ErrorBoundary } from "../features/errors/ErrorBoundary";
import { useAuth } from "../context/AuthContext";
import { Spinner } from "reactstrap";

const OverviewPage = lazy(() => import("../features/overview/pages/OverviewPage").then((m) => ({ default: m.OverviewPage })));
const TransactionsPage = lazy(() => import("../features/transactions/pages/TransactionPage").then((m) => ({ default: m.TransactionsPage })));
const GoalsPage = lazy(() => import("../features/goals/GoalsPage"));
const SettingsPage = lazy(() => import("../features/settings/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const InvestmentsPage = lazy(() => import("../features/budget/InvestmentsPage"));
const PlannerPage = lazy(() => import("../features/plannerPage/PlannerPage").then((m) => ({ default: m.PlannerPage })));
const LoginPage = lazy(() => import("../features/auth/LoginPage"));
const RegisterPage = lazy(() => import("../features/auth/RegisterPage"));

function PageLoader() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
      <Spinner color="primary" />
    </div>
  );
}

function ProtectedRoute() {
  const { currentUser, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!currentUser) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

function PublicOnlyRoute() {
  const { currentUser, loading } = useAuth();
  if (loading) return null;
  if (currentUser) return <Navigate to="/" replace />;
  return <Outlet />;
}

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
