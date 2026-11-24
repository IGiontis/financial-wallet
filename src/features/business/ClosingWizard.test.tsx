import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../../i18n";
import ClosingWizard from "./ClosingWizard";
import type { Business } from "../../shared/types/IndexTypes";

// «Κλείσιμο ημέρας», WHERE before HOW MUCH (owner, 2026-11-12): the card the
// day's money goes to — or comes out of — is asked before the lines' amounts.

const spies = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("./useBusiness", () => ({ useSaveClosing: () => ({ mutate: spies.save, mutateAsync: (vars: unknown) => (spies.save(vars), new Promise(() => {})) }) }));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../../shared/hooks/useCurrencyConverter", () => ({
  useCurrencyConverter: () => ({ format: (n: number) => `€${n.toFixed(2)}`, convert: (n: number) => n, convertToBase: (n: number) => n, baseCurrency: "EUR", displayCurrency: "EUR" }),
}));
vi.mock("../transactions/hooks/useTransactions", () => ({ useTransactions: () => ({ data: [] }) }));
const TWO_PLACES = [
  { id: "eb", name: "Eurobank", kind: "bank", main: true },
  { id: "rev", name: "Revolut", kind: "bank" },
];
// `useMoneyAccounts` too: a closing that ends in a loss asks whether the card
// can carry it (`useSpendCheck`, rule 22). No reading here, so no refusal.
vi.mock("../accounts/useMoneyAccounts", () => ({
  useAccountList: () => TWO_PLACES,
  useMoneyAccounts: () => ({ accounts: TWO_PLACES, latest: undefined, transactions: [], checkIns: [], setCheckIns: vi.fn() }),
}));
// The picker stands in as one button for Revolut; its own error shows when the step was tried.
vi.mock("../accounts/AccountPicker", () => ({
  default: ({ onChoose, invalid }: { onChoose: (id: string) => void; invalid?: boolean }) => (
    <>
      <button type="button" onClick={() => onChoose("rev")}>
        pick Revolut
      </button>
      {invalid && <p>card required</p>}
    </>
  ),
}));
vi.mock("../accounts/ReviewCard", () => ({ default: () => null }));

const SHOP: Business = { id: "shop", name: "Shop", incomeLines: [{ id: "till", name: "Till" }], expenseLines: [{ id: "stock", name: "Stock" }] };

beforeAll(async () => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
});
beforeEach(() => spies.save.mockClear());

const next = () => userEvent.click(screen.getByRole("button", { name: /^Next/ }));
const current = () => document.querySelector("[aria-current=step]")?.textContent;

describe("closing a day: the card before the amounts", () => {
  it("asks where the money goes on the second step, before any line's amount, and will not go on without it", async () => {
    render(<ClosingWizard businesses={[SHOP]} onClose={() => {}} />);
    expect(current()).toMatch(/Day/);
    await next();
    expect(current()).toMatch(/Where/);
    expect(screen.getByText("Where does the day's profit go?")).toBeInTheDocument();
    // No amount asked yet.
    expect(screen.queryByLabelText("Till")).toBeNull();
    expect(screen.queryByText("card required")).toBeNull();
    await next();
    expect(current()).toMatch(/Where/);
    expect(screen.getByText("card required")).toBeInTheDocument();
  });

  it("then the amounts; the check lists the card before them, and the profit goes into it", async () => {
    render(<ClosingWizard businesses={[SHOP]} onClose={() => {}} />);
    await next();
    await userEvent.click(screen.getByRole("button", { name: "pick Revolut" }));
    await next();
    expect(current()).toMatch(/Income/);
    await userEvent.type(screen.getByLabelText("Till"), "300");
    await next();
    expect(current()).toMatch(/Expenses/);
    await userEvent.type(screen.getByLabelText("Stock"), "120");
    await next();
    expect(current()).toMatch(/Check/);

    // The first card of the check: business, day, and where — before any figure.
    const rows = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    const where = rows.findIndex((r) => /^Where\s*Revolut/.test(r));
    const till = rows.findIndex((r) => /^Till/.test(r));
    expect(where).toBeGreaterThan(-1);
    expect(where).toBeLessThan(till);

    await userEvent.click(screen.getByRole("button", { name: /^Save/ }));
    const [vars] = spies.save.mock.calls[0];
    // By hand: 300 in − 120 out = 180 profit, into Revolut.
    expect(vars.closing).toMatchObject({ businessId: "shop", accountId: "rev" });
    expect(vars.closing.incomes).toEqual([{ lineId: "till", amount: 300 }]);
    expect(vars.closing.expenses).toEqual([{ lineId: "stock", amount: 120 }]);
    expect(300 - 120).toBe(180);
  });
});
