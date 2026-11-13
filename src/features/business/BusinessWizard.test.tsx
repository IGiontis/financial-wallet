import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import BusinessWizard from "./BusinessWizard";
import type { Business } from "../../shared/types/IndexTypes";

// A business always keeps at least one income line (DECISIONS, 2026-11-12):
// the first income row has no ✕, a new business cannot be saved without one
// income line's name, and expense lines may be none. A day can still bring in
// 0 € on that line — the closing counts an empty field as 0, as before.

const store = vi.hoisted(() => ({ businesses: [] as Business[] }));

vi.mock("./useBusiness", () => ({
  useBusinesses: () => [
    store.businesses,
    (next: Business[] | ((previous: Business[]) => Business[])) => {
      store.businesses = typeof next === "function" ? next(store.businesses) : next;
    },
  ],
  newBusinessId: () => "biz-new",
  newLineId: (() => {
    let n = 0;
    return () => `line-${++n}`;
  })(),
}));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

beforeEach(() => {
  store.businesses = [];
});

const next = () => userEvent.click(screen.getByRole("button", { name: /^Next/ }));
const current = () => document.querySelector("[aria-current=step]")?.textContent;
const removeButtons = () => screen.queryAllByRole("button", { name: /^Remove line/ });

async function toIncomes() {
  await userEvent.type(screen.getByRole("textbox", { name: /Name/ }), "Kiosk");
  await next();
  expect(current()).toMatch(/Income/);
}

describe("a new business — its income lines", () => {
  it("starts with one income row that has no ✕; a second row has one, the first still none", async () => {
    render(<BusinessWizard entries={[]} entriesLoaded onClose={() => {}} />);
    await toIncomes();
    expect(screen.getByRole("textbox", { name: "Income line 1" })).toBeInTheDocument();
    expect(removeButtons()).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: /income line/ }));
    expect(screen.getByRole("textbox", { name: "Income line 2" })).toBeInTheDocument();
    expect(removeButtons().map((b) => b.getAttribute("aria-label"))).toEqual(["Remove line 2"]);

    // Taking the second off leaves the first, still with no way to take it off.
    await userEvent.click(removeButtons()[0]);
    expect(screen.queryByRole("textbox", { name: "Income line 2" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Income line 1" })).toBeInTheDocument();
    expect(removeButtons()).toEqual([]);
  });

  it("does not go on without an income line's name, and says why", async () => {
    render(<BusinessWizard entries={[]} entriesLoaded onClose={() => {}} />);
    await toIncomes();
    await next();
    expect(current()).toMatch(/Income/);
    expect(screen.getByText("Add at least one income line.")).toBeInTheDocument();
    // The review cannot be reached past it either.
    await userEvent.click(screen.getByRole("button", { name: /Check/ }));
    expect(current()).toMatch(/Income/);
  });

  it("saves with one income line and no expense lines at all", async () => {
    const onClose = vi.fn();
    render(<BusinessWizard entries={[]} entriesLoaded onClose={onClose} />);
    await toIncomes();
    await userEvent.type(screen.getByRole("textbox", { name: "Income line 1" }), "Till");
    await next();
    expect(current()).toMatch(/Expenses/);
    // Expense rows: every one can go, the first included.
    expect(removeButtons().map((b) => b.getAttribute("aria-label"))).toEqual(["Remove line 1"]);
    await userEvent.click(removeButtons()[0]);
    await next();
    expect(current()).toMatch(/Check/);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(store.businesses).toEqual([{ id: "biz-new", name: "Kiosk", incomeLines: [{ id: expect.any(String), name: "Till" }], expenseLines: [] }]);
    expect(onClose).toHaveBeenCalled();
  });
});

describe("changing a business", () => {
  const kiosk: Business = { id: "biz-k", name: "Kiosk", incomeLines: [{ id: "till", name: "Till" }, { id: "cards", name: "Cards" }], expenseLines: [] };

  it("keeps the first income line without a ✕; the others can go", async () => {
    store.businesses = [kiosk];
    render(<BusinessWizard business={kiosk} entries={[]} entriesLoaded onClose={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /^\d?\s*Income/ }));
    expect(current()).toMatch(/Income/);
    expect(removeButtons().map((b) => b.getAttribute("aria-label"))).toEqual(["Remove line 2"]);
  });

  it("gives a stored business with no income line left one empty row to fill, with no ✕, and will not save it without a name", async () => {
    const bare: Business = { id: "biz-b", name: "Bare", incomeLines: [{ id: "old", name: "Old", removed: true }], expenseLines: [] };
    store.businesses = [bare];
    render(<BusinessWizard business={bare} entries={[]} entriesLoaded onClose={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: /^\d?\s*Income/ }));
    expect(screen.getByRole("textbox", { name: "Income line 1" })).toHaveValue("");
    expect(removeButtons()).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: /^\d?\s*Check/ }));
    expect(current()).toMatch(/Income/);
  });
});
