import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../../i18n";
import { GoalDeleteModal } from "./GoalDeleteModal";
import type { InvestmentGoalWithStats } from "../../../shared/types/IndexTypes";

// Deleting a goal with money in it asks what became of the money: given up on
// (back to spendable) or spent (an expense, off a card). Nothing chosen for you.

vi.mock("../../../shared/hooks/useOfflineGuard", () => ({ useOfflineGuard: () => ({ locked: false, reason: "" }) }));
vi.mock("../../../shared/hooks/useCurrencyConverter", () => ({ useCurrencyConverter: () => ({ format: (n: number) => `€${n.toFixed(2)}` }) }));
vi.mock("../../accounts/AccountPicker", () => ({
  default: ({ onChoose }: { onChoose: (id: string) => void }) => (
    <button type="button" onClick={() => onChoose("eurobank")}>
      Eurobank
    </button>
  ),
}));
vi.mock("../../accounts/useMoneyAccounts", () => {
  const accounts = [{ id: "eurobank", name: "Eurobank", kind: "bank", main: true }];
  const latest = { at: new Date(2026, 9, 14), checkIn: { id: "c", at: new Date(2026, 9, 14).toISOString(), amounts: { eurobank: 1500 } } };
  return { useMoneyAccounts: () => ({ accounts, latest, transactions: [] }) };
});
vi.mock("../../transactions/hooks/useTransactions", () => ({
  useCategories: () => ({ data: [{ id: "other", name: "Other Expense", type: "expense", icon: "🧾", isDefault: true, userId: null }] }),
  useCreateCategoryScope: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

const goal = (totalSaved: number) => ({ id: "trip", name: "Trip", icon: "✈️", totalSaved }) as unknown as InvestmentGoalWithStats;

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("deleting a goal", () => {
  it("with nothing in it, just asks to delete", async () => {
    const onConfirm = vi.fn();
    render(<GoalDeleteModal goal={goal(0)} isDeleting={false} onConfirm={onConfirm} onClose={() => {}} />);
    expect(screen.queryByRole("radio")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledWith({});
  });

  it("with money in it, waits for an answer before it will go on", async () => {
    render(<GoalDeleteModal goal={goal(500)} isDeleting={false} onConfirm={vi.fn()} onClose={() => {}} />);
    expect(screen.getByText("What became of the goal's €500.00?")).toBeInTheDocument();
    expect(screen.getAllByRole("radio").map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "false"]);
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(screen.getByText("Choose what became of the money")).toBeInTheDocument();
  });

  it("given up on: a check first — the money back to spendable, the cards unchanged — then delete", async () => {
    const onConfirm = vi.fn();
    render(<GoalDeleteModal goal={goal(500)} isDeleting={false} onConfirm={onConfirm} onClose={() => {}} />);
    await userEvent.click(screen.getByRole("radio", { name: /not doing it/ }));
    await userEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(onConfirm).not.toHaveBeenCalled();

    const check = screen.getByRole("group", { name: "What will happen" });
    // Spendable: 1.500 in the bank, nothing in goals in these records — plus the 500.
    expect(check).toHaveTextContent("€1500.00 → €2000.00");
    expect(check).toHaveTextContent("unchanged");
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledWith({});
  });

  it("spent: no card assumed; the check shows the expense and the card going down", async () => {
    const onConfirm = vi.fn();
    render(<GoalDeleteModal goal={goal(500)} isDeleting={false} onConfirm={onConfirm} onClose={() => {}} />);
    await userEvent.click(screen.getByRole("radio", { name: /money was spent/ }));
    await userEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(screen.getByText("Choose the card it left")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Eurobank" }));
    await userEvent.click(screen.getByRole("button", { name: /Next/ }));
    const check = screen.getByRole("group", { name: "What will happen" });
    expect(check).toHaveTextContent("−€500.00 · Other Expense");
    expect(check).toHaveTextContent("€1500.00 → €1000.00");

    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete & record the expense" }));
    expect(onConfirm).toHaveBeenCalledWith({ spent: { accountId: "eurobank", categoryId: "other" } });
  });
});
