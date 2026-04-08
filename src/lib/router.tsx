import { Navigate, Outlet, createBrowserRouter, useLocation } from "react-router-dom";
import { MainLayout } from "../features/layout/MainLayout";
import { OverviewPage } from "../features/overview/pages/OverviewPage";
import { TransactionsPage } from "../features/transactions/pages/TransactionPage";
import { SettingsPage } from "../features/settings/pages/SettingsPage";
import { NotFoundPage } from "../features/errors/NotFoundPage";
import { ErrorBoundary } from "../features/errors/ErrorBoundary";
import InvestmentsPage from "../features/budget/InvestmentsPage";

import { useAuth } from "../context/AuthContext";
import LoginPage from "../features/auth/LoginPage";
import RegisterPage from "../features/auth/RegisterPage";

// ─── ProtectedRoute ───────────────────────────────────────────────────────────
// Redirects to /login if the user is not authenticated.
// Saves the attempted path so we can redirect back after login.
// Shows nothing while Firebase is checking auth state on startup.

function ProtectedRoute() {
  const { currentUser, loading } = useAuth();
  const location = useLocation();

  // Firebase is still checking — render nothing to avoid flash
  if (loading) return null;

  if (!currentUser) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  return <Outlet />;
}

// ─── PublicOnlyRoute ──────────────────────────────────────────────────────────
// Redirects already-logged-in users away from /login and /register.
// Prevents going back to login after you're already authenticated.

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
  // ── Public only routes (login / register) ──────────────────────────────────
  {
    element: <PublicOnlyRoute />,
    children: [
      {
        path: "/login",
        element: <LoginPage/>,
      },
      {
        path: "/register",
        element: <RegisterPage />,
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
        index: true,
        element: <OverviewPage />,
      },
      // Protected routes — require login
      {
        element: <ProtectedRoute />,
        children: [
          {
            path: "transactions",
            element: <TransactionsPage />,
          },
          {
            path: "investments",
            element: <InvestmentsPage />,
          },
          {
            path: "settings",
            element: <SettingsPage />,
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