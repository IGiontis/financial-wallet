import { describe, it, expect, vi } from "vitest";
import { Suspense, type ComponentType } from "react";
import { render, screen } from "@testing-library/react";

// The router's lazy pages must load through the SAME functions as the idle
// prefetch (pageChunks), or a prefetched chunk would be fetched twice. Every
// loader in the map is swapped for a spy; each page the router renders has to
// call the one for its chunk.
const loaded: string[] = [];
vi.mock("./pageChunks", async () => {
  const actual = await vi.importActual<typeof import("./pageChunks")>("./pageChunks");
  const Page = () => <p>page</p>;
  // A module where every export is a page — default or named.
  const module = new Proxy({}, { get: (_, key) => (key === "then" ? undefined : Page) });
  const pageChunks = Object.fromEntries(
    Object.keys(actual.pageChunks).map((key) => [key, () => (loaded.push(key), Promise.resolve(module))]),
  );
  return { ...actual, pageChunks };
});

const routes = await import("./lazyRoutes");

const expected: Record<string, string> = {
  OverviewPage: "overview",
  TransactionsPage: "transactions",
  // The same records as a calendar: the list's own chunk, in its other view.
  TransactionsCalendarPage: "transactions",
  NewTransactionPage: "newTransaction",
  LedgerPage: "ledger",
  NamesPage: "names",
  AnalyticsPage: "analytics",
  GoalsPage: "goals",
  SettingsPage: "settings",
  InvestmentsPage: "investments",
  BillsPage: "bills",
  IncomesPage: "incomes",
  CalendarPage: "calendar",
  PlannerPage: "planner",
  DebtsPage: "debts",
  AccountsPage: "accounts",
  BusinessPage: "business",
  LegalPage: "legal",
  LoginPage: "login",
  RegisterPage: "register",
};

describe("lazy pages", () => {
  it("names every page the router has", () => {
    expect(Object.keys(routes).sort()).toEqual(Object.keys(expected).sort());
  });

  it.each(Object.entries(expected))("%s loads through the shared chunk map (%s)", async (name, chunk) => {
    loaded.length = 0;
    const Page = (routes as unknown as Record<string, ComponentType<Record<string, unknown>>>)[name];
    render(
      <Suspense fallback={<p>waiting</p>}>
        <Page />
      </Suspense>,
    );
    expect(await screen.findByText("page")).toBeTruthy();
    expect(loaded).toEqual([chunk]);
  });
});
