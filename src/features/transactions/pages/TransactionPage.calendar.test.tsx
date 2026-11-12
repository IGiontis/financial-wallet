import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "../../../i18n";
import { TransactionsPage } from "./TransactionPage";
import type { Transaction } from "../../../shared/types/IndexTypes";

// The Transactions page's «Ημερολόγιο» tab: the month's two tiles are the
// list's own totals for the same records, transfers and goal deposits left
// out of both; a tap on a day lists that day's records and nothing else, and
// a record opens in its read-only view; the open tab is in the address.

const mocks = vi.hoisted(() => ({ transactions: [] as Transaction[] }));

vi.mock("../../../shared/hooks/useAuth", () => ({ useAuth: () => ({ currentUser: { uid: "u1" } }) }));
vi.mock("../../../firebase/firestore", () => ({ getDebts: vi.fn(async () => []), getDebtPayments: vi.fn(async () => []) }));
vi.mock("../hooks/useTransactions", () => ({
  useTransactions: () => ({ data: mocks.transactions, isLoading: false, isError: false }),
  useCategories: () => ({ data: [{ id: "food", name: "Groceries", icon: "🛒", type: "expense", isDefault: true, userId: null }], isLoading: false, isError: false }),
  useCreateTransaction: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateTransaction: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteTransaction: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../hooks/useTransfers", () => ({ useDeleteTransfer: () => ({ mutate: vi.fn() }), useSaveTransfer: () => ({ mutate: vi.fn() }) }));
vi.mock("../components/TransferWizard", () => ({ default: () => null }));
vi.mock("../components/TransferSheet", () => ({ default: ({ out }: { out: Transaction }) => <div role="note">viewing transfer {out.description}</div> }));
vi.mock("../hooks/usePayees", () => ({ usePayees: () => ({ payees: [], isReady: true, add: vi.fn(), rename: vi.fn(), remove: vi.fn() }) }));
vi.mock("../../../shared/hooks/useCurrencyConverter", () => ({ useCurrencyConverter: () => ({ format: (n: number) => `€${n.toFixed(2)}` }) }));
vi.mock("../../../shared/hooks/useOfflineGuard", () => ({ useOfflineGuard: () => ({ locked: false, reason: "" }) }));
vi.mock("../components/TransactionCalendar", () => ({ TransactionCalendar: () => null, MobileCalendar: () => null }));
vi.mock("../components/AddTransactionModal", () => ({ default: () => null }));
vi.mock("../components/EditTransactionModal", () => ({ default: () => null }));
// The record's read-only view: what a tap on a record in a day must open.
vi.mock("../components/TransactionsViewModal", () => ({ default: ({ transaction }: { transaction: Transaction }) => <div role="note">viewing {transaction.description}</div> }));

// "Today" is 20 November 2026. The list's dates run from 1 January to today,
// and the only records in that stretch are November's — so the list's totals
// are November's, the same month the calendar opens on. Last year's rent sits
// outside both.
const NOW = new Date(2026, 10, 20, 12);
const at = (day: number, hour = 12) => new Date(2026, 10, day, hour);
let n = 0;
const tx = (description: string, amount: number, date: Date, extra: Partial<Transaction> = {}): Transaction =>
  ({ id: `t${++n}`, userId: "u1", type: "expense", amount, categoryId: "food", description, date, createdAt: date, updatedAt: date, ...extra }) as Transaction;

// By hand — in: 1.200 + 50 = 1.250,00; out: 45,50 + 20 = 65,50.
mocks.transactions = [
  tx("Salary", 1200, at(3, 9), { type: "income" }),
  tx("Bread", 45.5, at(3, 18)),
  tx("To savings", 300, at(5), { id: "xfer_tr1_out", transferId: "tr1", transferPart: "out", accountId: "a1" }),
  tx("To savings", 300, at(5), { id: "xfer_tr1_in", type: "income", transferId: "tr1", transferPart: "in", accountId: "a2" }),
  tx("Coffee", 20, at(10)),
  tx("Holiday", 100, at(10), { type: "investment", isInvestmentTransaction: true, isGoalTransaction: true, goalId: "g1", contributionType: "deposit" }),
  tx("Holiday back", 50, at(12), { type: "investment", isInvestmentTransaction: true, isGoalTransaction: true, goalId: "g1", contributionType: "withdrawal" }),
  tx("Old rent", 500, new Date(2025, 9, 28, 12)),
];

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
});

afterAll(() => {
  vi.useRealTimers();
});

function Where() {
  const location = useLocation();
  return <output data-testid="where">{`${location.pathname}${location.search}`}</output>;
}

const renderPage = (entry = "/transactions") => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["debts", "u1"], []);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/transactions/calendar" element={<TransactionsPage view="calendar" />} />
        </Routes>
        <Where />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const dayTitle = new Intl.DateTimeFormat("en", { weekday: "long", day: "numeric", month: "long" });
