import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

const mocks = vi.hoisted(() => ({ transactions: [] as Transaction[], deleteMutate: vi.fn(), deleteTransfer: vi.fn() }));

// What the screen says after a delete — success only when it went, once.
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock("react-toastify", async (original) => ({ ...(await original<typeof import("react-toastify")>()), toast: toasts }));
vi.mock("../../../shared/hooks/useAuth", () => ({ useAuth: () => ({ currentUser: { uid: "u1" } }) }));
// Never reached: the debts are put in the cache below, as the Overview leaves them.
vi.mock("../../../firebase/firestore", () => ({ getDebts: vi.fn(async () => { throw new Error("no read expected"); }), getDebtPayments: vi.fn(async () => []) }));

vi.mock("../hooks/useTransactions", () => ({
  useTransactions: () => ({ data: mocks.transactions, isLoading: false, isError: false }),
  useCategories: () => ({ data: [{ id: "food", name: "Groceries", icon: "🛒", type: "expense", isDefault: true, userId: null }], isLoading: false, isError: false }),
  useCreateTransaction: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateTransaction: () => ({ mutate: vi.fn(), isPending: false }),
  // The screen waits for the delete's answer (`mutateAsync`); the spy hears what is sent.
  useDeleteTransaction: () => ({ mutate: mocks.deleteMutate, mutateAsync: async (row: unknown) => mocks.deleteMutate(row), isPending: false }),
}));
vi.mock("../hooks/useTransfers", () => ({ useDeleteTransfer: () => ({ mutate: mocks.deleteTransfer, mutateAsync: async (id: string) => mocks.deleteTransfer(id) }), useSaveTransfer: () => ({ mutate: vi.fn() }) }));
vi.mock("../components/TransferWizard", () => ({ default: () => null }));
vi.mock("../components/TransferSheet", () => ({ default: () => null }));
vi.mock("../hooks/usePayees", () => ({ usePayees: () => ({ payees: [], isReady: true, add: vi.fn(), rename: vi.fn(), remove: vi.fn() }) }));
vi.mock("../../../shared/hooks/useCurrencyConverter", () => ({ useCurrencyConverter: () => ({ format: (n: number) => `€${n.toFixed(2)}` }) }));
vi.mock("../../../shared/hooks/useOfflineGuard", () => ({ useOfflineGuard: () => ({ locked: false, reason: "" }) }));
// The calendar, the modals and the insights are not what this checks.
vi.mock("../components/TransactionCalendar", () => ({ TransactionCalendar: () => null, MobileCalendar: () => null }));
vi.mock("../components/AddTransactionModal", () => ({ default: () => null }));
vi.mock("../components/EditTransactionModal", () => ({ default: () => null }));
vi.mock("../components/TransactionsViewModal", () => ({ default: () => null }));

const today = new Date();
const row = (id: string, description: string, extra: Partial<Transaction> = {}): Transaction =>
  ({ id, userId: "u1", amount: 10, type: "expense", categoryId: "food", date: today, description, createdAt: today, updatedAt: today, ...extra }) as Transaction;

const bread = row("t-bread", "Bread");
const power = row("t-power", "Power", { billId: "b1" });
const holiday = row("t-goal", "Holiday", { type: "investment", categoryId: "", isInvestmentTransaction: true, isGoalTransaction: true, goalId: "g1", contributionType: "deposit" });
const etf = row("t-etf", "ETF", { type: "investment", categoryId: "", isInvestmentTransaction: true, isGoalTransaction: false, goalId: "g2", contributionType: "deposit" });
// What Nikos paid toward the ski trip: an expense the debt names.
const ski = row("t-ski", "Ski trip", { amount: 550 });
// A loan's cash, and one half of a transfer (the list shows one row per transfer).
const loanCash = row("t-loan", "Loan from Maria", { type: "income", debtId: "d-maria" });
const move = row("xfer_tr1_out", "To savings", { transferId: "tr1", transferPart: "out", accountId: "a1" });
const moveIn = row("xfer_tr1_in", "To savings", { type: "income", transferId: "tr1", transferPart: "in", accountId: "a2" });
// What is left of a transfer whose other half was deleted alone, before rows were locked.
const orphan = row("xfer_tr9_out", "Old move", { transferId: "tr9", transferPart: "out", accountId: "a1" });
const debts = [
  { id: "d-nikos", person: "Nikos", direction: "owed_by_me", amount: 550, date: today, forGoalId: "g1", coveredExpenseId: "t-ski", userId: "u1" },
  { id: "d-maria", person: "Maria", direction: "owed_by_me", amount: 200, date: today, userId: "u1" },
];

