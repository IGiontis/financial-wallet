import { describe, it, expect } from "vitest";
import { buildPlan, dailyBurnRate, detectSalary, goalMonthlyNeed, goalsStillNeeded, lastSalaryDate, nextSalaryDate } from "./plannerUtils";
import type { BillWithStatus, InvestmentGoalWithStats, Transaction } from "../../shared/types/IndexTypes";

const tx = (overrides: Partial<Transaction> = {}): Transaction =>
  ({
    id: Math.random().toString(),
    userId: "u1",
    amount: 10,
    type: "expense",
    categoryId: "food",
    date: new Date(2026, 7, 10),
    description: "Shop",
    createdAt: new Date(2026, 7, 10),
    updatedAt: new Date(2026, 7, 10),
    ...overrides,
  }) as Transaction;

const income = (amount: number, date: Date) => tx({ amount, type: "income", categoryId: "salary", description: "Salary", date });

const bill = (overrides: Partial<BillWithStatus> = {}): BillWithStatus =>
  ({
    id: `b${Math.random()}`,
    userId: "u1",
    name: "Bill",
    amount: 50,
    categoryId: "c1",
    frequency: "monthly",
    isActive: true,
    createdAt: new Date(2026, 0, 1),
    updatedAt: new Date(2026, 0, 1),
    currentPeriodKey: "2026-08",
    isPaidThisPeriod: false,
    payments: [],
    monthlyEquivalent: 50,
    ...overrides,
  }) as BillWithStatus;

const goal = (overrides: Partial<InvestmentGoalWithStats> = {}): InvestmentGoalWithStats =>
  ({
    id: `g${Math.random()}`,
    userId: "u1",
    name: "Goal",
    goalType: "targeted",
    isActive: true,
    isCompleted: false,
    createdAt: new Date(2026, 0, 1),
    updatedAt: new Date(2026, 0, 1),
    totalDeposited: 0,
    totalWithdrawn: 0,
    totalSaved: 0,
    contributionCount: 0,
    withdrawalCount: 0,
    ...overrides,
  }) as InvestmentGoalWithStats;

// ─── Salary detection ────────────────────────────────────────────────────────

describe("detectSalary", () => {
  const now = new Date(2026, 7, 14); // 14 Aug 2026

  it("finds a salary repeating on the same day", () => {
    const rows = [income(2000, new Date(2026, 4, 1)), income(2000, new Date(2026, 5, 1)), income(2050, new Date(2026, 6, 1)), income(2000, new Date(2026, 7, 1))];

    expect(detectSalary(rows, now)).toEqual({ amount: 2000, dayOfMonth: 1, occurrences: 4 });
  });

  it("takes the largest income each month, ignoring small extras", () => {
    const rows = [
      income(2000, new Date(2026, 6, 5)),
      income(120, new Date(2026, 6, 20)), // a refund, not the salary
      income(2000, new Date(2026, 7, 5)),
      income(80, new Date(2026, 7, 9)),
    ];

    expect(detectSalary(rows, now)).toMatchObject({ amount: 2000, dayOfMonth: 5 });
  });

  it("is undefined from a single month — one payment is not a pattern", () => {
    expect(detectSalary([income(2000, new Date(2026, 7, 1))], now)).toBeUndefined();
  });

  it("is undefined with no income at all", () => {
    expect(detectSalary([tx({ amount: 40 })], now)).toBeUndefined();
  });

  it("ignores income outside the lookback window", () => {
    const rows = [income(2000, new Date(2025, 0, 1)), income(2000, new Date(2025, 1, 1))];
    expect(detectSalary(rows, now)).toBeUndefined();
  });

  it("counts money pulled back out of savings as income", () => {
    const rows = [
      tx({ amount: 900, type: "investment", isInvestmentTransaction: true, contributionType: "withdrawal", date: new Date(2026, 6, 3) }),
      tx({ amount: 900, type: "investment", isInvestmentTransaction: true, contributionType: "withdrawal", date: new Date(2026, 7, 3) }),
    ];
    expect(detectSalary(rows, now)).toMatchObject({ amount: 900, occurrences: 2 });
  });
});

