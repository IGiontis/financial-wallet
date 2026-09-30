import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { computeGoalStats, deadlinePace } from "./investmentsUtils";
import { buildPlan, goalMonthlyNeed, goalMonthlyTarget } from "../plannerPage/plannerUtils";
import { committedMonthly } from "../allocation/allocationUtils";
import type { InvestmentGoal, InvestmentContribution } from "../../shared/types/IndexTypes";

// ─── Test helpers ─────────────────────────────────────────────────────────────

const makeGoal = (overrides: Partial<InvestmentGoal> = {}): InvestmentGoal =>
  ({
    id: "g1",
    userId: "u1",
    name: "Test goal",
    goalType: "targeted",
    isActive: true,
    isCompleted: false,
    createdAt: new Date("2024-01-01"),
    updatedAt: new Date("2024-01-01"),
    ...overrides,
  }) as InvestmentGoal;

const deposit = (amount: number, date = new Date()): InvestmentContribution =>
  ({ id: Math.random().toString(), userId: "u1", goalId: "g1", amount, contributionType: "deposit", date, createdAt: date, updatedAt: date }) as InvestmentContribution;

const withdrawal = (amount: number, date = new Date()): InvestmentContribution =>
  ({ id: Math.random().toString(), userId: "u1", goalId: "g1", amount, contributionType: "withdrawal", date, createdAt: date, updatedAt: date }) as InvestmentContribution;

// Every figure here is measured against "now", so the clock is pinned: these
// tests used to pass or fail depending on the day they happened to run.
const TODAY = new Date(2026, 8, 8); // 8 September 2026

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("computeGoalStats — totals", () => {
  it("sums deposits and subtracts withdrawals into totalSaved", () => {
    const stats = computeGoalStats(makeGoal({ goalType: "open_ended" }), [deposit(100), deposit(50), withdrawal(30)]);
    expect(stats.totalDeposited).toBe(150);
    expect(stats.totalWithdrawn).toBe(30);
    expect(stats.totalSaved).toBe(120);
    expect(stats.contributionCount).toBe(2);
    expect(stats.withdrawalCount).toBe(1);
  });

  it("handles an empty contribution list", () => {
    const stats = computeGoalStats(makeGoal({ goalType: "open_ended" }), []);
    expect(stats.totalSaved).toBe(0);
    expect(stats.contributionCount).toBe(0);
  });
});

describe("computeGoalStats — one-time targeted goal", () => {
  it("computes percentage reached and remaining", () => {
    const stats = computeGoalStats(makeGoal({ targetAmount: 1000 }), [deposit(250)]);
    expect(stats.percentageReached).toBeCloseTo(25);
    expect(stats.remaining).toBe(750);
    expect(stats.status).not.toBe("completed");
  });

  it("marks the goal completed once the target is reached", () => {
    const stats = computeGoalStats(makeGoal({ targetAmount: 1000 }), [deposit(600), deposit(400)]);
    expect(stats.totalSaved).toBe(1000);
    expect(stats.remaining).toBe(0);
    expect(stats.status).toBe("completed");
  });

  it("never reports negative remaining when overfunded", () => {
    const stats = computeGoalStats(makeGoal({ targetAmount: 500 }), [deposit(800)]);
    expect(stats.remaining).toBe(0);
    expect(stats.status).toBe("completed");
  });
});

describe("computeGoalStats — recurring monthly goal", () => {
  it("treats a full current-month deposit as on track", () => {
    const goal = makeGoal({ goalType: "targeted", targetPeriod: "monthly", targetAmount: 200, createdAt: new Date() });
    const stats = computeGoalStats(goal, [deposit(200, new Date())]);
    expect(stats.currentPeriodSaved).toBe(200);
    expect(stats.status).toBe("on_track");
  });

  it("flags the goal as behind when nothing is contributed this month", () => {
    const goal = makeGoal({ goalType: "targeted", targetPeriod: "monthly", targetAmount: 200, createdAt: new Date() });
    const stats = computeGoalStats(goal, []);
    expect(stats.status).toBe("behind");
    expect(stats.remaining).toBe(200);
  });
});

