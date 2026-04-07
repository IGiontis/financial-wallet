import { createBrowserRouter, Outlet } from "react-router-dom";
import { MainLayout } from "../features/layout/MainLayout";
import { OverviewPage } from "../features/overview/pages/OverviewPage";
import { TransactionsPage } from "../features/transactions/pages/TransactionPage";
import { SettingsPage } from "../features/settings/pages/SettingsPage";
import { NotFoundPage } from "../features/errors/NotFoundPage";
import { ErrorBoundary } from "../features/errors/ErrorBoundary";
import InvestmentsPage from "../features/budget/InvestmentsPage";

/**
 * Protected Route Component
 * Checks if user is authenticated before allowing access
 */
interface ProtectedRouteProps {
  redirectPath?: string;
  children?: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ redirectPath = "/login", children }) => {
  // TODO: Replace with your actual auth logic (Redux, Context, TanStack Query)

  // if (!isAuthenticated) {
  //   // Redirect to login with the attempted path saved
  //   return <Navigate to={redirectPath} replace state={{ from: location.pathname }} />;
  // }

  // If authenticated, render children or Outlet for nested routes
  return children ? <>{children}</> : <Outlet />;
};

/**
 * Application Router Configuration
 *
 * 2025/2026 Best Practices:
 *  Data Router (createBrowserRouter)
 *  Error boundaries at root and route level
 *  404 catch-all route
 *  Protected routes for authenticated areas
 *  Type-safe routes
 */
export const router = createBrowserRouter([
  {
    path: "/",
    element: <MainLayout />,
    errorElement: <ErrorBoundary />, // Root-level error boundary
    children: [
      {
        index: true,
        element: <OverviewPage />,
      },
      // Protected routes group
      {
        element: <ProtectedRoute />, // Wrapper for all protected routes
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
      // 404 Catch-all route (MUST be last)
      {
        path: "*",
        element: <NotFoundPage />,
      },
    ],
  },
  // Public routes (outside MainLayout if needed)
]);
