import { describe, it, expect } from "vitest";
import {
  amountHistogram,
  averageSavingsRate,
  categoryDistribution,
  categoryPayeeTree,
  categoryProfile,
  categoryTrend,
  cumulativeNet,
  moneyFlow,
  monthPace,
  monthlyFlows,
  payeeBreakdown,
  rangeStart,
  savingsRateSeries,
  spendingHeatmap,
  withinRange,
  FLOW_DEFICIT_ID,
  FLOW_HUB_ID,
  FLOW_LEFTOVER_ID,
  FLOW_SAVINGS_ID,
  FLOW_WITHDRAWALS_ID,
  OTHER_CATEGORY_ID,
} from "./analyticsUtils";
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

const deposit = (amount: number, date: Date, goal = false) =>
  tx({ amount, type: "investment", isInvestmentTransaction: true, isGoalTransaction: goal, contributionType: "deposit", date });

const withdrawal = (amount: number, date: Date, goal = false) =>
  tx({ amount, type: "investment", isInvestmentTransaction: true, isGoalTransaction: goal, contributionType: "withdrawal", date });

// ─── Range ───────────────────────────────────────────────────────────────────

describe("rangeStart", () => {
  const now = new Date(2026, 7, 11); // 11 Aug 2026

  it("snaps to a month start and counts the current month as one of them", () => {
    expect(rangeStart("3m", now)).toEqual(new Date(2026, 5, 1)); // Jun, Jul, Aug
    expect(rangeStart("6m", now)).toEqual(new Date(2026, 2, 1));
    expect(rangeStart("12m", now)).toEqual(new Date(2025, 8, 1));
  });

  it("returns null for the whole history", () => {
    expect(rangeStart("all", now)).toBeNull();
  });
});

describe("withinRange", () => {
  it("keeps the boundary days at both ends", () => {
    const rows = [tx({ date: new Date(2026, 5, 1) }), tx({ date: new Date(2026, 4, 31) }), tx({ date: new Date(2026, 7, 11) }), tx({ date: new Date(2026, 7, 12) })];
    const kept = withinRange(rows, new Date(2026, 5, 1), new Date(2026, 7, 11));
    expect(kept).toHaveLength(2);
  });

  it("keeps everything when there is no lower bound", () => {
    const rows = [tx({ date: new Date(2020, 0, 1) }), tx({ date: new Date(2026, 7, 11) })];
    expect(withinRange(rows, null, new Date(2026, 7, 11))).toHaveLength(2);
  });
});

// ─── Monthly flows ───────────────────────────────────────────────────────────

