import { lazy, Suspense } from "react";
import { Navigate, Outlet, createBrowserRouter, useLocation } from "react-router-dom";
import { MainLayout } from "../features/layout/MainLayout";
import { NotFoundPage } from "../features/errors/NotFoundPage";
import { ErrorBoundary } from "../features/errors/ErrorBoundary";
import { useAuth } from "../context/AuthContext";
import { Spinner } from "reactstrap";

// ─── Lazy page imports ────────────────────────────────────────────────────────
// Each page becomes its own JS chunk and is only downloaded when first visited.
// Named exports need the .then(m => ({ default: m.X })) unwrap.
// Default exports (LoginPage, RegisterPage, InvestmentsPage) don't need it.

const OverviewPage = lazy(() => import("../features/overview/pages/OverviewPage").then((m) => ({ default: m.OverviewPage })));

const TransactionsPage = lazy(() => import("../features/transactions/pages/TransactionPage").then((m) => ({ default: m.TransactionsPage })));

const SettingsPage = lazy(() => import("../features/settings/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));

const InvestmentsPage = lazy(() => import("../features/budget/InvestmentsPage"));
const LoginPage = lazy(() => import("../features/auth/LoginPage"));
const RegisterPage = lazy(() => import("../features/auth/RegisterPage"));

// ─── Page loading fallback ────────────────────────────────────────────────────
// Shown while a lazy chunk is being downloaded on first visit.

function PageLoader() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
      }}
    >
      <Spinner color="primary" />
    </div>
  );
}

// ─── ProtectedRoute ───────────────────────────────────────────────────────────

function ProtectedRoute() {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;

  if (!currentUser) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

// ─── PublicOnlyRoute ──────────────────────────────────────────────────────────

function PublicOnlyRoute() {
  const { currentUser, loading } = useAuth();

  if (loading) return null;

  if (currentUser) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const router = createBrowserRouter([
  // ── Public only routes ──────────────────────────────────────────────────────
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

  // ── App routes (inside MainLayout) ─────────────────────────────────────────
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
            path: "settings",
            element: (
              <Suspense fallback={<PageLoader />}>
                <SettingsPage />
              </Suspense>
            ),
          },
        ],
      },
      // 404 — must be last
      {
        path: "*",
        element: <NotFoundPage />,
      },
    ],
  },
]);
