import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../../i18n";
import { OverviewPage } from "./OverviewPage";
import { computeBillStatus } from "../../bills/billsUtils";
import { computeDebtStatus } from "../../debts/debtsUtils";
import type { Bill, Debt, Transaction } from "../../../shared/types/IndexTypes";

// The overview's four tabs, on the real page.
//
// Each tab restates figures other pages own, so each is checked against a
// second route: the balance less the bills before pay day, worked by hand; the
// position against what was put in; the month's two figures against the
// transactions themselves.

const NOW = new Date(2026, 8, 26, 12); // 26 September

const data = vi.hoisted(() => ({ transactions: [] as Transaction[], bills: [] as unknown[], debts: [] as unknown[] }));

// The chart is recharts, loaded lazily; what it draws is not what these check,
// and pulling it in slowed the next test past its timeout.
vi.mock("../components/CashFlowChart", () => ({ default: () => <div data-testid="cash-flow-chart" /> }));
vi.mock("../../transactions/hooks/useTransactions", () => ({
  useTransactions: () => ({ data: data.transactions, isLoading: false, isError: false }),
  useCategories: () => ({ data: [{ id: "shop", name: "Groceries", icon: "🛒", type: "expense" }] }),
}));
vi.mock("../../budget/useInvestments", () => ({ useInvestmentGoals: () => ({ data: [], isLoading: false }) }));
vi.mock("../../bills/useBills", () => ({ useBills: () => ({ data: data.bills }) }));
vi.mock("../../debts/useDebts", () => ({ useDebts: () => ({ data: data.debts }) }));
vi.mock("../../../shared/hooks/useSalary", () => ({ useSalary: () => ({ salary: { amount: 1700, dayOfMonth: 28, occurrences: 3 } }) }));
vi.mock("../../../shared/hooks/useOpeningBalance", () => ({ useOpeningBalance: () => ({ opening: undefined, isLoading: false }) }));
vi.mock("../../../shared/hooks/useCurrencyConverter", () => ({
  useCurrencyConverter: () => ({ format: (n: number) => `€${n.toFixed(2)}`, convert: (n: number) => n, baseCurrency: "EUR", displayCurrency: "EUR" }),
}));

const tx = (id: string, type: "income" | "expense", amount: number, date: Date): Transaction =>
  ({ id, userId: "u", type, amount, categoryId: "c", description: id, date, createdAt: date, updatedAt: date }) as unknown as Transaction;

const bill = (id: string, name: string, amount: number, dueDay: number) =>
  computeBillStatus({ id, userId: "u", name, amount, categoryId: "c", frequency: "monthly", dueDay, isActive: true, anchorDate: new Date(2026, 0, 1), createdAt: new Date(2026, 0, 1), updatedAt: new Date(2026, 0, 1) } as Bill, [], NOW);

const renderPage = () =>
  render(
    <MemoryRouter>
      <OverviewPage />
    </MemoryRouter>,
  );

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
});

afterAll(() => vi.useRealTimers());

beforeEach(() => {
  localStorage.removeItem("overview-tab");
  // August: 3000 in, 500 out. September so far: 150 in, 309,45 out. Balance 2340,55.
  data.transactions = [
    tx("salary-aug", "income", 3000, new Date(2026, 7, 28)),
    tx("rent-aug", "expense", 500, new Date(2026, 7, 2)),
    tx("gig", "income", 150, new Date(2026, 8, 12)),
    { ...tx("shop", "expense", 309.45, new Date(2026, 8, 14)), categoryId: "shop" } as Transaction,
  ];
  data.bills = [bill("water", "Water", 68.4, 20), bill("phone", "Phone", 25, 30)];
  data.debts = [
    computeDebtStatus({ id: "loan", userId: "u", person: "Nikos", direction: "owed_by_me", label: "Rent loan", amount: 300, date: new Date(2026, 5, 1), dueDate: new Date(2026, 8, 30), createdAt: new Date(2026, 5, 1), updatedAt: new Date(2026, 5, 1) } as Debt, [], NOW),
  ];
});

describe("the overview", () => {
  it("opens on Everything, with what wants doing above the tiles", () => {
    renderPage();

    expect(screen.getByRole("tab", { name: /Everything/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByRole("tab")[0]).toHaveTextContent("Everything");
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("Water")).toBeInTheDocument();
    expect(within(panel).getByText("Rent loan")).toBeInTheDocument();
  });

  it("shows this month on Today, and where it went adds up to what went out", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("tab", { name: /Today/ }));
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("Water")).toBeInTheDocument();
    expect(within(panel).getByText("🛒 Groceries")).toBeInTheDocument();
    // This month only: 150 in, 309,45 out — August does not count.
    expect(within(panel).getByText("€150.00")).toBeInTheDocument();
    // Twice: as what went out, and as the one category it all went on — the
    // two are counted the same way, so they have to agree.
    expect(within(panel).getAllByText("€309.45")).toHaveLength(2);
  });

  it("says what is left on pay day, then the timeline of the month", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("tab", { name: /The month/ }));

    const panel = screen.getByRole("tabpanel");
    // Second route: 3000 − 500 + 150 − 309,45 = 2340,55 in hand, less the
    // water (20th, unpaid) before pay on the 28th; the phone on the 30th is after.
    expect(3000 - 500 + 150 - 309.45 - 68.4).toBeCloseTo(2272.15, 2);
    expect(within(panel).getByText("€2272.15")).toBeInTheDocument();
    // The boxes first, the timeline of the month last.
    const text = panel.textContent ?? "";
    expect(text.indexOf("Came in")).toBeLessThan(text.lastIndexOf("Water"));
    expect(within(panel).queryByText("Total income")).not.toBeInTheDocument();
  });

  it("keeps the period dashboard, with its range picker and chart, in its own tab", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("tab", { name: /Flow/ }));

    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("Total income")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "This month" })).toBeInTheDocument();
  });

  it("shows the net position: cash less what is owed", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("tab", { name: /Position/ }));

    // 2340,55 cash − 300 owed = 2040,55.
    expect(within(screen.getByRole("tabpanel")).getAllByText("€2040.55").length).toBeGreaterThan(0);
  });

  it("links every tile to its page", async () => {
    renderPage();
    await userEvent.click(screen.getByRole("tab", { name: /Everything/ }));

    const hrefs = within(screen.getByRole("tabpanel"))
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining(["/bills", "/planner", "/transactions", "/debts", "/goals", "/analytics"]));
  });

  it("remembers the tab last chosen", async () => {
    const first = renderPage();
    await userEvent.click(screen.getByRole("tab", { name: /Position/ }));
    first.unmount();

    renderPage();
    expect(screen.getByRole("tab", { name: /Position/ })).toHaveAttribute("aria-selected", "true");
  });

  it("says all clear when nothing wants doing", async () => {
    data.bills = [];
    data.debts = [];
    renderPage();
    // On Everything the list simply is not there; Today says so in words.
    expect(screen.queryByText(/Needs you/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /Today/ }));

    expect(screen.getByText("All clear")).toBeInTheDocument();
  });
});
