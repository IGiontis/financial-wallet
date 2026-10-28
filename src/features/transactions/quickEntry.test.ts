import { describe, it, expect } from "vitest";
import { lastAccountFor, quickFavorites, recentCategoryIds } from "./quickEntry";
import type { Transaction } from "../../shared/types/IndexTypes";

// The coffee: 3,50 every time. The supermarket: different every week. Petrol once.
// And what the app wrote itself — a bill paid, a transfer — which is not «usual» shopping.

const NOW = new Date(2026, 9, 28, 12);
const day = (d: number, month = 9) => new Date(2026, month, d, 9);
let n = 0;
const tx = (description: string, categoryId: string, amount: number, date: Date, extra: Partial<Transaction> = {}) =>
  ({ id: `t${++n}`, userId: "u", type: "expense", description, categoryId, amount, date, createdAt: date, updatedAt: date, ...extra }) as Transaction;

const RECORDS = [
  tx("Καφές", "coffee", 3.5, day(27), { accountId: "revolut" }),
  tx("Καφές", "coffee", 3.5, day(25), { accountId: "revolut" }),
  tx("καφές ", "coffee", 3.5, day(20), { accountId: "revolut" }),
  tx("Σκλαβενίτης", "food", 42.3, day(26), { accountId: "eurobank" }),
  tx("Σκλαβενίτης", "food", 51.1, day(19), { accountId: "eurobank" }),
  tx("Σκλαβενίτης", "food", 38.0, day(12)),
  tx("Βενζίνη", "fuel", 50, day(15)),
  // Written by the app: a bill, a transfer's half, a goal — never «usual».
  tx("ΔΕΗ", "power", 85, day(10), { billId: "b" }),
  tx("ΔΕΗ", "power", 85, day(10, 8), { billId: "b" }),
  tx("Revolut → Eurobank", "other", 100, day(5), { transferId: "x" }),
  tx("Revolut → Eurobank", "other", 100, day(4), { transferId: "y" }),
  // Too long ago: May.
  tx("Σινεμά", "fun", 9, day(10, 4)),
  tx("Σινεμά", "fun", 9, day(12, 4)),
];

describe("«τα συνηθισμένα σου»", () => {
  const favorites = quickFavorites(RECORDS, NOW);

  it("are what was bought at least twice lately, the most often first — not what the app wrote, not May's cinema", () => {
    expect(favorites.map((f) => f.label)).toEqual(["Καφές", "Σκλαβενίτης"]);
    expect(favorites.map((f) => f.count)).toEqual([3, 3]);
  });

  it("fill in the coffee's 3,50 — the same three times running — and leave the supermarket's amount empty", () => {
    const [coffee, market] = favorites;
    expect([coffee.fixedAmount, coffee.lastAmount]).toEqual([3.5, 3.5]);
    expect([market.fixedAmount, market.lastAmount]).toEqual([undefined, 42.3]);
  });

  it("take the card and the category from the last time", () => {
    const [coffee, market] = favorites;
    expect([coffee.categoryId, coffee.accountId]).toEqual(["coffee", "revolut"]);
    expect([market.categoryId, market.accountId]).toEqual(["food", "eurobank"]);
  });

  it("stop filling in an amount the moment it changes", () => {
    const dearer = [tx("Καφές", "coffee", 4, day(28), { accountId: "revolut" }), ...RECORDS];
    expect(quickFavorites(dearer, NOW)[0]).toMatchObject({ label: "Καφές", fixedAmount: undefined, lastAmount: 4 });
  });
});

describe("the categories and the card it offers first", () => {
  it("offers the expense categories used most recently, each once", () => {
    expect(recentCategoryIds(RECORDS)).toEqual(["coffee", "food", "fuel", "fun"]);
  });

  it("puts a category's expense on the card it went through last", () => {
    expect([lastAccountFor(RECORDS, "coffee"), lastAccountFor(RECORDS, "fuel"), lastAccountFor(RECORDS, "nothing")]).toEqual(["revolut", undefined, undefined]);
  });
});
