import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../../i18n";
import AddTransactionModal from "./AddTransactionModal";
import type { Category } from "../../../shared/types/IndexTypes";

/**
 * The band over the dialog says which way the money goes (rule 15a), and it
 * follows the ONE question that decides it — in the owner's own words:
 *
 *  · it must colour «τη στιγμή που πατάω», not a step later (2026-11-23), and
 *  · going back to the question unanswers it, so the colour goes with it:
 *    «διάλεξα αλλά γύρισα πίσω, άρα είμαι null ξανά» (2026-11-24).
 *
 * The value itself is kept, so tapping the same answer again loses nothing.
 */

vi.mock("../hooks/usePayees", () => ({ usePayees: () => ({ payees: [] }) }));
vi.mock("../hooks/useTransactions", () => ({ useTransactions: () => ({ data: [] }) }));
vi.mock("../../../shared/hooks/useCurrencyConverter", () => ({ useCurrencyConverter: () => ({ baseCurrency: "EUR", displayCurrency: "EUR", convertToBase: (n: number) => n }) }));
vi.mock("../../accounts/useMoneyAccounts", () => ({ useAccountList: () => [], useMoneyAccounts: () => ({ accounts: [], checkIns: [], setCheckIns: vi.fn() }) }));
vi.mock("../../accounts/ReviewCard", () => ({ default: () => null }));
const groceries = { id: "food", name: "Groceries", icon: "🛒", type: "expense", isDefault: true, userId: null } as unknown as Category;
vi.mock("../../categories/CategoryPicker", () => ({
  default: ({ onChange }: { onChange: (id: string, c: Category) => void }) => (
    <button type="button" onClick={() => onChange("food", { id: "food", name: "Groceries", icon: "🛒", type: "expense", isDefault: true, userId: null } as unknown as Category)}>
      pick groceries
    </button>
  ),
}));

beforeAll(async () => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
});

const open = () =>
  render(
    <MemoryRouter>
      <AddTransactionModal isOpen onClose={() => {}} categories={[groceries]} onSubmit={vi.fn(async () => {})} />
    </MemoryRouter>,
  );

const head = () => document.querySelector(".modal-header")!.className;

describe("the band over the new-transaction dialog", () => {
  it("has no colour before the kind is chosen", () => {
    open();
    // `type` holds "expense" from the first render so the form can validate;
    // that is not an answer, and nothing on screen may suggest it is.
    expect(head()).not.toMatch(/tone-head/);
  });

  it("takes the colour on the tap itself, one step before the category", async () => {
    const user = userEvent.setup();
    open();
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^Expense/ }));
    expect(head()).toMatch(/tone-head-expense/);
    // Still on the category step — the colour did not wait for a category.
    expect(within(dialog).getByRole("button", { name: "pick groceries" })).toBeInTheDocument();
  });

  it("is green for money coming in", async () => {
    const user = userEvent.setup();
    open();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Income/ }));
    expect(head()).toMatch(/tone-head-income/);
  });

  it("loses the colour on the way back to the question, and takes it again on the next tap", async () => {
    const user = userEvent.setup();
    open();
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^Expense/ }));
    expect(head()).toMatch(/tone-head-expense/);

    await user.click(within(dialog).getByRole("button", { name: /Back/ }));
    expect(head()).not.toMatch(/tone-head/);

    await user.click(within(dialog).getByRole("button", { name: /^Expense/ }));
    expect(head()).toMatch(/tone-head-expense/);
  });
});
