import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../../i18n";
import { GoalDeleteModal } from "./GoalDeleteModal";
import type { InvestmentGoalWithStats, Transaction } from "../../../shared/types/IndexTypes";

// Deleting a goal with money in it: what became of the money, then a check —
// card by card — then delete. The owner's case: 500 of the trip handed to
// Athanasia from Eurobank, 200 kept in his own bank (Revolut).

vi.mock("../../../shared/hooks/useOfflineGuard", () => ({ useOfflineGuard: () => ({ locked: false, reason: "" }) }));
vi.mock("../../../shared/hooks/useCurrencyConverter", () => ({ useCurrencyConverter: () => ({ format: (n: number) => `€${n.toFixed(2)}` }) }));
vi.mock("../../accounts/AccountPicker", () => ({
  default: ({ onChoose }: { onChoose: (id: string) => void }) => (
    <button type="button" onClick={() => onChoose("revolut")}>
      Revolut
    </button>
  ),
}));
const store = vi.hoisted(() => ({ transactions: [] as unknown[] }));
vi.mock("../../accounts/useMoneyAccounts", () => {
  const accounts = [
    { id: "eurobank", name: "Eurobank", kind: "bank", main: true },
    { id: "revolut", name: "Revolut", kind: "bank" },
  ];
  // Read before either deposit.
  const latest = { at: new Date(2026, 9, 14), checkIn: { id: "c", at: new Date(2026, 9, 14).toISOString(), amounts: { eurobank: 2000, revolut: 900 } } };
  return { useMoneyAccounts: () => ({ accounts, latest, transactions: store.transactions }) };
});
vi.mock("../../transactions/hooks/useTransactions", () => ({
  useCategories: () => ({ data: [{ id: "other", name: "Other Expense", type: "expense", icon: "🧾", isDefault: true, userId: null }] }),
  useCreateCategoryScope: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

const day = new Date(2026, 9, 15, 10);
const mirror = (id: string, amount: number, accountId: string, heldBy?: string) =>
  ({ id, userId: "u", type: "investment", amount, categoryId: "", description: "Trip", date: day, createdAt: day, updatedAt: day, isInvestmentTransaction: true, isGoalTransaction: true, goalId: "trip", goalName: "Trip", contributionType: "deposit", accountId, heldBy }) as Transaction;

const goal = (totalSaved: number) => ({ id: "trip", name: "Trip", icon: "✈️", totalSaved }) as unknown as InvestmentGoalWithStats;

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  store.transactions = [mirror("m1", 500, "eurobank", "Athanasia"), mirror("m2", 200, "revolut")];
});

const next = () => userEvent.click(screen.getByRole("button", { name: /Next/ }));
const check = () => screen.getByRole("group", { name: "What will happen" });

describe("deleting a goal", () => {
  it("with nothing in it, just asks to delete", async () => {
    store.transactions = [];
    const onConfirm = vi.fn();
    render(<GoalDeleteModal goal={goal(0)} isDeleting={false} onConfirm={onConfirm} onClose={() => {}} />);
    expect(screen.queryByRole("radio")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledWith({});
  });

  it("with money in it, says who holds what and waits for an answer", async () => {
    render(<GoalDeleteModal goal={goal(700)} isDeleting={false} onConfirm={vi.fn()} onClose={() => {}} />);
    expect(screen.getByText(/€500.00 held by Athanasia/)).toHaveTextContent("€200.00 in your bank");
    expect(screen.getAllByRole("radio").map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "false"]);
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    await next();
    expect(screen.getByText("Choose what became of the money")).toBeInTheDocument();
  });

  it("given up on: Athanasia gives back 500 into Eurobank, the 200 is freed — then delete", async () => {
    const onConfirm = vi.fn();
    render(<GoalDeleteModal goal={goal(700)} isDeleting={false} onConfirm={onConfirm} onClose={() => {}} />);
    await userEvent.click(screen.getByRole("radio", { name: /not doing it/ }));
    await next();
    expect(onConfirm).not.toHaveBeenCalled();

    expect(check()).toHaveTextContent("Athanasia gives back€500.00");
    // Eurobank went down 500 when it was handed over (2.000 → 1.500); it comes back.
    expect(check()).toHaveTextContent("€1500.00 → €2000.00");
    // Spendable: 2.400 in the banks, 200 of it set aside — plus the goal's 700.
    expect(check()).toHaveTextContent("€2200.00 → €2900.00");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledWith({});
  });

  it("done: Eurobank does not go down again; only Revolut's 200 leaves — then the closing records", async () => {
    const onConfirm = vi.fn();
    render(<GoalDeleteModal goal={goal(700)} isDeleting={false} onConfirm={onConfirm} onClose={() => {}} />);
    await userEvent.click(screen.getByRole("radio", { name: /money was spent/ }));
    await next();
    // A card is asked for the bank's part only.
    expect(screen.getByText("Choose the card it left")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Revolut" }));
    await next();

    expect(check()).toHaveTextContent("Athanasia already had it");
    expect(check()).toHaveTextContent("€900.00 → €700.00");
    expect(check()).toHaveTextContent("stays €2200.00");

    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete & record the expense" }));
    const { close } = onConfirm.mock.calls[0][0];
    const expenses = close.filter((r: { type: string }) => r.type === "expense");
    expect(expenses.map((e: { amount: number; accountId?: string }) => [e.amount, e.accountId])).toEqual([
      [500, "eurobank"],
      [200, "revolut"],
    ]);
  });
});
