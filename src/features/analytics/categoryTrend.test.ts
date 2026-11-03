import { describe, it, expect } from "vitest";
import { monthlyTrend, spendingCategories, trendYears, yearlyTrend } from "./categoryTrend";
import type { Transaction } from "../../shared/types/IndexTypes";

// Groceries and fuel across the turn of 2025–2026, with the things filed under
// «groceries» that are not groceries: a transfer, a goal deposit, an income.
// Every figure added up by hand first, then a second way: months against the
// year, categories against the total, the windows against each other.

let n = 0;
const tx = (categoryId: string, amount: number, date: Date, extra: Partial<Transaction> = {}): Transaction =>
  ({ id: `t${++n}`, userId: "u", type: "expense", categoryId, amount, description: "", date, createdAt: date, updatedAt: date, ...extra }) as Transaction;

const RECORDS = [
  tx("food", 120.4, new Date(2025, 10, 3)),
  tx("food", 80, new Date(2025, 11, 30, 23, 30)),
  tx("food", 95.1, new Date(2026, 0, 1, 0, 5)),
  tx("food", 60, new Date(2026, 0, 31)),
  // Stored negative by an older import: still 30 spent.
  tx("food", -30, new Date(2026, 1, 14)),
  tx("fuel", 50, new Date(2025, 11, 2)),
  tx("fuel", 45.5, new Date(2026, 1, 20)),
  tx("rent", 400, new Date(2026, 0, 1)),
  // Under «food» but not spending.
  tx("food", 200, new Date(2026, 0, 10), { transferId: "x", transferPart: "out" }),
  tx("food", 100, new Date(2026, 0, 11), { isGoalTransaction: true, isInvestmentTransaction: true, contributionType: "deposit" }),
  tx("food", 15, new Date(2026, 0, 12), { type: "income" }),
  tx("food", 70, new Date(2026, 0, 13), { debtId: "d", debtPart: "loan" }),
  tx("food", 10, new Date(2023, 5, 1)),
];

describe("month by month", () => {
  const months = monthlyTrend(RECORDS, ["food", "fuel"], new Date(2026, 1, 20), 6);

  it("has every month of the stretch, oldest first, an empty one at 0", () => {
    expect(months.map((m) => m.key)).toEqual(["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(months.map((m) => m.values.food)).toEqual([0, 0, 120.4, 80, 155.1, 30]);
    expect(months.map((m) => m.values.fuel)).toEqual([0, 0, 0, 50, 0, 45.5]);
  });

  it("counts only spending: the transfer, the goal, the income and the loan under «food» are not groceries", () => {
    // January by hand: 95,10 + 60 — not the 200, 100, 15 or 70.
    expect(months[4].values.food).toBe(155.1);
    expect(95.1 + 60).toBeCloseTo(155.1, 10);
  });

  it("files a record by its own day: 30 Dec 23:30 is December, 1 Jan 00:05 is January", () => {
    expect(months[3].values.food).toBe(80);
    expect(months[4].values.food).toBe(155.1);
  });

  it("adds each month's categories up to its total, and the months up to the categories' whole", () => {
    for (const m of months) expect(m.total).toBeCloseTo(m.values.food + m.values.fuel, 10);
    const all = months.reduce((s, m) => s + m.total, 0);
    // A second way: every spending record of the two in the window, summed straight off the list.
    expect(all).toBeCloseTo(120.4 + 80 + 95.1 + 60 + 30 + 50 + 45.5, 10);
  });

  it("gives the same month the same figure whatever stretch it is seen in", () => {
    const three = monthlyTrend(RECORDS, ["food", "fuel"], new Date(2026, 1, 1), 3);
    const twelve = monthlyTrend(RECORDS, ["food", "fuel"], new Date(2026, 1, 28), 12);
    expect(three.map((m) => m.key)).toEqual(["2025-12", "2026-01", "2026-02"]);
    for (const m of three) {
      expect(twelve.find((x) => x.key === m.key)).toEqual(m);
      expect(months.find((x) => x.key === m.key)).toEqual(m);
    }
    expect(twelve).toHaveLength(12);
  });

  it("does not change a category's figures for picking another beside it", () => {
    const alone = monthlyTrend(RECORDS, ["food"], new Date(2026, 1, 20), 6);
    expect(alone.map((m) => m.values.food)).toEqual(months.map((m) => m.values.food));
    expect(alone.map((m) => m.total)).toEqual(alone.map((m) => m.values.food));
  });
});

describe("year by year", () => {
  it("offers 2024 to next year — earlier when the records start earlier", () => {
    expect(trendYears([], new Date(2026, 10, 2))).toEqual([2024, 2025, 2026, 2027]);
    expect(trendYears(RECORDS, new Date(2026, 10, 2))).toEqual([2023, 2024, 2025, 2026, 2027]);
  });

  it("totals each year, and a year is its twelve months added up", () => {
    const years = yearlyTrend(RECORDS, ["food", "fuel"], [2024, 2025, 2026, 2027]);
    expect(years.map((y) => [y.key, y.values.food, y.values.fuel])).toEqual([
      ["2024", 0, 0],
      ["2025", 200.4, 50],
      ["2026", 185.1, 45.5],
      ["2027", 0, 0],
    ]);
    // A second way: 2026's twelve months from the month view.
    const months2026 = monthlyTrend(RECORDS, ["food", "fuel"], new Date(2026, 11, 1), 12);
    expect(months2026.reduce((s, m) => s + m.values.food, 0)).toBeCloseTo(years[2].values.food, 10);
    expect(months2026.reduce((s, m) => s + m.total, 0)).toBeCloseTo(years[2].total, 10);
  });
});

describe("the picker", () => {
  it("lists the categories with spending, biggest first; one with only moves in it is not there", () => {
    expect(spendingCategories(RECORDS)).toEqual([
      { categoryId: "rent", total: 400 },
      { categoryId: "food", total: 395.5 },
      { categoryId: "fuel", total: 95.5 },
    ]);
    expect(spendingCategories([tx("x", 50, new Date(2026, 0, 1), { transferId: "t", transferPart: "out" })])).toEqual([]);
  });
});
