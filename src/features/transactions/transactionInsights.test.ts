import { describe, it, expect } from "vitest";
import {
  computeStats,
  categorySplit,
  bucketOverTime,
  pickBucket,
  topPayees,
  compareWithPrevious,
  spanInDays,
  sliceTransactions,
  OTHER_CATEGORY_ID,
  INVESTMENT_SLICE_ID,
} from "./transactionInsights";
import type { Transaction } from "../../shared/types/IndexTypes";

const tx = (overrides: Partial<Transaction> = {}): Transaction =>
  ({
    id: Math.random().toString(),
    userId: "u1",
    amount: 10,
    type: "expense",
    categoryId: "food",
    date: new Date("2026-03-10"),
    description: "Shop",
    createdAt: new Date("2026-03-10"),
    updatedAt: new Date("2026-03-10"),
    ...overrides,
  }) as Transaction;

const label = (d: Date) => d.toISOString().slice(0, 10);

// ─── Stats ──────────────────────────────────────────────────────────────────

describe("computeStats", () => {
  it("totals only real spending, ignoring goal and investment deposits", () => {
    const rows = [
      tx({ amount: 100 }),
      tx({ amount: 50 }),
      tx({ amount: 500, isInvestmentTransaction: true, contributionType: "deposit" }),
      tx({ amount: 200, isGoalTransaction: true, contributionType: "deposit" }),
    ];
    expect(computeStats(rows, "expense", 10).total).toBe(150);
    expect(computeStats(rows, "expense", 10).count).toBe(2);
  });

  it("counts a withdrawal as income", () => {
    const rows = [tx({ amount: 300, type: "income" }), tx({ amount: 200, isInvestmentTransaction: true, contributionType: "withdrawal" })];
    expect(computeStats(rows, "income", 10).total).toBe(500);
  });

  it("spreads the total across the whole filtered span, not just active days", () => {
    expect(computeStats([tx({ amount: 300 })], "expense", 30).perDay).toBe(10);
  });

  it("returns a zero per-day rather than dividing by zero", () => {
    expect(computeStats([tx({ amount: 300 })], "expense", 0).perDay).toBe(0);
  });

  it("takes the median so one huge payment doesn't skew the typical figure", () => {
    const rows = [tx({ amount: 10 }), tx({ amount: 20 }), tx({ amount: 30 }), tx({ amount: 5000 })];
    expect(computeStats(rows, "expense", 10).median).toBe(25);
  });

  it("reports the single largest payment with its label", () => {
    const rows = [tx({ amount: 10 }), tx({ amount: 650, description: "Rent", date: new Date("2026-03-01") })];
    expect(computeStats(rows, "expense", 10).largest).toMatchObject({ amount: 650, description: "Rent" });
  });

  it("has no largest when nothing matches", () => {
    expect(computeStats([], "expense", 10).largest).toBeUndefined();
  });
});

// ─── Category split ─────────────────────────────────────────────────────────

describe("categorySplit", () => {
  it("ranks categories biggest first with percentages that sum to 100", () => {
    const rows = [tx({ amount: 75, categoryId: "rent" }), tx({ amount: 25, categoryId: "food" })];
    const split = categorySplit(rows, "expense");
    expect(split.map((s) => s.categoryId)).toEqual(["rent", "food"]);
    expect(split[0].percentage).toBeCloseTo(75);
    expect(split.reduce((s, c) => s + c.percentage, 0)).toBeCloseTo(100);
  });

  it("is empty when there is nothing to split", () => {
    expect(categorySplit([], "expense")).toEqual([]);
  });

  it("folds everything past the limit into one other slice", () => {
    const rows = ["a", "b", "c", "d", "e", "f", "g"].map((c, i) => tx({ amount: 100 - i, categoryId: c }));
    const split = categorySplit(rows, "expense", 5);
    expect(split).toHaveLength(6);
    expect(split[5].categoryId).toBe(OTHER_CATEGORY_ID);
    // Amounts run 100…94; the two smallest roll together.
    expect(split[5].amount).toBe(95 + 94);
    expect(split[5].count).toBe(2);
  });

  it("does not add an other slice when everything already fits", () => {
    const rows = [tx({ amount: 10, categoryId: "a" }), tx({ amount: 20, categoryId: "b" })];
    expect(categorySplit(rows, "expense", 5).some((s) => s.categoryId === OTHER_CATEGORY_ID)).toBe(false);
  });
});

