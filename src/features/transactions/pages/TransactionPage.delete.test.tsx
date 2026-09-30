import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../../i18n";
import { TransactionsPage } from "./TransactionPage";
import type { Transaction } from "../../../shared/types/IndexTypes";

// What the Transactions screen lets you delete.
//
// A goal or investment deposit shows up here as a mirror of a contribution
// that lives on its goal. Deleting the mirror here left the contribution
// behind: the goal still said €500 saved, the balance no longer did. So the
// mirror is deleted from its goal, exactly as it is already edited there. A
// bill's expense can be deleted here, and the whole row goes to the delete so
// its payment goes with it.

const mocks = vi.hoisted(() => ({ transactions: [] as Transaction[], deleteMutate: vi.fn() }));

vi.mock("../hooks/useTransactions", () => ({
  useTransactions: () => ({ data: mocks.transactions, isLoading: false, isError: false }),
  useCategories: () => ({ data: [{ id: "food", name: "Groceries", icon: "🛒", type: "expense", isDefault: true, userId: null }], isLoading: false, isError: false }),
  useCreateTransaction: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateTransaction: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteTransaction: () => ({ mutate: mocks.deleteMutate, isPending: false }),
}));
vi.mock("../hooks/usePayees", () => ({ usePayees: () => ({ payees: [], isReady: true, add: vi.fn(), rename: vi.fn(), remove: vi.fn() }) }));
vi.mock("../../../shared/hooks/useCurrencyConverter", () => ({ useCurrencyConverter: () => ({ format: (n: number) => `€${n.toFixed(2)}` }) }));
vi.mock("../../../shared/hooks/useOfflineGuard", () => ({ useOfflineGuard: () => ({ locked: false, reason: "" }) }));
// The calendar, the modals and the insights are not what this checks.
vi.mock("../components/TransactionCalendar", () => ({ TransactionCalendar: () => null, MobileCalendar: () => null }));
vi.mock("../components/AddTransactionModal", () => ({ default: () => null }));
vi.mock("../components/EditTransactionModal", () => ({ default: () => null }));
vi.mock("../components/TransactionsViewModal", () => ({ default: () => null }));
vi.mock("../components/ManagePayeesModal", () => ({ default: () => null }));

const today = new Date();
const row = (id: string, description: string, extra: Partial<Transaction> = {}): Transaction =>
  ({ id, userId: "u1", amount: 10, type: "expense", categoryId: "food", date: today, description, createdAt: today, updatedAt: today, ...extra }) as Transaction;

const bread = row("t-bread", "Bread");
const power = row("t-power", "Power", { billId: "b1" });
const holiday = row("t-goal", "Holiday", { type: "investment", categoryId: "", isInvestmentTransaction: true, isGoalTransaction: true, goalId: "g1", contributionType: "deposit" });
const etf = row("t-etf", "ETF", { type: "investment", categoryId: "", isInvestmentTransaction: true, isGoalTransaction: false, goalId: "g2", contributionType: "deposit" });

beforeAll(async () => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  mocks.deleteMutate.mockClear();
  mocks.transactions = [bread, power, holiday, etf];
});

const renderPage = () =>
  render(
    <MemoryRouter>
      <TransactionsPage />
    </MemoryRouter>,
  );

/** The desktop table's delete button on the row showing this payee. */
const deleteButtonFor = (description: string) => {
  const tableRow = screen.getAllByRole("row").find((r) => within(r).queryByText(description));
  return within(tableRow!).getByTitle(i18n.t("common.delete"));
};

describe("deleting from the Transactions screen", () => {
  it("is disabled for goal and investment mirrors, like editing them", () => {
    renderPage();

    expect(deleteButtonFor("Holiday")).toBeDisabled();
    expect(deleteButtonFor("ETF")).toBeDisabled();
    expect(deleteButtonFor("Bread")).toBeEnabled();
    expect(deleteButtonFor("Power")).toBeEnabled();
  });

  it("is disabled for mirrors on the phone list too", () => {
    const { container } = renderPage();
    // The phone cards carry no title; they are the delete buttons that are not in the table.
    const table = container.querySelector("table")!;
    const cardButtons = [...container.querySelectorAll("button")].filter((b) => !table.contains(b) && b.querySelector("svg") && b.style.color === "var(--bs-danger)");

    expect(cardButtons).toHaveLength(4);
    expect(cardButtons.filter((b) => b.disabled)).toHaveLength(2);
  });

  it("hands the whole row to the delete, so a bill's payment goes with its expense", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(deleteButtonFor("Power"));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: i18n.t("common.delete") }));

    expect(mocks.deleteMutate).toHaveBeenCalledWith(expect.objectContaining({ id: "t-power", billId: "b1" }), expect.anything());
  });
});