// ─── Carryover ────────────────────────────────────────────────────────────────
// The engine underneath every recurring goal: what each past period owed, what
// it paid, and what that leaves owing now. None of it was covered, and it is
// the part that decides whether the app tells you that you are behind.

describe("computeGoalStats — a monthly goal remembers every past month", () => {
  // Created 1 June 2026, "today" is 8 September 2026: June, July and August are
  // past, September is the current period.
  const monthly = (over: Partial<InvestmentGoal> = {}) =>
    makeGoal({ goalType: "targeted", targetPeriod: "monthly", targetAmount: 200, createdAt: new Date(2026, 5, 1), ...over });

  const on = (year: number, month: number, day = 10) => new Date(year, month, day);

  it("adds up what every missed month still owes", () => {
    const stats = computeGoalStats(monthly(), []);

    // Three months at 200 owed, plus this month's 200.
    expect(stats.arrears).toBe(600);
    expect(stats.missedMonths).toBe(3);
    expect(stats.remaining).toBe(800);
    expect(stats.status).toBe("behind");
    expect(stats.periodSurplus).toBe(0);
  });

  it("banks an overpayment as credit instead of forgetting it", () => {
    const stats = computeGoalStats(monthly(), [deposit(400, on(2026, 5)), deposit(400, on(2026, 6)), deposit(400, on(2026, 7))]);

    // 600 over three months, of which this month's 200 is covered.
    expect(stats.periodCredit).toBe(600);
    expect(stats.arrears).toBe(0);
    expect(stats.missedMonths).toBe(0);
    expect(stats.periodSurplus).toBe(400);
    expect(stats.remaining).toBe(0);
    expect(stats.status).toBe("ahead");
  });

  it("calls it on track only when the balance is exactly level", () => {
    const paid = [deposit(200, on(2026, 5)), deposit(200, on(2026, 6)), deposit(200, on(2026, 7)), deposit(200, on(2026, 8))];
    const stats = computeGoalStats(monthly(), paid);

    expect(stats.status).toBe("on_track");
    expect(stats.remaining).toBe(0);
    expect(stats.periodSurplus).toBe(0);
    expect(stats.periodCredit).toBe(0);
    expect(stats.arrears).toBe(0);
  });

  it("counts a withdrawal against the month it happened in", () => {
    // Paid in full in July, then took half of it back out in July.
    const stats = computeGoalStats(monthly({ createdAt: new Date(2026, 6, 1) }), [deposit(200, on(2026, 6)), withdrawal(100, on(2026, 6, 20)), deposit(200, on(2026, 7))]);

    // July owed 200 and kept 100; August owed 200 and paid 200.
    expect(stats.arrears).toBe(100);
    expect(stats.missedMonths).toBe(1);
    expect(stats.remaining).toBe(300); // 100 behind, plus September's 200
  });

  it("puts a deposit in the month it is dated, to the last hour of it", () => {
    // The boundary that decides whether August is paid or missed.
    const lastOfAugust = computeGoalStats(monthly({ createdAt: new Date(2026, 7, 1) }), [deposit(200, new Date(2026, 7, 31, 23, 59))]);
    const firstOfSeptember = computeGoalStats(monthly({ createdAt: new Date(2026, 7, 1) }), [deposit(200, new Date(2026, 8, 1, 0, 1))]);

    expect(lastOfAugust.missedMonths).toBe(0);
    expect(lastOfAugust.currentPeriodSaved).toBe(0);

    expect(firstOfSeptember.missedMonths).toBe(1);
    expect(firstOfSeptember.currentPeriodSaved).toBe(200);
  });

  it("charges nothing for months before the goal existed", () => {
    // A goal created this month has no history to answer for, whatever else is
    // sitting in the account.
    const stats = computeGoalStats(monthly({ createdAt: new Date(2026, 8, 1) }), []);

    expect(stats.arrears).toBe(0);
    expect(stats.missedMonths).toBe(0);
    expect(stats.remaining).toBe(200);
  });
});