describe("monthlyFlows", () => {
  const now = new Date(2026, 2, 20); // March 2026

  it("splits income, spending and transfers using the app's money model", () => {
    const rows = [
      tx({ amount: 2000, type: "income", date: new Date(2026, 2, 1) }),
      tx({ amount: 300, type: "expense", date: new Date(2026, 2, 5) }),
      deposit(500, new Date(2026, 2, 6)),
      deposit(100, new Date(2026, 2, 7), true),
      withdrawal(50, new Date(2026, 2, 8)),
    ];

    const [march] = monthlyFlows(rows, new Date(2026, 2, 1), now);

    expect(march.income).toBe(2050); // 2000 salary + 50 withdrawn back out
    expect(march.expenses).toBe(300); // transfers are not spending
    expect(march.invested).toBe(500);
    expect(march.goals).toBe(100);
    expect(march.net).toBe(1750);
  });

  it("keeps empty months so a quiet stretch stays visible", () => {
    const rows = [tx({ amount: 40, date: new Date(2026, 0, 15) }), tx({ amount: 60, date: new Date(2026, 2, 15) })];
    const flows = monthlyFlows(rows, new Date(2026, 0, 1), now);

    expect(flows.map((f) => f.key)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(flows[1].expenses).toBe(0);
  });

  it("starts at the earliest transaction when no lower bound is given", () => {
    const rows = [tx({ amount: 40, date: new Date(2026, 1, 15) })];
    expect(monthlyFlows(rows, null, now).map((f) => f.key)).toEqual(["2026-02", "2026-03"]);
  });

  it("ignores transactions outside the window", () => {
    const rows = [tx({ amount: 40, date: new Date(2025, 11, 31) }), tx({ amount: 60, date: new Date(2026, 2, 1) })];
    const flows = monthlyFlows(rows, new Date(2026, 1, 1), now);
    expect(flows.reduce((s, f) => s + f.expenses, 0)).toBe(60);
  });

  it("still returns the current month when there is nothing at all", () => {
    expect(monthlyFlows([], null, now).map((f) => f.key)).toEqual(["2026-03"]);
  });
});

// ─── Cumulative ──────────────────────────────────────────────────────────────

describe("cumulativeNet", () => {
  const now = new Date(2026, 2, 20);

  it("accumulates month by month and can fall back", () => {
    const rows = [
      tx({ amount: 1000, type: "income", date: new Date(2026, 0, 5) }),
      tx({ amount: 400, date: new Date(2026, 0, 6) }),
      tx({ amount: 900, date: new Date(2026, 1, 6) }), // a month spending more than it earns
      tx({ amount: 1000, type: "income", date: new Date(2026, 2, 5) }),
    ];

    const points = cumulativeNet(monthlyFlows(rows, new Date(2026, 0, 1), now));

    expect(points.map((p) => p.cumulative)).toEqual([600, -300, 700]);
  });
});

// ─── Savings rate ────────────────────────────────────────────────────────────

describe("savingsRateSeries", () => {
  const now = new Date(2026, 1, 20);

  it("reports the share of income kept, counting goal deposits as kept", () => {
    const rows = [
      tx({ amount: 1000, type: "income", date: new Date(2026, 1, 1) }),
      tx({ amount: 250, date: new Date(2026, 1, 2) }),
      deposit(400, new Date(2026, 1, 3), true),
    ];

    const [feb] = savingsRateSeries(monthlyFlows(rows, new Date(2026, 1, 1), now));
    expect(feb.rate).toBe(75); // only the 250 of real spending reduces it
  });

  it("leaves a month with no income unrated rather than claiming 0%", () => {
    const [feb] = savingsRateSeries(monthlyFlows([tx({ amount: 50, date: new Date(2026, 1, 2) })], new Date(2026, 1, 1), now));
    expect(feb.rate).toBeNull();
  });
});

describe("averageSavingsRate", () => {
  const now = new Date(2026, 1, 20);

  it("weights by income so a tiny month cannot swing it", () => {
    const rows = [
      // January: €2,000 in, €1,000 out → 50%
      tx({ amount: 2000, type: "income", date: new Date(2026, 0, 1) }),
      tx({ amount: 1000, date: new Date(2026, 0, 2) }),
      // February: €100 in, €100 out → 0%
      tx({ amount: 100, type: "income", date: new Date(2026, 1, 1) }),
      tx({ amount: 100, date: new Date(2026, 1, 2) }),
    ];

    // A plain mean of the two rates would be 25%; weighting gives 1000/2100.
    expect(averageSavingsRate(monthlyFlows(rows, new Date(2026, 0, 1), now))).toBeCloseTo(47.62, 1);
  });

  it("is undefined without any income", () => {
    expect(averageSavingsRate(monthlyFlows([tx({ amount: 50, date: new Date(2026, 1, 2) })], new Date(2026, 1, 1), now))).toBeUndefined();
  });
});

// ─── Category trend ──────────────────────────────────────────────────────────

describe("categoryTrend", () => {
  const now = new Date(2026, 1, 20);
  const from = new Date(2026, 0, 1);

  it("ranks once over the whole window so bands keep their position", () => {
    const rows = [
      tx({ amount: 300, categoryId: "rent", date: new Date(2026, 0, 3) }),
      tx({ amount: 40, categoryId: "food", date: new Date(2026, 0, 4) }),
      // February flips the monthly order — the stack order must not follow.
      tx({ amount: 500, categoryId: "food", date: new Date(2026, 1, 4) }),
      tx({ amount: 300, categoryId: "rent", date: new Date(2026, 1, 3) }),
    ];

    const trend = categoryTrend(rows, monthlyFlows(rows, from, now), 5);

    // rent totals 600 over the window against food's 540, so rent leads the
    // stack in *both* columns even though February is a food month.
    expect(trend.categoryIds).toEqual(["rent", "food"]);
    expect(trend.rows[0].totals).toEqual({ food: 40, rent: 300 });
    expect(trend.rows[1].totals).toEqual({ food: 500, rent: 300 });
  });

  it("folds everything past the limit into one band", () => {
    const rows = ["a", "b", "c", "d"].map((c, i) => tx({ amount: 100 - i, categoryId: c, date: new Date(2026, 1, 5) }));
    const trend = categoryTrend(rows, monthlyFlows(rows, from, now), 2);

    expect(trend.categoryIds).toEqual(["a", "b", OTHER_CATEGORY_ID]);
    expect(trend.otherCount).toBe(2);
    expect(trend.rows[1].totals[OTHER_CATEGORY_ID]).toBe(98 + 97);
  });

  it("leaves out transfers", () => {
    const rows = [tx({ amount: 100, categoryId: "food", date: new Date(2026, 1, 5) }), deposit(900, new Date(2026, 1, 6))];
    const trend = categoryTrend(rows, monthlyFlows(rows, from, now));
    expect(trend.categoryIds).toEqual(["food"]);
  });
});

// ─── Category profile ────────────────────────────────────────────────────────

describe("categoryProfile", () => {
  const now = new Date(2026, 2, 20);

  it("compares the latest month against the mean of the earlier ones", () => {
    const rows = [
      tx({ amount: 100, categoryId: "food", date: new Date(2026, 0, 5) }),
      tx({ amount: 200, categoryId: "food", date: new Date(2026, 1, 5) }),
      tx({ amount: 500, categoryId: "food", date: new Date(2026, 2, 5) }),
    ];

    const [food] = categoryProfile(rows, monthlyFlows(rows, new Date(2026, 0, 1), now));

    expect(food.current).toBe(500);
    expect(food.average).toBe(150); // (100 + 200) / 2 earlier months
  });

  it("returns nothing when there is no baseline to compare against", () => {
    const rows = [tx({ amount: 100, date: new Date(2026, 2, 5) })];
    expect(categoryProfile(rows, monthlyFlows(rows, new Date(2026, 2, 1), now))).toEqual([]);
  });

  it("keeps a category that only spiked this month", () => {
    const rows = [
      tx({ amount: 500, categoryId: "rent", date: new Date(2026, 0, 5) }),
      tx({ amount: 500, categoryId: "rent", date: new Date(2026, 1, 5) }),
      tx({ amount: 500, categoryId: "rent", date: new Date(2026, 2, 5) }),
      tx({ amount: 400, categoryId: "travel", date: new Date(2026, 2, 6) }), // first ever
    ];

    const ids = categoryProfile(rows, monthlyFlows(rows, new Date(2026, 0, 1), now)).map((r) => r.categoryId);
    expect(ids).toContain("travel");
  });
});

// ─── Payees ──────────────────────────────────────────────────────────────────

describe("payeeBreakdown", () => {
  it("merges spellings, ranks by amount and skips blanks", () => {
    const rows = [
      tx({ amount: 30, description: "Lidl" }),
      tx({ amount: 20, description: "lidl" }),
      tx({ amount: 100, description: "Rent" }),
      tx({ amount: 5, description: "   " }),
    ];

    const payees = payeeBreakdown(rows);

    expect(payees).toEqual([
      { name: "Rent", value: 100, count: 1 },
      { name: "Lidl", value: 50, count: 2 },
    ]);
  });

  it("caps the list", () => {
    const rows = Array.from({ length: 20 }, (_, i) => tx({ amount: i + 1, description: `p${i}` }));
    expect(payeeBreakdown(rows, 5)).toHaveLength(5);
  });
});

// ─── Heatmap ─────────────────────────────────────────────────────────────────

describe("spendingHeatmap", () => {
  // Mon 2 Mar 2026 … Sun 15 Mar 2026 — exactly two whole weeks.
  const from = new Date(2026, 2, 2);
  const to = new Date(2026, 2, 15);

  it("lays days out Monday-first in weekly columns", () => {
    const rows = [tx({ amount: 25, date: new Date(2026, 2, 2) }), tx({ amount: 15, date: new Date(2026, 2, 2) }), tx({ amount: 60, date: new Date(2026, 2, 8) })];

    const map = spendingHeatmap(rows, from, to);

    expect(map.weeks).toHaveLength(2);
    expect(map.weeks[0].days[0]).toMatchObject({ amount: 40, count: 2 }); // Monday
    expect(map.weeks[0].days[6]).toMatchObject({ amount: 60, count: 1 }); // Sunday
    expect(map.max).toBe(60);
  });

  it("blanks the days that fall outside the window", () => {
    // Starting on a Wednesday leaves Mon/Tue of that column empty.
    const map = spendingHeatmap([], new Date(2026, 2, 4), to);
    expect(map.weeks[0].days[0]).toBeNull();
    expect(map.weeks[0].days[1]).toBeNull();
    expect(map.weeks[0].days[2]).not.toBeNull();
  });

  it("totals each weekday across the window", () => {
    const rows = [tx({ amount: 10, date: new Date(2026, 2, 2) }), tx({ amount: 30, date: new Date(2026, 2, 9) })]; // both Mondays
    expect(spendingHeatmap(rows, from, to).weekdayTotals[0]).toBe(40);
  });

  it("leaves transfers out", () => {
    const map = spendingHeatmap([deposit(900, new Date(2026, 2, 3))], from, to);
    expect(map.max).toBe(0);
  });
});

// ─── Pace ────────────────────────────────────────────────────────────────────

describe("monthPace", () => {
  const now = new Date(2026, 2, 10); // 10 March 2026

  it("runs both months as cumulative totals and stops today's line at today", () => {
    const rows = [
      tx({ amount: 20, date: new Date(2026, 2, 2) }),
      tx({ amount: 30, date: new Date(2026, 2, 5) }),
      tx({ amount: 100, date: new Date(2026, 1, 3) }),
      tx({ amount: 100, date: new Date(2026, 1, 20) }),
    ];

    const pace = monthPace(rows, now);

    expect(pace.points[1].current).toBe(20); // day 2
    expect(pace.points[4].current).toBe(50); // day 5, running
    expect(pace.points[9].current).toBe(50); // day 10 is today
    expect(pace.points[10].current).toBeNull(); // day 11 hasn't happened
    expect(pace.points[10].previous).toBe(100); // last month keeps going
  });

  it("spans the longer of the two months", () => {
    // March has 31 days, February 28 — the axis has to cover March.
    const pace = monthPace([], now);
    expect(pace.points).toHaveLength(31);
    expect(pace.points[30].previous).toBeNull();
  });

  it("compares like for like on the same day of the month", () => {
    const rows = [tx({ amount: 40, date: new Date(2026, 2, 3) }), tx({ amount: 100, date: new Date(2026, 1, 3) }), tx({ amount: 500, date: new Date(2026, 1, 25) })];

    const pace = monthPace(rows, now);

    expect(pace.currentTotal).toBe(40);
    expect(pace.previousToDate).toBe(100); // not the 600 the month finished on
    expect(pace.previousTotal).toBe(600);
  });
});

// ─── Histogram ───────────────────────────────────────────────────────────────

describe("amountHistogram", () => {
  it("treats every edge as upper-exclusive", () => {
    const rows = [tx({ amount: 9.99 }), tx({ amount: 10 }), tx({ amount: 24.99 }), tx({ amount: 25 })];
    const bins = amountHistogram(rows);

    expect(bins[0]).toMatchObject({ min: 0, max: 10, count: 1 });
    expect(bins[1]).toMatchObject({ min: 10, max: 25, count: 2 }); // 10 and 24.99
    expect(bins[2]).toMatchObject({ min: 25, max: 50, count: 1 });
  });

  it("puts anything above the last edge in the open-ended bin", () => {
    const bins = amountHistogram([tx({ amount: 500 }), tx({ amount: 4000 })]);
    const last = bins[bins.length - 1];

    expect(last).toMatchObject({ min: 500, max: null, count: 2 });
    expect(last.amount).toBe(4500);
  });

  it("ignores income and transfers", () => {
    const bins = amountHistogram([tx({ amount: 30, type: "income" }), deposit(30, new Date(2026, 2, 2))]);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(0);
  });
});

// ─── Money flow ──────────────────────────────────────────────────────────────

describe("moneyFlow", () => {
  const into = (flow: NonNullable<ReturnType<typeof moneyFlow>>) => flow.links.filter((l) => l.target === FLOW_HUB_ID).reduce((s, l) => s + l.value, 0);
  const outOf = (flow: NonNullable<ReturnType<typeof moneyFlow>>) => flow.links.filter((l) => l.source === FLOW_HUB_ID).reduce((s, l) => s + l.value, 0);

  it("balances what came in against where it went", () => {
    const rows = [
      tx({ amount: 2000, type: "income", categoryId: "salary" }),
      tx({ amount: 800, categoryId: "rent" }),
      tx({ amount: 300, categoryId: "food" }),
      deposit(200, new Date(2026, 2, 5)),
      deposit(100, new Date(2026, 2, 5), true),
      withdrawal(50, new Date(2026, 2, 6)),
    ];

    const flow = moneyFlow(rows)!;

    expect(flow.total).toBe(2050); // 2000 earned + 50 pulled back out
    expect(into(flow)).toBe(2050);
    expect(outOf(flow)).toBe(2050);
    expect(flow.nodes.find((n) => n.id === FLOW_SAVINGS_ID)?.value).toBe(300); // 200 + 100
    expect(flow.nodes.find((n) => n.id === FLOW_LEFTOVER_ID)?.value).toBe(650);
    expect(flow.nodes.find((n) => n.id === FLOW_WITHDRAWALS_ID)?.value).toBe(50);
  });

  it("shows a shortfall as an inflow rather than a negative leftover", () => {
    const rows = [tx({ amount: 1000, type: "income", categoryId: "salary" }), tx({ amount: 1500, categoryId: "rent" })];

    const flow = moneyFlow(rows)!;

    expect(flow.nodes.find((n) => n.id === FLOW_DEFICIT_ID)?.value).toBe(500);
    expect(flow.nodes.find((n) => n.id === FLOW_LEFTOVER_ID)).toBeUndefined();
    expect(into(flow)).toBe(1500);
    expect(outOf(flow)).toBe(1500);
  });

  it("keeps a category used on both sides from forming a cycle", () => {
    const rows = [tx({ amount: 500, type: "income", categoryId: "misc" }), tx({ amount: 200, categoryId: "misc" })];

    const flow = moneyFlow(rows)!;
    const ids = flow.nodes.map((n) => n.id);

    expect(ids).toContain("in:misc");
    expect(ids).toContain("out:misc");
    // Every link runs source → hub or hub → sink; none can point back.
    expect(flow.links.every((l) => l.source === FLOW_HUB_ID || l.target === FLOW_HUB_ID)).toBe(true);
    expect(flow.links.some((l) => l.source === l.target)).toBe(false);
  });

  it("folds spending past the limit into one branch", () => {
    const rows = [
      tx({ amount: 1000, type: "income", categoryId: "salary" }),
      ...["a", "b", "c", "d"].map((c, i) => tx({ amount: 100 - i, categoryId: c })),
    ];

    const flow = moneyFlow(rows, 2)!;

    expect(flow.otherCount).toBe(2);
    expect(flow.nodes.find((n) => n.id === `out:${OTHER_CATEGORY_ID}`)?.value).toBe(98 + 97);
  });

  it("is undefined when there is nothing to draw", () => {
    expect(moneyFlow([])).toBeUndefined();
  });
});

// ─── Category → payee tree ───────────────────────────────────────────────────

describe("categoryPayeeTree", () => {
  it("nests payees under their category, biggest first", () => {
    const rows = [
      tx({ amount: 100, categoryId: "food", description: "Lidl" }),
      tx({ amount: 40, categoryId: "food", description: "AB" }),
      tx({ amount: 30, categoryId: "food", description: "lidl" }), // same payee, different case
      tx({ amount: 500, categoryId: "rent", description: "Landlord" }),
    ];

    const tree = categoryPayeeTree(rows);

    expect(tree.map((b) => b.categoryId)).toEqual(["rent", "food"]);
    expect(tree[1].value).toBe(170);
    expect(tree[1].children).toEqual([
      { name: "Lidl", value: 130, count: 2 },
      { name: "AB", value: 40, count: 1 },
    ]);
  });

  it("folds the payee tail inside each category", () => {
    const rows = ["a", "b", "c", "d", "e", "f"].map((p, i) => tx({ amount: 60 - i * 10, categoryId: "food", description: p }));
    const [food] = categoryPayeeTree(rows, 6, 5);

    expect(food.children).toHaveLength(6);
    expect(food.children[5]).toEqual({ name: OTHER_CATEGORY_ID, value: 10, count: 1 });
  });

  it("caps the number of categories", () => {
    const rows = ["a", "b", "c", "d"].map((c, i) => tx({ amount: 100 - i, categoryId: c }));
    expect(categoryPayeeTree(rows, 2)).toHaveLength(2);
  });

  it("leaves transfers out", () => {
    const rows = [tx({ amount: 10, categoryId: "food" }), deposit(900, new Date(2026, 2, 5))];
    expect(categoryPayeeTree(rows).map((b) => b.categoryId)).toEqual(["food"]);
  });
});

// ─── Distribution ────────────────────────────────────────────────────────────

describe("categoryDistribution", () => {
  it("computes a Tukey five-number summary", () => {
    const rows = [10, 20, 30, 40, 50].map((a) => tx({ amount: a, categoryId: "food" }));
    const [food] = categoryDistribution(rows);

    expect(food).toMatchObject({ low: 10, q1: 20, median: 30, q3: 40, high: 50, count: 5, outliers: [] });
  });

  it("pushes a lone big payment past the whisker instead of stretching it", () => {
    const rows = [10, 12, 14, 16, 18, 20, 100].map((a) => tx({ amount: a, categoryId: "food" }));
    const [food] = categoryDistribution(rows);

    expect(food).toMatchObject({ q1: 13, median: 16, q3: 19 });
    expect(food.high).toBe(20); // whisker stops at the last ordinary payment
    expect(food.outliers).toEqual([100]);
  });

  it("drops categories with too few payments to describe", () => {
    const rows = [...[1, 2, 3, 4, 5].map((a) => tx({ amount: a, categoryId: "food" })), ...[9, 9].map((a) => tx({ amount: a, categoryId: "rare" }))];
    expect(categoryDistribution(rows).map((r) => r.categoryId)).toEqual(["food"]);
  });

  it("ranks by total spend and caps the list", () => {
    const rows = [
      ...Array.from({ length: 6 }, () => tx({ amount: 100, categoryId: "big" })),
      ...Array.from({ length: 6 }, () => tx({ amount: 5, categoryId: "small" })),
    ];
    expect(categoryDistribution(rows, 1).map((r) => r.categoryId)).toEqual(["big"]);
  });
});
