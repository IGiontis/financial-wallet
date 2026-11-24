import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import i18n from "../../../i18n";
import { TransactionsPage } from "./TransactionPage";
import type { Transaction } from "../../../shared/types/IndexTypes";
import { DEBT_CATEGORY_ID, DEBT_INTEREST_CATEGORY_ID } from "../../../shared/utils/categories";
import { dateFormat } from "../../../shared/utils/dates";

// A day of «Ημερολόγιο συναλλαγών» that moved borrowed money (owner,
// 2026-11-24, «option Γ»): the loan's row is neutral — no sign, no green,
// «δανεικά» beside its name — and the day's foot says TWO things, «Δικά σου»
// (the day's own money, with no borrowed part in it) and, under it, what the
// loan brought in or took out.
//
// November 2026, with today the 20th:
//   12th  Salary +1.200, Coffee −20          → one total, no borrowed line
//   17th  60 off a debt, 4 of interest       → own −4,00, 60,00 borrowed out
//   18th  Kostas lends 100                   → own 0,00, 100,00 borrowed in
//   19th  Kostas lends 100, Bread −45,50, Taxi −31,60 → own −77,10, 100,00 borrowed in
//
// The month's tiles, by hand: in 1.200,00; out 20 + 4 + 45,50 + 31,60 = 101,10.

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
vi.mock("../components/TransferSheet", () => ({ default: () => null }));
vi.mock("../hooks/usePayees", () => ({ usePayees: () => ({ payees: [], isReady: true, add: vi.fn(), rename: vi.fn(), remove: vi.fn() }) }));
vi.mock("../../../shared/hooks/useCurrencyConverter", () => ({ useCurrencyConverter: () => ({ format: (n: number) => `€${n.toFixed(2)}` }) }));
vi.mock("../../../shared/hooks/useOfflineGuard", () => ({ useOfflineGuard: () => ({ locked: false, reason: "" }) }));
vi.mock("../components/TransactionCalendar", () => ({ TransactionCalendar: () => null, MobileCalendar: () => null }));
vi.mock("../components/AddTransactionModal", () => ({ default: () => null }));
vi.mock("../components/EditTransactionModal", () => ({ default: () => null }));
vi.mock("../components/TransactionsViewModal", () => ({ default: () => null }));

const NOW = new Date(2026, 10, 20, 12);
const at = (day: number, hour = 12) => new Date(2026, 10, day, hour);
let n = 0;
const tx = (description: string, amount: number, date: Date, extra: Partial<Transaction> = {}): Transaction =>
  ({ id: `t${++n}`, userId: "u1", type: "expense", amount, categoryId: "food", description, date, createdAt: date, updatedAt: date, ...extra }) as Transaction;

const salary = tx("Salary", 1200, at(12, 9), { type: "income" });
const coffee = tx("Coffee", 20, at(12, 18));
// A debt's own cash records, with the ids and marks `debtCashRecords` writes.
const repaid = tx("Kostas", 60, at(17), { id: "debtpay_p1", debtId: "d1", debtPaymentId: "p1", debtPart: "principal", categoryId: DEBT_CATEGORY_ID });
const interest = tx("Kostas", 4, at(17, 13), { id: "debtint_p1", debtId: "d1", debtPaymentId: "p1", debtPart: "interest", categoryId: DEBT_INTEREST_CATEGORY_ID });
const loanAlone = tx("Kostas", 100, at(18), { id: "debt_d2", type: "income", debtId: "d2", debtPart: "loan", categoryId: DEBT_CATEGORY_ID });
const loanWithDay = tx("Kostas", 100, at(19, 8), { id: "debt_d3", type: "income", debtId: "d3", debtPart: "loan", categoryId: DEBT_CATEGORY_ID });
const bread = tx("Bread", 45.5, at(19, 10));
const taxi = tx("Taxi", 31.6, at(19, 20));

mocks.transactions = [salary, coffee, repaid, interest, loanAlone, loanWithDay, bread, taxi];

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
});

afterAll(() => {
  vi.useRealTimers();
});

const renderCalendar = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["debts", "u1"], []);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/calendar/transactions"]}>
        <Routes>
          <Route path="/calendar/transactions" element={<TransactionsPage view="calendar" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

const dayTitle = dateFormat("dayMonthWeekday", "en");
const dayButton = (day: number) => screen.getByRole("button", { name: new RegExp(`^${dayTitle.format(at(day))}( ·|$)`) });
const openDay = async (day: number) => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  await user.click(dayButton(day));
  return screen.getByRole("dialog");
};
const row = (dialog: HTMLElement, name: string) =>
  within(dialog)
    .getAllByRole("button")
    .find((b) => (b.textContent ?? "").includes(name))!;
const money = (n: number) => `€${n.toFixed(2)}`;