beforeAll(async () => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  mocks.deleteMutate.mockReset();
  mocks.deleteTransfer.mockReset();
  toasts.success.mockClear();
  toasts.error.mockClear();
  mocks.transactions = [bread, power, holiday, etf];
});

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["debts", "u1"], debts);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

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

  it("keeps the phone's cards free of buttons: they open the record, where Delete is", () => {
    const { container } = renderPage();
    const table = container.querySelector("table")!;
    const outside = [...container.querySelectorAll("button")].filter((b) => !table.contains(b));
    expect(outside.filter((b) => b.getAttribute("aria-label") === "Delete")).toHaveLength(0);
    // One card per record, each a button that opens it.
    expect(outside.filter((b) => ["Bread", "Power", "Holiday", "ETF"].some((name) => b.textContent?.includes(name)))).toHaveLength(4);
  });

  it("hands the whole row to the delete, so a bill's payment goes with its expense", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(deleteButtonFor("Power"));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: i18n.t("common.delete") }));

    expect(mocks.deleteMutate).toHaveBeenCalledWith(expect.objectContaining({ id: "t-power", billId: "b1" }));
  });

  // The owner's report (2026-11-12, on Goals): a second press while the delete
  // ran, and an error for a record that was gone. «An action waits for its answer».
  it("pressed twice while it runs: one delete, the dialog locked meanwhile, one success and no error", async () => {
    let answer!: () => void;
    mocks.deleteMutate.mockImplementation(() => new Promise<void>((resolve) => (answer = resolve)));
    const user = userEvent.setup();
    renderPage();

    await user.click(deleteButtonFor("Bread"));
    const dialog = screen.getByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: i18n.t("common.delete") });
    act(() => {
      fireEvent.click(confirm);
      fireEvent.click(confirm);
    });
    expect(mocks.deleteMutate).toHaveBeenCalledOnce();
    expect(within(dialog).getByRole("button", { name: i18n.t("common.deleting") })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: i18n.t("common.cancel") })).toBeDisabled();

    await act(async () => answer());
    expect(mocks.deleteMutate).toHaveBeenCalledOnce();
    expect(toasts.success).toHaveBeenCalledOnce();
    expect(toasts.success).toHaveBeenCalledWith(i18n.t("transactions.deleteSuccess"));
    expect(toasts.error).not.toHaveBeenCalled();
  });

  it("refused: says it did not delete, and leaves the record and its dialog as they were", async () => {
    mocks.deleteMutate.mockRejectedValue(Object.assign(new Error("PERMISSION_DENIED"), { code: "permission-denied" }));
    const user = userEvent.setup();
    renderPage();

    await user.click(deleteButtonFor("Bread"));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: i18n.t("common.delete") }));

    await vi.waitFor(() => expect(toasts.error).toHaveBeenCalledWith(i18n.t("transactions.deleteFailed")));
    expect(toasts.success).not.toHaveBeenCalled();
    // Still there, and still asking — free to try again.
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: i18n.t("common.delete") })).toBeEnabled();
    expect(deleteButtonFor("Bread")).toBeInTheDocument();
  });
});

describe("half of a linked set, on the Transactions screen", () => {
  beforeEach(() => {
    mocks.transactions = [bread, ski, loanCash, move, moveIn, orphan];
  });

  /** The desktop table's edit button on the row showing this payee. */
  const editButtonFor = (description: string) => {
    const tableRow = screen.getAllByRole("row").find((r) => within(r).queryByText(description));
    return within(tableRow!).getAllByRole("button").find((b) => b.querySelector("svg") && !b.getAttribute("aria-label")?.includes("Delete"))!;
  };
  const rowOf = (description: string) => screen.getAllByRole("row").find((r) => within(r).queryByText(description))!;

  it("won't delete a goal's covered expense alone, but leaves it open to edit", () => {
    renderPage();
    const del = within(rowOf("Ski trip")).getByRole("button", { name: /^delete/i });
    expect(del).toBeDisabled();
    expect(del).toHaveAttribute("title", i18n.t("transactions.lockFromDebts"));
    expect(editButtonFor("Ski trip")).toBeEnabled();
    // An ordinary expense beside it is untouched.
    expect(within(rowOf("Bread")).getByRole("button", { name: /^delete/i })).toBeEnabled();
  });

  it("locks a loan's cash both ways, as before", () => {
    renderPage();
    expect(within(rowOf("Loan from Maria")).getByRole("button", { name: /^delete/i })).toBeDisabled();
    expect(editButtonFor("Loan from Maria")).toBeDisabled();
  });

  it("deletes a transfer as its pair, after asking, never one half through the plain delete", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(within(rowOf("To savings")).getByRole("button", { name: /^delete/i }));
    // The button's own "are you sure", then both halves by their transfer id.
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: i18n.t("common.delete") }));

    expect(mocks.deleteTransfer).toHaveBeenCalledWith("tr1");
    expect(mocks.deleteMutate).not.toHaveBeenCalled();
  });

  it("deletes what is left of a broken transfer as the one record it is — the pair's batch would be refused", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(within(rowOf("Old move")).getByRole("button", { name: /^delete/i }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: i18n.t("common.delete") }));

    expect(mocks.deleteTransfer).not.toHaveBeenCalled();
    expect(mocks.deleteMutate).toHaveBeenCalledWith(expect.objectContaining({ id: "xfer_tr9_out" }));
  });

  it("won't correct a broken transfer as a pair, and says why", () => {
    renderPage();
    const edit = editButtonFor("Old move");
    expect(edit).toBeDisabled();
    expect(edit).toHaveAttribute("title", i18n.t("transactions.transfer.orphan"));
    // A whole pair is still corrected as one.
    expect(editButtonFor("To savings")).toBeEnabled();
  });
});