describe("nextSalaryDate / lastSalaryDate", () => {
  it("moves to next month once the day has passed", () => {
    expect(nextSalaryDate(5, new Date(2026, 7, 14))).toEqual(new Date(2026, 8, 5));
    expect(lastSalaryDate(5, new Date(2026, 7, 14))).toEqual(new Date(2026, 7, 5));
  });

  it("keeps this month's day when it is still ahead", () => {
    expect(nextSalaryDate(25, new Date(2026, 7, 14))).toEqual(new Date(2026, 7, 25));
    expect(lastSalaryDate(25, new Date(2026, 7, 14))).toEqual(new Date(2026, 6, 25));
  });

  it("treats payday itself as the start of the new cycle, not the end of the old one", () => {
    const payday = new Date(2026, 7, 5);
    expect(lastSalaryDate(5, payday)).toEqual(payday);
    expect(nextSalaryDate(5, payday)).toEqual(new Date(2026, 8, 5));
  });

  it("clamps to the last day of a short month", () => {
    expect(nextSalaryDate(31, new Date(2026, 1, 10))).toEqual(new Date(2026, 1, 28));
  });

  it("falls back to the 1st when the day is unknown", () => {
    expect(nextSalaryDate(undefined, new Date(2026, 7, 14))).toEqual(new Date(2026, 8, 1));
  });
});

// ─── Burn rate ───────────────────────────────────────────────────────────────

describe("dailyBurnRate", () => {
  const now = new Date(2026, 7, 14);

  it("averages everyday spending across the window", () => {
    const rows = [tx({ amount: 300, date: new Date(2026, 7, 10) })];
    expect(dailyBurnRate(rows, now, 30)).toBe(10);
  });

  it("leaves out bill payments — the projection charges those on their own dates", () => {
    const rows = [tx({ amount: 300, date: new Date(2026, 7, 10) }), tx({ amount: 600, date: new Date(2026, 7, 11), billId: "b1" })];
    expect(dailyBurnRate(rows, now, 30)).toBe(10);
  });

  it("leaves out transfers into savings", () => {
    const rows = [tx({ amount: 300, type: "investment", isInvestmentTransaction: true, contributionType: "deposit", date: new Date(2026, 7, 10) })];
    expect(dailyBurnRate(rows, now, 30)).toBe(0);
  });

  it("ignores spending older than the window", () => {
    expect(dailyBurnRate([tx({ amount: 300, date: new Date(2026, 5, 1) })], now, 30)).toBe(0);
  });
});

// ─── Goals ───────────────────────────────────────────────────────────────────

describe("goalMonthlyNeed", () => {
  const now = new Date(2026, 7, 14);

  it("reports nothing for an open-ended goal", () => {
    expect(goalMonthlyNeed(goal({ goalType: "open_ended" }), now)).toBe(0);
  });

  it("uses what a recurring monthly goal still owes", () => {
    expect(goalMonthlyNeed(goal({ targetPeriod: "monthly", monthlyRequired: 120, currentPeriodSaved: 0 }), now)).toBe(120);
  });

  it("reports zero — not nothing — for a recurring goal already funded", () => {
    // The old planner hid these entirely; a goal you're keeping up with should
    // still be visible, just at zero.
    expect(goalMonthlyNeed(goal({ targetPeriod: "monthly", monthlyRequired: 120, currentPeriodSaved: 120 }), now)).toBe(0);
  });

  it("spreads a targeted goal across the months left", () => {
    expect(goalMonthlyNeed(goal({ remaining: 900, deadline: new Date(2026, 10, 14) }), now)).toBe(300);
  });

  it("asks for the whole remainder when the deadline is this month", () => {
    expect(goalMonthlyNeed(goal({ remaining: 900, deadline: new Date(2026, 7, 28) }), now)).toBe(900);
  });
});