describe("computeGoalStats — a yearly goal remembers every past year", () => {
  const yearly = (over: Partial<InvestmentGoal> = {}) =>
    makeGoal({ goalType: "targeted", targetPeriod: "yearly", targetAmount: 1200, createdAt: new Date(2024, 0, 1), ...over });

  it("owes for a year that went unpaid", () => {
    // 2024 paid in full, 2025 not touched, 2026 is the current year.
    const stats = computeGoalStats(yearly(), [deposit(1200, new Date(2024, 5, 1))]);

    expect(stats.arrears).toBe(1200);
    expect(stats.missedMonths).toBe(1); // one period, and the period is a year
    expect(stats.remaining).toBe(2400); // last year's 1200, plus this year's
    expect(stats.status).toBe("behind");
    expect(stats.yearlyRequired).toBe(1200);
  });

  it("carries an overpaid year forward as credit", () => {
    const stats = computeGoalStats(yearly(), [deposit(2000, new Date(2024, 5, 1)), deposit(2000, new Date(2025, 5, 1))]);

    expect(stats.periodCredit).toBe(1600);
    expect(stats.periodSurplus).toBe(400);
    expect(stats.status).toBe("ahead");
  });

  it("counts only this year in the current period", () => {
    const stats = computeGoalStats(yearly(), [deposit(1200, new Date(2024, 5, 1)), deposit(1200, new Date(2025, 5, 1)), deposit(300, new Date(2026, 1, 1))]);

    expect(stats.currentPeriodSaved).toBe(300);
    expect(stats.remaining).toBe(900);
    expect(stats.status).toBe("behind");
  });
});

describe("computeGoalStats — a targeted goal with a deadline", () => {
  const targeted = (over: Partial<InvestmentGoal> = {}) => makeGoal({ targetAmount: 1200, createdAt: new Date(2026, 4, 1), ...over });

  it("spreads what is left over the months that are left, this one included", () => {
    // Today 8 Sep 2026, deadline February 2027: September to February is six
    // months to save in — the same six slices the Planner charges.
    const stats = computeGoalStats(targeted({ deadline: new Date(2027, 1, 20) }), [deposit(300, new Date(2026, 5, 1))]);

    expect(stats.monthsLeft).toBe(6);
    expect(stats.remaining).toBe(900);
    expect(stats.monthlyRequired).toBe(150);
    expect(stats.yearlyRequired).toBe(1800);
  });

  it("asks for everything left, now, once the deadline is here or gone", () => {
    // Not for nothing: an overdue goal is not settled by being ignored, and the
    // Planner and Allocation page already charge the whole remainder this month.
    const thisMonth = computeGoalStats(targeted({ deadline: new Date(2026, 8, 30) }), [deposit(300)]);
    const past = computeGoalStats(targeted({ deadline: new Date(2026, 1, 1) }), [deposit(300)]);

    expect(thisMonth.monthsLeft).toBe(1);
    expect(thisMonth.monthlyRequired).toBe(900);
    expect(past.monthsLeft).toBe(0);
    expect(past.monthlyRequired).toBe(900);
    expect(past.status).toBe("behind");
  });

  it("judges the pace on what has been saved per month so far", () => {
    // Created four months ago, 800 saved: 200 a month against the 150 needed.
    const ahead = computeGoalStats(targeted({ deadline: new Date(2027, 2, 20) }), [deposit(800, new Date(2026, 5, 1))]);
    // The same target with almost nothing in it.
    const behind = computeGoalStats(targeted({ deadline: new Date(2027, 2, 20) }), [deposit(40, new Date(2026, 5, 1))]);

    expect(ahead.status).toBe("ahead");
    expect(behind.status).toBe("behind");
  });
});

