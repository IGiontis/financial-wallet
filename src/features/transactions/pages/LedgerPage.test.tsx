import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import i18n from "../../../i18n";
import type { Category, Transaction } from "../../../shared/types/IndexTypes";
import { LedgerPage } from "./LedgerPage";

// «Βιβλίο κινήσεων», opened: the page itself, not only the sums behind it —
// the category filter once threw before the page could draw at all.

const NOW = new Date(2026, 9, 26, 12);
const day = (d: number) => new Date(2026, 9, d, 10);
const tx = (id: string, type: "income" | "expense", categoryId: string, amount: number, d: number) =>
  ({ id, userId: "u", type, categoryId, amount, description: id, date: day(d), createdAt: day(d), updatedAt: day(d) }) as Transaction;

// «Άλλο» is both an income and an expense category: two ids, one name.
const CATEGORIES = [
  { id: "food", name: "Food", type: "expense", icon: "🛒" },
  { id: "other-out", name: "Other", type: "expense", icon: "•" },
  { id: "other-in", name: "Other", type: "income", icon: "•" },
] as Category[];
const RECORDS = [tx("Groceries", "expense", "food", 50, 3), tx("Odd job", "income", "other-in", 120, 5), tx("Gift", "expense", "other-out", 30, 7)];

vi.mock("../hooks/useTransactions", () => ({
  useTransactions: () => ({ data: RECORDS, isLoading: false }),
  useCategories: () => ({ data: CATEGORIES }),
}));
vi.mock("../../accounts/useMoneyAccounts", () => ({ useAccountList: () => [] }));
vi.mock("../../../shared/hooks/useCurrencyConverter", () => ({ useCurrencyConverter: () => ({ format: (n: number) => `€${n.toFixed(2)}` }) }));
vi.mock("../components/TransactionsViewModal", () => ({ default: () => null }));

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  await i18n.changeLanguage("en");
});
afterAll(() => vi.useRealTimers());

describe("the ledger page", () => {
  it("opens, and a name that is both an income and an expense category shows both", async () => {
    render(
      <MemoryRouter>
        <LedgerPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("Groceries")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Category"), "Other");
    expect(screen.getByText("Odd job")).toBeInTheDocument();
    expect(screen.getByText("Gift")).toBeInTheDocument();
    expect(screen.queryByText("Groceries")).toBeNull();
  });

  it("a line of «Where it went» opens the records behind it, with its total", async () => {
    render(
      <MemoryRouter>
        <LedgerPage />
      </MemoryRouter>,
    );
    const whereOut = screen.getByRole("heading", { name: /Where it went/ }).parentElement!;
    await userEvent.click(within(whereOut).getByRole("button", { name: /Food/ }));
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText("1 record · October 2026")).toBeInTheDocument();
    expect(within(sheet).getByText("€50.00", { selector: "strong" })).toBeInTheDocument();
    expect(within(sheet).getByText("Groceries")).toBeInTheDocument();
    // Only the food: the gift is another category, the odd job money in.
    expect(within(sheet).queryByText("Gift")).toBeNull();
    expect(within(sheet).queryByText("Odd job")).toBeNull();
  });

  it("folds «Where it went» away from the chevron opposite its title, and remembers it on this device", async () => {
    localStorage.removeItem("ledger-where-out-open");
    const { unmount } = render(
      <MemoryRouter>
        <LedgerPage />
      </MemoryRouter>,
    );
    const fold = screen.getByRole("button", { name: /Where it went/ });
    expect(fold).toHaveAttribute("aria-expanded", "true");
    await userEvent.click(fold);
    expect(fold).toHaveAttribute("aria-expanded", "false");
    expect(localStorage.getItem("ledger-where-out-open")).toBe("false");
    // «Where it came from» is its own fold, still open.
    expect(screen.getByRole("button", { name: /Where it came from/ })).toHaveAttribute("aria-expanded", "true");
    unmount();

    render(
      <MemoryRouter>
        <LedgerPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: /Where it went/ })).toHaveAttribute("aria-expanded", "false");
    localStorage.removeItem("ledger-where-out-open");
  });

  it("combines kinds: a first tap picks one, a second adds another, and the sums follow", async () => {
    render(
      <MemoryRouter>
        <LedgerPage />
      </MemoryRouter>,
    );
    const kinds = screen.getByRole("group", { name: "Kind" });
    const sum = (label: string) => screen.getByText(label, { selector: "span" }).nextElementSibling!.textContent;
    expect(within(kinds).getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(within(kinds).getByRole("button", { name: "Income" }));
    expect(screen.getByText("Odd job")).toBeInTheDocument();
    expect(screen.queryByText("Groceries")).toBeNull();
    expect([sum("In"), sum("Out")]).toEqual(["€120.00", "€0.00"]);

    await userEvent.click(within(kinds).getByRole("button", { name: "Expenses" }));
    expect(within(kinds).getByRole("button", { name: "Income" })).toHaveAttribute("aria-pressed", "true");
    expect(within(kinds).getByRole("button", { name: "Expenses" })).toHaveAttribute("aria-pressed", "true");
    expect(within(kinds).getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");
    expect([sum("In"), sum("Out"), sum("Net")]).toEqual(["€120.00", "€80.00", "+€40.00"]);

    // The last one on stays on.
    await userEvent.click(within(kinds).getByRole("button", { name: "Expenses" }));
    await userEvent.click(within(kinds).getByRole("button", { name: "Income" }));
    expect(within(kinds).getByRole("button", { name: "Income" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(within(kinds).getByRole("button", { name: "All" }));
    expect(screen.getByText("Groceries")).toBeInTheDocument();
  });
});
