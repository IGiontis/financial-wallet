import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { computeGoalStats } from "./investmentsUtils";
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

  it("spreads what is left over the months that are left", () => {
    // Today 8 Sep 2026, deadline March 2027: six months ahead.
    const stats = computeGoalStats(targeted({ deadline: new Date(2027, 2, 20) }), [deposit(300, new Date(2026, 5, 1))]);

    expect(stats.monthsLeft).toBe(6);
    expect(stats.remaining).toBe(900);
    expect(stats.monthlyRequired).toBe(150);
    expect(stats.yearlyRequired).toBe(1800);
  });

  it("asks for nothing per month once the deadline is here or gone", () => {
    const thisMonth = computeGoalStats(targeted({ deadline: new Date(2026, 8, 30) }), [deposit(300)]);
    const past = computeGoalStats(targeted({ deadline: new Date(2026, 1, 1) }), [deposit(300)]);

    expect(thisMonth.monthsLeft).toBe(0);
    expect(thisMonth.monthlyRequired).toBeUndefined();
    expect(past.monthsLeft).toBe(0);
    expect(past.monthlyRequired).toBeUndefined();
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
    // 1,200 leaves 900 over the six months to the deadline — 150 a month
    // needed against 150 a month achieved.
    const goal = makeGoal({ targetAmount: 1200, createdAt: new Date(2026, 6, 1), deadline: new Date(2027, 2, 15) });
    const stats = computeGoalStats(goal, [deposit(300, new Date(2026, 7, 10))]);

    expect(stats.monthlyRequired).toBe(150);
    expect(stats.status).toBe("on_track");
  });
});
