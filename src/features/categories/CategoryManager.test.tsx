import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import CategoryManager from "./CategoryManager";
import type { Category } from "../../shared/types/IndexTypes";

// The two things the list does beyond listing: widening a one-sided category
// to «both» (the missing half created, the existing one only updated), and
// refusing to delete one that records still use — counted from what the app
// already holds, named by kind.

const own = (id: string, name: string, type: "income" | "expense"): Category => ({ id, name, type, userId: "u1", isDefault: false, icon: "🎲" }) as Category;

const state = vi.hoisted(() => ({
  categories: [] as unknown[],
  transactions: [] as unknown[],
  bills: [] as unknown[],
  incomes: [] as unknown[],
  lines: [] as unknown[],
  update: vi.fn(async (...args: unknown[]) => void args),
  create: vi.fn(async (...args: unknown[]) => ({ args })),
  remove: vi.fn(),
}));

vi.mock("../transactions/hooks/useTransactions", () => ({
  useCategories: () => ({ data: state.categories, isLoading: false }),
  useTransactions: () => ({ data: state.transactions, isSuccess: true }),
  useCreateCategoryScope: () => ({ isPending: false, mutate: vi.fn(), mutateAsync: state.create }),
  useUpdateCategoryGroup: () => ({ isPending: false, mutateAsync: state.update }),
  useDeleteCategoryGroup: () => ({ isPending: false, mutate: state.remove }),
}));
vi.mock("../bills/useBills", () => ({ useBills: () => ({ data: state.bills, isSuccess: true }) }));
vi.mock("../incomes/useIncomes", () => ({ useIncomeList: () => ({ incomes: state.incomes, isLoading: false }) }));
vi.mock("../../shared/hooks/useWorkspaceSetting", () => ({ useWorkspaceSetting: () => [state.lines, vi.fn()] }));
vi.mock("../../shared/hooks/useOfflineGuard", () => ({ useOfflineGuard: () => ({ locked: false, reason: undefined }) }));

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  state.categories = [own("bet-x", "Betting", "expense")];
  state.transactions = [];
  state.bills = [];
  state.incomes = [];
  state.lines = [];
  state.update.mockClear();
  state.create.mockClear();
  state.remove.mockClear();
});

describe("CategoryManager — widening", () => {
  it("offers Both for an expense-only category, not Income", async () => {
    const user = userEvent.setup();
    render(<CategoryManager />);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Income" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Both" })).toBeEnabled();
  });

  it("widens by updating the existing half and creating only the income half", async () => {
    const user = userEvent.setup();
    render(<CategoryManager />);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Both" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(state.update).toHaveBeenCalledTimes(1);
    expect(state.update.mock.calls[0][0]).toMatchObject({ categoryIds: ["bet-x"], data: { name: "Betting", icon: "🎲" } });
    expect(state.create).toHaveBeenCalledTimes(1);
    expect(state.create.mock.calls[0][0]).toMatchObject({ name: "Betting", icon: "🎲", scope: "income" });
    // Updated before the new half exists, so a failure cannot leave two names.
    expect(state.update.mock.invocationCallOrder[0]).toBeLessThan(state.create.mock.invocationCallOrder[0]);
  });

  it("gives the new half no payee or amount of the old one's to prefill", async () => {
    state.categories = [{ ...own("gym-x", "Gym", "expense"), defaultPayee: "FitZone", defaultAmount: 35 }];
    const user = userEvent.setup();
    render(<CategoryManager />);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Both" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    // The expense half keeps its defaults…
    expect(state.update.mock.calls[0][0]).toMatchObject({ data: { defaultPayee: "FitZone", defaultAmount: 35 } });
    // …the income half is created without them.
    const created = state.create.mock.calls[0][0] as Record<string, unknown>;
    expect(created).toMatchObject({ name: "Gym", scope: "income" });
    expect(created).not.toHaveProperty("defaultPayee");
    expect(created).not.toHaveProperty("defaultAmount");
  });

  it("creates nothing when the scope stays as it was", async () => {
    const user = userEvent.setup();
    render(<CategoryManager />);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }));
    expect(state.update).toHaveBeenCalledTimes(1);
    expect(state.create).not.toHaveBeenCalled();
  });

  it("keeps a Both category both", async () => {
    state.categories = [own("bet-x", "Betting", "expense"), own("bet-i", "Betting", "income")];
    const user = userEvent.setup();
    render(<CategoryManager />);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Income" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Expense" })).toBeDisabled();
  });
});

describe("CategoryManager — deleting", () => {
  it("blocks a category still in use, naming each kind with its count", async () => {
    state.categories = [own("bet-x", "Betting", "expense"), own("bet-i", "Betting", "income")];
    state.transactions = [{ categoryId: "bet-x" }, { categoryId: "bet-i" }, { categoryId: "other" }];
    state.bills = [{ categoryId: "bet-x" }];
    state.incomes = [{ categoryId: "bet-i" }];
    state.lines = [{ id: "l1", label: "Fun", amount: 50, kind: "expense", categoryIds: ["bet-x", "bet-i"] }];
    const user = userEvent.setup();
    render(<CategoryManager />);
    await user.click(screen.getByRole("button", { name: /delete/i }));

    const blocked = screen.getByTestId("category-in-use");
    expect(blocked).toHaveTextContent("2 transactions");
    expect(blocked).toHaveTextContent("1 bill");
    expect(blocked).toHaveTextContent("1 income");
    expect(blocked).toHaveTextContent("1 Planner line");
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "Delete" })).toBeNull();
    expect(state.remove).not.toHaveBeenCalled();
  });

  it("deletes an unused category after the confirm, both halves together", async () => {
    state.categories = [own("bet-x", "Betting", "expense"), own("bet-i", "Betting", "income")];
    state.transactions = [{ categoryId: "other" }];
    const user = userEvent.setup();
    render(<CategoryManager />);
    await user.click(screen.getByRole("button", { name: /delete/i }));
    expect(screen.queryByTestId("category-in-use")).toBeNull();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(state.remove).toHaveBeenCalledTimes(1);
    expect(state.remove.mock.calls[0][0]).toEqual(["bet-x", "bet-i"]);
  });
});
