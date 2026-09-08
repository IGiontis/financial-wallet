import { describe, it, expect } from "vitest";
import { calculateMetrics, calculateMoneyLeft, filterTransactions, getDateRange, groupByMonth, groupByWeek, sumGoalSavings, sumInvestments, sumWithdrawals } from "./overviewUtils";
import type { Transaction } from "../../shared/types/IndexTypes";

const tx = (overrides: Partial<Transaction>): Transaction =>
  ({
    id: Math.random().toString(),
    userId: "u1",
    amount: 100,
    type: "expense",
    categoryId: "c1",
    date: new Date("2026-07-15"),
    description: "test",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as Transaction;

const income = (amount: number, date?: Date) => tx({ amount, type: "income", date });
const expense = (amount: number, date?: Date) => tx({ amount, type: "expense", date });
const investDeposit = (amount: number, date?: Date) => tx({ amount, type: "investment", isInvestmentTransaction: true, contributionType: "deposit", date });
const investWithdrawal = (amount: number, date?: Date) => tx({ amount, type: "investment", isInvestmentTransaction: true, contributionType: "withdrawal", date });
const goalDeposit = (amount: number, date?: Date) =>
  tx({ amount, type: "investment", isInvestmentTransaction: true, isGoalTransaction: true, contributionType: "deposit", date });
const goalWithdrawal = (amount: number, date?: Date) =>
  tx({ amount, type: "investment", isInvestmentTransaction: true, isGoalTransaction: true, contributionType: "withdrawal", date });

describe("calculateMetrics", () => {
  it("sums plain income and expenses", () => {
    const m = calculateMetrics([income(2000), expense(500), expense(300)]);
    expect(m.totalIncome).toBe(2000);
    expect(m.totalExpenses).toBe(800);
    expect(m.netIncome).toBe(1200);
    expect(m.savingsRate).toBeCloseTo(60);
  });

  it("excludes deposits from income and expenses", () => {
    // Contributions are mirrored as transactions — counting them here would double count.
    const m = calculateMetrics([income(1000), investDeposit(300), goalDeposit(200)]);
    expect(m.totalIncome).toBe(1000);
    expect(m.totalExpenses).toBe(0);
  });

  it("counts an investment withdrawal as income", () => {
    const m = calculateMetrics([investWithdrawal(500)]);
    expect(m.totalIncome).toBe(500);
  });

  it("counts a goal withdrawal as income", () => {
    const m = calculateMetrics([goalWithdrawal(300)]);
    expect(m.totalIncome).toBe(300);
  });

  it("adds withdrawals on top of plain income", () => {
    const m = calculateMetrics([income(2000), investWithdrawal(400), goalWithdrawal(100)]);
    expect(m.totalIncome).toBe(2500);
  });

  it("reports a zero savings rate when there is no income", () => {
    expect(calculateMetrics([expense(100)]).savingsRate).toBe(0);
  });
});

describe("sumInvestments / sumGoalSavings", () => {
  it("reports the net amount tied up", () => {
    expect(sumInvestments([investDeposit(500), investWithdrawal(200)])).toBe(300);
  });

  it("keeps goal contributions separate from plain investments", () => {
    const list = [investDeposit(500), goalDeposit(250)];
    expect(sumInvestments(list)).toBe(500);
    expect(sumGoalSavings(list)).toBe(250);
  });

  it("goes negative when more is taken out than put in", () => {
    // Cashing out 400 with no deposits means 400 came back out of the pot.
    expect(sumInvestments([investWithdrawal(400)])).toBe(-400);
  });

  it("goes negative when a withdrawal exceeds the period's deposits", () => {
    // Withdrew profits: put in 1500, took out 1800 → 300 net out.
    expect(sumInvestments([investDeposit(1500), investWithdrawal(1800)])).toBe(-300);
  });
});

describe("money left — no double counting", () => {
  // A withdrawal shows up twice in the UI: as income, and as a negative net
  // flow. "Money left" must count it exactly once.

  it("raises money left by exactly the amount withdrawn", () => {
    expect(calculateMoneyLeft([investWithdrawal(500)])).toBe(500);
  });

  it("handles a deposit-and-withdrawal period", () => {
    // Deposit 300, withdraw 100 → net 200 tied up, so money left is −200.
    expect(calculateMoneyLeft([investDeposit(300), investWithdrawal(100)])).toBe(-200);
  });

  it("keeps a realistic month consistent", () => {
    // 2000 income, 800 spent, 300 invested, 100 pulled back out.
    expect(calculateMoneyLeft([income(2000), expense(800), investDeposit(300), investWithdrawal(100)])).toBe(1000);
  });

  it("agrees with the chart tooltip's gross-based formula", () => {
    // The tooltip computes: (income incl. withdrawals) − expenses − gross deposits.
    const txs = [income(2000), expense(800), investDeposit(300), investWithdrawal(100), goalDeposit(200)];
    const m = calculateMetrics(txs);
    const grossDeposits = 300 + 200;
    const tooltipFigure = m.totalIncome - m.totalExpenses - grossDeposits;
    expect(calculateMoneyLeft(txs)).toBe(tooltipFigure);
  });
});

describe("groupByMonth", () => {
  it("buckets transactions by calendar month in chronological order", () => {
    const rows = groupByMonth([income(1000, new Date("2026-06-10")), expense(400, new Date("2026-07-05")), income(2000, new Date("2026-07-20"))]);
    expect(rows).toHaveLength(2);
    expect(rows[0].income).toBe(1000);
    expect(rows[1].income).toBe(2000);
    expect(rows[1].expenses).toBe(400);
  });

  it("tracks goal and investment flows separately", () => {
    const rows = groupByMonth([investDeposit(300), goalDeposit(150)]);
    expect(rows[0].investments).toBe(300);
    expect(rows[0].goals).toBe(150);
  });
});

describe("getDateRange", () => {
  it("starts the current-month range at the first of the month", () => {
    const now = new Date("2026-07-15T12:00:00");
    const { start, end } = getDateRange("current_month", undefined, now);
    expect(start.getDate()).toBe(1);
    expect(start.getMonth()).toBe(6);
    expect(end).toEqual(now);
  });

  it("spans three calendar months for last_3_months", () => {
    const now = new Date("2026-07-15T12:00:00");
    const { start } = getDateRange("last_3_months", undefined, now);
    expect(start.getMonth()).toBe(4); // May
  });

  it("never lets a custom range end in the future", () => {
    const now = new Date("2026-07-15T12:00:00");
    const { end } = getDateRange("custom", { fromMonth: 0, fromYear: 2026, toMonth: 11, toYear: 2026 }, now);
    expect(end).toEqual(now);
  });
});

// ─── Weekly grouping ─────────────────────────────────────────────────────────
// The bars on the overview when the range is short. None of this was covered.

describe("groupByWeek", () => {
  // July 2026: the 1st is a Wednesday, so the first ISO week runs Mon 29 Jun
  // to Sun 5 Jul.
  const range = { start: new Date(2026, 6, 1), end: new Date(2026, 6, 31, 23, 59, 59) };

  it("cuts the range into weeks that start on Monday", () => {
    const weeks = groupByWeek([income(500, new Date(2026, 6, 3)), income(700, new Date(2026, 6, 6))], range);

    // 3 July is a Friday and 6 July the Monday after: different weeks.
    expect(weeks.map((w) => w.label)).toEqual(["Week 1", "Week 2"]);
    expect(weeks.map((w) => w.income)).toEqual([500, 700]);
  });

  it("leaves out the weeks nothing happened in", () => {
    // A bar of zero height with a label is noise, not information.
    const weeks = groupByWeek([expense(80, new Date(2026, 6, 2)), expense(40, new Date(2026, 6, 27))], range);

    expect(weeks).toHaveLength(2);
    expect(weeks.map((w) => w.expenses)).toEqual([80, 40]);
  });

  it("counts a transaction on the first and the last day of the range", () => {
    const weeks = groupByWeek([expense(10, range.start), expense(25, new Date(2026, 6, 31, 12))], range);

    expect(weeks.reduce((sum, w) => sum + w.expenses, 0)).toBe(35);
  });

  it("puts a withdrawal in the income bar and keeps the gross deposits separate", () => {
    const day = new Date(2026, 6, 8);
    const weeks = groupByWeek([goalDeposit(300, day), goalWithdrawal(100, day), investDeposit(200, day), investWithdrawal(50, day)], range);

    expect(weeks).toHaveLength(1);
    // Gross in the deposit columns, net alongside, withdrawals in income.
    expect(weeks[0]).toMatchObject({ income: 150, goals: 300, goalsNet: 200, investments: 200, investmentsNet: 150 });
  });

  it("ignores anything outside the range", () => {
    const weeks = groupByWeek([income(999, new Date(2026, 5, 20)), income(400, new Date(2026, 6, 8))], range);

    expect(weeks).toHaveLength(1);
    expect(weeks[0].income).toBe(400);
  });
});

// ─── Ranges ──────────────────────────────────────────────────────────────────

describe("getDateRange — the rest of the periods", () => {
  const now = new Date(2026, 8, 8, 14, 30); // 8 Sep 2026, mid-afternoon

  it("spans six calendar months for last_6_months", () => {
    const { start, end } = getDateRange("last_6_months", undefined, now);

    expect(start).toEqual(new Date(2026, 3, 1)); // 1 April
    expect(end).toEqual(now);
  });

  it("runs from 1 January to now for year_to_date", () => {
    const { start, end } = getDateRange("year_to_date", undefined, now);

    expect(start).toEqual(new Date(2026, 0, 1));
    expect(end).toEqual(now);
  });

  it("runs to the end of December for this_year, which is still ahead", () => {
    const { end } = getDateRange("this_year", undefined, now);

    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(11);
    expect(end.getTime()).toBeGreaterThan(now.getTime());
  });

  it("falls back to the current month when custom has no range with it", () => {
    const { start, end } = getDateRange("custom", undefined, now);

    expect(start).toEqual(new Date(2026, 8, 1));
    expect(end).toEqual(now);
  });

  it("keeps a whole past month whole", () => {
    const { start, end } = getDateRange("custom", { fromMonth: 5, fromYear: 2026, toMonth: 6, toYear: 2026 }, now);

    expect(start).toEqual(new Date(2026, 5, 1));
    expect(end.getMonth()).toBe(6);
    expect(end.getDate()).toBe(31);
  });
});

describe("filterTransactions", () => {
  const range = { start: new Date(2026, 6, 1), end: new Date(2026, 6, 31, 23, 59, 59) };

  it("keeps both ends of the range", () => {
    const inside = [expense(10, range.start), expense(20, new Date(2026, 6, 31, 23, 0))];
    const outside = [expense(30, new Date(2026, 5, 30, 23, 59)), expense(40, new Date(2026, 7, 1))];

    expect(filterTransactions([...inside, ...outside], range)).toHaveLength(2);
  });
});

// ─── The same figure, reached another way ────────────────────────────────────

describe("overview figures that must agree with each other", () => {
  // A month shaped like a real one: pay, bills, both kinds of deposit, and
  // money taken back out of each.
  const month = [
    income(1800, new Date(2026, 6, 25)),
    income(150, new Date(2026, 6, 3)),
    expense(700, new Date(2026, 6, 5)),
    expense(180, new Date(2026, 6, 8)),
    expense(260, new Date(2026, 6, 19)),
    goalDeposit(300, new Date(2026, 6, 26)),
    goalWithdrawal(120, new Date(2026, 6, 14)),
    investDeposit(400, new Date(2026, 6, 26)),
    investWithdrawal(90, new Date(2026, 6, 2)),
  ];

  it("adds the headline income up from its two parts", () => {
    const m = calculateMetrics(month);

    expect(m.plainIncome).toBe(1950);
    expect(sumWithdrawals(month)).toBe(210);
    expect(m.totalIncome).toBe(m.plainIncome + sumWithdrawals(month));
    expect(m.netIncome).toBe(m.totalIncome - m.totalExpenses);
    expect(m.savingsRate).toBeCloseTo((m.netIncome / m.totalIncome) * 100, 10);
  });

  it("gets the same money left by simply walking the wallet", () => {
    // The other route: start at nothing, add what came in, take out what was
    // spent, take out every deposit and put back every withdrawal. No
    // classification beyond what the transaction itself says.
    const walked = month.reduce((balance, t) => {
      if (t.contributionType === "deposit") return balance - t.amount;
      if (t.contributionType === "withdrawal") return balance + t.amount;
      return t.type === "income" ? balance + t.amount : balance - Math.abs(t.amount);
    }, 0);

    expect(calculateMoneyLeft(month)).toBe(walked);
  });

  it("counts a withdrawal once, not twice", () => {
    // The trap this model exists to avoid: a withdrawal is income *and* a
    // negative net flow, so counting both would lift money left twice.
    const withoutWithdrawal = month.filter((t) => t.contributionType !== "withdrawal");
    const withWithdrawal = [...withoutWithdrawal, goalWithdrawal(120, new Date(2026, 6, 14))];

    expect(calculateMoneyLeft(withWithdrawal) - calculateMoneyLeft(withoutWithdrawal)).toBe(120);
  });

  it("totals the monthly bars back to the headline figures", () => {
    const bars = groupByMonth(month);
    const m = calculateMetrics(month);

    expect(bars.reduce((sum, b) => sum + b.income, 0)).toBe(m.totalIncome);
    expect(bars.reduce((sum, b) => sum + b.expenses, 0)).toBe(m.totalExpenses);
    expect(bars.reduce((sum, b) => sum + b.goalsNet, 0)).toBe(sumGoalSavings(month));
    expect(bars.reduce((sum, b) => sum + b.investmentsNet, 0)).toBe(sumInvestments(month));
  });

  it("totals the weekly bars to the same figures as the monthly ones", () => {
    const range = { start: new Date(2026, 6, 1), end: new Date(2026, 6, 31, 23, 59, 59) };
    const weekly = groupByWeek(month, range);
    const monthly = groupByMonth(month);
    const total = (bars: { income: number; expenses: number; goalsNet: number; investmentsNet: number }[], key: "income" | "expenses" | "goalsNet" | "investmentsNet") =>
      bars.reduce((sum, b) => sum + b[key], 0);

    for (const key of ["income", "expenses", "goalsNet", "investmentsNet"] as const) {
      expect(total(weekly, key), key).toBe(total(monthly, key));
    }
  });

  it("splits a range's transactions across the periods without losing any", () => {
    const range = getDateRange("custom", { fromMonth: 6, fromYear: 2026, toMonth: 6, toYear: 2026 }, new Date(2026, 8, 8));

    expect(filterTransactions(month, range)).toHaveLength(month.length);
  });

  it("keeps a goal transaction flagged as an investment one too", () => {
    // `calculateMetrics` only treats a withdrawal as income when the
    // investment flag is set, while `sumGoalSavings` goes by the goal flag
    // alone. A goal transaction written without both would be counted twice in
    // money left — everything that writes one sets both, and this says so.
    const goalRows = month.filter((t) => t.isGoalTransaction);

    expect(goalRows).not.toHaveLength(0);
    for (const row of goalRows) expect(row.isInvestmentTransaction).toBe(true);
  });
});
