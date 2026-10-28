import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../../i18n";
import { QuickExpense } from "./QuickExpense";
import type { Transaction } from "../../../shared/types/IndexTypes";

// The «+»: the coffee is always 3,50 and fills itself in; the supermarket never
// is, so its amount is left for the reader, with last time's as a hint.

const NOW = new Date(2026, 9, 28, 12);
const day = (d: number) => new Date(2026, 9, d, 9);
let n = 0;
const tx = (description: string, categoryId: string, amount: number, d: number, accountId?: string) =>
  ({ id: `t${++n}`, userId: "u", type: "expense", description, categoryId, amount, date: day(d), createdAt: day(d), updatedAt: day(d), accountId }) as Transaction;

const RECORDS = [tx("Καφές", "coffee", 3.5, 27, "revolut"), tx("Καφές", "coffee", 3.5, 25, "revolut"), tx("Καφές", "coffee", 3.5, 20, "revolut"), tx("Σκλαβενίτης", "food", 42.3, 26), tx("Σκλαβενίτης", "food", 51.1, 19)];
const CATEGORIES = [
  { id: "coffee", name: "Coffee", type: "expense", icon: "☕" },
  { id: "food", name: "Groceries", type: "expense", icon: "🛒" },
  { id: "fuel", name: "Fuel", type: "expense", icon: "⛽" },
];
const mutate = vi.hoisted(() => vi.fn());

vi.mock("../hooks/useTransactions", () => ({
  useTransactions: () => ({ data: RECORDS }),
  useCategories: () => ({ data: CATEGORIES }),
  useCreateTransaction: () => ({ mutate }),
}));
vi.mock("../../accounts/useMoneyAccounts", () => ({
  useAccountList: () => [
    { id: "eurobank", name: "Eurobank", kind: "bank", main: true },
    { id: "revolut", name: "Revolut", kind: "bank" },
  ],
}));
vi.mock("../../../shared/hooks/useCurrencyConverter", () => ({
  useCurrencyConverter: () => ({ format: (x: number) => `€${x.toFixed(2)}`, convert: (x: number) => x, convertToBase: (x: number) => x, baseCurrency: "EUR", displayCurrency: "EUR" }),
}));
vi.mock("react-toastify", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  await i18n.changeLanguage("en");
});
afterAll(() => vi.useRealTimers());
beforeEach(() => mutate.mockClear());

const open = async () => {
  render(
    <MemoryRouter>
      <QuickExpense />
    </MemoryRouter>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Quick expense" }));
  return screen.getByRole("dialog");
};

describe("the quick expense", () => {
  it("puts the coffee in with two taps: always 3,50, on the card it always goes on", async () => {
    const dialog = await open();
    await userEvent.click(within(dialog).getByRole("button", { name: /Καφές/ }));
    expect(within(dialog).getByRole("textbox", { name: "Amount" })).toHaveValue("3,50");
    expect(within(dialog).getByRole("button", { name: "Revolut" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toMatchObject({ amount: 3.5, type: "expense", categoryId: "coffee", description: "Καφές", accountId: "revolut" });
  });

  it("leaves the supermarket's amount for the reader, with last time's as a hint, and will not save without it", async () => {
    const dialog = await open();
    await userEvent.click(within(dialog).getByRole("button", { name: /Σκλαβενίτης/ }));
    const amount = within(dialog).getByRole("textbox", { name: "Amount" });
    expect(amount).toHaveValue("");
    expect(amount).toHaveAttribute("placeholder", "last time €42.30");
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();

    await userEvent.type(amount, "38,75");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    // The main account is no account: the expense carries none.
    expect(mutate.mock.calls[0][0]).toMatchObject({ amount: 38.75, categoryId: "food", description: "Σκλαβενίτης", accountId: undefined });
  });

  it("takes anything else: an amount, a category, and the category's name for a description", async () => {
    const dialog = await open();
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Amount" }), "12,40");
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    await userEvent.selectOptions(within(dialog).getByRole("combobox", { name: "Other category…" }), "fuel");
    await userEvent.click(within(dialog).getByRole("button", { name: "Yesterday" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    const saved = mutate.mock.calls[0][0];
    expect(saved).toMatchObject({ amount: 12.4, categoryId: "fuel", description: "Fuel" });
    expect(saved.date.getDate()).toBe(27);
  });
});
