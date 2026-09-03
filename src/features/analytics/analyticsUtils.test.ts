import { describe, it, expect } from "vitest";
import {
  averageSavingsRate,
  categoryTrend,
  cumulativeNet,
  moneyFlow,
  monthPace,
  monthlyFlows,
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
  categoryDeltas,
  categorySeries,
  spendingWaterfall,
  committedSplit,
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
    expect(rangeStart("1m", now)).toEqual(new Date(2026, 7, 1)); // August alone
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

// ─── What changed ────────────────────────────────────────────────────────────

describe("categoryDeltas", () => {
  const now = new Date(2026, 7, 20); // 20 Aug 2026

  it("compares the window against the one of equal length before it", () => {
    const rows = [
      tx({ amount: 500, categoryId: "bet", date: new Date(2026, 7, 5) }),
      tx({ amount: 100, categoryId: "bet", date: new Date(2026, 6, 5) }),
      tx({ amount: 60, categoryId: "food", date: new Date(2026, 7, 6) }),
      tx({ amount: 200, categoryId: "food", date: new Date(2026, 6, 6) }),
    ];

    const deltas = categoryDeltas(rows, new Date(2026, 7, 1), now);

    // Sorted by size of change, so the thing that moved most leads.
    expect(deltas.map((d) => d.categoryId)).toEqual(["bet", "food"]);
    expect(deltas[0]).toMatchObject({ current: 500, previous: 100, delta: 400 });
    expect(deltas[1]).toMatchObject({ current: 60, previous: 200, delta: -140 });
  });

  it("ranks by movement, not by size", () => {
    // Rent is far bigger but did not budge; the small habit that doubled is the
    // one worth showing first.
    const rows = [
      tx({ amount: 900, categoryId: "rent", date: new Date(2026, 7, 1) }),
      tx({ amount: 900, categoryId: "rent", date: new Date(2026, 6, 1) }),
      tx({ amount: 80, categoryId: "coffee", date: new Date(2026, 7, 2) }),
      tx({ amount: 20, categoryId: "coffee", date: new Date(2026, 6, 2) }),
    ];

    expect(categoryDeltas(rows, new Date(2026, 7, 1), now).map((d) => d.categoryId)).toEqual(["coffee"]);
  });

  it("reports nothing when the earlier window was empty", () => {
    // Otherwise a first month on the app announces every category as a rise,
    // which is the most misleading thing the page could say.
    const rows = [tx({ amount: 500, categoryId: "rent", date: new Date(2026, 7, 1) })];
    expect(categoryDeltas(rows, new Date(2026, 7, 1), now)).toEqual([]);
  });

  it("has nothing to compare against over all time", () => {
    expect(categoryDeltas([tx({ amount: 10 })], null, now)).toEqual([]);
  });

  it("counts a category that only appeared this time", () => {
    const rows = [tx({ amount: 75, categoryId: "gym", date: new Date(2026, 7, 3) }), tx({ amount: 10, categoryId: "food", date: new Date(2026, 6, 3) })];
    expect(categoryDeltas(rows, new Date(2026, 7, 1), now)[0]).toMatchObject({ current: 75, previous: 0, delta: 75 });
  });
});

// ─── Small multiples ─────────────────────────────────────────────────────────

describe("categorySeries", () => {
  const now = new Date(2026, 7, 20);

  it("gives every category a dense series across the months shown", () => {
    const rows = [
      tx({ amount: 100, categoryId: "food", date: new Date(2026, 5, 4) }),
      tx({ amount: 150, categoryId: "food", date: new Date(2026, 7, 4) }),
      tx({ amount: 40, categoryId: "fuel", date: new Date(2026, 6, 4) }),
    ];
    const flows = monthlyFlows(rows, new Date(2026, 5, 1), now);
    const series = categorySeries(rows, flows);

    expect(flows).toHaveLength(3);
    // July has no food spending, and must read as zero rather than be skipped.
    expect(series.find((s) => s.categoryId === "food")!.points).toEqual([100, 0, 150]);
    expect(series.find((s) => s.categoryId === "fuel")!.points).toEqual([0, 40, 0]);
  });

  it("sorts by total and keeps only the busiest", () => {
    const rows = [
      tx({ amount: 10, categoryId: "a", date: new Date(2026, 7, 1) }),
      tx({ amount: 90, categoryId: "b", date: new Date(2026, 7, 1) }),
      tx({ amount: 50, categoryId: "c", date: new Date(2026, 7, 1) }),
    ];
    const flows = monthlyFlows(rows, new Date(2026, 7, 1), now);

    expect(categorySeries(rows, flows, 2).map((s) => s.categoryId)).toEqual(["b", "c"]);
  });

  it("reads the last complete month against the average of the ones before", () => {
    const rows = [
      tx({ amount: 100, categoryId: "bet", date: new Date(2026, 4, 1) }),
      tx({ amount: 100, categoryId: "bet", date: new Date(2026, 5, 1) }),
      tx({ amount: 200, categoryId: "bet", date: new Date(2026, 6, 1) }),
    ];
    const flows = monthlyFlows(rows, new Date(2026, 4, 1), now);

    expect(categorySeries(rows, flows, 12, now)[0].trend).toBe(1); // double the usual
  });

  it("does not read a collapse off the month still in progress", () => {
    // On the 20th only part of August has happened. Judged against whole
    // months every category looks as though it has stopped dead.
    const rows = [
      tx({ amount: 300, categoryId: "food", date: new Date(2026, 5, 4) }),
      tx({ amount: 300, categoryId: "food", date: new Date(2026, 6, 4) }),
      tx({ amount: 60, categoryId: "food", date: new Date(2026, 7, 4) }),
    ];
    const flows = monthlyFlows(rows, new Date(2026, 5, 1), now);
    const [food] = categorySeries(rows, flows, 12, now);

    expect(food.points).toEqual([300, 300, 60]); // the line still draws it
    expect(food.trend).toBe(0); // but July matched June, so nothing to report
  });
});

// ─── Waterfall ───────────────────────────────────────────────────────────────

describe("spendingWaterfall", () => {
  it("walks income down through the big categories to what is left", () => {
    const rows = [
      tx({ amount: 2000, type: "income", categoryId: "salary" }),
      tx({ amount: 600, categoryId: "rent" }),
      tx({ amount: 300, categoryId: "food" }),
    ];
    const steps = spendingWaterfall(rows);

    expect(steps.map((s) => s.id)).toEqual(["income", "rent", "food", "leftover"]);
    expect(steps.map((s) => s.balance)).toEqual([2000, 1400, 1100, 1100]);
    expect(steps[steps.length - 1].kind).toBe("result");
  });

  it("gathers everything past the limit into one step", () => {
    const rows = [
      tx({ amount: 1000, type: "income", categoryId: "salary" }),
      ...["a", "b", "c"].map((c) => tx({ amount: 100, categoryId: c })),
      tx({ amount: 30, categoryId: "d" }),
      tx({ amount: 20, categoryId: "e" }),
    ];
    const steps = spendingWaterfall(rows, 3);

    expect(steps.map((s) => s.id)).toEqual(["income", "a", "b", "c", OTHER_CATEGORY_ID, "leftover"]);
    expect(steps.find((s) => s.id === OTHER_CATEGORY_ID)!.amount).toBe(-50);
    expect(steps[steps.length - 1].balance).toBe(650);
  });

  it("ends below zero when the month did", () => {
    const rows = [tx({ amount: 100, type: "income", categoryId: "salary" }), tx({ amount: 250, categoryId: "rent" })];
    expect(spendingWaterfall(rows)[2].balance).toBe(-150);
  });
});

// ─── Committed against free ──────────────────────────────────────────────────

describe("committedSplit", () => {
  const now = new Date(2026, 7, 20);

  it("counts bills and goal deposits as already spoken for", () => {
    const rows = [
      tx({ amount: 400, categoryId: "rent", billId: "b1", date: new Date(2026, 7, 2) }),
      tx({ amount: 150, categoryId: "food", date: new Date(2026, 7, 3) }),
      tx({ amount: 200, type: "investment", isGoalTransaction: true, contributionType: "deposit", date: new Date(2026, 7, 4) }),
    ];
    const [august] = committedSplit(rows, monthlyFlows(rows, new Date(2026, 7, 1), now));

    expect(august).toMatchObject({ committed: 600, free: 150 });
    expect(august.share).toBe(0.8);
  });

  it("does not count money pulled back out of a goal as committed", () => {
    const rows = [
      tx({ amount: 300, type: "investment", isGoalTransaction: true, contributionType: "withdrawal", date: new Date(2026, 7, 4) }),
      tx({ amount: 100, categoryId: "food", date: new Date(2026, 7, 5) }),
    ];
    const [august] = committedSplit(rows, monthlyFlows(rows, new Date(2026, 7, 1), now));

    expect(august).toMatchObject({ committed: 0, free: 100 });
  });

  it("reports a quiet month as zero rather than dropping it", () => {
    const rows = [tx({ amount: 100, categoryId: "food", date: new Date(2026, 5, 5) })];
    const months = committedSplit(rows, monthlyFlows(rows, new Date(2026, 5, 1), now));

    expect(months).toHaveLength(3);
    expect(months[1]).toMatchObject({ committed: 0, free: 0, share: 0 });
  });
});
