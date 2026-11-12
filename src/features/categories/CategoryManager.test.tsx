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
  merge: vi.fn(async (...args: unknown[]) => void args),
}));

vi.mock("../transactions/hooks/useTransactions", () => ({
  useCategories: () => ({ data: state.categories, isLoading: false }),
  useTransactions: () => ({ data: state.transactions, isSuccess: true }),
  useCreateCategoryScope: () => ({ isPending: false, mutate: vi.fn(), mutateAsync: state.create }),
  useUpdateCategoryGroup: () => ({ isPending: false, mutateAsync: state.update }),
  useDeleteCategoryGroup: () => ({ isPending: false, mutate: state.remove, mutateAsync: async (...args: unknown[]) => (state.remove(...(args as [never])), undefined) }),
}));
vi.mock("../bills/useBills", () => ({ useBills: () => ({ data: state.bills, isSuccess: true }) }));
vi.mock("../incomes/useIncomes", () => ({ useIncomeList: () => ({ incomes: state.incomes, isLoading: false }) }));
vi.mock("../../shared/hooks/useWorkspaceSetting", () => ({ useWorkspaceSetting: () => [state.lines, vi.fn()] }));
vi.mock("../../shared/hooks/useOfflineGuard", () => ({ useOfflineGuard: () => ({ locked: false, reason: undefined }) }));
vi.mock("../names/useNameActions", () => ({ useMergeCategories: () => ({ isPending: false, mutateAsync: state.merge }) }));

/** A row's action, through its ⋯ menu. */
const fromMenu = async (user: ReturnType<typeof userEvent.setup>, item: string | RegExp, row = "Betting") => {
  await user.click(screen.getByRole("button", { name: `Actions for “${row}”` }));
  await user.click(await screen.findByRole("menuitem", { name: item }));
};

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
  state.merge.mockClear();
});

describe("CategoryManager — widening", () => {
  it("offers Both for an expense-only category, not Income", async () => {
    const user = userEvent.setup();
    render(<CategoryManager />);
    await fromMenu(user, "Edit");
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Income" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Both" })).toBeEnabled();
  });

  it("widens by updating the existing half and creating only the income half", async () => {
    const user = userEvent.setup();
    render(<CategoryManager />);
    await fromMenu(user, "Edit");
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

  it("sends only the name and icon — an old document's stored payee/amount is neither shown nor written", async () => {
    // A category saved while «default payee / amount» existed still carries them.
    state.categories = [{ ...own("gym-x", "Gym", "expense"), defaultPayee: "FitZone", defaultAmount: 35 } as never];
    const user = userEvent.setup();
    render(<CategoryManager />);
    await fromMenu(user, "Edit", "Gym");
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByDisplayValue("FitZone")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Both" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(Object.keys((state.update.mock.calls[0][0] as { data: object }).data).sort()).toEqual(["icon", "name"]);
    expect(Object.keys(state.create.mock.calls[0][0] as object).sort()).toEqual(["icon", "name", "scope"]);
  });

  it("creates nothing when the scope stays as it was", async () => {
    const user = userEvent.setup();
    render(<CategoryManager />);
    await fromMenu(user, "Edit");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }));
    expect(state.update).toHaveBeenCalledTimes(1);
    expect(state.create).not.toHaveBeenCalled();
  });

  it("keeps a Both category both", async () => {
    state.categories = [own("bet-x", "Betting", "expense"), own("bet-i", "Betting", "income")];
    const user = userEvent.setup();
    render(<CategoryManager />);
    await fromMenu(user, "Edit");
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
    await fromMenu(user, "Delete");

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
    await fromMenu(user, "Delete");
    expect(screen.queryByTestId("category-in-use")).toBeNull();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(state.remove).toHaveBeenCalledTimes(1);
    expect(state.remove.mock.calls[0][0]).toEqual(["bet-x", "bet-i"]);
  });
});

const builtIn = (id: string, name: string, type: "income" | "expense"): Category => ({ id, name, type, userId: null, isDefault: true, icon: "☕" }) as unknown as Category;

