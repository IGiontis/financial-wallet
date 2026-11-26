import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../../i18n";
import AddTransactionModal from "./AddTransactionModal";
import type { Category } from "../../../shared/types/IndexTypes";
import { markedLabels } from "../../../test/requiredMarks";

// The owner's rule: no prefilled text. A new record's fields start empty and
// show only a placeholder; today's date and the side picked are the only
// things already filled in.

vi.mock("../hooks/usePayees", () => ({ usePayees: () => ({ payees: ["Lidl"] }) }));
vi.mock("../hooks/useTransactions", () => ({ useTransactions: () => ({ data: [] }) }));
vi.mock("../../../shared/hooks/useCurrencyConverter", () => ({ useCurrencyConverter: () => ({ baseCurrency: "EUR", displayCurrency: "EUR", convertToBase: (n: number) => n }) }));
vi.mock("../../accounts/useMoneyAccounts", () => ({ useAccountList: () => [], useMoneyAccounts: () => ({ accounts: [], checkIns: [], setCheckIns: vi.fn() }) }));
vi.mock("../../accounts/ReviewCard", () => ({ default: () => null }));
const plain = { id: "food", name: "Groceries", icon: "🛒", type: "expense", isDefault: true, userId: null } as unknown as Category;
vi.mock("../../categories/CategoryPicker", () => ({
  default: ({ onChange }: { onChange: (id: string, c: Category) => void }) => (
    <button type="button" onClick={() => onChange(plain.id, plain)}>
      pick groceries
    </button>
  ),
}));

beforeAll(async () => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  await i18n.changeLanguage("en");
});

describe("a new transaction", () => {
  it("starts with empty fields and placeholders only", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AddTransactionModal isOpen onClose={() => {}} categories={[plain]} onSubmit={vi.fn(async () => {})} />
      </MemoryRouter>,
    );
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /^Expense/ }));
    await user.click(within(dialog).getByRole("button", { name: "pick groceries" }));
    // Picking the category moves on to the details by itself.

    const amount = within(dialog).getByRole("spinbutton");
    const payee = within(dialog).getByRole("combobox");
    const notes = within(dialog).getByPlaceholderText(i18n.t("common.optionalNote"));
    for (const field of [amount, payee, notes]) {
      expect(field).toHaveValue(field === amount ? null : "");
      expect(field.getAttribute("placeholder")).toBeTruthy();
    }
  });

  it("marks every field its check requires, and nothing else", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AddTransactionModal isOpen onClose={() => {}} categories={[plain]} onSubmit={vi.fn(async () => {})} />
      </MemoryRouter>,
    );
    const dialog = screen.getByRole("dialog");
    // Step 1 is one asked question.
    expect(markedLabels(dialog)).toEqual([i18n.t("transactions.wizard.pickType")]);
    await user.click(within(dialog).getByRole("button", { name: /^Expense/ }));
    expect(markedLabels(dialog)).toEqual([i18n.t("transactions.wizard.pickCategory")]);
    await user.click(within(dialog).getByRole("button", { name: "pick groceries" }));

    // The schema's required ones: amount, date and payee; the notes are optional.
    // The currency is the field's end cell (`MoneyInput`), never a «(EUR)» in the label.
    expect(markedLabels(dialog)).toEqual(["Amount", "Date", "Payee"]);
    expect(within(dialog).getByRole("spinbutton")).toHaveAttribute("aria-required", "true");
    expect(within(dialog).getByRole("spinbutton").nextElementSibling).toHaveTextContent("€");
    expect(within(dialog).getByRole("combobox")).toHaveAttribute("aria-required", "true");
    expect(within(dialog).getByPlaceholderText(i18n.t("common.optionalNote"))).not.toHaveAttribute("aria-required");
  });
});
