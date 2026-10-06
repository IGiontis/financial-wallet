import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import i18n from "../../i18n";
import type { Transaction } from "../../shared/types/IndexTypes";
import ReviewCard from "./ReviewCard";

// The card on the review step, for a new record and for an edited one. Read at
// 1.000 on Revolut yesterday evening; a 100 expense from it today.

const READ_AT = new Date(2026, 9, 5, 20, 0);
const spent = { id: "t1", userId: "u", type: "expense", amount: 100, categoryId: "c", description: "Shop", date: new Date(2026, 9, 6), createdAt: new Date(2026, 9, 6, 10), updatedAt: new Date(2026, 9, 6, 10), accountId: "revolut" } as Transaction;
const state = vi.hoisted(() => ({ transactions: [] as Transaction[] }));

vi.mock("./useMoneyAccounts", () => ({
  useMoneyAccounts: () => ({
    accounts: [
      { id: "revolut", name: "Revolut", kind: "bank" },
      { id: "eurobank", name: "Eurobank", kind: "bank", main: true },
    ],
    latest: { at: READ_AT, total: 3000, checkIn: { id: "r1", at: READ_AT.toISOString(), amounts: { revolut: 1000, eurobank: 2000 } } },
    transactions: state.transactions,
  }),
}));
vi.mock("../../shared/hooks/useCurrencyConverter", () => ({ useCurrencyConverter: () => ({ format: (n: number) => `€${n.toFixed(2)}` }) }));

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

describe("the review card", () => {
  it("for a new record: what the card holds, and that less the new amount", () => {
    state.transactions = [spent];
    render(<ReviewCard accountId="revolut" income={false} delta={-50} />);
    // 1.000 − 100 = 900 now; − 50 = 850.
    expect(screen.getByText("€850.00")).toBeInTheDocument();
  });

  it("for an edit: 100 changed to 110 takes 10 more, not 110 more", () => {
    state.transactions = [spent];
    render(<ReviewCard accountId="revolut" income={false} editing={{ original: spent, changed: { ...spent, amount: 110 } }} />);
    expect(screen.getByText("After the change:")).toBeInTheDocument();
    // 1.000 − 110 = 890 — not 900 − 110 = 790.
    expect(screen.getByText("€890.00")).toBeInTheDocument();
    expect(screen.queryByText("€790.00")).toBeNull();
  });

  it("for an edit that moves the record to another card: this one gets its 100 back", () => {
    state.transactions = [spent];
    render(<ReviewCard accountId="revolut" income={false} editing={{ original: spent, changed: { ...spent, accountId: "eurobank" } }} />);
    expect(screen.getByText("€1000.00")).toBeInTheDocument();
  });

  it("for an edit of a record the last reading already holds: says the bank's figure stands", () => {
    const before = { ...spent, date: new Date(2026, 9, 4), createdAt: new Date(2026, 9, 4, 10) };
    state.transactions = [before];
    render(<ReviewCard accountId="revolut" income={false} editing={{ original: before, changed: { ...before, amount: 110 } }} />);
    expect(screen.getByText(/the figure stays what the bank said/)).toBeInTheDocument();
  });
});