describe("CategoryManager — the categories tab", () => {
  it("lists built-in and own ones with their transaction counts; only own ones have a menu", () => {
    state.categories = [own("kafes", "Kafes", "expense"), builtIn("coffee", "Coffee", "expense")];
    state.transactions = [{ id: "t1", categoryId: "kafes" }, { id: "t2", categoryId: "kafes" }, { id: "t3", categoryId: "coffee" }];
    render(<CategoryManager />);
    const list = screen.getByRole("list", { name: "Categories" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringMatching(/Coffee.*1 transaction(?!s).*built-in/), expect.stringMatching(/Kafes.*2 transactions/)]);
    expect(within(rows[0]).queryByRole("button", { name: /Actions for/ })).toBeNull();
    expect(within(rows[1]).getByRole("button", { name: "Actions for “Kafes”" })).toBeInTheDocument();
  });

  it("registers its add with the floating «+»", async () => {
    const { PageAddProvider } = await import("../../shared/components/PageAddProvider");
    const { useCurrentPageAdd } = await import("../../shared/hooks/usePageAdd");
    function Fab() {
      const add = useCurrentPageAdd();
      return (
        <button type="button" data-testid="fab" onClick={() => add?.onAdd()}>
          {add?.label}
        </button>
      );
    }
    const user = userEvent.setup();
    render(
      <PageAddProvider>
        <CategoryManager />
        <Fab />
      </PageAddProvider>,
    );
    expect(screen.getByTestId("fab")).toHaveTextContent("New category");
    await user.click(screen.getByTestId("fab"));
    expect(within(screen.getByRole("dialog")).getByText("New category")).toBeInTheDocument();
  });

  it("offers the Greeklish twin of a built-in as a merge, and says how many records move before merging", async () => {
    state.categories = [own("kafes", "Kafes", "expense"), builtIn("coffee", "Coffee", "expense")];
    state.transactions = [{ id: "t1", categoryId: "kafes" }, { id: "t2", categoryId: "kafes" }, { id: "t3", categoryId: "coffee" }];
    state.bills = [{ id: "b1", categoryId: "kafes" }];
    const user = userEvent.setup();
    render(<CategoryManager />);
    const box = screen.getByTestId("similar-pairs");
    await user.click(within(box).getByRole("button", { name: /Merge/ }));
    const dialog = screen.getByRole("dialog");
    // The own one goes into the built-in one, chosen up front.
    await user.click(within(dialog).getByRole("button", { name: /Next/ }));
    const review = within(dialog).getByTestId("category-merge-review");
    expect(review).toHaveTextContent("Kafes");
    expect(review).toHaveTextContent("2 transactions");
    expect(review).toHaveTextContent("1 bill");
    await user.click(within(dialog).getByRole("button", { name: "Merge" }));
    expect(state.merge).toHaveBeenCalledTimes(1);
    const plan = state.merge.mock.calls[0][0] as { transactions: { id: string; to: string }[]; bills: unknown[]; deleteIds: string[] };
    expect(plan.transactions).toEqual([
      { id: "t1", to: "coffee" },
      { id: "t2", to: "coffee" },
    ]);
    expect(plan.bills).toEqual([{ id: "b1", to: "coffee" }]);
    expect(plan.deleteIds).toEqual(["kafes"]);
  });

  it("new category: a similar name is suggested, never forced; the same name is refused", async () => {
    state.categories = [builtIn("coffee", "Coffee", "expense")];
    const user = userEvent.setup();
    render(<CategoryManager />);
    await user.click(screen.getByRole("button", { name: "New category" }));
    const dialog = screen.getByRole("dialog");
    const field = within(dialog).getByPlaceholderText("e.g. Car instalments");
    await user.type(field, "Cofee");
    expect(within(dialog).getByTestId("name-similar")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /Save|Create|Add/ })).toBeEnabled();
    await user.clear(field);
    await user.type(field, "coffee ");
    expect(within(dialog).queryByTestId("name-similar")).toBeNull();
    expect(within(dialog).getByText(/You already have this one/)).toBeInTheDocument();
  });
});
