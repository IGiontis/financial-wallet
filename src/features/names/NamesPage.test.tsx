import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import i18n from "../../i18n";
import { PageAddProvider } from "../../shared/components/PageAddProvider";
import { useCurrentPageAdd, usePageAdd } from "../../shared/hooks/usePageAdd";
import { NamesPage } from "./NamesPage";

// «Δικαιούχοι & κατηγορίες»: the two tabs and the address, the floating «+»
// following the tab, and the payee rename — the count the review states is
// the count handed to the write, a duplicate is refused, a similar name only
// suggested.

const state = vi.hoisted(() => ({
  transactions: [] as unknown[],
  payees: [] as string[],
  add: vi.fn(async (name: string) => void name),
  remove: vi.fn(async (name: string) => void name),
  rename: vi.fn(async (vars: unknown) => vars),
  bills: [] as unknown[],
  debts: [] as unknown[],
}));

vi.mock("../transactions/hooks/useTransactions", () => ({ useTransactions: () => ({ data: state.transactions, isSuccess: true }) }));
vi.mock("../transactions/hooks/usePayees", () => ({ usePayees: () => ({ payees: state.payees, isReady: true, add: state.add, remove: state.remove, rename: vi.fn() }) }));
vi.mock("../bills/useBills", () => ({ useBills: () => ({ data: state.bills, isSuccess: true }) }));
vi.mock("../debts/useDebts", () => ({ useDebts: () => ({ data: state.debts, isSuccess: true }) }));
vi.mock("./useNameActions", () => ({ useRenamePayee: () => ({ mutateAsync: state.rename, isPending: false }) }));
vi.mock("../../shared/hooks/useOfflineGuard", () => ({ useOfflineGuard: () => ({ locked: false, reason: undefined }) }));
// The categories tab has its own tests (CategoryManager.test.tsx); here it only
// has to register its add, as the real one does.
vi.mock("../categories/CategoryManager", () => ({
  default: function Categories() {
    usePageAdd("New category", () => {});
    return <p>categories tab</p>;
  },
}));

const tx = (id: string, description: string, extra: Record<string, unknown> = {}) => ({ id, description, date: new Date(2026, 9, Number(id) || 1), categoryId: "c", amount: 10, type: "expense", ...extra });

function Where() {
  const location = useLocation();
  return <output data-testid="where">{location.pathname + location.search}</output>;
}

function Fab() {
  const add = useCurrentPageAdd();
  return (
    <button type="button" data-testid="fab" onClick={() => add?.onAdd()}>
      {add?.label ?? "New transaction"}
    </button>
  );
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <PageAddProvider>
        <NamesPage />
        <Fab />
        <Where />
      </PageAddProvider>
    </MemoryRouter>,
  );

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  state.transactions = [
    tx("1", "Δώρο"),
    tx("2", "δωρο "),
    tx("3", "ΔΩΡΟ"),
    tx("4", "Lidl"),
    tx("5", "Doro"),
    tx("6", "Δώρο", { transferId: "x" }), // a transfer half: not a payee
    // Named after what they are linked to: never a payee, never renamed.
    tx("7", "Δώρο", { billId: "bill-1" }),
    tx("8", "Δώρο", { incomeId: "inc-1" }),
    tx("9", "Δώρο"), // a covered debt's expense (coveredExpenseId)
    tx("10", "Δώρο"), // an old bill payment's expense (payment.transactionId)
    tx("11", "Δώρο", { debtId: "d-1", debtPart: "interest" }),
  ];
  state.bills = [{ id: "bill-2", payments: [{ id: "p1", transactionId: "10" }] }];
  state.debts = [{ id: "d-2", forGoalId: "g", coveredExpenseId: "9", amount: 10, date: new Date(2026, 0, 1), label: "Δώρο" }];
  state.payees = ["Δώρο", "Lidl"];
  state.add.mockClear();
  state.remove.mockClear();
  state.rename.mockClear();
});

