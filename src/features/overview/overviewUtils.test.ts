import { describe, it, expect } from "vitest";
import { calculateMetrics, calculateMoneyLeft, sumInvestments, sumGoalSavings, groupByMonth, getDateRange } from "./overviewUtils";
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