const dayButton = (day: number) => screen.getByRole("button", { name: new RegExp(`^${dayTitle.format(at(day))}( ·|$)`) });
const tile = (label: string) => screen.getByText(label, { selector: "span" }).parentElement!;

describe("Transactions — the calendar page", () => {
  it("shows the same month totals as the list, worked out by hand, with the transfer and the goal deposit left out", async () => {
    renderPage();
    // The list's own summary (desktop and phone both render here).
    expect(screen.getAllByText("€65.50").length).toBeGreaterThan(0);
    expect(screen.getAllByText("€1250.00").length).toBeGreaterThan(0);

    // The same records on their own page, «Ημερολόγιο συναλλαγών».
    cleanup();
    renderPage("/transactions/calendar");
    expect(within(tile(i18n.t("calendar.in"))).getByText("€1250.00")).toBeInTheDocument();
    expect(within(tile(i18n.t("calendar.out"))).getByText("€65.50")).toBeInTheDocument();
    // Nothing the 300 transfer or the 100 deposit would have made.
    expect(screen.queryByText("€1550.00")).not.toBeInTheDocument();
    expect(screen.queryByText("€365.50")).not.toBeInTheDocument();
    expect(screen.queryByText("€165.50")).not.toBeInTheDocument();
  });

  it("draws a transfer-only day with no figure, and lists the transfer once when tapped", async () => {
    const user = userEvent.setup();
    renderPage("/transactions/calendar");
    const fifth = dayButton(5);
    expect(fifth.textContent).toBe("5");
    await user.click(fifth);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByText("To savings")).toHaveLength(1);
  });

  it("a tap on a day lists exactly that day's records, and a record opens read-only", async () => {
    const user = userEvent.setup();
    renderPage("/transactions/calendar");
    // The 3rd nets +1.154,50: its chip says so.
    expect(dayButton(3).textContent).toContain("+");
    await user.click(dayButton(3));
    const dialog = screen.getByRole("dialog");
    const names = within(dialog)
      .getAllByRole("button")
      .map((b) => b.textContent ?? "")
      .filter((text) => /Salary|Bread|Coffee|Holiday|To savings|Old rent/.test(text));
    expect(names).toHaveLength(2);
    expect(names.some((t) => t.includes("Salary"))).toBe(true);
    expect(names.some((t) => t.includes("Bread"))).toBe(true);
    expect(within(dialog).getByText("+€1154.50")).toBeInTheDocument();

    await user.click(within(dialog).getByText("Bread"));
    expect(screen.getByRole("note")).toHaveTextContent("viewing Bread");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("is its own page, and an old «?tab=calendar» link lands on it", () => {
    renderPage("/transactions?tab=calendar&category=all");
    expect(screen.getByTestId("where").textContent).toBe("/transactions/calendar");
    expect(dayButton(3)).toBeInTheDocument();
    // No tabs left on either page: the menu is the way between them.
    expect(screen.queryByRole("tab")).toBeNull();
  });
});