describe("the tabs", () => {
  it("opens on Payees, with the explanation, and keeps the tab in the address", async () => {
    const user = userEvent.setup();
    renderAt("/transactions/names");
    expect(screen.getByRole("tab", { name: "Payees" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/The person or shop you pay/)).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("/transactions/names");

    await user.click(screen.getByRole("tab", { name: "Categories" }));
    expect(screen.getByRole("tab", { name: "Categories" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("categories tab")).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("/transactions/names?tab=categories");
  });

  it("lands on the tab the address names (Settings links to ?tab=categories)", () => {
    renderAt("/transactions/names?tab=categories");
    expect(screen.getByRole("tab", { name: "Categories" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("categories tab");
  });

  it("moves between tabs with the arrow keys", async () => {
    const user = userEvent.setup();
    renderAt("/transactions/names");
    screen.getByRole("tab", { name: "Payees" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Categories" })).toHaveFocus();
    expect(screen.getByTestId("where")).toHaveTextContent("?tab=categories");
  });
});

describe("the floating «+»", () => {
  it("adds what the open tab lists", async () => {
    const user = userEvent.setup();
    renderAt("/transactions/names");
    expect(screen.getByTestId("fab")).toHaveTextContent("New payee");
    await user.click(screen.getByTestId("fab"));
    expect(within(screen.getByRole("dialog")).getByText("New payee")).toBeInTheDocument();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByRole("tab", { name: "Categories" }));
    expect(screen.getByTestId("fab")).toHaveTextContent("New category");
  });
});

describe("the payee list", () => {
  it("lists saved and used names once each, with how many records carry them", () => {
    renderAt("/transactions/names");
    const list = screen.getByRole("list", { name: "Payees" });
    const rows = within(list).getAllByRole("listitem").map((li) => li.textContent);
    // By hand: Δώρο ×3 (1, 2, 3 — the transfer half is not a payee), Doro ×1, Lidl ×1.
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r?.startsWith("Δώρο"))).toMatch(/3 transactions/);
    expect(rows.find((r) => r?.startsWith("Doro"))).toMatch(/1 transaction(?!s)/);
    expect(rows.find((r) => r?.startsWith("Lidl"))).toMatch(/1 transaction(?!s)/);
  });

  it("offers the Greeklish twin as a possible duplicate", () => {
    renderAt("/transactions/names");
    const box = screen.getByTestId("similar-pairs");
    expect(box).toHaveTextContent("Δώρο");
    expect(box).toHaveTextContent("Doro");
  });

  it("filters by the chips — each count is the cards it shows", async () => {
    const user = userEvent.setup();
    renderAt("/transactions/names");
    const chips = screen.getByRole("group", { name: "Which payees to show" });
    const cards = () => within(screen.getByRole("list", { name: "Payees" })).getAllByRole("listitem").map((li) => li.textContent ?? "");
    // By hand: all = Δώρο, Doro, Lidl; saved = Δώρο, Lidl; duplicates = the pair Δώρο · Doro.
    for (const [chip, names] of [
      [/^All 3$/, ["Δώρο", "Doro", "Lidl"]],
      [/^In suggestions 2$/, ["Δώρο", "Lidl"]],
      [/^Duplicates 2$/, ["Δώρο", "Doro"]],
    ] as const) {
      await user.click(within(chips).getByRole("button", { name: chip }));
      expect(within(chips).getByRole("button", { name: chip })).toHaveAttribute("aria-pressed", "true");
      const shown = cards();
      expect(shown).toHaveLength(names.length);
      for (const name of names) expect(shown.some((c) => c.startsWith(name))).toBe(true);
    }
    // Only a saved name carries the marker.
    await user.click(within(chips).getByRole("button", { name: /^All/ }));
    expect(cards().find((c) => c.startsWith("Doro"))).not.toMatch(/in suggestions/);
    expect(cards().find((c) => c.startsWith("Lidl"))).toMatch(/in suggestions/);
  });
});

describe("renaming a payee", () => {
  const openRename = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
    await user.click(screen.getByRole("button", { name: `Actions for “${name}”` }));
    await user.click(await screen.findByRole("menuitem", { name: "Rename" }));
    return screen.getByRole("dialog");
  };

  it("states how many records change, and hands exactly those to the write", async () => {
    const user = userEvent.setup();
    renderAt("/transactions/names");
    const dialog = await openRename(user, "Δώρο");
    const field = within(dialog).getByLabelText(/Payee/);
    expect(field).toHaveValue("Δώρο");
    await user.clear(field);
    await user.type(field, "Δώρα γενεθλίων");
    await user.click(within(dialog).getByRole("button", { name: /Next/ }));

    expect(within(dialog).getByTestId("payee-review-count")).toHaveTextContent("3 transactions will change.");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(state.rename).toHaveBeenCalledTimes(1);
    const vars = state.rename.mock.calls[0][0] as { ids: string[]; to: string; saved?: string[] };
    // The count shown (3) is the count written, and they are the right three.
    expect(vars.ids).toHaveLength(3);
    expect([...vars.ids].sort()).toEqual(["1", "2", "3"]);
    expect(vars.to).toBe("Δώρα γενεθλίων");
    expect(vars.saved).toEqual(["Δώρα γενεθλίων", "Lidl"]);
  });

  it("refuses a name that is already there, and offers the merge instead", async () => {
    const user = userEvent.setup();
    renderAt("/transactions/names");
    const dialog = await openRename(user, "Doro");
    const field = within(dialog).getByLabelText(/Payee/);
    await user.clear(field);
    await user.type(field, " ΔΩΡΟ ");
    expect(within(dialog).getByTestId("name-exists")).toHaveTextContent("Already exists: Δώρο");
    await user.click(within(dialog).getByRole("button", { name: /Next/ }));
    // Still on the name: refused.
    expect(within(dialog).queryByTestId("payee-review")).toBeNull();
    expect(state.rename).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Merge with “Δώρο”" }));
    await user.click(within(dialog).getByRole("button", { name: /Next/ }));
    expect(within(dialog).getByTestId("payee-review-count")).toHaveTextContent("1 transaction will change.");
    await user.click(within(dialog).getByRole("button", { name: "Merge" }));
    const vars = state.rename.mock.calls[0][0] as { ids: string[]; to: string; saved?: string[] };
    expect(vars).toMatchObject({ ids: ["5"], to: "Δώρο" });
    // «Doro» was never saved: the list is not rewritten.
    expect(vars.saved).toBeUndefined();
  });

  it("only suggests a similar name — Next still goes on with the name typed", async () => {
    const user = userEvent.setup();
    renderAt("/transactions/names");
    const dialog = await openRename(user, "Lidl");
    const field = within(dialog).getByLabelText(/Payee/);
    await user.clear(field);
    await user.type(field, "dwro");
    expect(within(dialog).getByTestId("name-similar")).toHaveTextContent(/Did you mean “(Doro|Δώρο)”\?/);
    await user.click(within(dialog).getByRole("button", { name: /Next/ }));
    expect(within(dialog).getByTestId("payee-review")).toHaveTextContent("«Lidl» → «dwro»");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(state.rename.mock.calls[0][0]).toMatchObject({ ids: ["4"], to: "dwro" });
  });
});

describe("adding a payee", () => {
  it("refuses a duplicate and saves a new one after the review", async () => {
    const user = userEvent.setup();
    renderAt("/transactions/names");
    await user.click(screen.getAllByRole("button", { name: "New payee" })[0]);
    const dialog = screen.getByRole("dialog");
    const field = within(dialog).getByLabelText(/Payee/);
    // Starts empty: placeholder only.
    expect(field).toHaveValue("");
    await user.type(field, "lidl");
    expect(within(dialog).getByTestId("name-exists")).toBeInTheDocument();
    await user.clear(field);
    await user.type(field, "Σκλαβενίτης");
    expect(within(dialog).queryByTestId("name-exists")).toBeNull();
    await user.click(within(dialog).getByRole("button", { name: /Next/ }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(state.add).toHaveBeenCalledWith("Σκλαβενίτης");
  });
});