// ─── Buckets ────────────────────────────────────────────────────────────────

describe("pickBucket", () => {
  it("uses days for a month or less", () => expect(pickBucket(31)).toBe("day"));
  it("uses weeks up to six months", () => expect(pickBucket(120)).toBe("week"));
  it("uses months beyond that", () => expect(pickBucket(365)).toBe("month"));
});

describe("bucketOverTime", () => {
  it("groups by calendar month and sorts oldest first", () => {
    const rows = [tx({ amount: 30, date: new Date("2026-03-20") }), tx({ amount: 10, date: new Date("2026-01-05") }), tx({ amount: 5, date: new Date("2026-03-02") })];
    const buckets = bucketOverTime(rows, "expense", "month", label);
    expect(buckets.map((b) => b.amount)).toEqual([10, 35]);
    expect(buckets[0].start.getMonth()).toBe(0);
  });

  it("starts weeks on Monday", () => {
    // 2026-03-11 is a Wednesday; its week starts Monday the 9th.
    const buckets = bucketOverTime([tx({ date: new Date("2026-03-11") })], "expense", "week", label);
    expect(buckets[0].start.getDate()).toBe(9);
  });

  it("keeps separate days apart", () => {
    const rows = [tx({ amount: 1, date: new Date("2026-03-01") }), tx({ amount: 2, date: new Date("2026-03-02") })];
    expect(bucketOverTime(rows, "expense", "day", label)).toHaveLength(2);
  });
});

// ─── Payees ─────────────────────────────────────────────────────────────────

describe("topPayees", () => {
  it("merges the same payee regardless of casing", () => {
    const rows = [tx({ amount: 10, description: "Shell" }), tx({ amount: 15, description: "shell" })];
    const payees = topPayees(rows, "expense");
    expect(payees).toHaveLength(1);
    expect(payees[0]).toMatchObject({ amount: 25, count: 2, name: "Shell" });
  });

  it("ranks by amount and caps the list", () => {
    const rows = [tx({ amount: 5, description: "A" }), tx({ amount: 50, description: "B" }), tx({ amount: 20, description: "C" })];
    expect(topPayees(rows, "expense", 2).map((p) => p.name)).toEqual(["B", "C"]);
  });

  it("skips blank descriptions", () => {
    expect(topPayees([tx({ description: "   " })], "expense")).toEqual([]);
  });
});

// ─── Comparison ─────────────────────────────────────────────────────────────

describe("compareWithPrevious", () => {
  const from = new Date("2026-03-01");
  const to = new Date("2026-03-31");

  it("measures against the equally long stretch just before", () => {
    const all = [tx({ amount: 100, date: new Date("2026-03-10") }), tx({ amount: 80, date: new Date("2026-02-10") })];
    const result = compareWithPrevious(all, "expense", from, to, 100);
    expect(result?.previousTotal).toBe(80);
    expect(result?.difference).toBe(20);
    expect(result?.percentage).toBeCloseTo(25);
  });

  it("is undefined when the earlier stretch had no activity", () => {
    const all = [tx({ amount: 100, date: new Date("2026-03-10") })];
    expect(compareWithPrevious(all, "expense", from, to, 100)).toBeUndefined();
  });

  it("is undefined for an inverted range", () => {
    expect(compareWithPrevious([], "expense", to, from, 0)).toBeUndefined();
  });

  it("excludes transactions inside the current window from the previous total", () => {
    const all = [tx({ amount: 100, date: new Date("2026-03-10") }), tx({ amount: 40, date: new Date("2026-02-20") })];
    expect(compareWithPrevious(all, "expense", from, to, 100)?.previousTotal).toBe(40);
  });
});