describe("goalsStillNeeded", () => {
  const now = new Date(2026, 7, 14);

  it("adds up active goals and skips switched-off ones", () => {
    const a = goal({ id: "a", targetPeriod: "monthly", monthlyRequired: 100, currentPeriodSaved: 0 });
    const b = goal({ id: "b", targetPeriod: "monthly", monthlyRequired: 50, currentPeriodSaved: 0 });
    expect(goalsStillNeeded([a, b], new Set(), now)).toBe(150);
    expect(goalsStillNeeded([a, b], new Set(["b"]), now)).toBe(100);
  });

  it("leaves out paused and finished goals", () => {
    const rows = [goal({ targetPeriod: "monthly", monthlyRequired: 100, isActive: false }), goal({ targetPeriod: "monthly", monthlyRequired: 100, isCompleted: true })];
    expect(goalsStillNeeded(rows, new Set(), now)).toBe(0);
  });
});

// ─── The plan ────────────────────────────────────────────────────────────────

describe("buildPlan", () => {
  const now = new Date(2026, 7, 14); // 14 Aug, salary on the 1st → 18 days to go

  const salary = { amount: 2000, dayOfMonth: 1, occurrences: 4 };
  const base = { transactions: [] as Transaction[], bills: [] as BillWithStatus[], goals: [] as InvestmentGoalWithStats[], salary, now };

  it("runs the window from the last payday to the next one", () => {
    const plan = buildPlan(base);

    expect(plan.cycleStart).toEqual(new Date(2026, 7, 1));
    expect(plan.nextSalary).toEqual(new Date(2026, 8, 1));
    // Stops the day before payday: the money has to reach 1 Sep, not cover it.
    expect(plan.end).toEqual(new Date(2026, 7, 31));
    expect(plan.daysRemaining).toBe(17);
  });

  it("counts income received this cycle and everyday spending against it", () => {
    const plan = buildPlan({
      ...base,
      transactions: [
        income(2000, new Date(2026, 7, 1)),
        income(999, new Date(2026, 6, 20)), // previous cycle — must not count
        tx({ amount: 500, date: new Date(2026, 7, 10) }),
      ],
    });

    expect(plan.income).toBe(2000);
    expect(plan.spent).toBe(500);
    expect(plan.startingBalance).toBe(1500);
  });

  it("adds income the user says is still coming", () => {
    const plan = buildPlan({ ...base, transactions: [income(2000, new Date(2026, 7, 1))], expectedExtra: 300 });
    expect(plan.income).toBe(2300);
  });

  it("charges a bill already paid this cycle without double counting it", () => {
    const paid = bill({
      isPaidThisPeriod: true,
      amount: 104,
      payment: { id: "p", userId: "u1", billId: "x", periodKey: "2026-08", amount: 104, paidDate: new Date(2026, 7, 6), createdAt: new Date(2026, 7, 6) },
    });

    const plan = buildPlan({
      ...base,
      transactions: [income(2000, new Date(2026, 7, 1)), tx({ amount: 104, date: new Date(2026, 7, 6), billId: paid.id })],
      bills: [paid],
    });

    // Counted once through the bill, never through the mirrored transaction.
    expect(plan.spent).toBe(104);
    expect(plan.startingBalance).toBe(1896);
  });

  it("says you make it when the money comfortably lasts", () => {
    const plan = buildPlan({ ...base, transactions: [income(2000, new Date(2026, 7, 1))] });

    expect(plan.verdict).toBe("ok");
    expect(plan.shortfall).toBe(0);
    expect(plan.breaksOn).toBeUndefined();
    expect(plan.surplus).toBe(2000);
  });

  it("names the day and the bill that tips you under", () => {
    const plan = buildPlan({
      ...base,
      transactions: [income(200, new Date(2026, 7, 1))],
      bills: [bill({ name: "Ρεύμα", amount: 300, dueDay: 24 })],
    });

    expect(plan.verdict).toBe("short");
    expect(plan.breaksOn).toEqual(new Date(2026, 7, 24));
    expect(plan.breakingEvent?.label).toBe("Ρεύμα");
    expect(plan.shortfall).toBe(100);
  });

  it("pulls an overdue bill onto today rather than a date that has passed", () => {
    const plan = buildPlan({
      ...base,
      transactions: [income(2000, new Date(2026, 7, 1))],
      bills: [bill({ name: "Late", amount: 50, dueDay: 9 })],
    });

    const [first] = plan.events.filter((e) => e.kind === "bill");
    expect(first.overdue).toBe(true);
    expect(first.date).toEqual(new Date(2026, 7, 14));
  });

  it("leaves out bills that land after the next payday", () => {
    const plan = buildPlan({
      ...base,
      bills: [bill({ name: "Next cycle", amount: 50, dueDay: 20, frequency: "yearly", dueMonth: 11 })],
    });

    expect(plan.events.filter((e) => e.kind === "bill")).toHaveLength(0);
  });

  it("reserves goal money off the top", () => {
    const plan = buildPlan({
      ...base,
      transactions: [income(1000, new Date(2026, 7, 1))],
      goals: [goal({ targetPeriod: "monthly", monthlyRequired: 400, currentPeriodSaved: 0 })],
    });

    expect(plan.goalsReserved).toBe(400);
    expect(plan.points[0].balance).toBe(600);
  });

  it("lets a switched-off goal free up its money", () => {
    const g = goal({ id: "g1", targetPeriod: "monthly", monthlyRequired: 400, currentPeriodSaved: 0 });
    const plan = buildPlan({ ...base, transactions: [income(1000, new Date(2026, 7, 1))], goals: [g], skipGoalIds: new Set(["g1"]) });

    expect(plan.goalsReserved).toBe(0);
    expect(plan.points[0].balance).toBe(1000);
  });

  it("drains the balance by the daily average, starting tomorrow", () => {
    // €300 over the 30-day window → €10/day. Today's spending is already
    // counted in `spent`, so day one must not be charged again.
    const plan = buildPlan({ ...base, transactions: [income(1000, new Date(2026, 7, 1)), tx({ amount: 300, date: new Date(2026, 7, 10) })] });

    expect(plan.burnRate).toBe(10);
    expect(plan.points[0].balance).toBe(700);
    expect(plan.points[1].balance).toBe(690);
  });

  it("calls it tight when it survives on fumes", () => {
    // €750 over the window → €25/day. Starting balance 1250 − 750 = 500, minus
    // 18 days of burn = 50 left: above zero, but under three days of spending.
    const plan = buildPlan({
      ...base,
      transactions: [income(1240, new Date(2026, 7, 1)), tx({ amount: 750, date: new Date(2026, 7, 2) })],
    });

    // €750 over the window → €25/day. Starting 1240 − 750 = 490, minus 17 days
    // of burn = 65 left: above zero, but under three days of spending (75).
    expect(plan.burnRate).toBe(25);
    expect(plan.surplus).toBe(65);
    expect(plan.shortfall).toBe(0);
    expect(plan.verdict).toBe("tight");
  });

  it("returns a usable plan with no data at all", () => {
    const plan = buildPlan(base);

    expect(plan.points.length).toBe(18); // today plus 17 days
    expect(plan.verdict).toBe("ok");
    expect(plan.safeDailySpend).toBe(0);
  });

  it("spreads what's left per day once bills and goals are set aside", () => {
    const plan = buildPlan({
      ...base,
      transactions: [income(1000, new Date(2026, 7, 1))],
      bills: [bill({ amount: 100, dueDay: 20 })],
      goals: [goal({ targetPeriod: "monthly", monthlyRequired: 180, currentPeriodSaved: 0 })],
    });

    // (1000 − 180 goals − 100 bill) spread over the 17 days to payday.
    expect(plan.safeDailySpend).toBe(42.35);
  });
});
