import { Suspense } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { MainLayout } from "../features/layout/MainLayout";
import { NotFoundPage } from "../features/errors/NotFoundPage";
import { ErrorBoundary } from "../features/errors/ErrorBoundary";
// Route components and lazy page chunks live in their own modules so this file
// only exports `router` — otherwise React Fast Refresh can't hot-reload it.
import { NamesRedirect, PageLoader, ProtectedRoute, PublicOnlyRoute, SessionGate } from "./routeGuards";
import { AuthSkeleton } from "../features/auth/AuthSkeleton";
import { OverviewPage, TransactionsPage, TransactionsCalendarPage, NewTransactionPage, LedgerPage, NamesPage, LegalPage, AnalyticsPage, GoalsPage, SettingsPage, InvestmentsPage, BillsPage, IncomesPage, CalendarPage, PlannerPage, DebtsPage, DebtPersonPage, AccountsPage, BusinessPage, NewClosingPage, LoginPage, RegisterPage } from "./lazyRoutes";

export const router = createBrowserRouter([
  // Readable signed in or not: linked from the sign-in pages and the footer.
  {
    path: "/terms",
    element: (
      <Suspense fallback={<PageLoader />}>
        <LegalPage doc="terms" />
      </Suspense>
    ),
  },
  {
    path: "/privacy",
    element: (
      <Suspense fallback={<PageLoader />}>
        <LegalPage doc="privacy" />
      </Suspense>
    ),
  },
  {
    element: <PublicOnlyRoute />,
    children: [
      {
        path: "/login",
        element: (
          <Suspense fallback={<AuthSkeleton />}>
            <LoginPage />
          </Suspense>
        ),
      },
      {
        path: "/register",
        element: (
          <Suspense fallback={<AuthSkeleton />}>
            <RegisterPage />
          </Suspense>
        ),
      },
    ],
  },
  // Signed out, the session gate goes to /login before any of the app's frame is drawn.
  {
    element: <SessionGate />,
    children: [
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
                path: "transactions/new",
                element: (
                  <Suspense fallback={<PageLoader />}>
                    <NewTransactionPage />
                  </Suspense>
                ),
              },
              // The transactions calendar moved under «Ημερολόγιο» (owner,
              // 2026-11-19); its old address still lands on it.
              { path: "transactions/calendar", element: <Navigate to="/calendar/transactions" replace /> },
              {
                path: "transactions/ledger",
                element: (
                  <Suspense fallback={<PageLoader />}>
                    <LedgerPage />
                  </Suspense>
                ),
              },
              // «Δικαιούχοι & κατηγορίες» is its own menu entry now; the old
              // address — and its `?tab=` — lands on the right child page.
              { path: "transactions/names", element: <NamesRedirect /> },
              { path: "names", element: <Navigate to="/names/payees" replace /> },
              {
                path: "names/payees",
                element: (
                  <Suspense fallback={<PageLoader />}>
                    <NamesPage view="payees" />
                  </Suspense>
                ),
              },
              {
                path: "names/categories",
                element: (
                  <Suspense fallback={<PageLoader />}>
                    <NamesPage view="categories" />
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
                    <BillsPage view="overview" />
                  </Suspense>
                ),
              },
              {
                path: "bills/pay",
                element: (
                  <Suspense fallback={<PageLoader />}>
                    <BillsPage view="pay" />
                  </Suspense>
                ),
              },
              {
                path: "bills/manage",
                element: (
                  <Suspense fallback={<PageLoader />}>
                    <BillsPage view="manage" />
                  </Suspense>
                ),
              },
              {
                path: "bills/all",
                element: (
                  <Suspense fallback={<PageLoader />}>
                    <BillsPage view="all" />
                  </Suspense>
                ),
              },
              {
                path: "incomes",
                element: (
                  <Suspense fallback={<PageLoader />}>
                    <IncomesPage view="overview" />
                  </Suspense>
                ),
              },
              {
                path: "incomes/record",
                element: (
                  <Suspense fallback={<PageLoader />}>
                    <IncomesPage view="record" />
                  </Suspense>
                ),
              },
              {
                path: "incomes/manage",
                element: (
                  <Suspense fallback={<PageLoader />}>
                    <IncomesPage view="manage" />
                  </Suspense>
                ),
              },
              {
                path: "incomes/all",
                element: (
                  <Suspense fallback={<PageLoader />}>
                    <IncomesPage view="all" />
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
                path: "calendar",
                element: (
                  <Suspense fallback={<PageLoader />}>
                    <CalendarPage />
                  </Suspense>
                ),
              },
              {
                // «Ημερολόγιο συναλλαγών»: the records as a month's calendar —
                // a page under «Ημερολόγιο» (owner, 2026-11-19), still the
                // Transactions page in its calendar view, so the same chunk.
                path: "calendar/transactions",
                element: (
                  <Suspense fallback={<PageLoader />}>
                    <TransactionsCalendarPage />
                  </Suspense>
                ),
              },
              // The Allocation page became the Planner's limits; an old bookmark lands there.
              { path: "allocation", element: <Navigate to="/planner" replace /> },
              {
                path: "debts",
                element: (
                  <Suspense fallback={<PageLoader />}>
                    <DebtsPage />
                  </Suspense>
                ),
              },
              {
                // One person's debts, a page of its own (owner, 2026-11-17) —
                // `:key` is the name's compare key. Not in the menu: reached
                // from the list's rows; the same chunk as «Χρέη».
                path: "debts/person/:key",
                element: (
                  <Suspense fallback={<PageLoader />}>
                    <DebtPersonPage />
                  </Suspense>
                ),
              },
              {
                // One bank loan, by its id.
                path: "debts/loan/:id",
                element: (
                  <Suspense fallback={<PageLoader />}>
                    <DebtPersonPage />
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
                // Only when switched on in Settings (`useHasAccess("business")`):
                // otherwise the page answers as an address that is not there.
                path: "business",
                element: (
                  <Suspense fallback={<PageLoader />}>
                    <BusinessPage />
                  </Suspense>
                ),
              },
              {
                // «Οι δουλειές μου»: the businesses themselves, a page of their own
                // under «Δουλειά» (the same chunk). Old `/business?tab=businesses`
                // links are sent here by the main page.
                path: "business/manage",
                element: (
                  <Suspense fallback={<PageLoader />}>
                    <BusinessPage view="manage" />
                  </Suspense>
                ),
              },
              {
                // «Νέο κλείσιμο»: the closing wizard as a page, as /transactions/new
                // is for a transaction (the same chunk as «Δουλειά»).
                path: "business/new",
                element: (
                  <Suspense fallback={<PageLoader />}>
                    <NewClosingPage />
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
    ],
  },
]);