// ─── Span ───────────────────────────────────────────────────────────────────

describe("spanInDays", () => {
  it("counts both endpoints", () => {
    expect(spanInDays(new Date("2026-03-01"), new Date("2026-03-31"), [])).toBe(31);
  });

  it("falls back to the data's own range when a bound is missing", () => {
    const rows = [tx({ date: new Date("2026-03-01") }), tx({ date: new Date("2026-03-05") })];
    expect(spanInDays(null, null, rows)).toBe(5);
  });

  it("never returns less than a day", () => {
    expect(spanInDays(new Date("2026-03-01"), new Date("2026-03-01"), [])).toBe(1);
    expect(spanInDays(null, null, [])).toBe(1);
  });
});

describe("sliceTransactions — opening up a slice of the pie", () => {
  const rows = [
    tx({ amount: 40, categoryId: "food", description: "Σούπερ" }),
    tx({ amount: 25, categoryId: "food", description: "Φούρνος" }),
    tx({ amount: 60, categoryId: "fuel" }),
    tx({ amount: 10, categoryId: "pet" }),
    tx({ amount: 5, categoryId: "games" }),
    tx({ amount: 900, type: "income", categoryId: "salary" }),
  ];

  it("gives back the rows behind one named slice", () => {
    const slices = categorySplit(rows, "expense", 2);
    const food = sliceTransactions(rows, "expense", slices, "food");

    expect(food).toHaveLength(2);
    expect(food.every((t) => t.categoryId === "food")).toBe(true);
  });

  it("gives back everything the Other slice swept up, and nothing else", () => {
    // The whole point of the slice: it is the only one whose contents the pie
    // does not name, so opening it has to answer what is in there.
    const slices = categorySplit(rows, "expense", 2);
    const named = slices.map((s) => s.categoryId).filter((id) => id !== OTHER_CATEGORY_ID);
    const other = sliceTransactions(rows, "expense", slices, OTHER_CATEGORY_ID);

    expect(other.length).toBeGreaterThan(0);
    expect(other.every((t) => !named.includes(t.categoryId))).toBe(true);
    expect(other.every((t) => t.type === "expense")).toBe(true);
  });

  it("leaves the other side of the ledger out of it", () => {
    const slices = categorySplit(rows, "income", 5);

    expect(sliceTransactions(rows, "income", slices, "salary").every((t) => t.type === "income")).toBe(true);
    expect(sliceTransactions(rows, "expense", categorySplit(rows, "expense", 5), "salary")).toEqual([]);
  });

  it("puts the newest first, so the list reads like the ledger", () => {
    const dated = [tx({ amount: 10, categoryId: "food", date: new Date(2026, 2, 1) }), tx({ amount: 10, categoryId: "food", date: new Date(2026, 2, 20) })];
    const opened = sliceTransactions(dated, "expense", categorySplit(dated, "expense", 5), "food");

    expect(opened.map((t) => t.date)).toEqual([new Date(2026, 2, 20), new Date(2026, 2, 1)]);
  });
});

describe("money coming back out of savings is its own slice", () => {
  // A withdrawal is income, but it is not a salary and not a gift: it is the
  // savings account handing money back, and lumping it in with the rest would
  // flatter the month it lands in.
  const withdrawal = tx({ amount: 400, type: "investment", isInvestmentTransaction: true, isGoalTransaction: true, contributionType: "withdrawal", categoryId: "" });
  const rows = [withdrawal, tx({ amount: 900, type: "income", categoryId: "salary" })];

  it("keeps it apart from the plain income in the split", () => {
    const slices = categorySplit(rows, "income", 5);

    expect(slices.map((s) => s.categoryId)).toContain(INVESTMENT_SLICE_ID);
    expect(slices.find((s) => s.categoryId === INVESTMENT_SLICE_ID)?.amount).toBe(400);
  });

  it("opens up to the withdrawals behind it", () => {
    const opened = sliceTransactions(rows, "income", categorySplit(rows, "income", 5), INVESTMENT_SLICE_ID);

    expect(opened).toEqual([withdrawal]);
  });
});