// ─── The same figure, reached another way ────────────────────────────────────
// Each of these recomputes something the function already returns, by a route
// the function does not take. A single test only proves the code agrees with
// itself.

describe("computeGoalStats — figures that must agree with each other", () => {
  const scenarios = () => {
    const monthly = makeGoal({ goalType: "targeted", targetPeriod: "monthly", targetAmount: 200, createdAt: new Date(2026, 2, 1) });
    const yearly = makeGoal({ goalType: "targeted", targetPeriod: "yearly", targetAmount: 1200, createdAt: new Date(2024, 0, 1) });
    const targeted = makeGoal({ targetAmount: 1000, createdAt: new Date(2026, 4, 1), deadline: new Date(2027, 2, 1) });
    const openEnded = makeGoal({ goalType: "open_ended", createdAt: new Date(2026, 0, 1) });

    const sets: InvestmentContribution[][] = [
      [],
      [deposit(200, new Date(2026, 3, 5))],
      [deposit(500, new Date(2026, 3, 5)), withdrawal(700, new Date(2026, 8, 2))],
      [deposit(150, new Date(2026, 2, 31)), deposit(150, new Date(2026, 4, 1)), withdrawal(50, new Date(2026, 5, 15))],
      [deposit(2000, new Date(2024, 6, 1)), deposit(1000, new Date(2025, 6, 1)), deposit(100, new Date(2026, 6, 1))],
    ];

    return [monthly, yearly, targeted, openEnded].flatMap((goal) => sets.map((set) => ({ goal, set, stats: computeGoalStats(goal, set) })));
  };

  it("keeps totalSaved equal to deposits minus withdrawals, every time", () => {
    for (const { set, stats } of scenarios()) {
      const deposits = set.filter((c) => c.contributionType === "deposit").reduce((sum, c) => sum + c.amount, 0);
      const withdrawals = set.filter((c) => c.contributionType === "withdrawal").reduce((sum, c) => sum + c.amount, 0);

      expect(stats.totalDeposited).toBe(deposits);
      expect(stats.totalWithdrawn).toBe(withdrawals);
      expect(stats.totalSaved).toBe(deposits - withdrawals);
    }
  });

  it("never reports being behind and ahead at the same time", () => {
    for (const { stats } of scenarios()) {
      // `remaining` and `periodSurplus` are the two sides of one balance, and
      // `arrears` and `periodCredit` the two sides of the carried one.
      expect(Math.min(stats.remaining ?? 0, stats.periodSurplus ?? 0)).toBe(0);
      expect(Math.min(stats.arrears ?? 0, stats.periodCredit ?? 0)).toBe(0);

      if (stats.status === "ahead") expect(stats.periodSurplus).toBeGreaterThan(0);
      if (stats.status === "behind") expect(stats.remaining).toBeGreaterThan(0);
      if (stats.status === "on_track") expect(stats.remaining).toBe(0);
    }
  });

  it("keeps every reported figure a real number, never negative", () => {
    for (const { stats } of scenarios()) {
      const figures = {
        totalDeposited: stats.totalDeposited,
        totalWithdrawn: stats.totalWithdrawn,
        remaining: stats.remaining,
        arrears: stats.arrears,
        periodCredit: stats.periodCredit,
        periodSurplus: stats.periodSurplus,
        currentPeriodSaved: stats.currentPeriodSaved,
        missedMonths: stats.missedMonths,
      };

      for (const [name, value] of Object.entries(figures)) {
        if (value === undefined) continue;
        expect(Number.isFinite(value), name).toBe(true);
        expect(value, name).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("keeps the progress figure inside 0-100, whatever the month did", () => {
    // A month with more taken out than put in produced a negative percentage,
    // which two of the three progress bars pass straight to a width.
    for (const { stats } of scenarios()) {
      const pct = stats.percentageReached;
      if (pct === undefined) continue;
      expect(pct).toBeGreaterThanOrEqual(0);
      expect(pct).toBeLessThanOrEqual(100);
    }
  });

  it("does not care what order the contributions arrive in", () => {
    for (const { goal, set } of scenarios()) {
      const forwards = computeGoalStats(goal, set);
      const backwards = computeGoalStats(goal, [...set].reverse());

      expect(backwards).toEqual(forwards);
    }
  });

  it("reports the latest contribution as the last one, however they are sorted", () => {
    const goal = makeGoal({ goalType: "open_ended" });
    const set = [deposit(10, new Date(2026, 1, 1)), deposit(10, new Date(2026, 7, 20)), deposit(10, new Date(2025, 11, 31))];

    expect(computeGoalStats(goal, set).lastContributionDate).toEqual(new Date(2026, 7, 20));
    expect(computeGoalStats(goal, [...set].reverse()).lastContributionDate).toEqual(new Date(2026, 7, 20));
  });
});

describe("computeGoalStats — a recurring goal with no target set", () => {
  // A goal saved before its amount was filled in. It has to survive that: the
  // form allows it, and the page still has to render a row.
  it("asks for nothing, and reports nothing saved, when the month is empty", () => {
    const goal = makeGoal({ goalType: "targeted", targetPeriod: "monthly", targetAmount: undefined, createdAt: new Date(2026, 6, 1) });
    const stats = computeGoalStats(goal, []);

    expect(stats.monthlyRequired).toBe(0);
    expect(stats.remaining).toBe(0);
    expect(stats.status).toBe("on_track");
    expect(stats.percentageReached).toBe(100);
  });

  it("still reports being behind when money was taken back out", () => {
    // Nothing is owed, so there is no fraction to show — but the balance is
    // genuinely negative, and 100% would say the opposite.
    const goal = makeGoal({ goalType: "targeted", targetPeriod: "monthly", targetAmount: undefined, createdAt: new Date(2026, 6, 1) });
    const stats = computeGoalStats(goal, [withdrawal(50, new Date(2026, 8, 2))]);

    expect(stats.status).toBe("behind");
    expect(stats.remaining).toBe(50);
    expect(stats.percentageReached).toBe(0);
  });

  it("does the same for a yearly goal", () => {
    const goal = makeGoal({ goalType: "targeted", targetPeriod: "yearly", targetAmount: undefined, createdAt: new Date(2025, 0, 1) });

    expect(computeGoalStats(goal, []).status).toBe("on_track");
    expect(computeGoalStats(goal, [withdrawal(80, new Date(2026, 2, 2))]).percentageReached).toBe(0);
    expect(computeGoalStats(goal, [deposit(80, new Date(2026, 2, 2))]).status).toBe("ahead");
  });

  it("reports a one-time goal with no target as nothing to reach", () => {
    const stats = computeGoalStats(makeGoal({ targetAmount: undefined }), [deposit(100)]);

    expect(stats.percentageReached).toBe(0);
    expect(stats.remaining).toBe(0);
    expect(stats.status).toBe("completed"); // 100 saved against a target of nothing
  });
});

describe("computeGoalStats — a targeted goal keeping exactly the pace", () => {
  it("calls it on track when the average saved matches the rate needed, to the cent", () => {
    // Created 1 July, today 8 September: two months of saving. 300 saved of
    // 1,200 leaves 900 over the six months September to February — 150 a
    // month needed against 150 a month achieved.
    const goal = makeGoal({ targetAmount: 1200, createdAt: new Date(2026, 6, 1), deadline: new Date(2027, 1, 15) });
    const stats = computeGoalStats(goal, [deposit(300, new Date(2026, 7, 10))]);

    expect(stats.monthlyRequired).toBe(150);
    expect(stats.status).toBe("on_track");
  });
});

// ─── Money compared to the cent ─────────────────────────────────────────────
// A float sum of cents does not land on the cents: 256.02 + 333.33 + 410.65 is
// 999.9999999999999 in one order and 1000 in another. A status must not depend
// on the order the deposits happened to be added in.

const orders = <T,>(items: T[]): T[][] => (items.length <= 1 ? [items] : items.flatMap((item, i) => orders([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest])));

describe("computeGoalStats — money compared to the cent", () => {
  it("completes a €1,000 goal paid to the cent, in every order", () => {
    const goal = makeGoal({ targetAmount: 1000, createdAt: new Date(2026, 4, 1), deadline: new Date(2027, 1, 1) });
    const paid = [256.02, 333.33, 410.65];
    // In whole cents the three add up to the target exactly.
    expect(paid.reduce((sum, n) => sum + Math.round(n * 100), 0)).toBe(100000);

    for (const order of orders(paid)) {
      const stats = computeGoalStats(goal, order.map((amount, i) => deposit(amount, new Date(2026, 5 + i, 3))));
      expect(stats.status).toBe("completed");
      expect(stats.totalSaved).toBe(1000);
      expect(stats.remaining).toBe(0);
      expect(stats.percentageReached).toBe(100);
    }
  });

  it("calls a monthly goal paid to the cent on track, not behind with €0.00 remaining", () => {
    const goal = makeGoal({ goalType: "targeted", targetPeriod: "monthly", targetAmount: 100, createdAt: new Date(2026, 8, 1) });

    for (const order of orders([1.02, 64.07, 34.91])) {
      const stats = computeGoalStats(goal, order.map((amount, i) => deposit(amount, new Date(2026, 8, 1 + i))));
      expect(stats.status).toBe("on_track");
      expect(stats.remaining).toBe(0);
      expect(stats.periodSurplus).toBe(0);
      expect(stats.currentPeriodSaved).toBe(100);
    }
  });

  it("does not count a past month paid to the cent as missed", () => {
    const goal = makeGoal({ goalType: "targeted", targetPeriod: "monthly", targetAmount: 100, createdAt: new Date(2026, 6, 1) });
    const july = [deposit(1.02, new Date(2026, 6, 2)), deposit(64.07, new Date(2026, 6, 9)), deposit(34.91, new Date(2026, 6, 20))];
    const stats = computeGoalStats(goal, [...july, deposit(100, new Date(2026, 7, 5)), deposit(100, new Date(2026, 8, 5))]);

    expect(stats.missedMonths).toBe(0);
    expect(stats.arrears).toBe(0);
    expect(stats.periodCredit).toBe(0);
    expect(stats.status).toBe("on_track");
  });

  it("does the same for a yearly goal", () => {
    const goal = makeGoal({ goalType: "targeted", targetPeriod: "yearly", targetAmount: 1000, createdAt: new Date(2026, 0, 1) });
    for (const order of orders([256.02, 333.33, 410.65])) {
      expect(computeGoalStats(goal, order.map((amount, i) => deposit(amount, new Date(2026, 2 + i, 1)))).status).toBe("on_track");
    }
  });

  it("still tells a cent short from a cent over", () => {
    const targeted = makeGoal({ targetAmount: 1000, createdAt: new Date(2026, 4, 1) });
    const short = computeGoalStats(targeted, [deposit(256.01), deposit(333.33), deposit(410.65)]);
    expect(short.status).not.toBe("completed");
    expect(short.remaining).toBe(0.01);

    const monthly = makeGoal({ goalType: "targeted", targetPeriod: "monthly", targetAmount: 100, createdAt: new Date(2026, 8, 1) });
    const under = computeGoalStats(monthly, [deposit(1.02), deposit(64.07), deposit(34.9)]);
    const over = computeGoalStats(monthly, [deposit(1.02), deposit(64.07), deposit(34.92)]);
    expect(under).toMatchObject({ status: "behind", remaining: 0.01 });
    expect(over).toMatchObject({ status: "ahead", periodSurplus: 0.01 });
  });

  it("keeps the exact pace on track when the average divides to a float hair", () => {
    // 300.30 over three months is 100.10000000000001 as a float; the need is
    // 600.60 over the six months September to February, 100.10 exactly.
    const goal = makeGoal({ targetAmount: 900.9, createdAt: new Date(2026, 5, 8), deadline: new Date(2027, 1, 10) });
    const stats = computeGoalStats(goal, [deposit(100.1, new Date(2026, 5, 9)), deposit(100.1, new Date(2026, 6, 9)), deposit(100.1, new Date(2026, 7, 9))]);

    expect(stats.monthlyRequired).toBe(100.1);
    expect(stats.status).toBe("on_track");
  });
});

// ─── One monthly figure for a goal with a deadline ──────────────────────────
// The Goals page divided what was left by the months *between* now and the
// deadline; the Planner and Allocation by one more. €900 due in two months was
// €450 a month on one screen and €300 on the other two.

describe("deadlinePace — the rule every screen uses", () => {
  const SEP_29 = new Date(2026, 8, 29);

  it("counts this month and the deadline's month: €900 due in November is three slices of €300", () => {
    expect(deadlinePace(900, new Date(2026, 10, 20), 0, SEP_29)).toEqual({ monthsLeft: 3, perMonth: 300, thisMonth: 300 });
  });

  it("adds up to what is left, to the cent, however it divides", () => {
    for (const remaining of [900, 1000, 1234.57, 0.05, 99999.99]) {
      for (let ahead = 1; ahead <= 13; ahead++) {
        const { monthsLeft, perMonth, thisMonth } = deadlinePace(remaining, new Date(2026, 8 + ahead, 15), 0, SEP_29);
        expect(monthsLeft).toBe(ahead + 1);
        // In whole cents, where the addition is exact.
        expect(Math.round(thisMonth * 100) + Math.round(perMonth * 100) * (monthsLeft - 1)).toBe(Math.round(remaining * 100));
        // And the slices are level: this month differs from the rest by rounding only.
        expect(Math.abs(thisMonth - perMonth)).toBeLessThanOrEqual(0.01 * monthsLeft);
      }
    }
  });

  it("holds the figure steady through the month as this month's slice goes in", () => {
    // 1,200 by February, seen on 8 September: six slices of 200.
    const feb = new Date(2027, 1, 20);
    const at = new Date(2026, 8, 8);

    expect(deadlinePace(1200, feb, 0, at)).toEqual({ monthsLeft: 6, perMonth: 200, thisMonth: 200 });
    // September's 200 in: the figure stays 200, and this month asks for nothing
    // more — it used to drop to 166.67 and ask for a second slice.
    expect(deadlinePace(1000, feb, 200, at)).toEqual({ monthsLeft: 6, perMonth: 200, thisMonth: 0 });
    // Part of it in: the rest of this month's slice is still wanted.
    expect(deadlinePace(1150, feb, 50, at)).toEqual({ monthsLeft: 6, perMonth: 200, thisMonth: 150 });
    // And on 1 October, the same 1,000 over the five months left: still 200.
    expect(deadlinePace(1000, feb, 0, new Date(2026, 9, 1)).perMonth).toBe(200);
  });

  it("lets a month that has had more than its slice lower the ones after it", () => {
    const pace = deadlinePace(700, new Date(2027, 1, 20), 500, new Date(2026, 8, 8));

    expect(pace).toEqual({ monthsLeft: 6, perMonth: 140, thisMonth: 0 });
    expect(pace.thisMonth + pace.perMonth * 5).toBe(700);
  });

  it("does not demand money taken out this month back in one go", () => {
    expect(deadlinePace(1200, new Date(2027, 1, 20), -300, new Date(2026, 8, 8))).toEqual(deadlinePace(1200, new Date(2027, 1, 20), 0, new Date(2026, 8, 8)));
  });

  it("asks for everything left, now, when the deadline is this month or has gone", () => {
    expect(deadlinePace(900, new Date(2026, 8, 30), 0, SEP_29)).toEqual({ monthsLeft: 1, perMonth: 900, thisMonth: 900 });
    expect(deadlinePace(900, new Date(2026, 8, 30), 300, SEP_29)).toEqual({ monthsLeft: 1, perMonth: 900, thisMonth: 900 });
    expect(deadlinePace(900, new Date(2026, 1, 1), 0, SEP_29)).toEqual({ monthsLeft: 0, perMonth: 900, thisMonth: 900 });
  });

  it("counts by month, not by day, across a year end and a leap day", () => {
    const dec = new Date(2026, 11, 31);
    expect(deadlinePace(900, new Date(2027, 1, 1), 0, dec).monthsLeft).toBe(3); // Dec, Jan, Feb
    expect(deadlinePace(900, new Date(2027, 1, 28), 0, dec)).toEqual(deadlinePace(900, new Date(2027, 1, 1), 0, dec));
    expect(deadlinePace(1200, new Date(2028, 1, 29), 0, new Date(2027, 8, 1)).monthsLeft).toBe(6);
  });

  it("asks for nothing once nothing is left", () => {
    expect(deadlinePace(0, new Date(2027, 1, 20), 0, SEP_29)).toEqual({ monthsLeft: 6, perMonth: 0, thisMonth: 0 });
  });
});

describe("a goal with a deadline reads the same on the Goals page, the Planner and Allocation", () => {
  // Today 8 September 2026. 1,200 wanted by 20 November, 300 put in in June:
  // 900 left over September, October and November.
  const NOW = new Date(2026, 8, 8);
  const goal = (over: Partial<InvestmentGoal> = {}) => makeGoal({ targetAmount: 1200, createdAt: new Date(2026, 4, 1), deadline: new Date(2026, 10, 20), ...over });
  const june = deposit(300, new Date(2026, 5, 1));
  const plan = (stats: ReturnType<typeof computeGoalStats>, horizon = 12) => buildPlan({ bills: [], goals: [stats], horizon, now: NOW });

  it("is €300 a month everywhere — the Goals page used to say €450", () => {
    const stats = computeGoalStats(goal(), [june]);
    const row = plan(stats).rows.find((r) => r.source === "goal")!;

    expect(stats.monthsLeft).toBe(3);
    expect(stats.monthlyRequired).toBe(300);
    expect(goalMonthlyTarget(stats, NOW)).toBe(300);
    expect(goalMonthlyNeed(stats, NOW)).toBe(300);
    expect(committedMonthly([], [stats], [], NOW).goals).toBe(300);
    expect(row).toMatchObject({ perMonth: -300, total: -900, occurrences: 3 });
  });

  it("charges the Planner exactly what is left, whatever the horizon", () => {
    const stats = computeGoalStats(goal(), [june]);
    for (const horizon of [3, 6, 12, 36]) expect(plan(stats, horizon).goalsTotal).toBe(stats.remaining);
    // Month by month: today, 1 October, 1 November, and nothing after.
    const events = plan(stats).events.filter((e) => e.kind === "goal");
    expect(events.map((e) => [e.date.getMonth(), e.amount])).toEqual([
      [8, -300],
      [9, -300],
      [10, -300],
    ]);
  });

  it("stops asking this month once this month's slice is in, on every screen", () => {
    const stats = computeGoalStats(goal(), [june, deposit(300, new Date(2026, 8, 5))]);

    expect(stats.monthlyRequired).toBe(300);
    expect(goalMonthlyNeed(stats, NOW)).toBe(0);
    expect(committedMonthly([], [stats], [], NOW).goals).toBe(300);
    expect(plan(stats).goalsTotal).toBe(600);
  });

  it("claims nothing for a paused goal, on the Planner or on Allocation", () => {
    const stats = computeGoalStats(goal({ isActive: false }), [june]);

    expect(committedMonthly([], [stats], [], NOW).goals).toBe(0);
    expect(plan(stats).rows.some((r) => r.source === "goal")).toBe(false);
  });
});