describe("a day that moved borrowed money", () => {
  it("shows the loan with no sign and «δανεικά», and the day's own money without it", async () => {
    renderCalendar();
    const dialog = await openDay(19);

    // The loan's row: the figure plain, no «+», the loan said in words.
    const loanRow = row(dialog, "Kostas");
    expect(loanRow).toHaveTextContent(money(100));
    expect(loanRow.textContent).not.toContain("+");
    expect(loanRow).toHaveTextContent(i18n.t("transactions.loanMark"));
    // The shopping keeps its sign.
    expect(row(dialog, "Bread").textContent).toContain("−");

    // Two totals, never one of both: the day's own, then the loan's.
    const own = within(dialog).getByText(i18n.t("transactions.calendar.ownNet")).parentElement!;
    // Worked out from the records, not from the figure on screen: −45,50 − 31,60.
    const byHand = -(bread.amount + taxi.amount);
    expect(byHand).toBe(-77.1);
    expect(own).toHaveTextContent(`−${money(Math.abs(byHand))}`);
    expect(within(dialog).getByText(i18n.t("transactions.calendar.borrowedIn", { amount: money(loanWithDay.amount) }))).toBeInTheDocument();
    // And the two are never added together.
    expect(within(dialog).queryByText(`+${money(100 - 77.1)}`)).toBeNull();
    expect(within(dialog).queryByText(`+${money(100)}`)).toBeNull();
  });

  it("the day's square says the same as its foot: nothing earned, −77,10 spent", async () => {
    renderCalendar();
    // The chip in the grid is the day's own money too — the 100 is in neither.
    const square = dayButton(19).textContent ?? "";
    expect(square).toContain("−");
    expect(square).not.toContain("+");
    // For a screen reader, the borrowed part is said and said as borrowed.
    expect(dayButton(19).getAttribute("aria-label")).toContain(i18n.t("transactions.calendar.borrowedIn", { amount: money(100) }));
  });

  it("a day whose only record is a loan: nothing of its own, and the loan said apart", async () => {
    renderCalendar();
    const dialog = await openDay(18);
    expect(row(dialog, "Kostas").textContent).not.toContain("+");
    expect(within(dialog).getByText(i18n.t("transactions.calendar.ownNet")).parentElement).toHaveTextContent(money(0));
    expect(within(dialog).getByText(i18n.t("transactions.calendar.borrowedIn", { amount: money(100) }))).toBeInTheDocument();
    // Nothing of a day's total that would read as 100 coming in.
    expect(within(dialog).queryByText(i18n.t("calendar.net"))).toBeNull();
    expect(dayButton(18).textContent).toBe("18");
  });

  it("a repayment day: the part off the debt goes out as borrowed, the interest as a real cost", async () => {
    renderCalendar();
    const dialog = await openDay(17);
    // By hand: the day's own money is the 4,00 of interest alone.
    expect(within(dialog).getByText(i18n.t("transactions.calendar.ownNet")).parentElement).toHaveTextContent(`−${money(interest.amount)}`);
    expect(within(dialog).getByText(i18n.t("transactions.calendar.borrowedOut", { amount: money(repaid.amount) }))).toBeInTheDocument();
    // The repayment's own row carries no sign; the interest's does.
    const rows = within(dialog)
      .getAllByRole("button")
      .filter((b) => (b.textContent ?? "").includes("Kostas"));
    expect(rows).toHaveLength(2);
    expect(rows.filter((b) => (b.textContent ?? "").includes("−"))).toHaveLength(1);
  });

  it("a day with no borrowed money keeps its one total, as before", async () => {
    renderCalendar();
    const dialog = await openDay(12);
    // 1.200 − 20 = 1.180,00, under the day's own words, with no second line.
    expect(within(dialog).getByText(i18n.t("calendar.net")).parentElement).toHaveTextContent(`+${money(salary.amount - coffee.amount)}`);
    expect(within(dialog).queryByText(i18n.t("transactions.calendar.ownNet"))).toBeNull();
    expect(within(dialog).queryByText(/Loan money/)).toBeNull();
  });

  it("the month's tiles leave every cent of it out", () => {
    renderCalendar();
    const tile = (label: string) => screen.getByText(label, { selector: "span" }).parentElement!;
    expect(within(tile(i18n.t("calendar.in"))).getByText(money(1200))).toBeInTheDocument();
    // 20 + 4 + 45,50 + 31,60 — the 100s borrowed and the 60 repaid are in neither.
    expect(within(tile(i18n.t("calendar.out"))).getByText(money(coffee.amount + interest.amount + bread.amount + taxi.amount))).toBeInTheDocument();
    expect(screen.queryByText(money(1400))).toBeNull();
    expect(screen.queryByText(money(161.1))).toBeNull();
  });
});
